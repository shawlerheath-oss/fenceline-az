// Minimal ArcGIS REST client: bbox queries with paging, point identify, field discovery.
import { withRetry } from './util.js';

async function getJSON(url, signal) {
  return withRetry(async () => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'ArcGIS error');
    return j;
  }, { tries: 2, delay: 500 });
}

export async function queryFeatures(url, { bbox, where = '1=1', outFields = '*', pageSize = 2000, maxPages = 4, signal, precision = 6, orderBy } = {}) {
  const features = []; let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const p = new URLSearchParams({
      f: 'geojson', where, outFields, returnGeometry: 'true', outSR: '4326',
      geometryPrecision: String(precision), resultRecordCount: String(pageSize), resultOffset: String(offset)
    });
    if (bbox) { p.set('geometry', bbox.join(',')); p.set('geometryType', 'esriGeometryEnvelope'); p.set('inSR', '4326'); p.set('spatialRel', 'esriSpatialRelIntersects'); }
    if (orderBy) p.set('orderByFields', orderBy);
    const gj = await getJSON(`${url}/query?${p}`, signal);
    const batch = gj.features || [];
    features.push(...batch);
    const more = gj.exceededTransferLimit || (gj.properties && gj.properties.exceededTransferLimit);
    if (!more || !batch.length) break;
    offset += batch.length;
  }
  return { type: 'FeatureCollection', features };
}

export async function queryPoint(url, lon, lat, { outFields = '*', signal, returnGeometry = false, distanceM = 0, where = '1=1' } = {}) {
  const p = new URLSearchParams({
    f: 'geojson', where, outFields, returnGeometry: String(returnGeometry), outSR: '4326',
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', resultRecordCount: '5'
  });
  if (distanceM) { p.set('distance', String(distanceM)); p.set('units', 'esriSRUnit_Meter'); }
  const gj = await getJSON(`${url}/query?${p}`, signal);
  return gj.features || [];
}

export async function queryCount(url, { bbox, where = '1=1', signal } = {}) {
  const p = new URLSearchParams({ f: 'json', where, returnCountOnly: 'true' });
  if (bbox) { p.set('geometry', bbox.join(',')); p.set('geometryType', 'esriGeometryEnvelope'); p.set('inSR', '4326'); p.set('spatialRel', 'esriSpatialRelIntersects'); }
  const j = await getJSON(`${url}/query?${p}`, signal);
  return j.count ?? 0;
}

export function serviceInfo(url, signal) { return getJSON(`${url}?f=pjson`, signal); }

// Pick the first matching property key from a list of candidates (exact names or RegExps).
export function pickField(props, candidates = []) {
  const keys = Object.keys(props || {});
  for (const c of candidates) {
    if (c instanceof RegExp) { const k = keys.find((k) => c.test(k)); if (k) return k; }
    else if (keys.includes(c)) return c;
  }
  return null;
}
export function pickValue(props, candidates = []) { const k = pickField(props, candidates); return k ? props[k] : undefined; }
