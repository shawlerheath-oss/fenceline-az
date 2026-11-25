// Game management unit helpers.
import { SERVICES } from './config.js';
import { pickValue } from './arcgis.js';
import { pointInGeom, esc } from './util.js';

export function unitName(props) { return pickValue(props, SERVICES.gmu.nameFields) ?? ''; }
export function unitRegion(props) { return pickValue(props, SERVICES.gmu.regionFields) ?? ''; }

export function findUnit(features, lon, lat) {
  const pt = [lon, lat];
  return features.find((f) => pointInGeom(pt, f.geometry)) || null;
}

export function unitLinks(props) {
  const L = SERVICES.gmu.linkFields; const links = [];
  const add = (label, url) => { if (url && /^https?:/i.test(url)) links.push({ label, url }); };
  add('AZGFD unit page', props[L.agfd]);
  add('Forest Service', props[L.usfs]);
  add('BLM', props[L.blm]);
  add('Fish & Wildlife', props[L.fws]);
  links.push({ label: 'Hunt regulations', url: 'https://www.azgfd.com/hunting/regulations/' });
  links.push({ label: 'Draw odds & hunt data', url: 'https://www.azgfd.com/hunting/draw/' });
  links.push({ label: 'Unit hunt guidelines', url: 'https://www.azgfd.com/hunting/units/' });
  return links;
}

export function unitHTML(props) {
  const name = unitName(props); const region = unitRegion(props);
  const sqmi = props.SQ_MILES; const acres = props.ACRES;
  const links = unitLinks(props).map((l) => `<a class="btn btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('');
  return `
    <div class="kv"><span>Unit</span><b>${esc(name)}</b></div>
    ${region ? `<div class="kv"><span>Region</span><b>${esc(region)}</b></div>` : ''}
    ${sqmi ? `<div class="kv"><span>Size</span><b>${Math.round(sqmi).toLocaleString()} sq mi · ${Math.round(acres || sqmi * 640).toLocaleString()} ac</b></div>` : ''}
    <div class="row wrap gap">${links}</div>
    <p class="muted small">Unit boundaries from the AZGFD public layer (last revised 2018). Confirm boundaries and dates in the current regulations.</p>`;
}

export function listUnits(features) {
  return features.map((f) => ({ name: unitName(f.properties), region: unitRegion(f.properties), feature: f }))
    .filter((u) => u.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
