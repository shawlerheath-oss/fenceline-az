// Waypoints, lines and areas: storage, rendering, GPX/GeoJSON import and export.
import { store } from './store.js';
import { markerSVG } from './icons.js';
import { uid, esc, lineLengthM, polygonAreaM2, bboxOfGeom } from './util.js';

export const KINDS = {
  stand: { label: 'Stand / blind', color: '#e67e22', glyph: 'stand' },
  glass: { label: 'Glassing point', color: '#3498db', glyph: 'glass' },
  cam: { label: 'Trail camera', color: '#8e44ad', glyph: 'cam' },
  truck: { label: 'Truck', color: '#2c3e50', glyph: 'truck' },
  camp: { label: 'Camp', color: '#16a085', glyph: 'camp' },
  water: { label: 'Water', color: '#2980b9', glyph: 'drop' },
  gate: { label: 'Gate / access', color: '#7f8c8d', glyph: 'gate' },
  bed: { label: 'Bedding', color: '#27ae60', glyph: 'bed' },
  sign: { label: 'Tracks / sign', color: '#95a5a6', glyph: 'sign' },
  track: { label: 'Track', color: '#a0522d', glyph: 'track' },
  scrape: { label: 'Scrape', color: '#d35400', glyph: 'sign' },
  rub: { label: 'Rub', color: '#c0392b', glyph: 'sign' },
  roost: { label: 'Roost', color: '#9b59b6', glyph: 'roost' },
  wallow: { label: 'Wallow', color: '#6d4c41', glyph: 'wallow' },
  mineral: { label: 'Mineral / lick', color: '#b0bec5', glyph: 'mineral' },
  feed: { label: 'Feed', color: '#8bc34a', glyph: 'feed' },
  sighting: { label: 'Sighting', color: '#f1c40f', glyph: 'eye' },
  kill: { label: 'Kill site', color: '#c0392b', glyph: 'flag' },
  blood: { label: 'Blood trail', color: '#e74c3c', glyph: 'blood' },
  shed: { label: 'Shed', color: '#d7ccc8', glyph: 'shed' },
  hazard: { label: 'Hazard', color: '#ff5252', glyph: 'warn' },
  photo: { label: 'Photo', color: '#607d8b', glyph: 'photo' },
  pin: { label: 'Pin', color: '#ff7675', glyph: 'pin' }
};

export class Markup {
  constructor(map, { onSelect, env } = {}) {
    this.map = map; this.items = new Map(); this.markers = new Map(); this.onSelect = onSelect || (() => {}); this.env = env || null;
    this.visible = true; this.filterTag = null;
  }
  async load() {
    const all = await store.all('markup');
    for (const it of all) this.items.set(it.id, it);
    this.render();
  }
  all() { return Array.from(this.items.values()).sort((a, b) => (b.updated || 0) - (a.updated || 0)); }
  get(id) { return this.items.get(id); }
  byKind(kind) { return this.all().filter((i) => i.kind === kind && i.type === 'point'); }
  tags() { const s = new Set(); for (const i of this.items.values()) (i.tags || []).forEach((t) => s.add(t)); return Array.from(s).sort(); }

  async add(item) {
    const base = { id: uid(), type: 'point', kind: 'pin', name: '', notes: '', tags: [], photos: [], created: Date.now(), updated: Date.now(), ...item };
    const env = base.type === 'point' && !base.env && this.env ? this.env() : null;
    const it = env ? { ...base, env } : base;
    if (!it.name) it.name = `${(KINDS[it.kind] || KINDS.pin).label} ${this.byKind(it.kind).length + 1}`;
    this.items.set(it.id, it); await store.put('markup', it.id, it); this.render(); return it;
  }
  async update(id, patch) {
    const cur = this.items.get(id); if (!cur) return null;
    const it = { ...cur, ...patch, updated: Date.now() };
    this.items.set(id, it); await store.put('markup', id, it); this.render(); return it;
  }
  async remove(id) { this.items.delete(id); await store.del('markup', id); this.render(); }
  async clearAll() { this.items.clear(); await store.clear('markup'); this.render(); }

  setVisible(v) { this.visible = v; this.render(); }
  setFilter(tag) { this.filterTag = tag; this.render(); }
  _shown(it) { return this.visible && (!this.filterTag || (it.tags || []).includes(this.filterTag)); }

  render() {
    // Points as DOM markers; lines and areas via a GeoJSON source.
    const keep = new Set();
    for (const it of this.items.values()) {
      if (it.type !== 'point' || !this._shown(it)) continue;
      keep.add(it.id);
      let mk = this.markers.get(it.id);
      const k = KINDS[it.kind] || KINDS.pin;
      if (!mk) {
        const el = document.createElement('button'); el.className = 'mk'; el.type = 'button';
        el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect(this.items.get(it.id)); });
        mk = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(it.coords).addTo(this.map);
        this.markers.set(it.id, mk);
      }
      const el = mk.getElement();
      el.style.setProperty('--c', it.color || k.color);
      el.innerHTML = `${markerSVG(k.glyph)}<span class="mk-label">${esc(it.name)}</span>`;
      el.setAttribute('aria-label', it.name);
      el.classList.toggle('mk-stand', it.kind === 'stand');
      mk.setLngLat(it.coords);
    }
    for (const [id, mk] of this.markers) if (!keep.has(id)) { mk.remove(); this.markers.delete(id); }
    const src = this.map.getSource('src-markup');
    if (src) src.setData(this.shapesFC());
  }
  shapesFC() {
    const feats = [];
    for (const it of this.items.values()) {
      if (it.type === 'point' || !this._shown(it)) continue;
      const k = KINDS[it.kind] || KINDS.pin;
      feats.push({ type: 'Feature', id: it.id, properties: { id: it.id, name: it.name, color: it.color || k.color, kind: it.type },
        geometry: it.type === 'line' ? { type: 'LineString', coordinates: it.coords } : { type: 'Polygon', coordinates: [it.coords.concat([it.coords[0]])] } });
    }
    return { type: 'FeatureCollection', features: feats };
  }
  static installLayers(map) {
    if (map.getSource('src-markup')) return;
    map.addSource('src-markup', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'markup-fill', type: 'fill', source: 'src-markup', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } }, 'anchor-line');
    map.addLayer({ id: 'markup-line', type: 'line', source: 'src-markup', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3 } }, 'anchor-point');
    map.addLayer({ id: 'markup-label', type: 'symbol', source: 'src-markup', layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': 12, 'symbol-placement': 'point' }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.4 } });
  }
  stats(it) {
    if (it.type === 'line') return { lengthM: lineLengthM(it.coords) };
    if (it.type === 'area') return { areaM2: polygonAreaM2({ type: 'Polygon', coordinates: [it.coords.concat([it.coords[0]])] }), perimM: lineLengthM(it.coords.concat([it.coords[0]])) };
    return {};
  }

  // ---- Export / import ----
  exportGeoJSON(items = this.all()) {
    return JSON.stringify({ type: 'FeatureCollection', features: items.map((it) => ({ type: 'Feature',
      properties: { name: it.name, kind: it.kind, notes: it.notes, tags: it.tags, color: it.color, created: it.created, bedding: it.bedding ?? null, photos: (it.photos || []).length },
      geometry: it.type === 'point' ? { type: 'Point', coordinates: it.coords } : it.type === 'line' ? { type: 'LineString', coordinates: it.coords } : { type: 'Polygon', coordinates: [it.coords.concat([it.coords[0]])] } })) }, null, 1);
  }
  exportGPX(items = this.all()) {
    const x = (s) => esc(s || '');
    const wpts = items.filter((i) => i.type === 'point').map((i) => `  <wpt lat="${i.coords[1]}" lon="${i.coords[0]}"><name>${x(i.name)}</name><desc>${x(i.notes)}</desc><sym>${x(i.kind)}</sym><type>${x(i.kind)}</type></wpt>`);
    const trks = items.filter((i) => i.type !== 'point').map((i) => `  <trk><name>${x(i.name)}</name><type>${i.type}</type><trkseg>${(i.type === 'area' ? i.coords.concat([i.coords[0]]) : i.coords).map((c) => `<trkpt lat="${c[1]}" lon="${c[0]}"/>`).join('')}</trkseg></trk>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Fenceline" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts.concat(trks).join('\n')}\n</gpx>`;
  }
  async importText(text) {
    const t = text.trim(); let n = 0;
    if (t.startsWith('{')) {
      const gj = JSON.parse(t); const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
      for (const f of feats) { const it = this._fromGeoJSON(f); if (it) { await this.add(it); n++; } }
    } else if (t.startsWith('<')) {
      const doc = new DOMParser().parseFromString(t, 'application/xml');
      const txt = (el, tag) => (el.getElementsByTagName(tag)[0] || {}).textContent || '';
      for (const w of Array.from(doc.getElementsByTagName('wpt'))) {
        const kind = KINDS[txt(w, 'type')] ? txt(w, 'type') : KINDS[txt(w, 'sym')] ? txt(w, 'sym') : 'pin';
        await this.add({ type: 'point', kind, name: txt(w, 'name'), notes: txt(w, 'desc'), coords: [+w.getAttribute('lon'), +w.getAttribute('lat')] }); n++;
      }
      for (const trk of Array.from(doc.getElementsByTagName('trk')).concat(Array.from(doc.getElementsByTagName('rte')))) {
        const pts = Array.from(trk.getElementsByTagName('trkpt')).concat(Array.from(trk.getElementsByTagName('rtept'))).map((p) => [+p.getAttribute('lon'), +p.getAttribute('lat')]);
        if (pts.length > 1) { await this.add({ type: 'line', kind: 'pin', name: txt(trk, 'name') || 'Imported track', coords: pts }); n++; }
      }
      // KML
      for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
        const name = txt(pm, 'name'); const coordsTxt = txt(pm, 'coordinates').trim();
        if (!coordsTxt) continue;
        const pts = coordsTxt.split(/\s+/).map((s) => s.split(',').slice(0, 2).map(Number)).filter((c) => c.length === 2 && isFinite(c[0]));
        if (pm.getElementsByTagName('Point').length && pts[0]) { await this.add({ type: 'point', kind: 'pin', name, coords: pts[0] }); n++; }
        else if (pm.getElementsByTagName('Polygon').length && pts.length > 2) { await this.add({ type: 'area', kind: 'pin', name, coords: pts.slice(0, -1) }); n++; }
        else if (pts.length > 1) { await this.add({ type: 'line', kind: 'pin', name, coords: pts }); n++; }
      }
    }
    return n;
  }
  _fromGeoJSON(f) {
    const p = f.properties || {}; const g = f.geometry; if (!g) return null;
    const base = { name: p.name || p.Name || p.title || '', notes: p.notes || p.description || '', tags: Array.isArray(p.tags) ? p.tags : [], kind: KINDS[p.kind] ? p.kind : 'pin', color: p.color, bedding: p.bedding ?? undefined };
    if (g.type === 'Point') return { ...base, type: 'point', coords: g.coordinates.slice(0, 2) };
    if (g.type === 'LineString') return { ...base, type: 'line', coords: g.coordinates.map((c) => c.slice(0, 2)) };
    if (g.type === 'Polygon') return { ...base, type: 'area', coords: g.coordinates[0].slice(0, -1).map((c) => c.slice(0, 2)) };
    if (g.type === 'MultiPolygon') return { ...base, type: 'area', coords: g.coordinates[0][0].slice(0, -1).map((c) => c.slice(0, 2)) };
    return null;
  }
  bbox() { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const it of this.items.values()) { const g = it.type === 'point' ? { coordinates: it.coords } : { coordinates: it.coords }; const bb = bboxOfGeom(g); b[0] = Math.min(b[0], bb[0]); b[1] = Math.min(b[1], bb[1]); b[2] = Math.max(b[2], bb[2]); b[3] = Math.max(b[3], bb[3]); } return isFinite(b[0]) ? b : null; }
}

// Resize a photo File to a <= maxPx JPEG data URL for storage.
export function shrinkPhoto(file, maxPx = 900) {
  return new Promise((ok, bad) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = bad; img.src = url;
  });
}
