// Editors and dialogs: waypoint editor, approach picker, shape drawing, offline download, boundary parcels, search.
import { KINDS, shrinkPhoto } from './markup.js';
import { icon, markerSVG } from './icons.js';
import { rateStand, bestWinds } from './weather.js';
import { TILE_SETS, FEATURE_SETS, estimate, downloadArea, listAreas, removeArea, storageEstimate } from './offline.js';
import { LAYER_DEFS } from './layers.js';
import { queryFeatures } from './arcgis.js';
import { COUNTY_PARCELS, TZ } from './config.js';
import { unitName } from './units.js';
import { h, esc, qs, qsa, fmtDist, fmtArea, fmtDate, fmtTime, compass16, haversine, bearing, bboxIntersects, pointInGeom } from './util.js';
import { fmtBearing } from './tools.js';
import { envText } from './insights.js';

const kindGrid = (cur) => `<div class="grid-kinds">${Object.entries(KINDS).map(([k, v]) => `<button type="button" data-kind="${k}" class="${k === cur ? 'on' : ''}"><span class="mk-dot" style="--c:${v.color}">${markerSVG(v.glyph)}</span>${esc(v.label)}</button>`).join('')}</div>`;

export function waypointEditor(app, item) {
  const u = app.settings.units; const here = app.here();
  const root = h('<div class="stack"></div>');
  const k = KINDS[item.kind] || KINDS.pin;
  root.appendChild(h(`<div class="sheet-title"><div class="row gap"><span class="mk-dot" style="--c:${item.color || k.color}">${markerSVG(k.glyph)}</span><h2 class="grow">${esc(item.name)}</h2></div><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const facts = [];
  if (item.type === 'point') {
    facts.push(`${item.coords[1].toFixed(5)}, ${item.coords[0].toFixed(5)}`);
    if (here) facts.push(`${fmtDist(haversine(here, item.coords), u)} ${fmtBearing(bearing(here, item.coords))} from you`);
  } else { const s = app.markup.stats(item); if (s.lengthM != null) facts.push(`Length ${fmtDist(s.lengthM, u)}`); if (s.areaM2 != null) facts.push(`${fmtArea(s.areaM2, u)} · perimeter ${fmtDist(s.perimM, u)}`); }
  facts.push(`Created ${fmtDate(item.created, TZ)}`);
  root.appendChild(h(`<p class="small muted">${facts.map(esc).join(' · ')}</p>`));
  root.appendChild(h(`<label class="field">Name<input type="text" name="name" value="${esc(item.name)}"></label>`));
  if (item.type === 'point') root.appendChild(h(`<label class="field">Type${kindGrid(item.kind)}</label>`));
  root.appendChild(h(`<label class="field">Notes<textarea name="notes" placeholder="What did you see? Wind, time, sign…">${esc(item.notes || '')}</textarea></label>`));
  if (item.env) root.appendChild(h(`<p class="small muted" style="margin:-4px 0 0">${icon('wind')} Logged ${esc(envText(item.env, app.settings.units))}</p>`));
  root.appendChild(h(`<label class="field">Tags (comma separated)<input type="text" name="tags" value="${esc((item.tags || []).join(', '))}" placeholder="unit 6A, 2026 elk, scouting"></label>`));
  if (item.kind === 'stand' && item.type === 'point') root.appendChild(standBlock(app, item));
  root.appendChild(photosBlock(app, item));
  const actions = h(`<div class="row wrap gap" style="margin-top:12px"><button class="btn btn-primary" data-save>Save</button><button class="btn" data-go>${icon('target')} Go</button>${item.type === 'point' ? `<button class="btn" data-move>Move</button>` : ''}<button class="btn" data-share>${icon('share')}</button><button class="btn btn-danger btn-icon" data-del aria-label="Delete">${icon('trash')}</button></div>`);
  root.appendChild(actions);
  let kind = item.kind;
  qsa('[data-kind]', root).forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; qsa('[data-kind]', root).forEach((x) => x.classList.toggle('on', x === b)); }));
  const collect = () => ({ name: qs('[name=name]', root).value.trim() || item.name, notes: qs('[name=notes]', root).value, tags: qs('[name=tags]', root).value.split(',').map((t) => t.trim()).filter(Boolean), kind });
  qs('[data-save]', actions).addEventListener('click', async () => { await app.markup.update(item.id, collect()); app.ui.toast('Saved'); app.ui.hideSheet(); app.updateScent(); });
  qs('[data-go]', actions).addEventListener('click', () => { app.goTo(item); });
  const mv = qs('[data-move]', actions); if (mv) mv.addEventListener('click', () => { app.ui.hideSheet(); app.movePoint(item); });
  qs('[data-share]', actions).addEventListener('click', () => app.share(`${item.name}.gpx`, app.markup.exportGPX([item]), 'application/gpx+xml'));
  qs('[data-del]', actions).addEventListener('click', async () => { if (await app.ui.confirm(`Delete "${item.name}"?`, { ok: 'Delete', danger: true })) { await app.markup.remove(item.id); app.ui.hideSheet(); app.updateScent(); } });
  return root;
}
function standBlock(app, item) {
  const w = app.wx; const r = w ? rateStand(item.bedding, w.current.windDir) : null;
  const el = h(`<div><h3>Approach & wind</h3>
    <p class="small muted">Point the approach at where the animals come from (bedding, trail, water). Scent must not blow that way.</p>
    <div class="kv"><span>Approach</span><b>${item.bedding != null ? fmtBearing(item.bedding) : 'not set'}</b></div>
    ${item.bedding != null ? `<div class="kv"><span>Best winds from</span><b>${bestWinds(item.bedding).join(', ')}</b></div>` : ''}
    ${r && r.rating !== 'unknown' ? `<div class="kv"><span>Right now</span><b><span class="pill ${r.rating === 'good' ? 'ok' : r.rating === 'marginal' ? 'warn' : 'bad'}">${r.rating}</span> wind ${compass16(w.current.windDir)} ${Math.round(w.current.windSpeed)} mph, scent to ${compass16(r.scentDir)}</b></div>` : ''}
    <div class="row gap" style="margin-top:8px"><button class="btn btn-sm" data-pick>${icon('target')} Tap the approach on the map</button><label class="field grow" style="margin:0">Or bearing°<input type="number" min="0" max="359" value="${item.bedding ?? ''}" inputmode="numeric"></label></div></div>`);
  qs('[data-pick]', el).addEventListener('click', () => beddingPicker(app, item));
  qs('input[type=number]', el).addEventListener('change', async (e) => { const v = e.target.value === '' ? null : ((+e.target.value % 360) + 360) % 360; await app.markup.update(item.id, { bedding: v }); app.updateScent(); app.selectItem(app.markup.get(item.id)); });
  return el;
}
function photosBlock(app, item) {
  const el = h(`<div><h3>Photos</h3><div class="photos">${(item.photos || []).map((p, i) => `<img src="${p}" alt="Photo ${i + 1}" data-i="${i}">`).join('')}</div>
    <div class="row gap" style="margin-top:8px"><label class="btn btn-sm">${icon('camera')} Add photo<input type="file" accept="image/*" capture="environment" hidden></label>${(item.photos || []).length ? `<button class="btn btn-sm btn-danger" data-rm>Remove last</button>` : ''}</div></div>`);
  qs('input[type=file]', el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = await shrinkPhoto(f, 1000); await app.markup.update(item.id, { photos: [...(item.photos || []), d] }); app.selectItem(app.markup.get(item.id)); } catch (err) { app.ui.toast('Could not read that photo'); }
  });
  const rm = qs('[data-rm]', el); if (rm) rm.addEventListener('click', async () => { await app.markup.update(item.id, { photos: (item.photos || []).slice(0, -1) }); app.selectItem(app.markup.get(item.id)); });
  qsa('img', el).forEach((im) => im.addEventListener('click', () => app.ui.modal({ body: `<img src="${im.src}" style="width:100%;border-radius:12px">`, actions: [{ label: 'Close' }] })));
  return el;
}
export function beddingPicker(app, item) {
  app.ui.hideSheet();
  app.map.easeTo({ center: item.coords, zoom: Math.max(app.map.getZoom(), 15) });
  app.ui.setToolbar(`<span class="grow">Tap where the animals come from</span><button class="btn btn-sm" data-cancel>Cancel</button>`);
  qs('[data-cancel]', app.ui.el.toolbar).addEventListener('click', () => { app.pickBedding = null; app.ui.setToolbar(null); app.selectItem(item); });
  app.pickBedding = async (lngLat) => {
    const b = Math.round(bearing(item.coords, [lngLat.lng, lngLat.lat]));
    app.pickBedding = null; app.ui.setToolbar(null);
    await app.markup.update(item.id, { bedding: b }); app.updateScent();
    app.ui.toast(`Approach set to ${fmtBearing(b)}`); app.selectItem(app.markup.get(item.id));
  };
}

export async function newWaypointAt(app, lngLat, kind = 'pin', extra = {}) {
  const it = await app.markup.add({ type: 'point', kind, coords: [lngLat.lng, lngLat.lat], ...extra });
  app.selectItem(it); return it;
}

// Draw a line or area by tapping; uses the Measure tool for the live preview.
export function shapeDrawer(app, type) {
  app.ui.hideSheet(); app.ui.hideCard();
  app.measure.start(type === 'area' ? 'area' : 'line');
  app.drawing = type;
  const render = () => {
    const r = app.measure.result(); const u = app.settings.units;
    const txt = r.areaM2 != null ? `${fmtArea(r.areaM2, u)} · ${fmtDist(r.perimM, u)}` : r.lengthM != null ? `${fmtDist(r.lengthM, u)} · ${fmtBearing(r.bearing)}` : `Tap to add ${type === 'area' ? 'corners' : 'points'}`;
    app.ui.setToolbar(`<span class="grow">${esc(txt)}</span><button class="btn btn-sm" data-undo>${icon('undo')}</button><button class="btn btn-sm btn-primary" data-done ${app.measure.pts.length < (type === 'area' ? 3 : 2) ? 'disabled' : ''}>Save</button><button class="btn btn-sm" data-cancel>${icon('close')}</button>`);
    qs('[data-undo]', app.ui.el.toolbar).addEventListener('click', () => { app.measure.undo(); render(); });
    qs('[data-cancel]', app.ui.el.toolbar).addEventListener('click', () => { app.measure.stop(); app.drawing = null; app.ui.setToolbar(null); });
    qs('[data-done]', app.ui.el.toolbar).addEventListener('click', async () => {
      const res = app.measure.stop(); app.drawing = null; app.ui.setToolbar(null);
      const it = await app.markup.add({ type, kind: 'pin', coords: res.coords, name: type === 'area' ? `Area ${app.markup.all().filter((x) => x.type === 'area').length + 1}` : `Line ${app.markup.all().filter((x) => x.type === 'line').length + 1}` });
      app.selectItem(it);
    });
  };
  app.onMeasureChange = render; render();
}

// ---------- Offline ----------
export async function offlinePanel(app) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Offline maps</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const est = await storageEstimate();
  root.appendChild(h(`<p class="small muted">Downloads the area on screen. ${est.usage != null ? `Using ${(est.usage / 1048576).toFixed(0)} MB of ${(est.quota / 1073741824).toFixed(1)} GB available · ${est.tiles} tiles saved.` : ''}</p>`));
  const form = h(`<div>
    <label class="field">Name<input type="text" name="name" placeholder="Unit 6A north" value="${app.unitHere ? `Unit ${esc(unitName(app.unitHere.properties))}` : ''}"></label>
    <label class="field">Detail (max zoom)<div class="seg"><button type="button" data-z="13" >Overview 13</button><button type="button" data-z="15" class="on">Hunt 15</button><button type="button" data-z="16">Fine 16</button></div></label>
    <label class="field">Map tiles</label><div class="col" data-sets>${Object.entries(TILE_SETS).map(([k, s]) => `<label class="row between"><span>${esc(s.label)}</span><span class="switch ${['sat', 'sma', 'dem'].includes(k) ? 'on' : ''}" data-set="${k}"></span></label>`).join('')}</div>
    <label class="field">Layer data</label><div class="col" data-feats>${FEATURE_SETS.map((k) => `<label class="row between"><span>${esc(LAYER_DEFS[k].label)}</span><span class="switch on" data-feat="${k}"></span></label>`).join('')}</div>
    <p class="small b" data-est></p><div class="progress" hidden><i style="width:0"></i></div><p class="small muted" data-prog></p>
    <div class="row gap"><button class="btn btn-primary" data-dl>${icon('download')} Download this view</button></div></div>`);
  root.appendChild(form);
  let maxZ = 15;
  const bbox = () => { const b = app.map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; };
  const sets = () => qsa('[data-set].on', form).map((x) => x.dataset.set);
  const feats = () => qsa('[data-feat].on', form).map((x) => x.dataset.feat);
  const updEst = () => { const e = estimate(bbox(), maxZ, sets()); qs('[data-est]', form).textContent = `${e.km2.toLocaleString()} km² · ${e.tiles.toLocaleString()} tiles · about ${e.mb} MB`; if (e.tiles > 25000) qs('[data-est]', form).textContent += ' · zoom in or lower detail'; };
  qsa('[data-z]', form).forEach((b) => b.addEventListener('click', () => { maxZ = +b.dataset.z; qsa('[data-z]', form).forEach((x) => x.classList.toggle('on', x === b)); updEst(); }));
  qsa('.switch', form).forEach((s) => s.addEventListener('click', () => { s.classList.toggle('on'); updEst(); }));
  updEst();
  qs('[data-dl]', form).addEventListener('click', async () => {
    const e = estimate(bbox(), maxZ, sets()); if (e.tiles > 25000) { app.ui.toast('Too big. Zoom in or lower the detail.'); return; }
    const btn = qs('[data-dl]', form); btn.disabled = true; const bar = qs('.progress', form); bar.hidden = false; const prog = qs('[data-prog]', form);
    const ac = new AbortController(); app.ui.setToolbar(`<span class="grow">Downloading…</span><button class="btn btn-sm" data-cancel>Cancel</button>`); qs('[data-cancel]', app.ui.el.toolbar).addEventListener('click', () => ac.abort());
    try {
      const area = await downloadArea({ name: qs('[name=name]', form).value.trim(), bbox: bbox(), maxZ, sets: sets(), features: feats(), signal: ac.signal,
        fetchFeatures: (lid, def, bb) => fetchLayerForOffline(lid, def, bb),
        onProgress: ({ stage, done, total, failed }) => { qs('i', bar).style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`; prog.textContent = stage === 'tiles' ? `Tiles ${done}/${total}${failed ? ` (${failed} failed)` : ''}` : `Layers ${done}/${total}`; } });
      app.ui.toast(`Saved "${area.name}" · ${area.tiles} tiles`);
      app.openPanel('offline');
    } catch (err) { app.ui.toast(`Download stopped: ${err.message}`); btn.disabled = false; }
    finally { app.ui.setToolbar(null); }
  });
  const areas = await listAreas();
  if (areas.length) {
    root.appendChild(h('<h3>Saved areas</h3>'));
    const list = h('<div class="list"></div>');
    for (const a of areas) {
      const el = h(`<div class="item"><div class="txt"><b>${esc(a.name)}</b><span>${fmtDate(a.created, TZ)} · z${a.maxZ} · ${a.tiles.toLocaleString()} tiles · ${a.sets.join(', ')} · ${Object.values(a.featureCounts || {}).filter((n) => n > 0).reduce((s, n) => s + n, 0)} features</span></div><button class="btn btn-sm" data-go>Go</button><button class="btn btn-sm btn-danger" data-del>${icon('trash')}</button></div>`);
      qs('[data-go]', el).addEventListener('click', () => { app.map.fitBounds([[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]], { padding: 20 }); app.ui.hideSheet(); });
      qs('[data-del]', el).addEventListener('click', async () => { if (await app.ui.confirm(`Delete offline area "${a.name}"?`, { ok: 'Delete', danger: true })) { await removeArea(a.id); app.openPanel('offline'); } });
      list.appendChild(el);
    }
    root.appendChild(list);
  }
  return root;
}
async function fetchLayerForOffline(lid, def, bbox) {
  if (def.kind === 'parcels') {
    const counties = COUNTY_PARCELS.filter((c) => bboxIntersects(c.bbox, bbox)); const feats = [];
    for (const c of counties) { for (const u of c.alt ? [c.alt, c.url] : [c.url]) { try { const fc = await queryFeatures(u, { bbox, outFields: '*', maxPages: 6, precision: 6 }); feats.push(...fc.features.map((f) => normalizeParcel(f, c))); break; } catch (_) { /* next */ } } }
    return { type: 'FeatureCollection', features: feats };
  }
  const feats = [];
  for (const [i, u] of (def.urls || []).entries()) {
    try {
      const fc = await queryFeatures(u, { bbox: def.kind === 'static' ? (def.bbox || null) : bbox, where: def.where || '1=1', outFields: def.outFields || '*', maxPages: 8, precision: def.precision || 6, simplify: def.simplify });
      const tag = def.tags && def.tags[i];
      feats.push(...(tag ? fc.features.map((f) => ({ ...f, properties: { ...f.properties, ...tag } })) : fc.features));
    } catch (_) { /* skip */ }
  }
  return { type: 'FeatureCollection', features: feats };
}
function normalizeParcel(f, c) {
  const pick = (fields) => { for (const k of fields) { if (k instanceof RegExp) { const kk = Object.keys(f.properties).find((x) => k.test(x)); if (kk) return f.properties[kk]; } else if (f.properties[k] != null) return f.properties[k]; } return ''; };
  return { ...f, properties: { owner: pick(c.ownerFields), apn: pick(c.apnFields), addr: pick(c.addrFields), city: pick(c.cityFields), acres: pick(c.acresFields) || null, county: c.name } };
}

// ---------- Boundary alerts ----------
export function boundaryPanel(app) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Boundary alerts</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  root.appendChild(h(`<p class="small muted">Mark the parcels you have permission to hunt. While the app is open with GPS on, you get a warning at ${100} yd and an alert at ${50} yd from their edge, and a notice if you step outside. Turn on the Private parcels layer and zoom to 13+ to pick parcels.</p>`));
  const parcels = app.layers.getFeatures('parcels');
  const here = app.here();
  const near = parcels.map((f) => ({ f, d: here ? (pointInGeom(here, f.geometry) ? 0 : haversine(here, [(f.bbox[0] + f.bbox[2]) / 2, (f.bbox[1] + f.bbox[3]) / 2])) : 0 })).sort((a, b) => a.d - b.d).slice(0, 60);
  const list = h('<div class="list"></div>');
  const permitted = new Set(app.settings.permitted);
  if (!near.length) list.appendChild(h('<div class="item"><div class="txt"><span>No parcels loaded. Turn on Private parcels, zoom in, then come back.</span></div></div>'));
  for (const { f, d } of near) {
    const p = f.properties; const on = permitted.has(p.apn);
    const el = h(`<label class="item"><div class="txt"><b>${esc(p.owner || 'Unknown owner')}</b><span>APN ${esc(p.apn)} · ${p.acres ? `${Math.round(p.acres)} ac · ` : ''}${here ? (d === 0 ? 'you are here' : fmtDist(d, app.settings.units)) : ''}</span></div>${h(`<span class="switch ${on ? 'on' : ''}"></span>`).outerHTML}</label>`);
    qs('.switch', el).addEventListener('click', (e) => { if (permitted.has(p.apn)) permitted.delete(p.apn); else permitted.add(p.apn); e.target.classList.toggle('on', permitted.has(p.apn)); app.setPermitted([...permitted]); });
    list.appendChild(el);
  }
  root.appendChild(list);
  if (app.settings.permitted.length) { const clr = h(`<button class="btn btn-sm btn-danger">Clear all (${app.settings.permitted.length})</button>`); clr.addEventListener('click', () => { app.setPermitted([]); app.openPanel('boundary'); }); root.appendChild(clr); }
  return root;
}

// ---------- Search ----------
export function searchDialog(app) {
  const body = h(`<div><input type="search" placeholder="Unit 6A · waypoint name · 34.5, -111.6 · town or landmark" autocomplete="off"><div class="list" style="margin-top:10px"></div></div>`);
  const inp = qs('input', body); const list = qs('.list', body);
  const m = app.ui.modal({ title: 'Search', body, actions: [{ label: 'Close' }] });
  const go = (coords, zoom, label) => { m.close(); app.flyTo(coords, zoom); if (label) app.ui.toast(label); };
  let t = null;
  const render = async (q) => {
    list.innerHTML = ''; const ql = q.trim().toLowerCase(); if (!ql) return;
    const add = (title, sub, fn) => { const el = h(`<button class="item" type="button"><div class="txt"><b>${esc(title)}</b><span>${esc(sub)}</span></div></button>`); el.addEventListener('click', fn); list.appendChild(el); };
    const ll = ql.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (ll) { let lat = +ll[1]; let lon = +ll[2]; if (Math.abs(lat) > 90) [lat, lon] = [lon, lat]; add(`Go to ${lat.toFixed(5)}, ${lon.toFixed(5)}`, 'Coordinates', () => go([lon, lat], 14)); }
    for (const f of app.layers.getFeatures('gmu')) { if (!unitName(f.properties)) continue; const n = String(unitName(f.properties)).toLowerCase(); if (n === ql.replace(/^unit\s*/, '') || (ql.length >= 2 && n.startsWith(ql.replace(/^unit\s*/, '')))) add(`Unit ${unitName(f.properties)}`, f.properties.REG_NAME || 'Game management unit', () => { m.close(); app.openUnit(f); }); }
    for (const it of app.markup.all()) if (`${it.name} ${(it.tags || []).join(' ')}`.toLowerCase().includes(ql)) add(it.name, `${KINDS[it.kind]?.label || it.type} · waypoint`, () => { m.close(); app.selectItem(it, { fly: true }); });
    for (const f of app.layers.getFeatures('parcels')) if (String(f.properties.owner || '').toLowerCase().includes(ql)) add(f.properties.owner, `APN ${f.properties.apn} · ${f.properties.county}`, () => go([(f.bbox[0] + f.bbox[2]) / 2, (f.bbox[1] + f.bbox[3]) / 2], 15));
    if (ql.length >= 3 && navigator.onLine !== false) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: `${q}, Arizona`, format: 'json', limit: '6', countrycodes: 'us', viewbox: '-115.2,37.3,-108.6,31.0', bounded: '1' })}`, { headers: { Accept: 'application/json' } });
        if (r.ok) for (const p of await r.json()) add(p.display_name.split(',').slice(0, 2).join(','), p.type.replace(/_/g, ' '), () => go([+p.lon, +p.lat], 12));
      } catch (_) { /* offline */ }
    }
    if (!list.children.length) list.appendChild(h('<div class="item"><div class="txt"><span>No matches</span></div></div>'));
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => render(inp.value), 300); });
  setTimeout(() => inp.focus(), 60);
}

export function importFile(app) {
  const inp = h('<input type="file" accept=".gpx,.kml,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/geo+json,application/json" hidden>');
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try { const n = await app.markup.importText(await f.text()); app.ui.toast(`Imported ${n} item${n === 1 ? '' : 's'}`); app.openPanel('markup'); const b = app.markup.bbox(); if (b && n) app.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 14 }); }
    catch (e) { app.ui.toast('Could not read that file'); }
    inp.remove();
  });
  inp.click();
}
export function exportDialog(app) {
  app.ui.modal({ title: 'Export markup', body: `<p class="small muted">${app.markup.all().length} items. GPX opens in onX, Gaia, Garmin and most apps. GeoJSON keeps notes, tags and stand approach bearings.</p>`,
    actions: [{ label: 'GPX', cls: 'btn-primary', onClick: () => app.share('fenceline.gpx', app.markup.exportGPX(), 'application/gpx+xml') }, { label: 'GeoJSON', onClick: () => app.share('fenceline.geojson', app.markup.exportGeoJSON(), 'application/geo+json') }, { label: 'Cancel' }] });
}
