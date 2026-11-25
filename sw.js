/* Fenceline service worker: app shell + map tile caching for offline hunts. */
const VERSION = 'fl-shell-v3';
const RUNTIME = 'fl-runtime-v1';
const OFFLINE = 'fl-offline-v1';
const RUNTIME_LIMIT = 6000;

const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './vendor/maplibre-gl.js', './vendor/maplibre-gl.css',
  './js/app.js', './js/config.js', './js/util.js', './js/sun.js', './js/store.js',
  './js/arcgis.js', './js/terrain.js', './js/basemaps.js', './js/layers.js',
  './js/weather.js', './js/markup.js', './js/tracking.js', './js/tools.js',
  './js/offline.js', './js/species.js', './js/features.js', './js/units.js',
  './js/ui.js', './js/panels.js', './js/editors.js', './js/icons.js',
  './js/imagery.js', './js/cropland.js', './js/guides.js', './js/guide-data.js', './js/guide-data-2.js', './js/habitat.js', './js/insights.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

const TILE_HOSTS = [
  'server.arcgisonline.com', 'basemap.nationalmap.gov', 'elevation-tiles-prod',
  'gis.blm.gov', 'demotiles.maplibre.org',
  // Dated or stamped image services: every URL names its date, so cache-first is safe.
  'gibs.earthdata.nasa.gov', 'tilecache.rainviewer.com', 'elevation.nationalmap.gov', 'imagery.nationalmap.gov',
  'pdi.scinet.usda.gov', 'mapservices.weather.noaa.gov'
];
const DATA_HOSTS = ['arcgis.com', 'open-meteo.com', 'fs.usda.gov', 'azgfd', 'maricopa.gov', 'pima.gov', 'pinal.gov', 'yavapaiaz.gov', 'coconino.az.gov', 'mohave.gov',
  'api.rainviewer.com', 'hydro.nationalmap.gov', 'gisdata.azland.gov', 'azwatermaps.azwater.gov'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('fl-shell-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Page messages: 'skipWaiting', or { type: 'shellStatus' | 'recache' } with a MessageChannel port for the reply.
self.addEventListener('message', (e) => {
  const d = e.data; const type = typeof d === 'string' ? d : d && d.type;
  if (type === 'skipWaiting') { self.skipWaiting(); return; }
  if (type !== 'shellStatus' && type !== 'recache') return;
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    const missing = async () => { const out = []; for (const u of SHELL) if (!(await c.match(u, { ignoreSearch: true }))) out.push(u); return out; };
    let miss = await missing();
    if (type === 'recache' && miss.length) { await Promise.allSettled(miss.map((u) => c.add(u))); miss = await missing(); }
    const port = e.ports && e.ports[0];
    if (port) port.postMessage({ type, version: VERSION, total: SHELL.length, cached: SHELL.length - miss.length, missing: miss });
  })());
});

function isTile(url) { return TILE_HOSTS.some((h) => url.hostname.includes(h) || url.href.includes(h)); }
function isData(url) { return DATA_HOSTS.some((h) => url.hostname.includes(h)); }

async function trimRuntime() {
  try {
    const c = await caches.open(RUNTIME);
    const keys = await c.keys();
    if (keys.length > RUNTIME_LIMIT) {
      const excess = keys.length - RUNTIME_LIMIT + 500;
      await Promise.all(keys.slice(0, excess).map((k) => c.delete(k)));
    }
  } catch (_) { /* ignore */ }
}
let trimCounter = 0;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        // Clone before the page starts reading the body, or the copy fails and the shell never refreshes.
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => null);
      if (cached) { network.catch(() => {}); return cached; }
      const res = await network;
      return res || new Response('Offline', { status: 503, statusText: 'Offline' });
    })());
    return;
  }

  if (isTile(url)) {
    e.respondWith((async () => {
      const off = await caches.open(OFFLINE);
      const hit = (await off.match(req.url)) || (await (await caches.open(RUNTIME)).match(req.url));
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          const rt = await caches.open(RUNTIME);
          rt.put(req.url, res.clone()).catch(() => {});
          if (++trimCounter % 200 === 0) trimRuntime();
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'Tile unavailable offline' });
      }
    })());
    return;
  }

  if (isData(url)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const rt = await caches.open(RUNTIME);
          rt.put(req.url, res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        const hit = await (await caches.open(RUNTIME)).match(req.url);
        return hit || new Response(JSON.stringify({ error: { message: 'offline' } }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
  }
});
