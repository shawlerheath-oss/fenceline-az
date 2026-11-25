// habitat:// raster protocol: shades ground that matches the selected species' elevation band, aspect and slope.
// The preset comes from the species guide (guides.js habitatFor) and changes with species and month.
import { demTile, sample, slopeAspectAt, metersPerPixel } from './terrain.js';

const FT = 0.3048;
const STRONG = [46, 204, 113, 190]; // all three criteria
const PARTIAL = [255, 214, 0, 120]; // two of three
const ASPECT_ARCS = { N: [[315, 360], [0, 45]], NE: [[0, 90]], E: [[45, 135]], SE: [[90, 180]], S: [[135, 225]], SW: [[180, 270]], W: [[225, 315]], NW: [[270, 360]] };

let preset = { label: 'No species selected', elev: [0, 14000], asp: null, slope: [0, 90] };
let version = 1;

export function setHabitatPreset(p) {
  if (!p) return;
  preset = { label: p.label || '', elev: p.elev || [0, 14000], asp: p.asp && p.asp.length ? p.asp : null, slope: p.slope || [0, 90] };
  version++;
}
export function habitatLabel() { return preset.label; }
// Used as the layer's `resolve`: a new version in the URL makes MapLibre refetch every tile after a preset change.
export function habitatSource() { return { tiles: `habitat://${version}/{z}/{x}/{y}`, date: '', label: preset.label }; }

function aspectOk(a) {
  if (!preset.asp) return true;
  for (const k of preset.asp) for (const [lo, hi] of ASPECT_ARCS[k] || []) if (a >= lo && a <= hi) return true;
  return false;
}

async function renderHabitat(z, x, y) {
  const img = await demTile(z, x, y);
  const mpp = metersPerPixel(z, y);
  const lo = preset.elev[0] * FT; const hi = preset.elev[1] * FT;
  const out = new ImageData(256, 256);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const e = sample(img, px, py);
      const [s, a] = slopeAspectAt(img, px, py, mpp);
      const elevOk = e >= lo && e <= hi;
      const slopeOk = s >= preset.slope[0] && s <= preset.slope[1];
      const aspOk = s < 3 ? !preset.asp : aspectOk(a); // flats have no aspect
      const n = elevOk + slopeOk + aspOk;
      const c = n === 3 ? STRONG : n === 2 && elevOk ? PARTIAL : null;
      if (!c) continue;
      const o = (py * 256 + px) * 4;
      out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = c[3];
    }
  }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  cv.getContext('2d').putImageData(out, 0, 0);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// Tile URLs look like habitat://{version}/{z}/{x}/{y}; DEM tiles stop at z14 so higher zooms are overzoomed by MapLibre.
export function registerHabitatProtocol(maplibregl) {
  maplibregl.addProtocol('habitat', async (params) => {
    const m = params.url.match(/^habitat:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    if (!m) throw new Error('bad habitat tile url');
    const data = await renderHabitat(Math.min(+m[2], 14), +m[3], +m[4]);
    return { data };
  });
}
