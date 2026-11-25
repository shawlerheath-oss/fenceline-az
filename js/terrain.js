// Elevation sampling and slope/aspect raster protocols built from Terrarium DEM tiles.
import { TILES } from './config.js';
import { lonLatToTileFrac } from './util.js';

const DEM_Z = 12;
const demCache = new Map(); // key -> ImageData (256x256)
const MAX_DEM = 120;

function demURL(z, x, y) { return TILES.terrarium.replace('{z}', z).replace('{x}', x).replace('{y}', y); }

async function loadImage(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`DEM ${res.status}`);
  const blob = await res.blob();
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = URL.createObjectURL(blob); });
}

function toImageData(img) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 256, 256);
  return ctx.getImageData(0, 0, 256, 256);
}

export async function demTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (demCache.has(key)) return demCache.get(key);
  const p = loadImage(demURL(z, x, y)).then(toImageData);
  demCache.set(key, p);
  if (demCache.size > MAX_DEM) demCache.delete(demCache.keys().next().value);
  try { return await p; } catch (e) { demCache.delete(key); throw e; }
}

export const decodeTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

export function sample(img, px, py) {
  const i = (Math.min(255, Math.max(0, py)) * 256 + Math.min(255, Math.max(0, px))) * 4;
  return decodeTerrarium(img.data[i], img.data[i + 1], img.data[i + 2]);
}

// Elevation in meters at a lon/lat, bilinear from a z12 tile (about 38 m per pixel at Arizona latitudes).
export async function elevationAt(lon, lat) {
  const [fx, fy] = lonLatToTileFrac(DEM_Z, lon, lat);
  const tx = Math.floor(fx); const ty = Math.floor(fy);
  const img = await demTile(DEM_Z, tx, ty);
  const px = (fx - tx) * 256 - 0.5; const py = (fy - ty) * 256 - 0.5;
  const x0 = Math.floor(px); const y0 = Math.floor(py); const dx = px - x0; const dy = py - y0;
  const e00 = sample(img, x0, y0); const e10 = sample(img, x0 + 1, y0); const e01 = sample(img, x0, y0 + 1); const e11 = sample(img, x0 + 1, y0 + 1);
  return (e00 * (1 - dx) + e10 * dx) * (1 - dy) + (e01 * (1 - dx) + e11 * dx) * dy;
}

// Elevation profile along a line of lon/lat points, sampled every `stepM` meters.
export async function profile(coords, stepM = 30, haversine, destination, bearing) {
  const pts = [];
  let carried = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]; const b = coords[i + 1]; const len = haversine(a, b); const brg = bearing(a, b);
    for (let d = carried; d < len; d += stepM) { pts.push(destination(a, brg, d)); }
    carried = (carried + Math.ceil((len - carried) / stepM) * stepM) - len;
  }
  pts.push(coords[coords.length - 1]);
  const elevs = await Promise.all(pts.map((p) => elevationAt(p[0], p[1]).catch(() => null)));
  return pts.map((p, i) => ({ lon: p[0], lat: p[1], elev: elevs[i] }));
}

// Slope (deg) and aspect (deg, 0 = north) for a single pixel using a 3x3 window.
export function slopeAspectAt(img, px, py, mPerPx) {
  const z = (dx, dy) => sample(img, px + dx, py + dy);
  const a = z(-1, -1); const b = z(0, -1); const c = z(1, -1);
  const d = z(-1, 0); const f = z(1, 0);
  const g = z(-1, 1); const hh = z(0, 1); const i = z(1, 1);
  const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * mPerPx);
  const dzdy = ((g + 2 * hh + i) - (a + 2 * b + c)) / (8 * mPerPx);
  const slope = Math.atan(Math.hypot(dzdx, dzdy)) * (180 / Math.PI);
  let aspect = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI;
  aspect = aspect < 0 ? 90 - aspect : aspect > 90 ? 360 - aspect + 90 : 90 - aspect;
  return [slope, aspect];
}

const SLOPE_RAMP = [
  [15, [0, 0, 0, 0]], [25, [255, 230, 0, 150]], [30, [255, 150, 0, 170]], [35, [235, 50, 50, 185]], [45, [150, 40, 190, 200]], [91, [60, 20, 90, 215]]
];
function slopeColor(s) { for (const [max, c] of SLOPE_RAMP) if (s < max) return c; return SLOPE_RAMP[SLOPE_RAMP.length - 1][1]; }
function aspectColor(a, slope) {
  if (slope < 4) return [0, 0, 0, 0];
  // N blue, E green, S orange, W purple, blended around the circle.
  const stops = [[0, [40, 110, 255]], [90, [40, 200, 120]], [180, [255, 150, 30]], [270, [170, 60, 220]], [360, [40, 110, 255]]];
  let k = 0; while (a > stops[k + 1][0]) k++;
  const t = (a - stops[k][0]) / 90; const c0 = stops[k][1]; const c1 = stops[k + 1][1];
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, 165];
}

export function metersPerPixel(z, y) {
  const n = 2 ** z; const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
  return (40075016.686 * Math.cos(lat)) / (n * 256);
}

async function renderDerived(kind, z, x, y) {
  const img = await demTile(z, x, y);
  const mpp = metersPerPixel(z, y);
  const out = new ImageData(256, 256);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const [s, a] = slopeAspectAt(img, px, py, mpp);
      const c = kind === 'slope' ? slopeColor(s) : aspectColor(a, s);
      const o = (py * 256 + px) * 4;
      out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = c[3];
    }
  }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  cv.getContext('2d').putImageData(out, 0, 0);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// Registers slope:// and aspect:// protocols. Tile URLs look like slope://{z}/{x}/{y}.
export function registerTerrainProtocols(maplibregl) {
  for (const kind of ['slope', 'aspect']) {
    maplibregl.addProtocol(kind, async (params) => {
      const m = params.url.match(/^\w+:\/\/(\d+)\/(\d+)\/(\d+)/);
      if (!m) throw new Error('bad tile url');
      const z = +m[1]; const x = +m[2]; const y = +m[3];
      const data = await renderDerived(kind, Math.min(z, 14), x, y);
      return { data };
    });
  }
}

export function clearDemCache() { demCache.clear(); }
