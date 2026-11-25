// Native shell detection and Capacitor plugin access.
// The same files run as a PWA in Safari and inside the WKWebView of the iOS app. The app injects the Capacitor bridge
// (window.Capacitor) before any module runs, so its presence is what tells the two shells apart.
const bridge = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);

export function isNative() {
  const cap = bridge();
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export function nativePlatform() {
  const cap = bridge();
  return isNative() && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
}

// Plugins compiled into the app announce themselves through the bridge's PluginHeaders list.
export function hasPlugin(name) {
  const cap = bridge();
  return !!(cap && Array.isArray(cap.PluginHeaders) && cap.PluginHeaders.some((h) => h && h.name === name));
}

let corePromise = null;
const proxies = new Map();
// Vendored @capacitor/core turns a plugin name into a proxy whose methods run native code. Only the app ever loads it.
function core() {
  if (!corePromise) corePromise = import('../vendor/capacitor-core.js');
  return corePromise;
}

// Resolves to the plugin proxy, or null outside the app or when the plugin is not compiled in.
export function plugin(name) {
  if (!isNative() || !hasPlugin(name)) return Promise.resolve(null);
  if (!proxies.has(name)) proxies.set(name, core().then((m) => m.registerPlugin(name)));
  return proxies.get(name);
}
