// Offline area downloads: raster tiles into the Cache API, layer features into IndexedDB.
import { TILES, SERVICES } from './config.js';
import { LAYER_DEFS } from './layers.js';
import { store } from './store.js';
import { lonLatToTile, uid, bboxIntersects, bboxAreaKm2 } from './util.js';

export const OFFLINE_CACHE = 'fl-offline-v1';
const CONCURRENCY = 6;

export function tilesForBbox(bbox, minZ, maxZ) {
  const out = [];
  for (let z = minZ; z <= maxZ; z++) {
    const [x0, y1] = lonLatToTile(z, bbox[0], bbox[1]); const [x1, y0] = lonLatToTile(z, bbox[2], bbox[3]);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push([z, x, y]);
  }
  return out;
}
const tpl = (t, z, x, y) => t.replace('{z}', z).replace('{x}', x).replace('{y}', y);

export const TILE_SETS = {
  sat: { label: 'Satellite', tiles: TILES.esriImagery, kb: 28 },
  topo: { label: 'USGS Topo', tiles: TILES.usgsTopo, kb: 22 },
  sma: { label: 'Land ownership', tiles: SERVICES.sma.tiles, kb: 6, maxzoom: 15 },
  hydro: { label: 'Streams & washes', tiles: TILES.usgsHydro, kb: 5 },
  dem: { label: 'Terrain (3D, slope, elevation)', tiles: TILES.terrarium, kb: 60, maxzoom: 13, xy: true }
};
export const FEATURE_SETS = ['gmu', 'parcels', 'stateTrust', 'tanks', 'springs', 'hpcWater', 'mvum', 'mvumTrails', 'trails', 'wilderness', 'fires'];

export function estimate(bbox, maxZ, sets) {
  let tiles = 0; let kb = 0;
  for (const k of sets) { const s = TILE_SETS[k]; if (!s) continue; const n = tilesForBbox(bbox, 8, Math.min(maxZ, s.maxzoom || 19)).length; tiles += n; kb += n * s.kb; }
  return { tiles, mb: Math.round(kb / 1024), km2: Math.round(bboxAreaKm2(bbox)) };
}

async function pool(items, worker, onProgress) {
  let i = 0; let done = 0; let failed = 0;
  const run = async () => { while (i < items.length) { const it = items[i++]; try { await worker(it); } catch (_) { failed++; } done++; if (onProgress && done % 10 === 0) onProgress(done, items.length, failed); } };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
  if (onProgress) onProgress(done, items.length, failed);
  return { done, failed };
}

export async function downloadArea({ name, bbox, maxZ = 15, sets = ['sat', 'sma', 'dem'], features = FEATURE_SETS, fetchFeatures, onProgress, signal }) {
  const id = uid();
  const cache = await caches.open(OFFLINE_CACHE);
  const jobs = [];
  for (const k of sets) { const s = TILE_SETS[k]; if (!s) continue; for (const [z, x, y] of tilesForBbox(bbox, 8, Math.min(maxZ, s.maxzoom || 19))) jobs.push(tpl(s.tiles, z, x, y)); }
  let stage = 'tiles';
  const report = (d, t, f) => onProgress && onProgress({ stage, done: d, total: t, failed: f });
  const res = await pool(jobs, async (url) => {
    if (signal && signal.aborted) throw new Error('aborted');
    if (await cache.match(url)) return;
    const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error(String(r.status));
    await cache.put(url, r.clone());
  }, report);
  stage = 'features';
  const featureCounts = {};
  let fi = 0;
  for (const lid of features) {
    if (signal && signal.aborted) break;
    const def = LAYER_DEFS[lid]; if (!def) continue;
    try {
      const fc = await fetchFeatures(lid, def, bbox);
      if (fc && fc.features.length) { await store.put('areaFeatures', `${id}:${lid}`, fc); featureCounts[lid] = fc.features.length; }
    } catch (e) { featureCounts[lid] = -1; }
    report(++fi, features.length, 0);
  }
  const area = { id, name: name || `Area ${new Date().toLocaleDateString()}`, bbox, maxZ, sets, features: Object.keys(featureCounts), featureCounts, tiles: res.done - res.failed, failed: res.failed, created: Date.now(), urls: jobs.length };
  await store.put('areas', id, area);
  return area;
}

export async function listAreas() { return (await store.all('areas')).sort((a, b) => b.created - a.created); }
export async function removeArea(id) {
  const area = await store.get('areas', id); if (!area) return;
  const cache = await caches.open(OFFLINE_CACHE);
  const others = (await listAreas()).filter((a) => a.id !== id);
  for (const k of area.sets) {
    const s = TILE_SETS[k]; if (!s) continue;
    for (const [z, x, y] of tilesForBbox(area.bbox, 8, Math.min(area.maxZ, s.maxzoom || 19))) {
      // keep tiles still covered by another area with the same set
      const shared = others.some((o) => o.sets.includes(k) && o.maxZ >= z && bboxIntersects(o.bbox, area.bbox));
      if (!shared) await cache.delete(tpl(s.tiles, z, x, y));
    }
  }
  for (const lid of area.features || []) await store.del('areaFeatures', `${id}:${lid}`);
  await store.del('areas', id);
}
export async function clearAllOffline() {
  await caches.delete(OFFLINE_CACHE); await store.clear('areas'); await store.clear('areaFeatures');
}

// Offline provider for LayerManager: union of saved feature sets whose area intersects the bbox.
export function makeOfflineProvider() {
  return async (layerId, bbox) => {
    const areas = await listAreas();
    const feats = [];
    for (const a of areas) {
      if (!bboxIntersects(a.bbox, bbox) || !(a.features || []).includes(layerId)) continue;
      const fc = await store.get('areaFeatures', `${a.id}:${layerId}`);
      if (fc) feats.push(...fc.features);
    }
    return feats.length ? { type: 'FeatureCollection', features: feats } : null;
  };
}

export async function storageEstimate() {
  const est = await store.estimate();
  const cache = await caches.open(OFFLINE_CACHE).catch(() => null);
  const n = cache ? (await cache.keys()).length : 0;
  return { usage: est ? est.usage : null, quota: est ? est.quota : null, tiles: n };
}
