// Sightings insights: the time, wind, moon and pressure your own waypoints were logged in, summed into simple histograms.
import { KINDS } from './markup.js';
import { icon } from './icons.js';
import { TZ } from './config.js';
import { h, esc, qsa, compass16, fmtTemp, fmtTime } from './util.js';

// Kinds that count as an observation of animals or their sign.
export const LOG_KINDS = ['sighting', 'kill', 'cam', 'track', 'scrape', 'rub', 'bed', 'blood', 'roost', 'wallow', 'shed'];
const SIGN = ['track', 'scrape', 'rub', 'bed', 'blood', 'roost', 'wallow'];
const FILTERS = [['all', 'All'], ['sighting', 'Sightings'], ['kill', 'Kills'], ['sign', 'Sign'], ['cam', 'Cameras'], ['shed', 'Sheds']];

// Conditions at this moment; saved on every new waypoint so the patterns can be summed later.
export function envSnapshot(app) {
  const w = app.wx && app.wx.current; const tr = app.wx && app.wx.pressureTrend; const m = app.moon ? app.moon() : null;
  const num = (v) => (typeof v === 'number' && !isNaN(v) ? v : null);
  return {
    t: Date.now(), windDir: w ? num(w.windDir) : null, windSpeed: w ? num(w.windSpeed) : null, temp: w ? num(w.temp) : null,
    pressure: w ? num(w.pressure) : null, trend: tr && tr.trend ? tr.trend : null, code: w ? num(w.code) : null,
    moon: m ? num(m.illumination) : null, moonName: m ? m.name : null
  };
}

export function envText(env, units = 'imperial') {
  if (!env) return '';
  const parts = [fmtTime(new Date(env.t), TZ)];
  if (env.windDir != null) parts.push(`${compass16(env.windDir)} ${Math.round(env.windSpeed || 0)} mph`);
  if (env.temp != null) parts.push(fmtTemp(env.temp, units));
  if (env.pressure != null) parts.push(`${env.pressure.toFixed(2)} inHg${env.trend ? ` ${env.trend}` : ''}`);
  if (env.moon != null) parts.push(`moon ${Math.round(env.moon * 100)}%${env.moonName ? `, ${env.moonName.toLowerCase()}` : ''}`);
  return parts.join(' · ');
}

// Bins. Hours and months come from the waypoint's own timestamp, so every point has them; the rest need a saved snapshot.
const HOURS = [['Night', (hh) => hh >= 21 || hh < 4], ['Dawn', (hh) => hh >= 4 && hh < 7], ['Morning', (hh) => hh >= 7 && hh < 10], ['Midday', (hh) => hh >= 10 && hh < 15], ['Afternoon', (hh) => hh >= 15 && hh < 18], ['Evening', (hh) => hh >= 18 && hh < 21]];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WINDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const MOONS = [['New', (x) => x < 0.1], ['Crescent or quarter', (x) => x >= 0.1 && x < 0.5], ['Gibbous', (x) => x >= 0.5 && x < 0.9], ['Full', (x) => x >= 0.9]];
const TRENDS = ['falling', 'steady', 'rising'];
const TEMPS = [['Below 32°F', -999, 32], ['32 to 50°F', 32, 50], ['50 to 70°F', 50, 70], ['70 to 90°F', 70, 90], ['90°F and up', 90, 999]];

function count(items, labels, pick) {
  const bins = labels.map((label) => ({ label, n: 0 }));
  let used = 0;
  for (const it of items) { const i = pick(it); if (i == null || i < 0) continue; bins[i].n++; used++; }
  return { bins, used };
}
const when = (it) => new Date(it.env && it.env.t ? it.env.t : it.created);
const hourBin = (it) => { const hh = when(it).getHours(); return HOURS.findIndex(([, f]) => f(hh)); };
const monthBin = (it) => when(it).getMonth();
const windBin = (it) => (it.env && it.env.windDir != null ? Math.round((((it.env.windDir % 360) + 360) % 360) / 45) % 8 : null);
const moonBin = (it) => (it.env && it.env.moon != null ? MOONS.findIndex(([, f]) => f(it.env.moon)) : null);
const trendBin = (it) => (it.env && it.env.trend ? TRENDS.indexOf(it.env.trend) : null);
const tempBin = (it) => (it.env && it.env.temp != null ? TEMPS.findIndex(([, lo, hi]) => it.env.temp >= lo && it.env.temp < hi) : null);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function histHTML(title, { bins, used }, total, note) {
  const max = Math.max(1, ...bins.map((b) => b.n));
  const rows = bins.map((b) => `<div class="hrow"><span class="hl">${esc(b.label)}</span><div class="hb"><i style="width:${Math.round((b.n / max) * 100)}%"></i></div><span class="hn">${b.n}</span></div>`).join('');
  const sub = used < total ? `<p class="small muted" style="margin:0 0 4px">${used} of ${total} points have this.${note ? ` ${note}` : ''}</p>` : '';
  return `<div class="hist"><h3>${esc(title)}</h3>${sub}${rows}</div>`;
}
function best(c, min = 2) { const top = [...c.bins].sort((a, b) => b.n - a.n)[0]; return top && top.n >= min ? top.label : null; }
const stamp = (it) => (it.env && it.env.t ? it.env.t : it.created);

export function insightsPanel(app, filter = 'all') {
  const f = FILTERS.some(([k]) => k === filter) ? filter : 'all';
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Sightings insights</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const chips = h(`<div class="species">${FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" class="${k === f ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`);
  qsa('button', chips).forEach((b) => b.addEventListener('click', () => app.openPanel('insights', b.dataset.f)));
  root.appendChild(chips);
  const all = app.markup.all().filter((it) => it.type === 'point' && LOG_KINDS.includes(it.kind));
  const items = all.filter((it) => f === 'all' || it.kind === f || (f === 'sign' && SIGN.includes(it.kind)));
  if (!items.length) {
    root.appendChild(h('<p class="muted">Nothing logged yet. Every waypoint you drop (sightings, kills, cameras, sign) saves the time, wind, temperature, pressure trend and moon with it. After a season the patterns show up here.</p>'));
    return root;
  }
  const total = items.length; const withEnv = items.filter((it) => it.env).length;
  const hc = count(items, HOURS.map((x) => x[0]), hourBin); const wc = count(items, WINDS, windBin); const mc = count(items, MOONS.map((x) => x[0]), moonBin);
  const tc = count(items, TRENDS.map(cap), trendBin); const tmc = count(items, TEMPS.map((x) => x[0]), tempBin); const moc = count(items, MONTHS, monthBin);
  const picks = [best(hc), best(wc) && `${best(wc)} wind`, best(tc) && `${best(tc).toLowerCase()} pressure`, best(mc) && `${best(mc).toLowerCase()} moon`].filter(Boolean);
  root.appendChild(h(`<div class="tiles"><div class="tile"><div class="v">${total}</div><div class="k">points</div></div><div class="tile"><div class="v">${withEnv}</div><div class="k">with weather</div></div><div class="tile"><div class="v">${items.filter((it) => it.kind === 'sighting').length}</div><div class="k">sightings</div></div></div>`));
  if (picks.length) root.appendChild(h(`<div class="phase">${icon('eye')}<div><b>Your pattern so far</b><span>Most of your logs came at ${esc(picks.join(', '))}. Small samples lie; keep logging.</span></div></div>`));
  const wrap = h('<div></div>');
  wrap.innerHTML = histHTML('Time of day', hc, total) + histHTML('Wind from', wc, total, 'Weather is saved only when the forecast had loaded.') + histHTML('Pressure trend', tc, total) + histHTML('Moon', mc, total) + histHTML('Temperature', tmc, total) + histHTML('Month', moc, total);
  root.appendChild(wrap);
  root.appendChild(h('<h3>Recent logs</h3>'));
  const list = h('<div class="list"></div>');
  for (const it of [...items].sort((a, b) => stamp(b) - stamp(a)).slice(0, 12)) {
    const k = KINDS[it.kind] || KINDS.pin;
    const el = h(`<button class="item" type="button">${icon(k.glyph)}<div class="txt"><b>${esc(it.name)}</b><span>${esc(envText(it.env, app.settings.units) || fmtTime(new Date(it.created), TZ))}${it.notes ? ` · ${esc(it.notes.slice(0, 60))}` : ''}</span></div></button>`);
    el.addEventListener('click', () => { app.ui.hideSheet(); app.map.easeTo({ center: it.coords, zoom: Math.max(app.map.getZoom(), 14) }); app.selectItem(it); });
    list.appendChild(el);
  }
  root.appendChild(list);
  return root;
}
