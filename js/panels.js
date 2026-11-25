// Sheet panels: layers, hunt, weather, markup, more, settings, offline, features, identify.
import { LAYER_DEFS, GROUPS } from './layers.js';
import { KINDS } from './markup.js';
import { SPECIES, speciesById } from './species.js';
import { FEATURES } from './features.js';
import { ATTRIBUTIONS, APP_VERSION, RULES, TZ } from './config.js';
import { pickValue } from './arcgis.js';
import { rateStand, bestWinds, windCalendar, activityScore, wmoDesc, getAirQuality, aqiLevel } from './weather.js';
import { Tracker } from './tracking.js';
import { unitHTML, unitName } from './units.js';
import { icon, markerSVG } from './icons.js';
import { h, esc, qs, qsa, fmtDist, fmtElev, fmtArea, fmtSpeed, fmtTemp, fmtTime, fmtDate, fmtDuration, compass16, haversine, bearing, round } from './util.js';
import { fmtBearing } from './tools.js';
import { guideBlock } from './guides.js';

const kindDot = (kind, color) => `<span class="mk-dot" style="--c:${color || (KINDS[kind] || KINDS.pin).color}">${markerSVG((KINDS[kind] || KINDS.pin).glyph)}</span>`;
const sw = (on) => `<span class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}"></span>`;
const statusPill = (s) => s === 'loading' ? '<span class="pill info">loading</span>' : s === 'zoom' ? '<span class="pill">zoom in</span>' : s === 'error' ? '<span class="pill bad">no data</span>' : s === 'offline' ? '<span class="pill warn">offline</span>' : '';
const legend = (def) => def.legend ? `<div class="legend">${def.legend.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>` : '';

// ---------- Layers ----------
export function layersPanel(app) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Layers</h2><div class="row"><button class="btn btn-sm" data-reset>Defaults</button><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div></div>`));
  for (const g of GROUPS) {
    const ids = Object.keys(LAYER_DEFS).filter((k) => LAYER_DEFS[k].group === g);
    if (!ids.length) continue;
    root.appendChild(h(`<h4>${esc(g)}</h4>`));
    const list = h('<div class="list"></div>');
    for (const id of ids) {
      const def = LAYER_DEFS[id]; const on = app.layers.isOn(id);
      const row = h(`<div><button class="item" type="button" data-id="${id}"><div class="txt"><b>${esc(def.label)} ${statusPill(app.layers.getStatus(id))}</b><span>${esc(def.desc)}</span></div>${sw(on)}</button></div>`);
      const btn = qs('.item', row);
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.txt')) { toggleDetails(row, def, app, id); return; }
        app.layers.toggle(id); qs('.switch', row).classList.toggle('on', app.layers.isOn(id));
        if (id === 'scent') app.updateScent(); if (id === 'tracks') app.map.setLayoutProperty('tracks-line', 'visibility', app.layers.isOn(id) ? 'visible' : 'none');
        if (def.minzoom && app.layers.isOn(id) && app.map.getZoom() < def.minzoom) app.ui.toast(`Zoom in to ${def.minzoom}+ to see ${def.label.toLowerCase()}`);
      });
      list.appendChild(row);
    }
    root.appendChild(list);
  }
  qs('[data-reset]', root).addEventListener('click', () => { app.resetLayers(); app.openPanel('layers'); });
  return root;
}
function toggleDetails(row, def, app, id) {
  const ex = qs('.sub', row);
  if (ex) { ex.remove(); return; }
  const op = def.kind === 'raster' ? `<label class="field">Opacity<input type="range" min="0.1" max="1" step="0.05" value="${app.map.getLayer(id) ? app.map.getPaintProperty(id, 'raster-opacity') : def.opacity || 0.7}"></label>` : '';
  const sub = h(`<div class="item sub"><p class="small">${esc(def.desc)}</p>${legend(def)}${op}${dateBar(def, app, id)}${def.minzoom ? `<p class="small muted">Loads at zoom ${def.minzoom}+ for the area on screen.</p>` : ''}</div>`);
  const r = qs('input[type=range]', sub); if (r) r.addEventListener('input', () => app.layers.setOpacity(id, +r.value));
  wireDateBar(sub, def, app, id);
  row.appendChild(sub);
}
// Date controls for dated rasters (satellite passes, radar, snow): step to older or newer dates, or refresh for the current view.
// A resolver that takes arguments (`({ step }) => …`) supports stepping; `() => …` resolvers are always "latest".
function dateBar(def, app, id) {
  if (!def.dated) return '';
  const meta = app.layers.getMeta(id); const on = app.layers.isOn(id);
  const label = !on ? 'Turn the layer on to load the newest date.' : meta ? esc(meta.label || meta.date || '') : 'Finding the newest pass…';
  const dis = on ? '' : 'disabled';
  const steps = def.resolve && def.resolve.length > 0 ? `<button class="btn btn-sm" data-step="1" ${dis}>◀ Older</button><button class="btn btn-sm" data-step="-1" ${dis}>Newer ▶</button>` : '';
  const re = def.recenter ? `<button class="btn btn-sm" data-reload ${dis}>Refresh here</button>` : '';
  return `<div class="row between gap" style="margin-top:8px"><span class="small" data-meta>${label}</span><span class="row gap">${steps}${re}</span></div>`;
}
function wireDateBar(sub, def, app, id) {
  if (!def.dated) return;
  const metaEl = qs('[data-meta]', sub); const btns = qsa('[data-step],[data-reload]', sub);
  const busy = (msg) => { metaEl.textContent = msg; btns.forEach((b) => { b.disabled = true; }); };
  const done = (meta) => { metaEl.textContent = meta ? (meta.label || meta.date || '') : 'Nothing published for that date'; btns.forEach((b) => { b.disabled = false; }); };
  qsa('[data-step]', sub).forEach((b) => b.addEventListener('click', async () => { busy('Loading…'); done(await app.layers.stepDate(id, +b.dataset.step)); }));
  const rl = qs('[data-reload]', sub); if (rl) rl.addEventListener('click', async () => { busy('Looking for the newest clear scene…'); done(await app.layers.reloadRaster(id)); });
}

// ---------- Hunt ----------
export function huntPanel(app) {
  const sp = speciesById(app.settings.species);
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Hunt</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const chips = h(`<div class="species">${SPECIES.map((s) => `<button type="button" data-sp="${s.id}" class="${s.id === sp.id ? 'on' : ''}">${esc(s.label)}</button>`).join('')}</div>`);
  qsa('button', chips).forEach((b) => b.addEventListener('click', () => { app.setSpecies(b.dataset.sp); app.openPanel('hunt'); }));
  root.appendChild(chips);
  root.appendChild(guideBlock(app));
  root.appendChild(lightBlock(app));
  root.appendChild(weatherNow(app));
  root.appendChild(standsBlock(app));
  root.appendChild(h(`<h3>Field notes: ${esc(sp.label)}</h3><ul class="steps small">${sp.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`));
  const tools = h(`<h3>Tools</h3><div class="row wrap gap">
    <button class="btn btn-sm" data-t="line">${icon('ruler')} Measure</button><button class="btn btn-sm" data-t="area">${icon('area')} Area</button>
    <button class="btn btn-sm" data-t="truck">${icon('truck')} Mark truck</button><button class="btn btn-sm" data-t="rec">${icon('record')} Record track</button>
    <button class="btn btn-sm" data-t="guard">${icon('warn')} Boundary alerts</button><button class="btn btn-sm" data-t="wx">${icon('wind')} Forecast</button></div>`);
  const wrap = h('<div></div>'); wrap.appendChild(tools);
  qsa('[data-t]', wrap).forEach((b) => b.addEventListener('click', () => app.tool(b.dataset.t)));
  root.appendChild(wrap);
  return root;
}
function lightBlock(app) {
  const L = app.legal(); const m = app.moon(); const rule = RULES.legal[app.settings.legalRule];
  const status = L.status === 'open' ? `<span class="pill ok">Legal light · ends ${fmtTime(L.end, TZ)}</span>` : L.status === 'before' ? `<span class="pill warn">Opens ${fmtTime(L.start, TZ)} · in ${L.minsTo} min</span>` : `<span class="pill bad">Closed · opens tomorrow ${fmtTime(new Date(L.start.getTime() + 86400000 - 60000), TZ)}</span>`;
  return h(`<div><h3>Light</h3><div class="tiles">
    <div class="tile"><div class="v">${fmtTime(L.sunrise, TZ)}</div><div class="k">Sunrise · legal ${fmtTime(L.start, TZ)}</div></div>
    <div class="tile"><div class="v">${fmtTime(L.sunset, TZ)}</div><div class="k">Sunset · legal ${fmtTime(L.end, TZ)}</div></div>
    <div class="tile"><div class="v">${Math.round(m.illumination * 100)}%</div><div class="k">${esc(m.name)}</div></div></div>
    <p class="small">${status}</p><p class="small muted">${esc(rule.label)}. Change the rule in Settings for migratory birds.</p></div>`);
}
function arrowFor(dir) { return `<span class="arrow" style="--r:${Math.round((dir || 0) + 180)}deg">↑</span>`; }
function weatherNow(app) {
  const w = app.wx; const u = app.settings.units;
  if (!w) return h(`<div><h3>Weather</h3><p class="muted small">Loading forecast…</p></div>`);
  const c = w.current; const score = activityScore(w, app.moon().illumination);
  const tr = w.pressureTrend; const trendTxt = tr.trend === 'rising' ? '▲ rising' : tr.trend === 'falling' ? '▼ falling' : '→ steady';
  const el = h(`<div><h3>Weather ${w.stale ? '<span class="pill warn">cached</span>' : ''}</h3>
    <p class="small muted">${esc(app.wxLabel())} · ${esc(c.desc)} · updated ${fmtTime(w.fetchedAt, TZ)}</p>
    <div class="tiles">
      <div class="tile"><div class="v">${fmtTemp(c.temp, u)}</div><div class="k">Feels ${fmtTemp(c.feelsLike, u)}</div></div>
      <div class="tile"><div class="v">${arrowFor(c.windDir)} ${fmtSpeed(c.windSpeed, u)}</div><div class="k">Wind from ${compass16(c.windDir || 0)} · gust ${fmtSpeed(c.gust, u)}</div></div>
      <div class="tile"><div class="v">${c.pressure ? c.pressure.toFixed(2) : '—'}</div><div class="k">inHg ${trendTxt}</div></div>
    </div>
    <div class="row between" style="margin-top:8px"><span class="small b">Activity ${score}/100</span><span class="small muted">humidity ${c.humidity ?? '—'}% · clouds ${c.cloud ?? '—'}%</span></div>
    <div class="score"><i style="width:${score}%"></i></div>
    <div class="row gap" style="margin-top:8px"><button class="btn btn-sm" data-wx>Hourly & 7-day</button><button class="btn btn-sm" data-refresh>Refresh</button></div></div>`);
  qs('[data-wx]', el).addEventListener('click', () => app.openPanel('weather'));
  qs('[data-refresh]', el).addEventListener('click', () => app.refreshWeather(true).then(() => app.openPanel('hunt')));
  return el;
}
function standsBlock(app) {
  const stands = app.markup.byKind('stand'); const w = app.wx;
  const root = h('<div><h3>Stands & wind</h3></div>');
  if (!stands.length) { root.appendChild(h('<p class="small muted">Add a Stand / blind waypoint, then set its approach direction to get wind ratings and scent cones.</p>')); return root; }
  const list = h('<div class="list"></div>');
  for (const s of stands) {
    const r = w ? rateStand(s.bedding, w.current.windDir) : { rating: 'unknown' };
    const pill = s.bedding == null ? '<span class="pill">set approach</span>' : `<span class="pill ${r.rating === 'good' ? 'ok' : r.rating === 'marginal' ? 'warn' : r.rating === 'bad' ? 'bad' : ''}">${r.rating}</span>`;
    const best = s.bedding != null ? `Best winds: ${bestWinds(s.bedding).join(', ')}` : 'Tap to set where the animals come from';
    const it = h(`<button class="item" type="button"><span class="mk-dot" style="--c:${KINDS.stand.color}">${markerSVG('stand')}</span><div class="txt"><b>${esc(s.name)} ${pill}</b><span>${best}</span></div>${icon('back', 'chev')}</button>`);
    qs('.chev', it).style.transform = 'rotate(180deg)';
    it.addEventListener('click', () => app.selectItem(s));
    list.appendChild(it);
  }
  root.appendChild(list);
  return root;
}

// ---------- Weather detail ----------
export function weatherPanel(app) {
  const w = app.wx; const u = app.settings.units;
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Forecast</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  if (!w) { root.appendChild(h('<p class="muted">No forecast yet. Check your connection.</p>')); return root; }
  root.appendChild(h(`<p class="small muted">${esc(app.wxLabel())} · Open-Meteo · ${w.stale ? 'cached, offline' : `updated ${fmtTime(w.fetchedAt, TZ)}`}</p>`));
  root.appendChild(airBlock(app));
  const stands = app.markup.byKind('stand').filter((s) => s.bedding != null);
  if (stands.length) {
    const sel = h(`<label class="field">Wind calendar for stand<select>${stands.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>`);
    const calWrap = h('<div></div>');
    const draw = () => { const s = app.markup.get(qs('select', sel).value); calWrap.innerHTML = ''; calWrap.appendChild(windCalendarEl(app, s)); };
    qs('select', sel).addEventListener('change', draw); root.appendChild(sel); root.appendChild(calWrap); draw();
  }
  root.appendChild(h('<h3>Next 24 hours</h3>'));
  const now = Date.now();
  const hrs = w.hourly.filter((x) => x.time.getTime() >= now - 1800000).slice(0, 24);
  const hl = h('<div></div>');
  for (const x of hrs) hl.appendChild(h(`<div class="hour"><span class="b">${fmtTime(x.time, TZ)}</span><span class="small">${esc(wmoDesc(x.code))}</span><span>${fmtTemp(x.temp, u)}</span><span>${arrowFor(x.windDir)} ${compass16(x.windDir || 0)} ${Math.round(x.windSpeed || 0)}</span><span class="small muted">${x.pop ?? 0}%</span></div>`));
  root.appendChild(hl);
  root.appendChild(h('<h3>7 days</h3>'));
  const dl = h('<div></div>');
  for (const d of w.daily) dl.appendChild(h(`<div class="day"><span class="b">${fmtDate(d.date, TZ).slice(0, 3)}</span><span class="small">${esc(d.desc)}</span><span>${fmtTemp(d.tmax, u)} / ${fmtTemp(d.tmin, u)}</span><span class="small">${compass16(d.windDir || 0)} ${Math.round(d.windMax || 0)}</span></div>`));
  root.appendChild(dl);
  return root;
}
function windCalendarEl(app, stand) {
  const cal = windCalendar(app.wx, stand.bedding, 48);
  const grid = h('<div class="cal"></div>');
  for (const c of cal) {
    const L = app.legal(c.time); const dark = L.status !== 'open';
    grid.appendChild(h(`<div class="h ${c.rating} ${dark ? 'dark' : ''}" title="${fmtTime(c.time, TZ)} ${compass16(c.windDir || 0)} ${Math.round(c.windSpeed || 0)} mph">${c.time.getHours() === 0 ? fmtDate(c.time, TZ).slice(0, 3) : fmtTime(c.time, TZ).replace(':00', '').replace(' ', '')}</div>`));
  }
  const wrap = h(`<div><p class="small muted">Green = scent blows away from the approach (${compass16(stand.bedding)}). Dim = outside legal light. 48 hours.</p></div>`);
  wrap.appendChild(grid); return wrap;
}

// ---------- Markup ----------
export function markupPanel(app, { filter = '' } = {}) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Markup</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const bar = h(`<div class="row wrap gap">
    <button class="btn btn-sm btn-primary" data-a="pin">${icon('plus')} Waypoint</button><button class="btn btn-sm" data-a="line">${icon('route')} Line</button><button class="btn btn-sm" data-a="area">${icon('area')} Area</button>
    <button class="btn btn-sm" data-a="import">${icon('upload')} Import</button><button class="btn btn-sm" data-a="export">${icon('share')} Export</button><button class="btn btn-sm" data-a="tracks">${icon('route')} Tracks</button></div>`);
  qsa('[data-a]', bar).forEach((b) => b.addEventListener('click', () => app.markupAction(b.dataset.a)));
  root.appendChild(bar);
  const items = app.markup.all(); const tags = app.markup.tags();
  const f = h(`<div class="row gap"><input type="search" placeholder="Filter by name, kind, tag" value="${esc(filter)}"><label class="row small muted" style="flex:0 0 auto">Show ${sw(app.markup.visible)}</label></div>`);
  qs('input', f).addEventListener('input', (e) => render(e.target.value));
  qs('.switch', f).addEventListener('click', (e) => { app.markup.setVisible(!app.markup.visible); e.target.classList.toggle('on', app.markup.visible); });
  root.appendChild(f);
  if (tags.length) { const tg = h(`<div class="tags">${tags.map((t) => `<button class="pill ${app.markup.filterTag === t ? 'ok' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>`); qsa('[data-tag]', tg).forEach((b) => b.addEventListener('click', () => { app.markup.setFilter(app.markup.filterTag === b.dataset.tag ? null : b.dataset.tag); app.openPanel('markup'); })); root.appendChild(tg); }
  const list = h('<div class="list"></div>'); root.appendChild(list);
  const here = app.here();
  const render = (q) => {
    list.innerHTML = ''; const ql = (q || '').toLowerCase();
    const shown = items.filter((it) => !ql || `${it.name} ${it.kind} ${(it.tags || []).join(' ')} ${it.notes || ''}`.toLowerCase().includes(ql));
    if (!shown.length) { list.appendChild(h('<div class="item"><div class="txt"><span>Nothing here yet. Long-press the map to drop a waypoint.</span></div></div>')); return; }
    for (const it of shown) {
      const c = it.type === 'point' ? it.coords : it.coords[0];
      const dist = here ? `${fmtDist(haversine(here, c), app.settings.units)} ${compass16(bearing(here, c))}` : '';
      const sub = [KINDS[it.kind]?.label || it.type, it.type !== 'point' ? it.type : '', dist, (it.tags || []).map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · ');
      const el = h(`<button class="item" type="button">${kindDot(it.kind, it.color)}<div class="txt"><b>${esc(it.name)}</b><span>${esc(sub)}</span></div></button>`);
      el.addEventListener('click', () => app.selectItem(it, { fly: true }));
      list.appendChild(el);
    }
  };
  render(filter);
  return root;
}
export async function tracksPanel(app) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Tracks</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const rec = app.tracker.rec;
  root.appendChild(h(`<div class="row gap"><button class="btn ${rec ? 'btn-danger' : 'btn-primary'}" data-rec>${rec ? `${icon('stop')} Stop recording` : `${icon('record')} Start recording`}</button></div>`));
  qs('[data-rec]', root).addEventListener('click', () => app.tool('rec'));
  const tracks = await app.tracker.tracks();
  const list = h('<div class="list"></div>');
  if (!tracks.length) list.appendChild(h('<div class="item"><div class="txt"><span>No saved tracks.</span></div></div>'));
  for (const t of tracks) {
    const s = Tracker.trackStats(t);
    const el = h(`<div class="item"><div class="txt"><b>${esc(t.name)}</b><span>${fmtDate(t.start, TZ)} · ${fmtDist(s.distM, app.settings.units)} · ${fmtDuration(s.durationMs)} · +${fmtElev(s.gain, app.settings.units)}</span></div><button class="btn btn-sm" data-go>Go</button><button class="btn btn-sm" data-share>${icon('share')}</button><button class="btn btn-sm btn-danger" data-del>${icon('trash')}</button></div>`);
    qs('[data-go]', el).addEventListener('click', () => { app.fitCoords(t.points.map((p) => [p[0], p[1]])); app.ui.hideSheet(); });
    qs('[data-share]', el).addEventListener('click', () => app.share(`${t.name}.gpx`, Tracker.trackGPX(t), 'application/gpx+xml'));
    qs('[data-del]', el).addEventListener('click', async () => { if (await app.ui.confirm(`Delete track "${t.name}"?`, { ok: 'Delete', danger: true })) { await app.tracker.removeTrack(t.id); app.openPanel('tracks'); } });
    list.appendChild(el);
  }
  root.appendChild(list);
  return root;
}

// ---------- More / settings / offline / features / about ----------
export function morePanel(app) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>More</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const rows = [
    ['offline', 'offline', 'Offline maps', 'Download imagery, topo, land and layers for an area'],
    ['boundary', 'warn', 'Boundary alerts', 'Pick the parcels you may hunt; get warned near the line'],
    ['settings', 'settings', 'Settings', 'Units, theme, night mode, legal-light rule, weather point'],
    ['tracks', 'route', 'Tracks', 'Recorded hikes'],
    ['units', 'map', 'Game units', 'Browse units and zoom to one'],
    ['guide', 'book', 'Species guides', 'Habitat, calendar, sign, tactics, calling, shot placement, Arizona rules'],
    ['insights', 'eye', 'Sightings insights', 'Time, wind, moon and pressure behind your own logged sightings'],
    ['features', 'list', 'Feature coverage', 'What onX, HuntStand, BaseMap, GoHunt charge for, and where it is here'],
    ['install', 'download', 'Install on iPhone', 'Add to Home Screen for full-screen use'],
    ['about', 'info', 'About & data sources', `Fenceline ${APP_VERSION}`]
  ];
  const list = h('<div class="list"></div>');
  for (const [p, ic, t, s] of rows) { const el = h(`<button class="item" type="button">${icon(ic)}<div class="txt"><b>${esc(t)}</b><span>${esc(s)}</span></div></button>`); el.addEventListener('click', () => app.openPanel(p)); list.appendChild(el); }
  root.appendChild(list);
  return root;
}
export function settingsPanel(app) {
  const s = app.settings;
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Settings</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const seg = (key, opts, label) => {
    const el = h(`<label class="field">${label}<div class="seg">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${s[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div></label>`);
    qsa('button', el).forEach((b) => b.addEventListener('click', () => { app.setSetting(key, b.dataset.v); qsa('button', el).forEach((x) => x.classList.toggle('on', x === b)); }));
    return el;
  };
  root.appendChild(seg('units', [['imperial', 'Yards / miles / °F'], ['metric', 'Meters / km / °C']], 'Units'));
  root.appendChild(seg('theme', [['dark', 'Dark'], ['light', 'Light']], 'Theme'));
  root.appendChild(seg('legalRule', [['bigGame', 'Big game & small game'], ['migratory', 'Dove & waterfowl']], 'Legal shooting hours'));
  root.appendChild(seg('wxSource', [['center', 'Map center'], ['you', 'My location']], 'Weather point'));
  const night = h(`<label class="field row between">Night mode (red light) ${sw(!!s.night)}</label>`);
  qs('.switch', night).addEventListener('click', (e) => { app.setSetting('night', !s.night); e.target.classList.toggle('on', !!s.night); });
  root.appendChild(night);
  const labels = h(`<label class="field row between">Waypoint labels on map ${sw(!!s.labels)}</label>`);
  qs('.switch', labels).addEventListener('click', (e) => { app.setSetting('labels', !s.labels); e.target.classList.toggle('on', !!s.labels); });
  root.appendChild(labels);
  const ex = h(`<label class="field">3D exaggeration <input type="range" min="1" max="2.5" step="0.1" value="${s.exaggeration || 1.3}"></label>`);
  qs('input', ex).addEventListener('change', (e) => app.setSetting('exaggeration', +e.target.value));
  root.appendChild(ex);
  const dz = h(`<div class="danger-zone"><p class="small b">Reset</p><div class="row wrap gap"><button class="btn btn-sm" data-r="layers">Layers to defaults</button><button class="btn btn-sm btn-danger" data-r="markup">Delete all markup</button><button class="btn btn-sm btn-danger" data-r="offline">Delete offline data</button></div></div>`);
  qsa('[data-r]', dz).forEach((b) => b.addEventListener('click', () => app.resetAction(b.dataset.r)));
  root.appendChild(dz);
  return root;
}
export function featuresPanel() {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Feature coverage</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  root.appendChild(h('<p class="small muted">Paid features from onX Hunt Elite, HuntStand Pro, BaseMap Pro, GoHunt Insider, HuntWise Pro, Gaia and CalTopo, and how Fenceline covers each.</p>'));
  const n = { in: 0, part: 0, no: 0 }; FEATURES.forEach((f) => n[f.s]++);
  root.appendChild(h(`<div class="tiles"><div class="tile"><div class="v">${n.in}</div><div class="k">Included</div></div><div class="tile"><div class="v">${n.part}</div><div class="k">Partial</div></div><div class="tile"><div class="v">${n.no}</div><div class="k">Not possible as a web app</div></div></div>`));
  const wrap = h('<div></div>');
  for (const f of FEATURES) wrap.appendChild(h(`<div class="cover"><span class="b">${esc(f.f)}</span><span class="pill ${f.s === 'in' ? 'ok' : f.s === 'part' ? 'warn' : 'bad'}">${f.s === 'in' ? 'Included' : f.s === 'part' ? 'Partial' : 'No'}</span><span class="how">${esc(f.who)} · ${esc(f.how)}</span></div>`));
  root.appendChild(wrap);
  return root;
}
export function aboutPanel() {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>About</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  root.appendChild(h(`<p>Fenceline ${APP_VERSION}. A personal Arizona hunting map. Everything runs on your phone; map data comes straight from public agency servers.</p>
    <h3>Data sources</h3><ul class="steps small">${ATTRIBUTIONS.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    <h3>Know the limits</h3><ul class="steps small"><li>Boundaries, ownership, and unit lines are informational. Confirm on the ground and in the current AZGFD regulations.</li><li>GPS stops when the screen locks. Keep the screen on while tracking or using boundary alerts.</li><li>Stock tank and spring data does not say whether water is present today.</li></ul>`));
  return root;
}
export function installPanel() {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Install on iPhone</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  root.appendChild(h(standalone ? '<p class="pill ok">Installed and running full screen.</p>' : `<ol class="steps"><li>Open this page in Safari.</li><li>Tap the Share button (square with an arrow).</li><li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open Fenceline from the Home Screen. Allow Location when asked.</li><li>Go to More → Offline maps and download your unit before you lose signal.</li></ol>
    <p class="small muted">iOS keeps the app and its downloads as long as you open it now and then. Safari may clear data for sites you have not opened in a long while.</p>`));
  return root;
}
export function unitsPanel(app) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Game units</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const feats = app.layers.getFeatures('gmu');
  if (!feats.length) { root.appendChild(h('<p class="muted small">Turn on the Game management units layer to load the list.</p>')); return root; }
  const q = h('<input type="search" placeholder="Unit number, e.g. 6A">'); root.appendChild(q);
  const list = h('<div class="list"></div>'); root.appendChild(list);
  const units = feats.filter((f) => unitName(f.properties)).map((f) => ({ name: String(unitName(f.properties)), f })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const render = (s) => { list.innerHTML = ''; for (const u of units.filter((u) => !s || u.name.toLowerCase().startsWith(s.toLowerCase()))) { const el = h(`<button class="item" type="button"><div class="txt"><b>Unit ${esc(u.name)}</b><span>${esc(u.f.properties.REG_NAME || '')}</span></div></button>`); el.addEventListener('click', () => app.openUnit(u.f)); list.appendChild(el); } };
  q.addEventListener('input', () => render(q.value)); render('');
  return root;
}
export function unitPanel(app, feature) {
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Unit ${esc(unitName(feature.properties))}</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  root.appendChild(h(`<div>${unitHTML(feature.properties)}</div>`));
  const hunts = feature.properties.HUNT;
  if (hunts) root.appendChild(h(`<div class="kv"><span>Hunts</span><b>${esc(String(hunts).replace(/[;,]s*/g, ' · '))}</b></div>`));
  const b = h(`<div class="row gap"><button class="btn btn-primary">Zoom to unit</button><button class="btn" data-dl>Download for offline</button></div>`);
  qs('.btn-primary', b).addEventListener('click', () => { app.fitGeom(feature.geometry); app.ui.hideSheet(); });
  qs('[data-dl]', b).addEventListener('click', () => { app.fitGeom(feature.geometry); app.openPanel('offline'); });
  root.appendChild(b);
  return root;
}

// ---------- Identify card ----------
const DROUGHT = ['D0 abnormally dry', 'D1 moderate drought', 'D2 severe drought', 'D3 extreme drought', 'D4 exceptional drought'];
const useLevel = (g) => (+g >= 20 ? 'High use' : +g >= 10 ? 'Medium use' : 'Low use');
// BLM PLSSID, e.g. AZ140140N0040E0 → "T14N R4E · Gila & Salt River meridian".
function plssText(id) {
  const m = /^([A-Z]{2})(\d{2})(\d{3})(\d)([NS])(\d{3})(\d)([EW])/.exec(String(id || ''));
  if (!m) return '';
  const mer = { 14: 'Gila & Salt River', 22: 'Navajo', 27: 'San Bernardino' }[+m[2]];
  return `T${+m[3]}${m[4] !== '0' ? `.${m[4]}` : ''}${m[5]} R${+m[6]}${m[7] !== '0' ? `.${m[7]}` : ''}${m[8]}${mer ? ` · ${mer} meridian` : ''}`;
}
const F = (p, keys) => pickValue(p, keys);
function summarize(id, p) {
  const acres = (v) => (v != null ? `${round(+v, 1).toLocaleString()} ac` : '');
  switch (id) {
    case 'parcels': return { title: p.owner || 'Unknown owner', sub: [p.apn ? `APN ${p.apn}` : '', p.addr, p.acres != null ? acres(p.acres) : '', p.county].filter(Boolean).join(' · ') };
    case 'stateTrust': return { title: `State Trust · ${p.accountname || 'no active lease'}`, sub: [`T${p.township}${p.townshipdirection} R${p.range}${p.rangedirection} S${p.section}`, acres(p.gisacres || p.acres), p.parceltype || p.classification].filter(Boolean).join(' · ') };
    case 'wilderness': return { title: `${F(p, ['wildernessname', 'NLCS_NAME']) || 'Wilderness'} Wilderness`, sub: `No motor vehicles or bikes · ${acres(F(p, ['gis_acres', 'GIS_ACRES']))}` };
    case 'forests': return { title: p.forestname || 'National Forest', sub: 'USFS boundary' };
    case 'wildlifeAreas': return { title: F(p, ['NAME', 'Name', 'name']) || 'Wildlife area', sub: 'AZGFD wildlife area; check special rules' };
    case 'allotments': return { title: F(p, [/allot.*name/i, /name/i]) || 'Grazing allotment', sub: [F(p, [/permit/i, /ranch/i]), F(p, [/agency/i, /admin/i])].filter(Boolean).join(' · ') || 'Grazing allotment' };
    case 'tanks': return { title: p.GNIS_NAME || (p.FTYPE === 436 ? 'Unnamed tank / reservoir' : 'Unnamed pond'), sub: p.AREASQKM ? `${round(p.AREASQKM * 247.1, 1)} ac surface when full` : 'NHD waterbody' };
    case 'springs': return { title: p.GNIS_NAME || 'Spring / seep', sub: 'NHD spring' };
    case 'hpcWater': return { title: p.project_name || 'Water project', sub: [p.water_type || p.project_type, p.reliable_water ? `reliable: ${p.reliable_water}` : '', p.project_status].filter(Boolean).join(' · ') };
    case 'springsWells': return { title: p.name || 'Spring / well', sub: p.watershed || '' };
    case 'mvum': return { title: `FR ${p.id || ''} ${p.name || ''}`.trim(), sub: [p.mvum_symbol_name, p.seasonal, p.highclearancevehicle_datesopen ? `open ${p.highclearancevehicle_datesopen}` : p.passengervehicle_datesopen ? `open ${p.passengervehicle_datesopen}` : '', p.surfacetype, p.gis_miles ? `${round(p.gis_miles, 1)} mi` : ''].filter(Boolean).join(' · ') };
    case 'mvumTrails': return { title: `Trail ${p.id || ''} ${p.name || ''}`.trim(), sub: [p.mvum_symbol_name, p.seasonal, p.gis_miles ? `${round(p.gis_miles, 1)} mi` : ''].filter(Boolean).join(' · ') };
    case 'trails': return { title: p.trail_name || `Trail ${p.trail_no || ''}`, sub: [p.trail_no ? `#${p.trail_no}` : '', p.trail_type, p.allowed_terra_use, p.terra_motorized, p.gis_miles ? `${round(p.gis_miles, 1)} mi` : ''].filter(Boolean).join(' · ') };
    case 'blmRec': return { title: F(p, ['FET_NAME', 'NAME', 'Name', 'SITE_NAME', /name/i]) || 'BLM site', sub: F(p, [/type/i, /feat/i]) || 'BLM recreation site' };
    case 'fires': return { title: `${p.INCIDENT || 'Fire'} (${p.FIRE_YEAR_INT || p.FIRE_YEAR || '?'})`, sub: `${acres(p.GIS_ACRES)} burned · ${new Date().getFullYear() - (p.FIRE_YEAR_INT || +p.FIRE_YEAR || 0)} yrs ago` };
    case 'firesCurrent': return { title: p.poly_IncidentName || 'Active fire', sub: `${acres(p.poly_GISAcres)} · ${p.attr_PercentContained != null ? `${p.attr_PercentContained}% contained` : 'this year'}` };
    case 'plss': return { title: F(p, ['TWNSHPLAB']) || plssText(p.PLSSID) || 'Township', sub: 'Township and range (BLM PLSS)' };
    case 'sections': return { title: `Section ${p.FRSTDIVNO || '?'}`, sub: plssText(p.PLSSID) || 'PLSS section' };
    case 'roadless': return { title: F(p, [/area_name/i, /roadless.*name/i, /^name$/i, /name/i]) || 'Roadless area', sub: [F(p, [/category/i, /type/i]), acres(F(p, [/gis_acres/i, /acres/i]))].filter(Boolean).join(' · ') || 'Inventoried Roadless Area' };
    case 'ranges': return { title: F(p, ['MasterName', 'Range_Name', /name/i]) || 'Range', sub: [F(p, [/type/i, /facility/i]), F(p, [/city/i, /town/i]), F(p, [/phone/i])].filter(Boolean).join(' · ') || 'Shooting range' };
    case 'timber': return { title: p.activity_name || p.treatment_type || 'Timber treatment', sub: [p.sale_name, p.fy_completed ? `completed FY${p.fy_completed}` : '', acres(p.gis_acres)].filter(Boolean).join(' · ') };
    case 'fuels': return { title: p.treatment_type || p.activity || 'Fuels treatment', sub: [p.treatment_name, p.method, p.stage, p.fiscal_year_completed ? `FY${p.fiscal_year_completed}` : '', acres(p.gis_acres)].filter(Boolean).join(' · ') };
    case 'restoration': return { title: p.HabitatAction || 'Habitat project', sub: [p.CoverType, p.Acres ? acres(p.Acres) : '', p.HabitatAction2].filter(Boolean).join(' · ') };
    case 'migration': return { title: `${p.fl_species || 'Ungulate'} corridor`, sub: [useLevel(p.GRIDCODE), F(p, [/herd/i, /population/i, /project/i])].filter(Boolean).join(' · ') };
    case 'migrationRoutes': return { title: `${p.fl_species || 'Ungulate'} route`, sub: [F(p, [/season/i]), F(p, [/herd/i, /population/i]), F(p, [/year/i])].filter(Boolean).join(' · ') || 'Collared-animal route' };
    case 'winterRange': return { title: `${p.fl_species || 'Ungulate'} ${String(p.fl_season || 'range').toLowerCase()}`, sub: [F(p, [/herd/i, /population/i, /project/i]), acres(F(p, [/acres/i]))].filter(Boolean).join(' · ') || 'Seasonal range' };
    case 'cwd': return { title: p.zone_type || 'CWD surveillance zone', sub: 'Carcass transport rules apply; AZGFD asks for heads to test' };
    case 'wolf': return { title: 'Mexican wolf occupied range', sub: 'Protected: confirm coyote vs wolf before any predator shot' };
    case 'drought': return { title: DROUGHT[p.dm] || 'Drought', sub: p.period ? `Week of ${p.period}` : 'US Drought Monitor' };
    case 'gmu': return { title: `Unit ${unitName(p)}`, sub: p.REG_NAME || '' };
    default: { const ks = Object.keys(p).filter((k) => p[k] != null && !/objectid|shape|globalid/i.test(k)).slice(0, 4); return { title: LAYER_DEFS[id]?.label || id, sub: ks.map((k) => `${k}: ${p[k]}`).join(' · ') }; }
  }
}
export function identifyHTML(app, hits, d) {
  const u = app.settings.units; const parts = [];
  const loc = `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`;
  parts.push(`<div class="card-head"><div><b>${d.unit ? `Unit ${esc(unitName(d.unit))}` : 'Point'}</b> <span class="muted small mono">${loc}</span></div><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`);
  const tiles = [];
  if (d.elev != null) tiles.push(`<div class="tile"><div class="v">${fmtElev(d.elev, u)}</div><div class="k">Elevation${d.dz != null ? ` · ${d.dz >= 0 ? '+' : ''}${fmtElev(d.dz, u)} from you` : ''}</div></div>`);
  if (d.fromYou) tiles.push(`<div class="tile"><div class="v">${fmtDist(d.fromYou.d, u)}</div><div class="k">${fmtBearing(d.fromYou.brg)} from you</div></div>`);
  if (d.truck) tiles.push(`<div class="tile"><div class="v">${fmtDist(d.truck.d, u)}</div><div class="k">${fmtBearing(d.truck.brg)} to ${esc(d.truck.name)}</div></div>`);
  if (d.water) tiles.push(`<div class="tile"><div class="v">${fmtDist(d.water.d, u)}</div><div class="k">${compass16(d.water.brg)} to ${esc(String(d.water.name))}</div></div>`);
  if (tiles.length) parts.push(`<div class="tiles">${tiles.join('')}</div>`);
  if (d.crop) parts.push(`<div class="kv"><span>Crop</span><b>${esc(d.crop.label)}${d.crop.isFeed ? ' <span class="muted small">· feed field: glass the edges at dusk</span>' : ''}</b></div>`);
  if (d.land) parts.push(`<div class="kv"><span>Land</span><b>${esc(landName(d.land.manager))}${d.land.owner && d.land.owner !== d.land.manager ? ` · ${esc(d.land.owner)}` : ''}${d.land.access ? ` · access: ${esc(d.land.access)}` : ''}</b></div>`);
  const rows = hits.filter((hh) => hh.id !== 'gmu').map((hh) => { const s = summarize(hh.id, hh.feature.properties); return `<div class="kv"><span>${esc(LAYER_DEFS[hh.id]?.label || hh.id)}</span><b>${esc(s.title)}${s.sub ? `<br><span class="muted small">${esc(s.sub)}</span>` : ''}</b></div>`; });
  if (rows.length) parts.push(rows.join(''));
  const par = hits.find((hh) => hh.id === 'parcels');
  const apn = par ? par.feature.properties.apn : null;
  const permitted = apn && app.settings.permitted.includes(apn);
  parts.push(`<div class="row wrap gap" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-act="pin">${icon('pin')} Waypoint</button><button class="btn btn-sm" data-act="measure">${icon('ruler')} Measure from here</button>${apn ? `<button class="btn btn-sm" data-act="permit">${permitted ? '✓ Permitted parcel' : 'I have permission here'}</button>` : ''}${d.unit ? `<button class="btn btn-sm" data-act="unit">Unit info</button>` : ''}<button class="btn btn-sm" data-act="share">${icon('share')}</button></div>`);
  return parts.join('');
}
export function landName(code) {
  const m = { BLM: 'BLM public land', USFS: 'National Forest', FS: 'National Forest', NPS: 'National Park Service', FWS: 'US Fish & Wildlife', USFWS: 'US Fish & Wildlife', ST: 'State Trust land', STATE: 'State land', SLD: 'State Trust land', ASLD: 'State Trust land', BIA: 'Tribal land', TRIBAL: 'Tribal land', DOD: 'Military', PVT: 'Private', PRIVATE: 'Private', PRI: 'Private', BOR: 'Bureau of Reclamation', LG: 'Local government', AZGFD: 'Arizona Game & Fish', OTHER: 'Other' };
  if (!code) return 'Unknown';
  return m[String(code).toUpperCase()] || String(code);
}

// Air quality tiles (smoke, dust, UV) filled in once Open-Meteo answers.
function airBlock(app) {
  const el = h('<div class="tiles"><div class="tile"><div class="v">…</div><div class="k">US AQI</div></div><div class="tile"><div class="v">…</div><div class="k">PM2.5 smoke</div></div><div class="tile"><div class="v">…</div><div class="k">UV index</div></div></div>');
  const [lon, lat] = app.wxPoint();
  getAirQuality(lon, lat).then((a) => {
    const [lvl, cls] = aqiLevel(a.aqi); const dust = a.dust != null && a.dust >= 50 ? ` · dust ${Math.round(a.dust)}` : '';
    el.innerHTML = `<div class="tile"><div class="v">${a.aqi ?? '—'}</div><div class="k">US AQI <span class="pill ${cls}">${esc(lvl)}</span></div></div><div class="tile"><div class="v">${a.pm25 != null ? Math.round(a.pm25) : '—'}</div><div class="k">PM2.5 µg/m³${dust}</div></div><div class="tile"><div class="v">${a.uv != null ? Math.round(a.uv) : '—'}</div><div class="k">UV index</div></div>`;
  }).catch(() => { el.innerHTML = '<p class="small muted" style="margin:0">Air quality unavailable right now.</p>'; });
  return el;
}
