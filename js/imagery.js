// Dated and live raster sources: NASA GIBS (daily imagery, snow cover, NDVI), HLS 30 m scenes, RainViewer radar.
// Each resolver returns { tiles, date, label } for LayerManager to feed a raster source.
import { GIBS, RAINVIEWER } from './config.js';

const DAY = 86400000;
const lonLatToTile = (z, lon, lat) => { const n = 2 ** z; const r = lat * Math.PI / 180; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };
const AZ_PROBE = [6, 12, 25]; // z/x/y tile over central Arizona, exists in every GIBS level >= 6
const HLS_MIN_BYTES = 2500; // a fully transparent 256 px PNG is about 1.2 KB

export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
export const shiftDays = (iso, n) => isoDate(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY);
export function fmtImageryDate(iso) { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
export function gibsTemplate(layer, date) { return `${GIBS.base}/${layer.id}/default/${date}/GoogleMapsCompatible_Level${layer.level}/{z}/{y}/{x}.${layer.ext}`; }
const fill = (tpl, z, x, y) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);

async function tileBytes(url, signal) {
  try {
    const r = await fetch(url, { signal }); if (!r.ok) return -1;
    return (await r.arrayBuffer()).byteLength;
  } catch (e) { return -1; }
}

// 8-day composites are dated on day 1, 9, 17, … of each year.
function latestAligned(layer, from) {
  const period = layer.period || 1; if (period === 1) return from;
  const d = new Date(`${from}T00:00:00Z`); const y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - y0) / DAY);
  return isoDate(y0 + Math.floor(doy / period) * period * DAY);
}

// Newest published date for a GIBS layer, stepping back `step` periods from it. Probes one tile per candidate date.
export async function resolveGibs(layer, { step = 0, maxBack = 8, signal } = {}) {
  const period = layer.period || 1;
  let date = latestAligned(layer, shiftDays(isoDate(Date.now()), -(layer.lag || 1)));
  let skipped = 0;
  for (let i = 0; i < maxBack + step; i++) {
    const tpl = gibsTemplate(layer, date);
    if (await tileBytes(fill(tpl, ...AZ_PROBE), signal) > 0) {
      if (skipped === step) return { tiles: tpl, date, label: `${fmtImageryDate(date)}${period > 1 ? ` · ${period}-day composite` : ''}` };
      skipped++;
    }
    date = shiftDays(date, -period);
  }
  throw new Error('no recent dates published');
}

// Newest HLS (Harmonized Landsat Sentinel-2) scene with data over the map center. Sentinel-2 and Landsat are checked per day.
export async function resolveHls({ center, step = 0, maxBack = 24, signal } = {}) {
  const [x, y] = lonLatToTile(12, center[0], center[1]);
  const cands = [GIBS.hlsS30, GIBS.hlsL30];
  let date = shiftDays(isoDate(Date.now()), -GIBS.hlsS30.lag); let found = 0;
  for (let i = 0; i < maxBack; i++) {
    const sizes = await Promise.all(cands.map((L) => tileBytes(fill(gibsTemplate(L, date), 12, x, y), signal)));
    const best = sizes.indexOf(Math.max(...sizes));
    if (sizes[best] >= HLS_MIN_BYTES) {
      if (found === step) { const L = cands[best]; return { tiles: gibsTemplate(L, date), date, label: `${fmtImageryDate(date)} · ${L === GIBS.hlsS30 ? 'Sentinel-2' : 'Landsat'}` }; }
      found++;
    }
    date = shiftDays(date, -1);
  }
  throw new Error('no clear 30 m scene here in the last 24 days');
}

// Latest RainViewer radar frame (updates every 10 minutes).
export async function resolveRadar({ signal } = {}) {
  const r = await fetch(RAINVIEWER.api, { signal }); if (!r.ok) throw new Error(`RainViewer ${r.status}`);
  const j = await r.json(); const past = (j.radar && j.radar.past) || []; const last = past[past.length - 1];
  if (!last) throw new Error('no radar frames');
  const t = new Date(last.time * 1000);
  return { tiles: `${j.host}${last.path}${RAINVIEWER.suffix}`, date: t.toISOString(), label: `Radar ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, refreshMs: 5 * 60000 };
}

// Daily cache-buster for services that redraw the same URL with new data (NOHRSC snow depth).
export function dailyStamp(tiles) { return { tiles: `${tiles}&d=${isoDate(Date.now())}`, date: isoDate(Date.now()), label: 'Updated daily by NOHRSC' }; }
