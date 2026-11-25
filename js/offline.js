// Offline area downloads: raster tiles into the Cache API, layer features into IndexedDB, plus app-shell and glyph checks.
import { TILES, SERVICES, GLYPHS, FONT } from './config.js';
import { LAYER_DEFS } from './layers.js';
import { store } from './store.js';
import { lonLatToTile, uid, bboxIntersects, bboxAreaKm2 } from './util.js';

export const OFFLINE_CACHE = 'fl-offline-v1';
export const MAX_TILES = 25000;
const CONCURRENCY = 6;
const MIN_Z = 8;

export function tilesForBbox(bbox, minZ, maxZ) {
  const out = [];
  for (let z = minZ; z <= maxZ; z++) {
    const [x0, y1] = lonLatToTile(z, bbox[0], bbox[1]); const [x1, y0] = lonLatToTile(z, bbox[2], bbox[3]);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push([z, x, y]);
  }
  return out;
}

// EPSG:3857 bbox string built exactly like MapLibre's {bbox-epsg-3857}, so the cached URL matches the live request byte for byte.
const HALF_WORLD = 2 * Math.PI * 6378137 / 2;
function merc(px, py, z) { const res = 2 * Math.PI * 6378137 / 256 / Math.pow(2, z); return [px * res - HALF_WORLD, py * res - HALF_WORLD]; }
export function tileBbox3857(z, x, y) {
  const yy = Math.pow(2, z) - y - 1;
  const a = merc(256 * x, 256 * yy, z); const b = merc(256 * (x + 1), 256 * (yy + 1), z);
  return `${a[0]},${a[1]},${b[0]},${b[1]}`;
}
export const tileURL = (t, z, x, y) => t.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{bbox-epsg-3857}', () => tileBbox3857(z, x, y));

export const TILE_SETS = {
  sat: { label: 'Satellite', tiles: TILES.esriImagery, kb: 28 },
  topo: { label: 'USGS Topo', tiles: TILES.usgsTopo, kb: 22 },
  sma: { label: 'Land ownership', tiles: SERVICES.sma.tiles, kb: 6, maxzoom: 14 }, // the BLM cache stops at z14
  hydro: { label: 'Streams & washes', tiles: TILES.usgsHydro, kb: 5 },
  dem: { label: 'Terrain (3D, slope, habitat, elevation)', tiles: TILES.terrarium, kb: 60, maxzoom: 13 },
  lidar: { label: 'Lidar hillshade (USGS 3DEP)', tiles: TILES.lidarHillshade, kb: 40, minzoom: 11, maxzoom: 16 },
  contours: { label: 'Contours (USGS 3DEP)', tiles: TILES.contours, kb: 18, minzoom: 12, maxzoom: 16 },
  naip: { label: 'NAIP aerials (USDA)', tiles: TILES.naip, kb: 45, minzoom: 12, maxzoom: 17 }
};
export const DEFAULT_SETS = ['sat', 'sma', 'dem'];
export const FEATURE_SETS = ['gmu', 'parcels', 'stateTrust', 'sections', 'plss', 'tanks', 'springs', 'hpcWater', 'mvum', 'mvumTrails', 'trails', 'blmRec', 'wilderness', 'roadless', 'forests', 'allotments', 'wildlifeAreas', 'ranges', 'fires', 'firesCurrent', 'timber', 'fuels', 'restoration', 'migration', 'migrationRoutes', 'winterRange', 'cwd', 'wolf'];

// Every raster source here is 256 px, so MapLibre draws map zoom Z from tile zoom Z + 1; maxZ is the map zoom the user picks.
const zoomRange = (s, maxZ) => [s.minzoom || MIN_Z, Math.min(maxZ + 1, s.maxzoom || 19)];
function setTiles(s, bbox, maxZ) { const [lo, hi] = zoomRange(s, maxZ); return hi < lo ? [] : tilesForBbox(bbox, lo, hi); }

export function estimate(bbox, maxZ, sets) {
  let tiles = 0; let kb = 0;
  for (const k of sets) { const s = TILE_SETS[k]; if (!s) continue; const n = setTiles(s, bbox, maxZ).length; tiles += n; kb += n * s.kb; }
  return { tiles, mb: Math.round(kb / 1024), km2: Math.round(bboxAreaKm2(bbox)) };
}

async function pool(items, worker, onProgress) {
  let i = 0; let done = 0; let failed = 0;
  const run = async () => { while (i < items.length) { const it = items[i++]; try { await worker(it); } catch (_) { failed++; } done++; if (onProgress && done % 10 === 0) onProgress(done, items.length, failed); } };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
  if (onProgress) onProgress(done, items.length, failed);
  return { done, failed };
}

export async function downloadArea({ name, bbox, maxZ = 15, sets = DEFAULT_SETS, features = FEATURE_SETS, fetchFeatures, onProgress, signal }) {
  const id = uid();
  const cache = await caches.open(OFFLINE_CACHE);
  const jobs = [];
  for (const k of sets) { const s = TILE_SETS[k]; if (!s) continue; for (const [z, x, y] of setTiles(s, bbox, maxZ)) jobs.push(tileURL(s.tiles, z, x, y)); }
  let stage = 'tiles';
  const report = (d, t, f) => onProgress && onProgress({ stage, done: d, total: t, failed: f });
  const res = await pool(jobs, async (url) => {
    if (signal && signal.aborted) throw new Error('aborted');
    if (await cache.match(url)) return;
    const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error(String(r.status));
    await cache.put(url, r.clone());
  }, report);
  await ensureGlyphs().catch(() => {});
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
    for (const [z, x, y] of setTiles(s, area.bbox, area.maxZ)) {
      // keep tiles still covered by another area with the same set
      const shared = others.some((o) => o.sets.includes(k) && o.maxZ >= z && bboxIntersects(o.bbox, area.bbox));
      if (!shared) await cache.delete(tileURL(s.tiles, z, x, y));
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

// Label glyphs come from a CDN; these ranges cover Latin text, the degree sign and dashes used in labels.
const GLYPH_RANGES = [[0, 255], [256, 511], [8192, 8447]];
export function glyphURLs() { return GLYPH_RANGES.map(([a, b]) => GLYPHS.replace('{fontstack}', FONT.join(',')).replace('{range}', `${a}-${b}`)); }
export async function glyphStatus() {
  const cache = await caches.open(OFFLINE_CACHE); const urls = glyphURLs(); let cached = 0;
  for (const u of urls) if (await cache.match(u)) cached++;
  return { cached, total: urls.length };
}
export async function ensureGlyphs() {
  const cache = await caches.open(OFFLINE_CACHE);
  await Promise.all(glyphURLs().map(async (u) => {
    if (await cache.match(u)) return;
    const r = await fetch(u, { mode: 'cors' }); if (!r.ok) throw new Error(`glyphs ${r.status}`);
    await cache.put(u, r);
  }));
  return glyphStatus();
}

// Ask the service worker about the app-shell cache, or to fill holes in it. Resolves null when no worker controls the page yet.
function askWorker(type, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctl) return resolve(null);
    const ch = new MessageChannel(); const t = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (ev) => { clearTimeout(t); resolve(ev.data); };
    ctl.postMessage({ type }, [ch.port2]);
  });
}
export const shellStatus = () => askWorker('shellStatus');
export const recacheShell = () => askWorker('recache', 90000);
export async function offlineReadiness() {
  const [shell, glyphs, areas] = await Promise.all([shellStatus(), glyphStatus().catch(() => ({ cached: 0, total: 0 })), listAreas().catch(() => [])]);
  return { shell, glyphs, areas: areas.length };
}
