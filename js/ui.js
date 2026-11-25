// UI chrome: sheet, card, banner, toast, toolbar, modal, tabs, chips.
import { h, esc, qs, qsa } from './util.js';
import { icon } from './icons.js';

export class UI {
  constructor(app) {
    this.app = app;
    const $ = (id) => document.getElementById(id);
    this.el = { topbar: $('topbar'), chipSearch: $('chip-search'), chipUnit: $('chip-unit'), chipWeather: $('chip-weather'), rail: $('rail'), status: $('status-left'),
      banner: $('banner'), toolbar: $('toolbar'), card: $('card'), toast: $('toast'), sheet: $('sheet'), handle: $('sheet-handle'), sheetBody: $('sheet-body'), tabbar: $('tabbar'), modal: $('modal') };
    this.toastTimer = null; this.sheetTab = null;
    qsa('.tab', this.el.tabbar).forEach((b) => b.addEventListener('click', () => app.onTab(b.dataset.tab)));
    this._bindHandle();
  }
  _bindHandle() {
    const hd = this.el.handle; let y0 = null;
    hd.addEventListener('click', () => this.el.sheet.classList.toggle('full'));
    hd.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    hd.addEventListener('touchmove', (e) => {
      if (y0 == null) return; const dy = e.touches[0].clientY - y0;
      if (dy > 70) { y0 = null; if (this.el.sheet.classList.contains('full')) this.el.sheet.classList.remove('full'); else this.hideSheet(); }
      else if (dy < -70) { y0 = null; this.el.sheet.classList.add('full'); }
    }, { passive: true });
    hd.addEventListener('touchend', () => { y0 = null; });
  }

  toast(msg, ms = 2600) {
    const t = this.el.toast; t.textContent = msg; t.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  banner(html, level = 'info') {
    const b = this.el.banner;
    if (!html) { b.hidden = true; b.innerHTML = ''; return; }
    b.className = `banner ${level}`; b.innerHTML = html; b.hidden = false;
  }
  setToolbar(html) {
    const t = this.el.toolbar;
    if (!html) { t.hidden = true; t.innerHTML = ''; return null; }
    t.innerHTML = html; t.hidden = false; return t;
  }
  showCard(html) { const c = this.el.card; c.innerHTML = html; c.hidden = false; return c; }
  hideCard() { this.el.card.hidden = true; this.el.card.innerHTML = ''; if (this.app.onCardClose) this.app.onCardClose(); }

  showSheet(content, { tab = null, full = false, title = null } = {}) {
    const body = this.el.sheetBody; body.innerHTML = '';
    if (title) body.appendChild(h(`<div class="sheet-title"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('close')}</button></div>`));
    if (typeof content === 'string') body.insertAdjacentHTML('beforeend', content); else body.appendChild(content);
    body.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.hideSheet()));
    this.el.sheet.hidden = false; this.el.sheet.classList.toggle('full', !!full);
    this.hideCard();
    this.sheetTab = tab; this.setTab(tab || null);
    body.scrollTop = 0;
  }
  hideSheet() { this.el.sheet.hidden = true; this.el.sheetBody.innerHTML = ''; this.sheetTab = null; this.setTab('map'); if (this.app.onSheetClose) this.app.onSheetClose(); }
  get sheetOpen() { return !this.el.sheet.hidden; }
  setTab(name) { qsa('.tab', this.el.tabbar).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === (name || 'map')))); }
  setChip(which, html, cls = '') { const el = which === 'unit' ? this.el.chipUnit : this.el.chipWeather; el.innerHTML = html; el.className = `chip ${cls}`; }
  setStatus(pills) { this.el.status.innerHTML = pills.filter(Boolean).map((p) => `<div class="pill ${p.cls || ''}">${p.html}</div>`).join(''); }

  modal({ title, body, actions = [], onClose } = {}) {
    const m = this.el.modal; m.innerHTML = '';
    const box = h(`<div class="modal-box">${title ? `<h2>${esc(title)}</h2>` : ''}<div class="modal-body"></div><div class="modal-actions"></div></div>`);
    const mb = qs('.modal-body', box); if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
    const ma = qs('.modal-actions', box);
    const close = () => { m.hidden = true; m.innerHTML = ''; if (onClose) onClose(); };
    for (const a of actions) {
      const b = h(`<button class="btn ${a.cls || ''}" type="button">${esc(a.label)}</button>`);
      b.addEventListener('click', async () => { const r = a.onClick ? await a.onClick(box) : undefined; if (r !== false) close(); });
      ma.appendChild(b);
    }
    if (!actions.length) ma.remove();
    m.appendChild(box); m.hidden = false;
    m.onclick = (e) => { if (e.target === m) close(); };
    return { close, box };
  }
  confirm(msg, { ok = 'OK', danger = false } = {}) {
    return new Promise((res) => this.modal({ body: `<p>${esc(msg)}</p>`, actions: [{ label: 'Cancel', onClick: () => res(false) }, { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => res(true) }], onClose: () => res(false) }));
  }
  prompt(label, value = '', { ok = 'Save' } = {}) {
    return new Promise((res) => {
      const body = h(`<label class="field">${esc(label)}<input type="text" value="${esc(value)}"></label>`);
      let done = false;
      this.modal({ body, actions: [{ label: 'Cancel', onClick: () => { done = true; res(null); } }, { label: ok, cls: 'btn-primary', onClick: () => { done = true; res(qs('input', body).value.trim()); } }], onClose: () => { if (!done) res(null); } });
      setTimeout(() => qs('input', body).focus(), 50);
    });
  }
}
