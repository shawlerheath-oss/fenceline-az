// GPS position, heading, track recording, wake lock.
import { store } from './store.js';
import { haversine, uid, lineLengthM } from './util.js';
import { markerSVG } from './icons.js';

export class Tracker {
  constructor(map, { onPosition, onError, onRecord } = {}) {
    this.map = map; this.pos = null; this.heading = null; this.watchId = null; this.follow = false; this.wake = null;
    this.rec = null; this.onPosition = onPosition || (() => {}); this.onError = onError || (() => {}); this.onRecord = onRecord || (() => {});
    this.marker = null; this.accCircle = null;
    this._lastRecPos = null;
  }
  get active() { return this.watchId != null; }

  start() {
    if (!navigator.geolocation) { this.onError(new Error('No GPS on this device')); return; }
    if (this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition((p) => this._update(p), (e) => this.onError(e), { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    this._startHeading();
  }
  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId); this.watchId = null;
    this.follow = false; this.releaseWake();
  }
  locate() {
    return new Promise((ok, bad) => {
      if (!navigator.geolocation) return bad(new Error('No GPS on this device'));
      navigator.geolocation.getCurrentPosition((p) => { this._update(p); ok(this.pos); }, bad, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    });
  }
  _update(p) {
    const c = p.coords;
    this.pos = { lon: c.longitude, lat: c.latitude, acc: c.accuracy, alt: c.altitude, speed: c.speed, heading: c.heading, time: p.timestamp };
    if (c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 0.8) this.heading = c.heading;
    this._renderMarker();
    if (this.follow) this.map.easeTo({ center: [c.longitude, c.latitude], duration: 500 });
    if (this.rec) this._record(this.pos);
    this.onPosition(this.pos);
  }
  _renderMarker() {
    if (!this.pos) return;
    if (!this.marker) {
      const el = document.createElement('div'); el.className = 'you';
      el.innerHTML = `<div class="you-acc"></div><div class="you-dot"></div><div class="you-arrow">${markerSVG('arrow')}</div>`;
      this.marker = new maplibregl.Marker({ element: el, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([this.pos.lon, this.pos.lat]).addTo(this.map);
    }
    this.marker.setLngLat([this.pos.lon, this.pos.lat]);
    const el = this.marker.getElement();
    const mpp = (40075016.686 * Math.cos((this.pos.lat * Math.PI) / 180)) / (2 ** this.map.getZoom() * 512);
    const r = Math.min(160, Math.max(14, (this.pos.acc || 20) / mpp));
    el.querySelector('.you-acc').style.width = el.querySelector('.you-acc').style.height = `${r * 2}px`;
    const arrow = el.querySelector('.you-arrow');
    arrow.style.display = this.heading == null ? 'none' : 'block';
    if (this.heading != null) arrow.style.transform = `rotate(${this.heading - this.map.getBearing() + 180}deg)`;
  }
  _startHeading() {
    const handler = (e) => {
      let h = e.webkitCompassHeading;
      if (h == null && e.alpha != null) h = 360 - e.alpha;
      if (h != null && !isNaN(h)) { this.heading = h; this._renderMarker(); }
    };
    const attach = () => window.addEventListener('deviceorientation', handler, true);
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then((s) => { if (s === 'granted') attach(); }).catch(() => {});
    } else attach();
    this.map.on('rotate', () => this._renderMarker()); this.map.on('zoom', () => this._renderMarker());
  }

  async requestWake() {
    try { if ('wakeLock' in navigator && !this.wake) { this.wake = await navigator.wakeLock.request('screen'); this.wake.addEventListener('release', () => { this.wake = null; }); } } catch (_) { /* denied */ }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (this.rec || this.follow)) this.requestWake(); }, { once: true });
  }
  releaseWake() { try { if (this.wake) this.wake.release(); } catch (_) { /* ignore */ } this.wake = null; }

  // ---- Recording ----
  startRecording(name) {
    this.rec = { id: uid(), name: name || `Track ${new Date().toLocaleDateString()}`, start: Date.now(), points: [], distM: 0, gain: 0, loss: 0 };
    this._lastRecPos = null; this.start(); this.requestWake(); this._renderTrack();
    this.onRecord(this.rec);
  }
  _record(p) {
    const last = this._lastRecPos;
    if (last) {
      const d = haversine([last.lon, last.lat], [p.lon, p.lat]);
      if (d < Math.max(3, (p.acc || 10) * 0.5)) return; // ignore GPS jitter
      this.rec.distM += d;
      if (p.alt != null && last.alt != null) { const dz = p.alt - last.alt; if (dz > 0) this.rec.gain += dz; else this.rec.loss -= dz; }
    }
    this.rec.points.push([p.lon, p.lat, p.alt ?? null, p.time]);
    this._lastRecPos = p;
    if (this.rec.points.length % 5 === 0) this._renderTrack();
    this.onRecord(this.rec);
  }
  async stopRecording() {
    const r = this.rec; if (!r) return null;
    this.rec = null; r.end = Date.now(); r.durationMs = r.end - r.start;
    if (r.points.length > 1) await store.put('tracks', r.id, r);
    this._renderTrack(); this.releaseWake(); this.onRecord(null);
    return r;
  }
  async tracks() { return (await store.all('tracks')).sort((a, b) => b.start - a.start); }
  async removeTrack(id) { await store.del('tracks', id); await this.renderSaved(); }
  _renderTrack() {
    const src = this.map.getSource('src-rec'); if (!src) return;
    src.setData(this.rec && this.rec.points.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: this.rec.points.map((p) => [p[0], p[1]]) }, properties: {} } : { type: 'FeatureCollection', features: [] });
  }
  async renderSaved() {
    const src = this.map.getSource('src-tracks'); if (!src) return;
    const all = await this.tracks();
    src.setData({ type: 'FeatureCollection', features: all.filter((t) => t.points.length > 1).map((t) => ({ type: 'Feature', id: t.id, properties: { id: t.id, name: t.name }, geometry: { type: 'LineString', coordinates: t.points.map((p) => [p[0], p[1]]) } })) });
  }
  static installLayers(map) {
    if (map.getSource('src-tracks')) return;
    map.addSource('src-tracks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('src-rec', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'tracks-line', type: 'line', source: 'src-tracks', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#00e5ff', 'line-width': 2.5, 'line-opacity': 0.8 } }, 'anchor-point');
    map.addLayer({ id: 'rec-line', type: 'line', source: 'src-rec', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ff3d00', 'line-width': 3.5 } }, 'anchor-point');
  }
  static trackGPX(t) {
    const pts = t.points.map((p) => `<trkpt lat="${p[1]}" lon="${p[0]}">${p[2] != null ? `<ele>${p[2].toFixed(1)}</ele>` : ''}<time>${new Date(p[3]).toISOString()}</time></trkpt>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Fenceline" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${t.name}</name><trkseg>${pts}</trkseg></trk></gpx>`;
  }
  static trackStats(t) { return { distM: t.distM ?? lineLengthM(t.points), durationMs: t.durationMs ?? ((t.end || Date.now()) - t.start), gain: t.gain || 0, loss: t.loss || 0, n: t.points.length }; }
}
