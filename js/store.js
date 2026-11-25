// IndexedDB persistence with an in-memory fallback. All stores use out-of-line keys.
const DB_NAME = 'fenceline-db'; const DB_VER = 1;
const STORES = ['markup', 'tracks', 'kv', 'areas', 'areaFeatures', 'cache', 'tags', 'logs'];
let dbPromise = null; const memory = new Map();

function open() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no idb'));
  dbPromise = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { const d = r.result; for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}
function mem(store) { if (!memory.has(store)) memory.set(store, new Map()); return memory.get(store); }
async function tx(store, mode, fn) {
  try {
    const d = await open();
    return await new Promise((res, rej) => {
      const t = d.transaction(store, mode); const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    });
  } catch (err) {
    return null; // caller falls back to memory
  }
}

export const store = {
  async get(s, k) { const v = await tx(s, 'readonly', (o) => o.get(k)); return v == null ? mem(s).get(k) : v; },
  async put(s, k, v) { mem(s).set(k, v); await tx(s, 'readwrite', (o) => o.put(v, k)); return v; },
  async del(s, k) { mem(s).delete(k); await tx(s, 'readwrite', (o) => o.delete(k)); },
  async all(s) { const v = await tx(s, 'readonly', (o) => o.getAll()); return v || Array.from(mem(s).values()); },
  async keys(s) { const v = await tx(s, 'readonly', (o) => o.getAllKeys()); return v || Array.from(mem(s).keys()); },
  async clear(s) { mem(s).clear(); await tx(s, 'readwrite', (o) => o.clear()); },
  async getKV(k, def) { const v = await this.get('kv', k); return v === undefined || v === null ? def : v; },
  setKV(k, v) { return this.put('kv', k, v); },
  async estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (_) { /* ignore */ }
    return null;
  },
  async persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (_) { /* ignore */ }
    return false;
  }
};
