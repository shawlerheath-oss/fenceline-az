// USDA Cropland Data Layer: which crop is under a point (CroplandCROS ImageServer identify).
// The server legend is cached for a year; a built-in table covers the common Arizona crops if it is unreachable.
import { SERVICES } from './config.js';
import { store } from './store.js';

const YEAR = 365 * 86400000;
const CDL_FALLBACK = {
  1: 'Corn', 2: 'Cotton', 4: 'Sorghum', 21: 'Barley', 22: 'Durum wheat', 24: 'Winter wheat', 25: 'Other small grains', 28: 'Oats',
  33: 'Safflower', 36: 'Alfalfa', 37: 'Other hay (non-alfalfa)', 42: 'Dry beans', 44: 'Other crops', 47: 'Misc vegetables & fruits',
  48: 'Watermelons', 49: 'Onions', 54: 'Tomatoes', 58: 'Clover / wildflowers', 59: 'Sod / grass seed', 61: 'Fallow / idle cropland',
  69: 'Grapes', 72: 'Citrus', 74: 'Pecans', 111: 'Open water', 121: 'Developed (open space)', 122: 'Developed (low)', 123: 'Developed (medium)',
  124: 'Developed (high)', 131: 'Barren', 141: 'Deciduous forest', 142: 'Evergreen forest', 143: 'Mixed forest', 152: 'Shrubland',
  176: 'Grassland / pasture', 190: 'Woody wetlands', 195: 'Herbaceous wetlands', 204: 'Pistachios', 205: 'Triticale', 206: 'Carrots',
  208: 'Garlic', 209: 'Cantaloupes', 211: 'Olives', 212: 'Oranges', 213: 'Honeydew melons', 214: 'Broccoli', 216: 'Peppers', 219: 'Greens',
  227: 'Lettuce', 243: 'Cabbage', 244: 'Cauliflower', 245: 'Celery', 246: 'Radishes', 247: 'Turnips', 248: 'Eggplants'
};
// Crops that draw deer, elk, javelina, doves and cranes to the field edge at dusk.
const FEED = /alfalfa|hay|corn|wheat|barley|sorghum|oats|triticale|small grains|clover|safflower|pasture|fallow/i;

let legendPromise = null;
function legend() {
  if (legendPromise) return legendPromise;
  legendPromise = (async () => {
    const cached = await store.get('cache', 'cdl:legend');
    if (cached && cached.map && Date.now() - (cached.fetchedAt || 0) < YEAR) return cached.map;
    const r = await fetch(`${SERVICES.cropland.legend}?f=json`);
    if (!r.ok) throw new Error(`legend ${r.status}`);
    const j = await r.json();
    const map = {};
    for (const layer of j.layers || []) for (const it of layer.legend || []) for (const v of it.values || []) map[String(v)] = it.label;
    if (!Object.keys(map).length) throw new Error('empty legend');
    await store.put('cache', 'cdl:legend', { map, fetchedAt: Date.now() });
    return map;
  })().catch((e) => { legendPromise = null; throw e; });
  return legendPromise;
}

// Resolves to { code, label, isFeed } or null where there is no cropland pixel.
export async function cropAt(lon, lat, signal) {
  const geom = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  const url = `${SERVICES.cropland.identify}?geometry=${geom}&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`identify ${r.status}`);
  const j = await r.json();
  const raw = j.value;
  if (raw == null || raw === 'NoData' || raw === '' || Number(raw) === 0) return null;
  const code = Number(raw);
  const names = await legend().catch(() => ({}));
  const label = names[String(code)] || CDL_FALLBACK[code] || `Crop code ${raw}`;
  return { code, label, isFeed: FEED.test(label) };
}
