// Geometry, formatting and DOM helpers shared across modules.

export const R_EARTH = 6371008.8;
export const toRad = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;

export function haversine(a, b) {
  const [lon1, lat1] = a; const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a, b) {
  const lon1 = toRad(a[0]); const lat1 = toRad(a[1]); const lon2 = toRad(b[0]); const lat2 = toRad(b[1]);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(a, brg, dist) {
  const lon1 = toRad(a[0]); const lat1 = toRad(a[1]);
  const d = dist / R_EARTH; const b = toRad(brg);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lon2), toDeg(lat2)];
}

export const COMPASS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const norm360 = (d) => ((d % 360) + 360) % 360;
export function compass8(deg) { return COMPASS8[Math.round(norm360(deg) / 45) % 8]; }
export function compass16(deg) { return COMPASS16[Math.round(norm360(deg) / 22.5) % 16]; }
export function angleDiff(a, b) { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; }

export function fmtDist(m, units = 'imperial') {
  if (!isFinite(m)) return '—';
  if (units === 'metric') return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  const yd = m * 1.09361;
  if (yd < 1000) return `${Math.round(yd)} yd`;
  const mi = yd / 1760;
  return `${mi.toFixed(mi < 10 ? 2 : 1)} mi`;
}
export function fmtElev(m, units = 'imperial') {
  if (m == null || !isFinite(m)) return '—';
  return units === 'metric' ? `${Math.round(m)} m` : `${Math.round(m * 3.28084).toLocaleString()} ft`;
}
export function fmtArea(m2, units = 'imperial') {
  if (!isFinite(m2)) return '—';
  if (units === 'metric') return m2 < 10000 ? `${Math.round(m2)} m²` : `${(m2 / 10000).toFixed(1)} ha`;
  const ac = m2 / 4046.856;
  if (ac < 0.1) return `${Math.round(m2 * 10.7639).toLocaleString()} sq ft`;
  return `${ac.toFixed(ac < 10 ? 2 : ac < 1000 ? 1 : 0)} ac`;
}
export function fmtSpeed(mph, units = 'imperial') {
  if (mph == null) return '—';
  return units === 'metric' ? `${Math.round(mph * 1.609)} km/h` : `${Math.round(mph)} mph`;
}
export function fmtTemp(f, units = 'imperial') {
  if (f == null) return '—';
  return units === 'metric' ? `${Math.round(((f - 32) * 5) / 9)}°C` : `${Math.round(f)}°F`;
}
export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60;
  return hh ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm}m ${String(ss).padStart(2, '0')}s`;
}
export function fmtTime(d, tz) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}
export function fmtDate(d, tz) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
}
export function fmtDateTime(d, tz) { return `${fmtDate(d, tz)} ${fmtTime(d, tz)}`; }

// Planar projection around a reference point, good for polygons a few miles across.
export function localXY(ref) {
  const k = Math.cos(toRad(ref[1]));
  return (p) => [(p[0] - ref[0]) * 111320 * k, (p[1] - ref[1]) * 110540];
}
export function ringAreaM2(ring) {
  if (!ring || ring.length < 3) return 0;
  const proj = localXY(ring[0]); const pts = ring.map(proj); let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}
export function polygonAreaM2(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let a = 0;
  for (const rings of polys) { a += ringAreaM2(rings[0]); for (let i = 1; i < rings.length; i++) a -= ringAreaM2(rings[i]); }
  return a;
}
export function lineLengthM(coords) {
  let d = 0; for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]); return d;
}
export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInGeom(pt, geom) {
  if (!geom) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const rings of polys) {
    if (pointInRing(pt, rings[0])) {
      let hole = false;
      for (let i = 1; i < rings.length; i++) if (pointInRing(pt, rings[i])) hole = true;
      if (!hole) return true;
    }
  }
  return false;
}
export function distToSegmentM(p, a, b) {
  const proj = localXY(p); const [ax, ay] = proj(a); const [bx, by] = proj(b);
  const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 ? (-ax * dx - ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
export function geomRings(geom) {
  if (!geom) return [];
  switch (geom.type) {
    case 'Polygon': return geom.coordinates;
    case 'MultiPolygon': return geom.coordinates.flat();
    case 'LineString': return [geom.coordinates];
    case 'MultiLineString': return geom.coordinates;
    default: return [];
  }
}
export function distToGeomEdgeM(p, geom) {
  let best = Infinity;
  for (const ring of geomRings(geom)) {
    for (let i = 0; i < ring.length - 1; i++) { const d = distToSegmentM(p, ring[i], ring[i + 1]); if (d < best) best = d; }
  }
  return best;
}
export function bboxOfGeom(geom) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => {
    if (typeof c[0] === 'number') { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; }
    else c.forEach(visit);
  };
  if (geom && geom.coordinates) visit(geom.coordinates);
  return b;
}
export function centroid(geom) {
  // Area-weighted centroid of the largest ring; good enough for labels.
  const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.type === 'MultiPolygon' ? geom.coordinates.map((p) => p[0]) : [];
  let best = null; let bestA = -1;
  for (const ring of rings) { const a = ringAreaM2(ring); if (a > bestA) { bestA = a; best = ring; } }
  if (!best) { const b = bboxOfGeom(geom); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  let cx = 0; let cy = 0; let f = 0;
  for (let i = 0; i < best.length - 1; i++) {
    const [x1, y1] = best[i]; const [x2, y2] = best[i + 1]; const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross; cy += (y1 + y2) * cross; f += cross;
  }
  if (Math.abs(f) < 1e-12) { const b = bboxOfGeom(geom); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  return [cx / (3 * f), cy / (3 * f)];
}
export function bboxExpand(b, f) { const w = b[2] - b[0]; const h = b[3] - b[1]; return [b[0] - w * f, b[1] - h * f, b[2] + w * f, b[3] + h * f]; }
export function bboxContains(outer, inner) { return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]; }
export function bboxIntersects(a, b) { return !(b[0] > a[2] || b[2] < a[0] || b[1] > a[3] || b[3] < a[1]); }
export function bboxAreaKm2(b) {
  const w = haversine([b[0], (b[1] + b[3]) / 2], [b[2], (b[1] + b[3]) / 2]); const h = haversine([b[0], b[1]], [b[0], b[3]]);
  return (w * h) / 1e6;
}

export function tileToLonLat(z, x, y) {
  const n = 2 ** z; return [(x / n) * 360 - 180, toDeg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))))];
}
export function lonLatToTile(z, lon, lat) {
  const n = 2 ** z; const la = toRad(lat);
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n)];
}
export function lonLatToTileFrac(z, lon, lat) {
  const n = 2 ** z; const la = toRad(lat);
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n];
}

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function throttle(fn, ms) {
  let last = 0; let t;
  return (...a) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); }
  };
}
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]); }
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
export function titleCase(s) { return String(s ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function round(v, d = 0) { const k = 10 ** d; return Math.round(v * k) / k; }
export async function withRetry(fn, { tries = 3, delay = 400 } = {}) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, delay * (i + 1))); }
  }
  throw err;
}
