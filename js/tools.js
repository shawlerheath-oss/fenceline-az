// Measurement, scent cones, boundary guard, and point description.
import { RULES, SERVICES } from './config.js';
import { queryPoint, pickValue } from './arcgis.js';
import { elevationAt } from './terrain.js';
import { legalLight } from './sun.js';
import { haversine, bearing, destination, lineLengthM, polygonAreaM2, pointInGeom, distToGeomEdgeM, compass16, norm360 } from './util.js';

// ---- Measure tool: tap points to build a line or area ----
export class Measure {
  constructor(map) { this.map = map; this.mode = null; this.pts = []; }
  start(mode) { this.mode = mode; this.pts = []; this.render(); }
  add(lngLat) { if (!this.mode) return; this.pts.push([lngLat.lng, lngLat.lat]); this.render(); }
  undo() { this.pts.pop(); this.render(); }
  stop() { const out = this.result(); this.mode = null; this.pts = []; this.render(); return out; }
  result() {
    if (this.mode === 'area' && this.pts.length > 2) return { mode: 'area', coords: this.pts.slice(), areaM2: polygonAreaM2({ type: 'Polygon', coordinates: [this.pts.concat([this.pts[0]])] }), perimM: lineLengthM(this.pts.concat([this.pts[0]])) };
    if (this.pts.length > 1) return { mode: 'line', coords: this.pts.slice(), lengthM: lineLengthM(this.pts), bearing: bearing(this.pts[this.pts.length - 2], this.pts[this.pts.length - 1]) };
    return { mode: this.mode, coords: this.pts.slice() };
  }
  render() {
    const src = this.map.getSource('src-measure'); if (!src) return;
    const feats = this.pts.map((c) => ({ type: 'Feature', properties: { kind: 'pt' }, geometry: { type: 'Point', coordinates: c } }));
    if (this.pts.length > 1) feats.push({ type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: this.mode === 'area' && this.pts.length > 2 ? this.pts.concat([this.pts[0]]) : this.pts } });
    if (this.mode === 'area' && this.pts.length > 2) feats.push({ type: 'Feature', properties: { kind: 'area' }, geometry: { type: 'Polygon', coordinates: [this.pts.concat([this.pts[0]])] } });
    src.setData({ type: 'FeatureCollection', features: feats });
  }
  static installLayers(map) {
    if (map.getSource('src-measure')) return;
    map.addSource('src-measure', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'measure-fill', type: 'fill', source: 'src-measure', filter: ['==', ['get', 'kind'], 'area'], paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'measure-line', type: 'line', source: 'src-measure', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'measure-pt', type: 'circle', source: 'src-measure', filter: ['==', ['get', 'kind'], 'pt'], paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5 } });
  }
}

// ---- Scent cones ----
export function scentConeFC(stands, windDir, windSpeed) {
  if (windDir == null) return { type: 'FeatureCollection', features: [] };
  const to = norm360(windDir + 180);
  const len = Math.min(700, 250 + (windSpeed || 0) * 25);
  const half = 14 + Math.max(0, 12 - (windSpeed || 0));
  const feats = stands.map((s) => {
    const ring = [s.coords];
    for (let a = -half; a <= half; a += 4) ring.push(destination(s.coords, to + a, len));
    ring.push(s.coords);
    return { type: 'Feature', properties: { id: s.id, name: s.name }, geometry: { type: 'Polygon', coordinates: [ring] } };
  });
  return { type: 'FeatureCollection', features: feats };
}
export function installScentLayers(map) {
  if (map.getSource('src-scent')) return;
  map.addSource('src-scent', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'scent-fill', type: 'fill', source: 'src-scent', paint: { 'fill-color': '#ff6b6b', 'fill-opacity': 0.28 } }, 'anchor-line');
  map.addLayer({ id: 'scent-line', type: 'line', source: 'src-scent', paint: { 'line-color': '#ff6b6b', 'line-width': 1, 'line-dasharray': [2, 2] } }, 'anchor-point');
}

// ---- Boundary guard: distance from permitted parcels' edges ----
export class BoundaryGuard {
  constructor() { this.permitted = new Set(); this.parcels = []; this.last = null; }
  setPermitted(apns) { this.permitted = new Set(apns); }
  setParcels(features) { this.parcels = features; }
  check(pos) {
    if (!pos || !this.permitted.size || !this.parcels.length) return null;
    const pt = [pos.lon, pos.lat];
    const mine = this.parcels.filter((f) => this.permitted.has(f.properties.apn));
    if (!mine.length) return null;
    const inside = mine.find((f) => pointInGeom(pt, f.geometry));
    let edgeM = Infinity;
    for (const f of mine) edgeM = Math.min(edgeM, distToGeomEdgeM(pt, f.geometry));
    const yd = edgeM * 1.09361;
    let level = 'ok';
    if (!inside) level = 'outside';
    else if (yd < RULES.boundaryAlertYd) level = 'alert';
    else if (yd < RULES.boundaryWarnYd) level = 'warn';
    const r = { level, yd: Math.round(yd), inside: !!inside, apn: inside ? inside.properties.apn : null };
    this.last = r; return r;
  }
}

// ---- Describe a point: elevation, unit, land, water, truck, legal light ----
export async function describePoint(app, lngLat) {
  const lon = lngLat.lng; const lat = lngLat.lat; const pt = [lon, lat];
  const out = { lon, lat };
  const tasks = [];
  tasks.push(elevationAt(lon, lat).then((e) => { out.elev = e; }).catch(() => {}));
  if (app.layers.isOn('sma')) {
    tasks.push(queryPoint(SERVICES.sma.queryAZ, lon, lat, { outFields: 'LAND_MNGR,LAND_MNGR_TYPE,LAND_OWNER,PUB_ACC,NATL_SYM,FED_STS' }).then((fs) => {
      if (fs[0]) { const p = fs[0].properties; out.land = { manager: pickValue(p, SERVICES.sma.managerFields), owner: pickValue(p, SERVICES.sma.ownerFields), access: pickValue(p, SERVICES.sma.accessFields), unit: pickValue(p, SERVICES.sma.unitFields) }; }
    }).catch(() => {}));
  }
  // GMU from loaded features (works offline once units are cached).
  const units = app.layers.getFeatures('gmu');
  const u = units.find((f) => pointInGeom(pt, f.geometry));
  if (u) out.unit = u.properties;
  // Parcel from loaded parcels.
  const par = app.layers.getFeatures('parcels').find((f) => pointInGeom(pt, f.geometry));
  if (par) out.parcel = par.properties;
  // Nearest water from loaded water layers.
  let best = null;
  for (const id of ['tanks', 'springs', 'hpcWater', 'springsWells']) {
    for (const f of app.layers.getFeatures(id)) {
      const c = f.geometry.type === 'Point' ? f.geometry.coordinates : f.__pt; if (!c) continue;
      const d = haversine(pt, c); if (!best || d < best.d) best = { d, name: pickValue(f.properties, ['GNIS_NAME', 'project_name', 'name']) || id, layer: id, coords: c };
    }
  }
  if (best) out.water = { ...best, brg: bearing(pt, best.coords) };
  const truck = app.markup.byKind('truck')[0];
  if (truck) out.truck = { d: haversine(pt, truck.coords), brg: bearing(pt, truck.coords), name: truck.name };
  if (app.tracker.pos) out.fromYou = { d: haversine([app.tracker.pos.lon, app.tracker.pos.lat], pt), brg: bearing([app.tracker.pos.lon, app.tracker.pos.lat], pt) };
  out.legal = legalLight(new Date(), lat, lon, RULES.legal[app.settings.legalRule] || RULES.legal.bigGame);
  await Promise.all(tasks);
  if (out.elev != null && app.tracker.pos && app.tracker.pos.alt != null) out.dz = out.elev - app.tracker.pos.alt;
  return out;
}

export function fmtBearing(b) { return `${Math.round(norm360(b))}° ${compass16(b)}`; }
