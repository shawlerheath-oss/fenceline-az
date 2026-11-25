import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTileCache, transformRequest, wrapURL, unwrapURL, shouldWrap, OFFLINE_CACHE, RUNTIME_CACHE, PROTOCOL, fetchTile } from '../js/tile-cache.js';
import { FakeCacheStorage, okResponse, fakeFetch, installNativeBridge } from './helpers.mjs';

const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1620/803';
const GLYPH = 'https://demotiles.maplibre.org/font/Open%20Sans%20Semibold/0-255.pbf';

test('transformRequest routes remote tiles and glyphs through the flcache protocol', () => {
  assert.deepEqual(transformRequest(TILE, 'Tile'), { url: `${PROTOCOL}://${TILE}` });
  assert.deepEqual(transformRequest(GLYPH, 'Glyphs'), { url: `${PROTOCOL}://${GLYPH}` });
});

test('transformRequest leaves local protocols, styles and sprites alone', () => {
  assert.equal(transformRequest('slope://12/1620/803', 'Tile'), undefined);
  assert.equal(transformRequest('habitat://3/12/1620/803', 'Tile'), undefined);
  assert.equal(transformRequest('https://example.com/style.json', 'Style'), undefined);
  assert.equal(transformRequest('https://example.com/sprite.png', 'SpriteImage'), undefined);
  assert.equal(shouldWrap(`${PROTOCOL}://${TILE}`, 'Tile'), false, 'never double-wraps');
});

test('wrapURL and unwrapURL round-trip and tolerate plain URLs', () => {
  assert.equal(unwrapURL(wrapURL(TILE)), TILE);
  assert.equal(unwrapURL(TILE), TILE);
});

test('a tile saved in the offline area cache answers without touching the network', async () => {
  const caches = new FakeCacheStorage();
  const off = await caches.open(OFFLINE_CACHE);
  await off.put(TILE, okResponse('offline-bytes'));
  const fetch = fakeFetch();
  const { load } = createTileCache({ caches, fetch });

  const out = await load({ url: wrapURL(TILE), type: 'arrayBuffer' }, new AbortController());

  assert.equal(new TextDecoder().decode(out.data), 'offline-bytes');
  assert.equal(fetch.calls.length, 0);
});

test('a tile seen earlier while online answers from the runtime cache', async () => {
  const caches = new FakeCacheStorage();
  const rt = await caches.open(RUNTIME_CACHE);
  await rt.put(TILE, okResponse('runtime-bytes'));
  const fetch = fakeFetch();
  const { load } = createTileCache({ caches, fetch });

  const out = await load({ url: wrapURL(TILE), type: 'arrayBuffer' });

  assert.equal(new TextDecoder().decode(out.data), 'runtime-bytes');
  assert.equal(fetch.calls.length, 0);
});

test('a cache miss fetches with CORS, returns the bytes and keeps a copy for next time', async () => {
  const caches = new FakeCacheStorage();
  const fetch = fakeFetch({ [TILE]: () => okResponse('fresh-bytes', { 'Cache-Control': 'max-age=60' }) });
  const { load, lookup } = createTileCache({ caches, fetch });

  const out = await load({ url: wrapURL(TILE), type: 'arrayBuffer' });

  assert.equal(new TextDecoder().decode(out.data), 'fresh-bytes');
  assert.equal(out.cacheControl, 'max-age=60');
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, TILE);
  assert.equal(fetch.calls[0].init.mode, 'cors');
  const kept = await lookup(TILE);
  assert.ok(kept, 'stored in the runtime cache');
  assert.equal(await kept.text(), 'fresh-bytes');
  assert.equal((await caches.open(OFFLINE_CACHE)).map.size, 0, 'downloaded-area cache is never written by browsing');
});

test('the offline cache wins over the runtime cache', async () => {
  const caches = new FakeCacheStorage();
  await (await caches.open(OFFLINE_CACHE)).put(TILE, okResponse('offline'));
  await (await caches.open(RUNTIME_CACHE)).put(TILE, okResponse('runtime'));
  const { load } = createTileCache({ caches, fetch: fakeFetch() });
  const out = await load({ url: wrapURL(TILE), type: 'arrayBuffer' });
  assert.equal(new TextDecoder().decode(out.data), 'offline');
});

test('no cache and no network rejects like fetch does, so MapLibre marks the tile errored', async () => {
  const { load } = createTileCache({ caches: new FakeCacheStorage(), fetch: fakeFetch() });
  await assert.rejects(load({ url: wrapURL(TILE), type: 'arrayBuffer' }), /Failed to fetch/);
});

test('an HTTP error carries its status and is not cached', async () => {
  const caches = new FakeCacheStorage();
  const fetch = fakeFetch({ [TILE]: () => new Response('', { status: 404, statusText: 'Not Found' }) });
  const { load, lookup } = createTileCache({ caches, fetch });
  await assert.rejects(load({ url: wrapURL(TILE), type: 'arrayBuffer' }), (e) => e.status === 404);
  assert.equal(await lookup(TILE), null);
});

test('json and string requests are decoded for MapLibre', async () => {
  const caches = new FakeCacheStorage();
  const fetch = fakeFetch({
    'https://example.com/tiles.json': () => new Response(JSON.stringify({ tiles: ['x'] }), { status: 200 }),
    'https://example.com/text': () => new Response('hello', { status: 200 })
  });
  const { load } = createTileCache({ caches, fetch });
  assert.deepEqual((await load({ url: wrapURL('https://example.com/tiles.json'), type: 'json' })).data, { tiles: ['x'] });
  assert.equal((await load({ url: wrapURL('https://example.com/text'), type: 'string' })).data, 'hello');
});

test('the runtime cache is trimmed once it passes its limit', async () => {
  const caches = new FakeCacheStorage();
  const routes = {};
  const urls = Array.from({ length: 210 }, (_, i) => `https://example.com/t/${i}`);
  for (const u of urls) routes[u] = () => okResponse(u);
  const fetch = fakeFetch(routes);
  const { fetchTile } = createTileCache({ caches, fetch, runtimeLimit: 100 });
  for (const u of urls) await fetchTile(u);
  await new Promise((r) => setTimeout(r, 0));
  const rt = await caches.open(RUNTIME_CACHE);
  assert.ok(rt.map.size < 210, `trimmed to ${rt.map.size}`);
  assert.ok(!rt.map.has(urls[0]), 'oldest tile goes first');
  assert.ok(rt.map.has(urls[199]), 'the newest tile at trim time survives');
  assert.ok(rt.map.has(urls[209]), 'newest tile survives');
});

test('a broken Cache API is treated as a miss and the network still answers', async () => {
  const caches = { open: async () => { throw new Error('SecurityError'); } };
  const fetch = fakeFetch({ [TILE]: () => okResponse('net') });
  const { load } = createTileCache({ caches, fetch });
  const out = await load({ url: wrapURL(TILE), type: 'arrayBuffer' });
  assert.equal(new TextDecoder().decode(out.data), 'net');
  const { load: noCaches } = createTileCache({ caches: undefined, fetch });
  assert.equal(new TextDecoder().decode((await noCaches({ url: wrapURL(TILE), type: 'arrayBuffer' })).data), 'net');
});

test('fetchTile is a plain fetch on the web and cache-first inside the app', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(url); return okResponse('net'); };
  try {
    await fetchTile('https://example.com/dem.png', { mode: 'cors' });
    assert.deepEqual(calls, ['https://example.com/dem.png']);
    const uninstall = installNativeBridge();
    globalThis.caches = new FakeCacheStorage();
    await (await globalThis.caches.open(OFFLINE_CACHE)).put('https://example.com/dem.png', okResponse('saved'));
    const res = await fetchTile('https://example.com/dem.png', { mode: 'cors' });
    assert.equal(await res.text(), 'saved');
    assert.equal(calls.length, 1, 'no network call when the tile is saved');
    uninstall();
  } finally {
    globalThis.fetch = realFetch; delete globalThis.caches;
  }
});
