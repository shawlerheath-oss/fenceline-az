// Cache-first map tiles for the native app.
// In Safari the service worker (sw.js) answers tile requests from the fl-offline-v1 (downloaded areas) and fl-runtime-v1
// (tiles seen while online) caches. A WKWebView loading capacitor://localhost runs no service worker, so the same two
// caches are read here: through a MapLibre protocol for map sources and label glyphs, and through fetchTile for the
// DEM tiles terrain.js decodes itself.
import { isNative } from './native.js';

export const OFFLINE_CACHE = 'fl-offline-v1';
export const RUNTIME_CACHE = 'fl-runtime-v1';
export const RUNTIME_LIMIT = 6000;
export const PROTOCOL = 'flcache';
const PREFIX = `${PROTOCOL}://`;
const TRIM_EVERY = 200;
const TRIM_SLACK = 500;
const WRAPPED_TYPES = new Set(['Tile', 'Glyphs']);

export const wrapURL = (url) => `${PREFIX}${url}`;
export const unwrapURL = (url) => (url.startsWith(PREFIX) ? url.slice(PREFIX.length) : url);
export const isHTTP = (url) => /^https?:\/\//i.test(url);
export const shouldWrap = (url, resourceType) => isHTTP(url) && WRAPPED_TYPES.has(resourceType);

// MapLibre transformRequest: remote tiles and glyphs go through the flcache protocol; styles, sprites and the
// slope://, aspect:// and habitat:// protocols are left alone.
export const transformRequest = (url, resourceType) => (shouldWrap(url, resourceType) ? { url: wrapURL(url) } : undefined);

// MapLibre asks for parsed JSON, text or bytes depending on the request; raster tiles and glyphs are bytes.
function body(res, type) {
  if (type === 'json') return res.json();
  if (type === 'string') return res.text();
  return res.arrayBuffer();
}
const header = (res, name) => (res.headers && res.headers.get(name)) || undefined;

export function createTileCache({ caches = globalThis.caches, fetch = globalThis.fetch, runtimeLimit = RUNTIME_LIMIT } = {}) {
  let puts = 0;

  // A missing or broken Cache API must not take the map down: a failed lookup is a miss and the network answers.
  async function lookup(url) {
    if (!caches) return null;
    try {
      const off = await caches.open(OFFLINE_CACHE);
      const saved = await off.match(url);
      if (saved) return saved;
      const rt = await caches.open(RUNTIME_CACHE);
      return (await rt.match(url)) || null;
    } catch (_) { return null; }
  }

  // Over the limit, drop the oldest entries down to a target below it so the next few hundred puts need no trim.
  async function trim(rt) {
    const keys = await rt.keys();
    if (keys.length <= runtimeLimit) return;
    const target = Math.max(runtimeLimit - TRIM_SLACK, Math.floor(runtimeLimit / 2));
    const excess = keys.length - target;
    await Promise.all(keys.slice(0, excess).map((k) => rt.delete(k)));
  }

  async function remember(url, res) {
    try {
      const rt = await caches.open(RUNTIME_CACHE);
      await rt.put(url, res);
      if (++puts % TRIM_EVERY === 0) await trim(rt);
    } catch (_) { /* storage full or evicted: the tile still draws */ }
  }

  // Cache-first fetch. A saved tile answers at once; a fresh one is kept for next time. Rejects like fetch when offline.
  async function fetchTile(url, init = {}) {
    const hit = await lookup(url);
    if (hit) return hit;
    const res = await fetch(url, { mode: 'cors', ...init });
    if (res.ok) remember(url, res.clone());
    return res;
  }

  // MapLibre addProtocol loader. Errors carry the HTTP status so a 404 (no tile here) stays quiet like a direct fetch.
  async function load(params, abortController) {
    const url = unwrapURL(params.url);
    const res = await fetchTile(url, abortController ? { signal: abortController.signal } : {});
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText || ''} ${url}`.replace(/\s+/g, ' ').trim());
      err.status = res.status;
      throw err;
    }
    return { data: await body(res, params.type), cacheControl: header(res, 'Cache-Control'), expires: header(res, 'Expires') };
  }

  return { lookup, fetchTile, load };
}

let shared = null;
function sharedCache() {
  if (!shared) shared = createTileCache();
  return shared;
}

// fetch for tile URLs requested outside MapLibre (DEM tiles for slope, aspect, habitat and elevation).
// Safari's service worker already serves those from the caches; inside the app this does the same.
export function fetchTile(url, init) {
  return isNative() ? sharedCache().fetchTile(url, init) : fetch(url, init);
}

// Registers the flcache protocol and returns the transformRequest for the Map constructor.
export function installTileCache(maplibregl) {
  maplibregl.addProtocol(PROTOCOL, sharedCache().load);
  return transformRequest;
}
