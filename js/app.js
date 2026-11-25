// Fenceline bootstrap and orchestration.
import { APP_VERSION, TZ, AZ_BOUNDS, DEFAULT_CENTER, DEFAULT_ZOOM, GLYPHS, TILES, RULES } from './config.js';
import { store } from './store.js';
import { registerTerrainProtocols, elevationAt } from './terrain.js';
import { registerHabitatProtocol, setHabitatPreset } from './habitat.js';
import * as G from './guides.js';
import * as I from './insights.js';
import { applyBasemap, nextBasemap, BASEMAPS } from './basemaps.js';
import { LayerManager, LAYER_DEFS } from './layers.js';
import { Markup, KINDS } from './markup.js';
import { Tracker } from './tracking.js';
import { Measure, scentConeFC, installScentLayers, BoundaryGuard, describePoint, fmtBearing } from './tools.js';
import { getForecast } from './weather.js';
import { legalLight, moonPhase } from './sun.js';
import { makeOfflineProvider, clearAllOffline } from './offline.js';
import { speciesById } from './species.js';
import { UI } from './ui.js';
import * as P from './panels.js';
import * as E from './editors.js';
import { findUnit, unitName } from './units.js';
import { fmtDist, fmtElev, fmtTime, fmtSpeed, compass16, haversine, bearing, esc, debounce, qs, bboxOfGeom } from './util.js';

const DEFAULTS = { units: 'imperial', theme: 'dark', night: false, basemap: 'hybrid', legalRule: 'bigGame', species: 'muledeer', layersOn: null, permitted: [], labels: true, exaggeration: 1.3, wxSource: 'center', is3D: false };

const app = { settings: { ...DEFAULTS }, wx: null, wxAt: null, unitHere: null, is3D: false, drawing: null, pickBedding: null, tapMarker: null, panel: null, moving: null };
window.fenceline = app;

// ---------- Settings ----------
app.save = debounce(() => store.setKV('settings', app.settings), 300);
app.setSetting = (k, v) => {
  app.settings = { ...app.settings, [k]: v }; app.save();
  if (k === 'theme' || k === 'night') applyTheme();
  if (k === 'units') { app.updateStatus(); app.tickLegal(); }
  if (k === 'legalRule') app.tickLegal();
  if (k === 'labels') updateLabels();
  if (k === 'exaggeration' && app.is3D) app.map.setTerrain({ source: 'dem', exaggeration: v });
  if (k === 'wxSource') app.refreshWeather(true);
};
function applyTheme() {
  document.documentElement.dataset.theme = app.settings.theme;
  document.documentElement.toggleAttribute('data-night', !!app.settings.night);
  const meta = qs('meta[name=theme-color]'); if (meta) meta.content = app.settings.night ? '#120404' : app.settings.theme === 'light' ? '#f3f4ef' : '#10140e';
}
app.setPermitted = (list) => { app.setSetting('permitted', list); app.guard.setPermitted(list); if (!list.length) app.ui.banner(null); };

// ---------- Helpers ----------
app.center = () => { const c = app.map.getCenter(); return [c.lng, c.lat]; };
app.here = () => (app.tracker && app.tracker.pos ? [app.tracker.pos.lon, app.tracker.pos.lat] : null);
app.wxPoint = () => (app.settings.wxSource === 'you' && app.here()) || app.center();
app.wxLabel = () => (app.settings.wxSource === 'you' && app.here() ? 'At your location' : app.unitHere ? `Unit ${unitName(app.unitHere.properties)} (map center)` : 'Map center');
app.legal = (date = new Date()) => { const [lon, lat] = app.wxPoint(); return legalLight(date, lat, lon, RULES.legal[app.settings.legalRule] || RULES.legal.bigGame); };
app.moon = () => moonPhase(new Date());
app.flyTo = (coords, zoom = 14) => app.map.flyTo({ center: coords, zoom, duration: 900 });
app.fitCoords = (coords) => { const b = bboxOfGeom({ coordinates: coords }); app.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 15 }); };
app.fitGeom = (geom) => { const b = bboxOfGeom(geom); app.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30 }); };
app.share = async (name, text, mime) => {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
};

// ---------- Panels ----------
app.openPanel = async (name, arg) => {
  app.panel = name;
  const tab = { layers: 'layers', hunt: 'hunt', weather: 'hunt', markup: 'markup', tracks: 'markup', edit: 'markup' }[name] || 'more';
  let content;
  switch (name) {
    case 'layers': content = P.layersPanel(app); break;
    case 'hunt': content = P.huntPanel(app); break;
    case 'weather': content = P.weatherPanel(app); break;
    case 'markup': content = P.markupPanel(app, arg || {}); break;
    case 'tracks': content = await P.tracksPanel(app); break;
    case 'more': content = P.morePanel(app); break;
    case 'settings': content = P.settingsPanel(app); break;
    case 'features': content = P.featuresPanel(); break;
    case 'about': content = P.aboutPanel(); break;
    case 'install': content = P.installPanel(); break;
    case 'units': content = P.unitsPanel(app); break;
    case 'unit': content = P.unitPanel(app, arg); break;
    case 'guide': content = G.guidePanel(app, arg); break;
    case 'insights': content = I.insightsPanel(app, arg); break;
    case 'offline': content = await E.offlinePanel(app); break;
    case 'boundary': content = E.boundaryPanel(app); break;
    case 'edit': content = E.waypointEditor(app, arg); break;
    default: content = P.morePanel(app);
  }
  app.ui.showSheet(content, { tab, full: ['weather', 'features', 'offline', 'edit', 'about', 'guide', 'insights'].includes(name) });
};
app.onTab = (name) => { if (name === 'map') { app.ui.hideSheet(); return; } app.openPanel(name); };
app.onSheetClose = () => { app.panel = null; };
app.refreshPanel = (name) => { if (app.panel === name && app.ui.sheetOpen) app.openPanel(name); };
app.openUnit = (f) => app.openPanel('unit', f);
app.selectItem = (it, { fly = false } = {}) => { if (!it) return; if (fly) { const c = it.type === 'point' ? it.coords : it.coords[0]; app.map.easeTo({ center: c, zoom: Math.max(app.map.getZoom(), 14) }); } app.openPanel('edit', it); };
app.goTo = (it) => { app.ui.hideSheet(); const c = it.type === 'point' ? it.coords : it.coords[0]; app.navTarget = it; app.map.easeTo({ center: c, zoom: Math.max(app.map.getZoom(), 14) }); app.updateStatus(); app.ui.toast(`Navigating to ${it.name}. Distance shows bottom-left.`); };

app.resetLayers = () => { for (const id of app.layers.listOn()) app.layers.disable(id, { silent: true }); app.layers.restore(Object.keys(LAYER_DEFS).filter((k) => LAYER_DEFS[k].default)); saveLayers(); app.updateScent(); };
app.resetAction = async (what) => {
  if (what === 'layers') { app.resetLayers(); app.ui.toast('Layers reset'); }
  if (what === 'markup' && (await app.ui.confirm('Delete every waypoint, line and area? Export first if you want a copy.', { ok: 'Delete all', danger: true }))) { await app.markup.clearAll(); app.updateScent(); app.ui.toast('Markup deleted'); }
  if (what === 'offline' && (await app.ui.confirm('Delete all downloaded map areas?', { ok: 'Delete', danger: true }))) { await clearAllOffline(); app.ui.toast('Offline data deleted'); }
};
function saveLayers() { app.settings = { ...app.settings, layersOn: app.layers.listOn() }; app.save(); }

// ---------- Species ----------
app.setSpecies = (id) => {
  const sp = speciesById(id);
  app.setSetting('species', sp.id); app.setSetting('legalRule', sp.legal);
  app.updateHabitat();
  app.layers.applyPreset(sp.layers); saveLayers();
  app.ui.toast(`${sp.label} layers on`);
};
// Point the habitat-finder raster at the current species and month; redraw it if it is showing.
app.updateHabitat = () => {
  const p = G.habitatFor(app.settings.species);
  if (p) setHabitatPreset({ label: p.label, elev: p.elev, asp: p.asp, slope: p.slope });
  if (app.layers && app.layers.isOn('habitat')) app.layers.reloadRaster('habitat').catch(() => {});
};

// ---------- Tools ----------
app.tool = async (t) => {
  switch (t) {
    case 'line': case 'area': startMeasure(t); break;
    case 'truck': { const here = app.here(); if (!here) { app.ui.toast('Waiting for GPS…'); try { await app.tracker.locate(); } catch (e) { app.ui.toast(gpsError(e)); return; } } const c = app.here(); const old = app.markup.byKind('truck')[0]; if (old) await app.markup.update(old.id, { coords: c }); else await app.markup.add({ type: 'point', kind: 'truck', coords: c, name: 'Truck' }); app.ui.hideSheet(); app.ui.toast('Truck marked here'); app.updateStatus(); break; }
    case 'rec': if (app.tracker.rec) { const r = await app.tracker.stopRecording(); app.ui.toast(r ? `Saved ${r.name}` : 'Recording stopped'); app.refreshPanel('tracks'); } else { app.tracker.startRecording(); app.ui.hideSheet(); app.ui.toast('Recording. Keep the screen on.'); } app.updateStatus(); break;
    case 'guard': app.openPanel('boundary'); break;
    case 'wx': app.openPanel('weather'); break;
    default: break;
  }
};
app.markupAction = (a) => {
  if (a === 'pin') { const c = app.here() || app.center(); app.ui.hideSheet(); E.newWaypointAt(app, { lng: c[0], lat: c[1] }, 'pin'); }
  else if (a === 'line' || a === 'area') E.shapeDrawer(app, a);
  else if (a === 'import') E.importFile(app);
  else if (a === 'export') E.exportDialog(app);
  else if (a === 'tracks') app.openPanel('tracks');
};
function startMeasure(mode) {
  app.ui.hideSheet(); app.ui.hideCard(); app.measure.start(mode); app.drawing = 'measure';
  const render = () => {
    const r = app.measure.result(); const u = app.settings.units;
    const txt = r.areaM2 != null ? `${fmtAreaSafe(r.areaM2, u)} · perimeter ${fmtDist(r.perimM, u)}` : r.lengthM != null ? `${fmtDist(r.lengthM, u)} · last leg ${fmtBearing(r.bearing)}` : `Tap points to measure ${mode === 'area' ? 'an area' : 'distance'}`;
    app.ui.setToolbar(`<span class="grow">${esc(txt)}</span><button class="btn btn-sm" data-undo>↶</button><button class="btn btn-sm" data-pos>From me</button><button class="btn btn-sm btn-primary" data-done>Done</button>`);
    qs('[data-undo]', app.ui.el.toolbar).addEventListener('click', () => { app.measure.undo(); render(); });
    qs('[data-pos]', app.ui.el.toolbar).addEventListener('click', () => { const c = app.here(); if (!c) { app.ui.toast('No GPS fix yet'); return; } app.measure.add({ lng: c[0], lat: c[1] }); render(); });
    qs('[data-done]', app.ui.el.toolbar).addEventListener('click', () => { app.measure.stop(); app.drawing = null; app.ui.setToolbar(null); });
  };
  app.onMeasureChange = render; render();
}
import { fmtArea as fmtAreaSafe } from './util.js';

// ---------- Weather ----------
let wxTimer = null;
const WX_RETRIES = 3; const WX_RETRY_MS = 15000;
app.refreshWeather = async (force = false) => {
  const [lon, lat] = app.wxPoint();
  if (!force && app.wxAt && haversine(app.wxAt, [lon, lat]) < 15000 && app.wx && Date.now() - app.wx.fetchedAt < 30 * 60000) return app.wx;
  try { app.wx = await getForecast(lon, lat, { force }); app.wxAt = [lon, lat]; app.wxFails = 0; }
  catch (e) {
    app.wxFails = (app.wxFails || 0) + 1;
    if (!app.wx) { app.ui.setChip('weather', 'Weather offline', 'warn'); if (app.wxFails <= WX_RETRIES) setTimeout(() => app.refreshWeather(true), WX_RETRY_MS * app.wxFails); }
  }
  app.tickLegal(); app.updateScent(); app.refreshPanel('hunt');
  clearTimeout(wxTimer); wxTimer = setTimeout(() => app.refreshWeather(), 30 * 60000);
  return app.wx;
};
app.updateScent = () => {
  const src = app.map.getSource('src-scent'); if (!src) return;
  if (!app.layers.isOn('scent') || !app.wx) { src.setData({ type: 'FeatureCollection', features: [] }); return; }
  src.setData(scentConeFC(app.markup.byKind('stand'), app.wx.current.windDir, app.wx.current.windSpeed));
};
app.tickLegal = () => {
  const L = app.legal(); const u = app.settings.units;
  const light = L.status === 'open' ? `ends ${fmtTime(L.end, TZ)}` : L.status === 'before' ? `light ${fmtTime(L.start, TZ)}` : 'after hrs';
  const cls = L.status === 'open' ? (L.minsTo <= 30 ? 'warn' : 'ok') : 'bad';
  if (app.wx) { const c = app.wx.current; const spd = Math.round(u === 'metric' ? c.windSpeed * 1.609 : c.windSpeed); app.ui.setChip('weather', `${Math.round(u === 'metric' ? ((c.temp - 32) * 5) / 9 : c.temp)}° ${compass16(c.windDir || 0)} ${spd} · ${light}`, cls); }
  else app.ui.setChip('weather', `Wind — · ${light}`, cls);
};

// ---------- Position, status, boundary guard ----------
let lastGuardLevel = 'ok';
function onPosition(pos) {
  app.updateStatus();
  if (app.settings.permitted.length) {
    app.guard.setParcels(app.layers.getFeatures('parcels'));
    const r = app.guard.check(pos);
    if (r) {
      if (r.level === 'alert') app.ui.banner(`${r.yd} yd to the property line`, 'alert');
      else if (r.level === 'warn') app.ui.banner(`${r.yd} yd to the property line`, 'warn');
      else if (r.level === 'outside') app.ui.banner('You are outside your permitted parcels', 'alert');
      else app.ui.banner(null);
      if (r.level !== lastGuardLevel && (r.level === 'alert' || r.level === 'outside')) beep();
      lastGuardLevel = r.level;
    }
  }
  if (app.settings.wxSource === 'you') app.refreshWeather();
}
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 880; g.gain.value = 0.2; o.start(); o.stop(audioCtx.currentTime + 0.25);
    setTimeout(() => { const o2 = audioCtx.createOscillator(); o2.connect(g); o2.frequency.value = 660; o2.start(); o2.stop(audioCtx.currentTime + 0.25); }, 320);
  } catch (_) { /* no audio */ }
}
app.updateStatus = () => {
  const u = app.settings.units; const pills = []; const pos = app.tracker.pos;
  if (pos) {
    const spd = pos.speed != null && pos.speed > 0.4 ? ` · ${fmtSpeed(pos.speed * 2.23694, u)}` : '';
    pills.push({ html: `GPS ±${Math.round(pos.acc)} m${pos.alt != null ? ` · ${fmtElev(pos.alt, u)}` : ''}${spd}` });
    const target = app.navTarget || app.markup.byKind('truck')[0];
    if (target) { const c = target.type === 'point' ? target.coords : target.coords[0]; pills.push({ html: `${esc(target.name)} ${fmtDist(haversine([pos.lon, pos.lat], c), u)} ${compass16(bearing([pos.lon, pos.lat], c))}` }); }
  }
  if (app.tracker.rec) pills.push({ html: `● REC ${fmtDist(app.tracker.rec.distM, u)}`, cls: 'rec' });
  app.ui.setStatus(pills);
};
function gpsError(e) { return e && e.code === 1 ? 'Location denied. Allow it in Settings → Privacy → Location → Safari/Fenceline.' : 'No GPS fix. Move outside or wait a moment.'; }

// ---------- Map interactions ----------
function bindMap() {
  const map = app.map;
  map.on('click', onMapClick);
  map.on('contextmenu', (e) => quickPin(e.lngLat));
  let lp = null; let lpPt = null;
  map.on('touchstart', (e) => { if (e.points.length !== 1) return; lpPt = e.point; clearTimeout(lp); lp = setTimeout(() => { lp = null; quickPin(e.lngLat); }, 600); });
  map.on('touchmove', (e) => { if (lp && lpPt && Math.abs(e.point.x - lpPt.x) + Math.abs(e.point.y - lpPt.y) > 10) { clearTimeout(lp); lp = null; } });
  map.on('touchend', () => { clearTimeout(lp); lp = null; }); map.on('touchcancel', () => { clearTimeout(lp); lp = null; });
  map.on('moveend', debounce(() => { const c = map.getCenter(); app.settings = { ...app.settings, center: [c.lng, c.lat], zoom: map.getZoom() }; app.save(); updateUnitChip(); app.refreshWeather(); updateLabels(); }, 250));
  map.on('zoom', updateLabels);
  map.on('rotate', () => { qs('svg', qs('#btn-compass')).style.transform = `rotate(${-map.getBearing()}deg)`; });
  map.on('dragstart', () => { if (app.tracker.follow) { app.tracker.follow = false; qs('#btn-locate').classList.remove('active'); } });
  window.addEventListener('online', () => { app.ui.toast('Back online'); app.layers.refresh(); app.refreshWeather(true); });
  window.addEventListener('offline', () => app.ui.toast('Offline: showing downloaded data'));
}
function updateLabels() { app.map.getContainer().classList.toggle('show-labels', !!app.settings.labels && app.map.getZoom() >= 11.5); }
function updateUnitChip() {
  const [lon, lat] = app.center();
  const f = findUnit(app.layers.getFeatures('gmu'), lon, lat);
  app.unitHere = f;
  app.ui.setChip('unit', f ? `Unit ${esc(String(unitName(f.properties)))}` : 'Unit —');
}
async function quickPin(lngLat) {
  if (app.drawing || app.pickBedding || app.moving) return;
  const it = await app.markup.add({ type: 'point', kind: 'pin', coords: [lngLat.lng, lngLat.lat] });
  app.ui.toast('Waypoint dropped'); app.selectItem(it);
}
app.movePoint = (item) => {
  app.moving = item;
  app.ui.setToolbar(`<span class="grow">Tap the new spot for ${esc(item.name)}</span><button class="btn btn-sm" data-cancel>Cancel</button>`);
  qs('[data-cancel]', app.ui.el.toolbar).addEventListener('click', () => { app.moving = null; app.ui.setToolbar(null); });
};
async function onMapClick(e) {
  if (app.moving) { const it = app.moving; app.moving = null; app.ui.setToolbar(null); await app.markup.update(it.id, { coords: [e.lngLat.lng, e.lngLat.lat] }); app.updateScent(); app.ui.toast('Moved'); return; }
  if (app.pickBedding) { app.pickBedding(e.lngLat); return; }
  if (app.measure.mode) { app.measure.add(e.lngLat); if (app.onMeasureChange) app.onMeasureChange(); return; }
  const map = app.map;
  const mk = map.getLayer('markup-fill') ? map.queryRenderedFeatures(e.point, { layers: ['markup-fill', 'markup-line'] }) : [];
  if (mk[0]) { app.selectItem(app.markup.get(mk[0].properties.id)); return; }
  const tr = map.getLayer('tracks-line') ? map.queryRenderedFeatures(e.point, { layers: ['tracks-line'] }) : [];
  if (tr[0]) { app.openPanel('tracks'); return; }
  const hits = app.layers.identify(e.point);
  showIdentify(e.lngLat, hits);
}
async function showIdentify(lngLat, hits) {
  if (app.ui.sheetOpen) app.ui.hideSheet();
  if (app.tapMarker) app.tapMarker.remove();
  const el = document.createElement('div'); el.className = 'tap-mark';
  app.tapMarker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(app.map);
  app.ui.showCard(`<div class="card-head"><b>Looking up…</b><button class="btn btn-ghost btn-icon" data-close>✕</button></div>`);
  qs('[data-close]', app.ui.el.card).addEventListener('click', () => app.ui.hideCard());
  let d;
  try { d = await describePoint(app, lngLat); } catch (err) { d = { lon: lngLat.lng, lat: lngLat.lat }; }
  if (app.ui.el.card.hidden) return;
  const card = app.ui.showCard(P.identifyHTML(app, hits, d));
  qs('[data-close]', card).addEventListener('click', () => app.ui.hideCard());
  card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const a = b.dataset.act;
    if (a === 'pin') { app.ui.hideCard(); E.newWaypointAt(app, lngLat, 'pin'); }
    else if (a === 'measure') { startMeasure('line'); app.measure.add(lngLat); app.onMeasureChange(); }
    else if (a === 'unit') { const uf = app.layers.getFeatures('gmu').find((f) => unitName(f.properties) === unitName(d.unit)); if (uf) app.openPanel('unit', uf); }
    else if (a === 'permit') { const par = hits.find((x) => x.id === 'parcels'); const apn = par.feature.properties.apn; const set = new Set(app.settings.permitted); if (set.has(apn)) set.delete(apn); else set.add(apn); app.setPermitted([...set]); b.textContent = set.has(apn) ? '✓ Permitted parcel' : 'I have permission here'; app.ui.toast(set.has(apn) ? 'Boundary alerts on for this parcel' : 'Removed'); }
    else if (a === 'share') app.share('point.txt', `${d.lat.toFixed(6)}, ${d.lon.toFixed(6)}\nhttps://maps.apple.com/?ll=${d.lat.toFixed(6)},${d.lon.toFixed(6)}`, 'text/plain');
  }));
}
app.onCardClose = () => { if (app.tapMarker) { app.tapMarker.remove(); app.tapMarker = null; } };

// ---------- Rail ----------
function bindUI() {
  qs('#chip-search').addEventListener('click', () => E.searchDialog(app));
  qs('#chip-unit').addEventListener('click', () => { if (app.unitHere) app.openUnit(app.unitHere); else app.openPanel('units'); });
  qs('#chip-weather').addEventListener('click', () => app.openPanel('hunt'));
  qs('#btn-locate').addEventListener('click', async () => {
    const b = qs('#btn-locate');
    if (app.tracker.follow) { app.tracker.follow = false; b.classList.remove('active'); return; }
    b.classList.add('active'); app.tracker.start(); app.tracker.follow = true; app.tracker.requestWake();
    try { const p = await app.tracker.locate(); app.map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(app.map.getZoom(), 14) }); } catch (e) { app.ui.toast(gpsError(e)); b.classList.remove('active'); app.tracker.follow = false; }
  });
  qs('#btn-3d').addEventListener('click', () => app.toggle3D());
  qs('#btn-basemap').addEventListener('click', () => { const k = nextBasemap(app.map.__basemap || app.settings.basemap); applyBasemap(app.map, k); app.setSetting('basemap', k); app.ui.toast(BASEMAPS[k].label); });
  // Compass: tap to face north; tap again while facing north to lock the map to your heading (tap once more to stop).
  const north = () => app.map.easeTo({ bearing: 0, pitch: app.is3D ? 60 : 0 });
  const setHeadingUp = (on) => { app.headingUp = on; qs('#btn-compass').classList.toggle('active', on); if (on) { app.tracker.start(); app.ui.toast('Heading-up: the map turns with you'); } else north(); };
  let lastRot = 0;
  app.onHeading = (hd) => { if (!app.headingUp || Date.now() - lastRot < 200) return; lastRot = Date.now(); app.map.easeTo({ bearing: hd, duration: 200 }); };
  qs('#btn-compass').addEventListener('click', () => { if (app.headingUp) setHeadingUp(false); else if (Math.abs(app.map.getBearing()) > 1) north(); else setHeadingUp(true); });
  app.map.on('rotatestart', (e) => { if (app.headingUp && e.originalEvent) setHeadingUp(false); });
  qs('#btn-zoom-in').addEventListener('click', () => app.map.zoomIn());
  qs('#btn-zoom-out').addEventListener('click', () => app.map.zoomOut());
}
app.toggle3D = (force) => {
  app.is3D = force != null ? force : !app.is3D;
  qs('#btn-3d').classList.toggle('active', app.is3D);
  app.setSetting('is3D', app.is3D);
  const apply = () => {
    try {
      if (app.is3D) { app.map.setTerrain({ source: 'dem', exaggeration: app.settings.exaggeration || 1.3 }); app.map.easeTo({ pitch: 60, duration: 600 }); }
      else { app.map.setTerrain(null); app.map.easeTo({ pitch: 0, duration: 600 }); }
    } catch (e) { console.warn('3D not applied', e); app.map.once('idle', apply); }
  };
  // setTerrain throws while a style update is still in flight (e.g. right after boot adds layers).
  if (app.map.isStyleLoaded()) apply(); else app.map.once('idle', apply);
};

// ---------- Service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) app.ui.toast('Update ready. Close and reopen Fenceline.', 5000); }); });
  }).catch(() => {});
}

// ---------- Boot ----------
async function boot() {
  const saved = await store.getKV('settings', {});
  app.settings = { ...DEFAULTS, ...saved };
  applyTheme();
  app.ui = new UI(app);
  registerSW();
  registerTerrainProtocols(maplibregl); registerHabitatProtocol(maplibregl);
  const map = new maplibregl.Map({
    container: 'map', center: app.settings.center || DEFAULT_CENTER, zoom: app.settings.zoom || DEFAULT_ZOOM,
    style: { version: 8, glyphs: GLYPHS, sources: {}, layers: [{ id: 'anchor-base', type: 'background', paint: { 'background-color': '#0b0f0a' } }] },
    maxBounds: [[AZ_BOUNDS[0][0] - 4, AZ_BOUNDS[0][1] - 3], [AZ_BOUNDS[1][0] + 4, AZ_BOUNDS[1][1] + 3]], minZoom: 5, maxZoom: 19.5, maxPitch: 70,
    attributionControl: false, touchPitch: true, pitchWithRotate: true, fadeDuration: 100, hash: false
  });
  app.map = map;
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: app.settings.units }), 'bottom-left');
  map.on('load', onLoad);
  map.on('error', (e) => { if (e && e.error && !/tile|Failed to fetch|AbortError|404|403/i.test(e.error.message || '')) console.warn('map error', e.error); });
}
function onLoad() {
  const map = app.map;
  for (const a of ['anchor-raster', 'anchor-fill', 'anchor-line', 'anchor-point', 'anchor-label']) map.addLayer({ id: a, type: 'background', paint: { 'background-opacity': 0 } });
  map.addSource('dem', { type: 'raster-dem', tiles: [TILES.terrarium], tileSize: 256, encoding: 'terrarium', maxzoom: 14 });
  applyBasemap(map, app.settings.basemap);
  app.layers = new LayerManager(map, { onChange: () => { saveLayers(); app.refreshPanel('layers'); }, onStatus: () => app.refreshPanel('layers') });
  app.layers.setOfflineProvider(makeOfflineProvider());
  installScentLayers(map); Markup.installLayers(map); Tracker.installLayers(map); Measure.installLayers(map);
  app.markup = new Markup(map, { onSelect: (it) => app.selectItem(it), env: () => I.envSnapshot(app) });
  app.tracker = new Tracker(map, { onPosition, onError: (e) => app.ui.toast(gpsError(e)), onRecord: () => app.updateStatus(), onHeading: (hd) => app.onHeading(hd) });
  app.measure = new Measure(map); app.guard = new BoundaryGuard(); app.guard.setPermitted(app.settings.permitted);
  app.updateHabitat();
  app.layers.restore(app.settings.layersOn || Object.keys(LAYER_DEFS).filter((k) => LAYER_DEFS[k].default));
  const gmuPoll = setInterval(() => { if (app.layers.getFeatures('gmu').length) { clearInterval(gmuPoll); updateUnitChip(); app.refreshPanel('hunt'); } }, 800);
  app.markup.load().then(() => { app.updateScent(); app.updateStatus(); });
  app.tracker.renderSaved();
  bindUI(); bindMap(); updateLabels();
  app.refreshWeather(); app.tickLegal(); setInterval(app.tickLegal, 30000);
  if (app.settings.is3D) app.toggle3D(true);
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  store.getKV('seenInstall', false).then((seen) => { if (!standalone && !seen && /iPhone|iPad/.test(navigator.userAgent)) { app.ui.toast('Tip: Share → Add to Home Screen to install', 5000); store.setKV('seenInstall', true); } });
  console.info(`Fenceline ${APP_VERSION} ready`);
}
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<div class="banner alert" style="top:60px">Startup failed: ${esc(e.message)}</div>`); });
