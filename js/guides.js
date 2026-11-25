// Species guides: panel rendering, 12-month calendar, habitat-finder presets and shot-placement diagrams.
import { GUIDES } from './guide-data.js';
import { GUIDES_2, COMMON } from './guide-data-2.js';
import { SPECIES } from './species.js';
import { icon } from './icons.js';
import { h, esc, qs, qsa } from './util.js';

const ALL = { ...GUIDES, ...GUIDES_2 };
const MONTH_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PHASE_LABEL = { rut: 'Breeding', prime: 'Prime', ok: 'Fair', off: 'Off season' };
const pillClass = (k) => (k === 'rut' ? 'warn' : k === 'prime' ? 'ok' : '');

export function guideFor(id) { return ALL[id] || null; }
export function guideIds() { return Object.keys(ALL); }

// Habitat-finder preset for a species in a given month: elevation band (ft), aspects, slope range, label.
export function habitatFor(id, date = new Date()) {
  const g = ALL[id]; if (!g || !g.hab) return null;
  const m = date.getMonth() + 1; const base = g.hab;
  let p = { elev: base.elev, asp: base.asp, slope: base.slope, label: '' };
  for (const [k, v] of Object.entries(base.months || {})) if (k.split(',').map(Number).includes(m)) p = { ...p, ...v };
  const aspText = p.asp && p.asp.length ? `, ${p.asp.join('/')} faces` : '';
  const elevText = `${p.elev[0].toLocaleString()} to ${p.elev[1].toLocaleString()} ft`;
  return { ...p, label: `${g.name}: ${elevText}${aspText}${p.label ? ` · ${p.label}` : ''}` };
}

export function phaseNow(id, date = new Date()) {
  const g = ALL[id]; if (!g) return null;
  const i = date.getMonth(); const [k, t, n] = g.cal[i];
  return { k, t, n, month: MONTH_NAMES[i], label: PHASE_LABEL[k] || k };
}

// Twelve month cells colored by phase; the current month is outlined.
export function calendarStrip(id, date = new Date()) {
  const g = ALL[id]; if (!g) return '';
  const now = date.getMonth();
  return `<div class="cal12">${g.cal.map(([k, t], i) => `<div class="m ${k}${i === now ? ' now' : ''}" title="${esc(MONTH_NAMES[i])}: ${esc(t)}">${MONTH_SHORT[i]}</div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Breeding</span><span><i style="background:var(--green)"></i>Prime</span><span><i style="background:var(--warn)"></i>Fair</span><span><i style="background:var(--panel3)"></i>Off</span></div>`;
}

const phaseHTML = (ph) => `<div class="phase">${icon('calendar')}<div><b>${esc(ph.month)}: ${esc(ph.t)} <span class="pill ${pillClass(ph.k)}">${esc(ph.label)}</span></b><span>${esc(ph.n)}</span></div></div>`;

// Stylized broadside silhouettes with lungs, heart and the aim point. Not to scale between species.
const SHOT = {
  deer: { body: [160, 105, 92, 40], neck: 'M232,86 L262,38 L284,44 L262,112 Z', head: [272, 34, 20, 12], legs: [[104, 140, 96, 192], [124, 142, 120, 192], [196, 142, 192, 192], [218, 140, 226, 192]], extra: 'M268,24 L262,6 M276,24 L284,4 M262,14 L252,8', lungs: [214, 106, 26, 24], heart: [222, 122, 8], aim: [214, 112], cap: 'Deer, Coues, pronghorn: one third up, just behind the front leg crease.' },
  elk: { body: [160, 100, 105, 48], neck: 'M240,78 L270,30 L296,38 L270,118 Z', head: [284, 26, 22, 13], legs: [[90, 142, 82, 196], [118, 146, 112, 196], [200, 146, 196, 196], [228, 142, 240, 196]], extra: 'M276,16 L262,0 M284,16 L296,0 M268,8 L256,2 M290,6 L302,0', lungs: [222, 104, 30, 28], heart: [232, 124, 9], aim: [222, 110], cap: 'Elk: lungs sit low and forward. Aim 4 to 6 in behind the crease, one third up.' },
  bison: { body: [150, 108, 110, 50], neck: 'M230,70 L240,60 L270,80 L262,130 L222,120 Z', head: [272, 96, 26, 20], legs: [[80, 150, 76, 196], [110, 154, 108, 196], [190, 154, 188, 196], [222, 150, 230, 196]], extra: 'M150,58 Q190,20 236,62', lungs: [214, 112, 30, 28], heart: [224, 134, 9], aim: [214, 118], cap: 'Bison: ignore the hump. Aim in line with the back of the front leg, one third up from the chest line.' },
  pig: { body: [160, 112, 78, 38], neck: 'M226,96 L256,92 L264,116 L236,130 Z', head: [260, 106, 18, 14], legs: [[110, 146, 106, 190], [130, 148, 128, 190], [188, 148, 186, 190], [206, 146, 212, 190]], extra: 'M276,106 L288,108', lungs: [214, 112, 18, 18], heart: [220, 126, 6], aim: [214, 116], cap: 'Javelina: small vitals set forward and low. Just behind the shoulder, lower third.' },
  bear: { body: [160, 110, 100, 50], neck: 'M238,86 L262,70 L284,80 L270,120 L236,124 Z', head: [280, 84, 20, 15], legs: [[92, 150, 86, 194], [124, 154, 124, 194], [196, 154, 196, 194], [226, 150, 236, 194]], extra: '', lungs: [214, 110, 26, 26], heart: [226, 130, 9], aim: [210, 112], cap: 'Bear: the middle of the middle. Center of the body, slightly behind the front shoulder; fat and hair hide the vitals.' },
  cat: { body: [160, 112, 92, 34], neck: 'M236,100 L262,86 L278,92 L270,120 L238,124 Z', head: [276, 92, 16, 13], legs: [[100, 142, 94, 188], [124, 144, 124, 188], [192, 144, 190, 188], [214, 142, 220, 188]], extra: 'M70,118 Q40,140 46,172', lungs: [216, 110, 20, 20], heart: [224, 126, 7], aim: [214, 114], cap: 'Lion, bobcat, coyote: thin-skinned. Just behind the shoulder, mid-body.' },
  sheep: { body: [160, 106, 90, 40], neck: 'M232,88 L256,46 L278,52 L262,112 Z', head: [270, 44, 20, 13], legs: [[104, 140, 98, 192], [126, 142, 122, 192], [194, 142, 190, 192], [216, 140, 224, 192]], extra: 'M268,32 Q300,30 290,62 Q284,78 264,66', lungs: [214, 106, 26, 24], heart: [222, 122, 8], aim: [214, 112], cap: 'Bighorn: like a big deer, behind the shoulder, lower third. Avoid a ram standing on a cliff edge.' },
  turkey: { body: [150, 120, 70, 44], neck: 'M196,96 L222,44 L236,46 L216,110 Z', head: [232, 40, 10, 9], legs: [[136, 162, 128, 194], [168, 162, 172, 194]], extra: 'M80,118 L40,70 L48,124 L36,150 L84,136', lungs: [168, 110, 14, 12], heart: [176, 120, 5], aim: [232, 40], aim2: [168, 110], cap: 'Turkey: shotgun to the head and neck inside 40 yd. Bow: the wing butt broadside (second mark).' },
  bird: { body: [160, 110, 60, 32], neck: 'M206,96 L230,70 L242,76 L222,112 Z', head: [240, 70, 10, 8], legs: [[150, 142, 146, 170], [174, 142, 178, 170]], extra: 'M100,110 L60,96 L70,124', lungs: [176, 108, 12, 10], heart: [182, 116, 4], aim: [176, 108], cap: 'Birds: swing through, lead, and shoot at the front of the bird.' },
  small: { body: [160, 118, 60, 30], neck: 'M210,106 L232,88 L244,96 L226,120 Z', head: [242, 90, 12, 10], legs: [[150, 146, 146, 176], [176, 146, 182, 176]], extra: 'M244,80 L250,62 M252,82 L262,66', lungs: [178, 114, 12, 10], heart: [184, 122, 4], aim: [242, 90], aim2: [178, 114], cap: 'Rabbit, squirrel: head shot with a rimfire (first mark) saves meat; shotgun at the body.' }
};
export function shotSVG(kind) {
  const s = SHOT[kind]; if (!s) return '';
  const [bx, by, brx, bry] = s.body; const [hx, hy, hrx, hry] = s.head;
  const legs = s.legs.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8a8f85" stroke-width="12" stroke-linecap="round"/>`).join('');
  const cross = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#fff" stroke-width="2"/><line x1="${x - 14}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="#fff" stroke-width="2"/><line x1="${x}" y1="${y - 14}" x2="${x}" y2="${y + 14}" stroke="#fff" stroke-width="2"/>`;
  return `<div class="shot"><svg viewBox="0 -10 320 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Shot placement">
    ${legs}<ellipse cx="${bx}" cy="${by}" rx="${brx}" ry="${bry}" fill="#8a8f85"/><path d="${s.neck}" fill="#8a8f85"/><ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" fill="#8a8f85"/>
    ${s.extra ? `<path d="${s.extra}" fill="none" stroke="#8a8f85" stroke-width="5" stroke-linecap="round"/>` : ''}
    <ellipse cx="${s.lungs[0]}" cy="${s.lungs[1]}" rx="${s.lungs[2]}" ry="${s.lungs[3]}" fill="#f28b82" opacity="0.85"/><circle cx="${s.heart[0]}" cy="${s.heart[1]}" r="${s.heart[2]}" fill="#c62828"/>
    ${cross(s.aim[0], s.aim[1])}${s.aim2 ? cross(s.aim2[0], s.aim2[1]) : ''}</svg><p class="small muted" style="margin:6px 0 0">${esc(s.cap)} Pink: lungs. Red: heart. Crosshair: aim point.</p></div>`;
}

const list = (items) => `<ul>${(items || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
const kvs = (pairs) => (pairs || []).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
const section = (title, body, open = false) => `<details class="gs"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="gs-body">${body}</div></details>`;

// Compact block for the Hunt panel: this month's phase, the year strip and a button to the full guide.
export function guideBlock(app) {
  const id = app.settings.species; const ph = phaseNow(id); const g = ALL[id];
  if (!g || !ph) return h('<div></div>');
  const el = h(`<div><h3>${esc(g.name)} this month</h3>
    ${phaseHTML(ph)}
    <div style="margin-top:8px">${calendarStrip(id)}</div>
    <div class="row wrap gap" style="margin-top:8px"><button class="btn btn-sm btn-primary" data-guide>${icon('book')} Species guide</button><button class="btn btn-sm" data-hab>${icon('layers')} Habitat finder ${app.layers.isOn('habitat') ? 'off' : 'on'}</button><button class="btn btn-sm" data-ins>${icon('eye')} My sightings</button></div></div>`);
  qs('[data-guide]', el).addEventListener('click', () => app.openPanel('guide', id));
  qs('[data-hab]', el).addEventListener('click', () => { app.layers.toggle('habitat'); app.openPanel('hunt'); if (app.layers.isOn('habitat')) app.ui.toast('Green = elevation, aspect and slope all match; yellow = two of three'); });
  qs('[data-ins]', el).addEventListener('click', () => app.openPanel('insights'));
  return el;
}

// Full species guide sheet.
export function guidePanel(app, speciesId) {
  const id = ALL[speciesId] ? speciesId : (ALL[app.settings.species] ? app.settings.species : 'muledeer');
  const g = ALL[id]; const ph = phaseNow(id); const hab = habitatFor(id);
  const root = h('<div class="stack"></div>');
  root.appendChild(h(`<div class="sheet-title"><h2>Species guide</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
  const chips = h(`<div class="species">${SPECIES.filter((s) => ALL[s.id]).map((s) => `<button type="button" data-sp="${s.id}" class="${s.id === id ? 'on' : ''}">${esc(s.label)}</button>`).join('')}</div>`);
  qsa('button', chips).forEach((b) => b.addEventListener('click', () => app.openPanel('guide', b.dataset.sp)));
  root.appendChild(chips);
  root.appendChild(h(`<div><h2 style="margin:4px 0 0">${esc(g.name)}</h2><p class="small muted" style="margin:0 0 6px"><i>${esc(g.latin || '')}</i></p><p>${esc(g.blurb)}</p></div>`));
  if (ph) root.appendChild(h(phaseHTML(ph)));
  root.appendChild(h(`<div>${calendarStrip(id)}</div>`));
  const acts = h(`<div class="row wrap gap"><button class="btn btn-sm btn-primary" data-use>${icon('layers')} Turn on ${esc(g.name.split(' (')[0])} layers</button>${hab ? `<button class="btn btn-sm" data-hab>${icon('map')} Habitat finder</button>` : ''}<button class="btn btn-sm" data-hunt>${icon('sun')} Hunt panel</button></div>`);
  qs('[data-use]', acts).addEventListener('click', () => { app.setSpecies(id); app.ui.hideSheet(); });
  const hb = qs('[data-hab]', acts); if (hb) hb.addEventListener('click', () => { if (app.settings.species !== id) app.setSpecies(id); if (!app.layers.isOn('habitat')) app.layers.enable('habitat'); app.ui.hideSheet(); app.ui.toast(hab.label, 5000); });
  qs('[data-hunt]', acts).addEventListener('click', () => { if (app.settings.species !== id) app.setSpecies(id); app.openPanel('hunt'); });
  root.appendChild(acts);
  const cal = g.cal.map(([k, t, n], i) => `<div class="kv"><span>${MONTH_NAMES[i].slice(0, 3)} <span class="pill ${pillClass(k)}">${esc(PHASE_LABEL[k])}</span></span><b>${esc(t)}<br><span class="muted small" style="font-weight:500">${esc(n)}</span></b></div>`).join('');
  const where = `<p>${esc(g.where)}</p>${g.elev ? `<p class="small muted">Elevation ${g.elev[0].toLocaleString()} to ${g.elev[1].toLocaleString()} ft.${hab ? ` Habitat finder this month: ${esc(hab.label.replace(`${g.name}: `, ''))}.` : ''}</p>` : ''}${list(g.habitats)}`;
  const sections = [
    ['Where they live', where, true], ['Month by month', cal], ['Daily pattern', list(g.daily)], ['Food & water', `${list(g.food)}${g.water ? `<p><b>Water:</b> ${esc(g.water)}</p>` : ''}`],
    ['Sign & tracks', kvs(g.sign)], ['Tactics', list(g.tactics)], ['Calling & decoys', list(g.calling)], ['Field judging', list(g.judging)],
    ['Shot placement', `${shotSVG(g.shot)}${list(g.shotNotes)}`], ['After the shot', list(g.after)], ['Arizona rules & draw', `${list(g.rules)}<p class="small muted">Typical dates; the current AZGFD regulations and your tag control.</p>`],
    ['Well-known units', `${list(g.units)}<p class="small muted">Reputation, not a promise: pressure, access and the current year\u2019s rain matter more.</p>`]
  ];
  const wrap = h('<div></div>');
  for (const [t, b, open] of sections) if (b && b !== '<ul></ul>') wrap.appendChild(h(section(t, b, open)));
  root.appendChild(wrap);
  root.appendChild(h('<h3>Every Arizona hunt</h3>'));
  const common = h('<div></div>');
  common.appendChild(h(section('Draw calendar & tags', kvs(COMMON.draw))));
  common.appendChild(h(section('Licenses, stamps & permits', list(COMMON.licenses))));
  common.appendChild(h(section('Bonus points', list(COMMON.points))));
  common.appendChild(h(section('Tagging, reporting & shooting hours', list(COMMON.field))));
  common.appendChild(h(section('Meat care in Arizona heat', list(COMMON.meat))));
  common.appendChild(h(section('Track quick reference', kvs(COMMON.tracks))));
  root.appendChild(common);
  return root;
}
