// In-memory stand-ins for the Cache API and fetch, enough to exercise tile-cache.js without a browser.
const key = (u) => (typeof u === 'string' ? u : u.url);

export class FakeCache {
  constructor() { this.map = new Map(); }
  async match(url) { const v = this.map.get(key(url)); return v ? v.clone() : undefined; }
  async put(url, res) { this.map.set(key(url), res); }
  async delete(url) { return this.map.delete(key(url)); }
  async keys() { return [...this.map.keys()].map((u) => new Request(u)); }
}

export class FakeCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) { if (!this.caches.has(name)) this.caches.set(name, new FakeCache()); return this.caches.get(name); }
  async has(name) { return this.caches.has(name); }
  async delete(name) { return this.caches.delete(name); }
}

export const bytes = (text) => new TextEncoder().encode(text);
export const okResponse = (text, headers = {}) => new Response(bytes(text), { status: 200, headers: { 'Content-Type': 'image/png', ...headers } });

// fetch that records calls and answers from a url -> Response factory map; anything else is a network failure.
export function fakeFetch(routes = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const make = routes[url];
    if (!make) throw new TypeError('Failed to fetch');
    return make();
  };
  fn.calls = calls;
  return fn;
}

export function installNativeBridge(plugins = ['Geolocation', 'BackgroundGeolocation']) {
  globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', PluginHeaders: plugins.map((name) => ({ name, methods: [] })) } };
  return () => { delete globalThis.window; };
}
