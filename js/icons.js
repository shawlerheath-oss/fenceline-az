// Inline SVG icon set for UI chrome and markers. All icons are 24x24 stroke icons unless noted.
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const I = {
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v8h14v-8"/>',
  download: '<path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 20h14"/>',
  upload: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 20h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7a2 2 0 1 1-2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  area: '<path d="M4 6l6-2 10 4-4 12-12-3z"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 17c5 0 3-10 8-10"/>',
  record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  offline: '<path d="M4 16a4 4 0 0 1 1-7.9A6 6 0 0 1 16.5 7 4.5 4.5 0 0 1 18 16"/><path d="M12 12v8M9 17l3 3 3-3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.5"/>',
  camera: '<path d="M4 8h4l2-3h4l2 3h4v11H4z"/><circle cx="12" cy="13.5" r="3"/>',
  arrow: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M12 5l3 7-3 7-3-7z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-2"/>',
  night: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M4 4l2 2M3 10h2"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-9 8"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  truck: '<path d="M3 7h10v6h4l3 3v2H3z"/><circle cx="7" cy="18.5" r="2"/><circle cx="17" cy="18.5" r="2"/>'
};
export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" ${S} aria-hidden="true">${I[name] || I.info}</svg>`;
}

// Marker glyphs drawn in white on a colored disc. var(--c) is the disc color.
const W = 'fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const GLYPHS = {
  stand: '<path d="M12 3 6 11h4v9h4v-9h4z" fill="#fff"/>',
  cam: `<g ${W}><path d="M4 8h4l2-3h4l2 3h4v11H4z"/><circle cx="12" cy="13.5" r="3"/></g>`,
  glass: `<g ${W}><circle cx="8" cy="14" r="4"/><circle cx="16" cy="14" r="4"/><path d="M8 10V5h3v4M16 10V5h-3v4"/></g>`,
  truck: '<path d="M3 7h10v6h4l3 3v2H3z" fill="#fff"/><circle cx="7" cy="18.5" r="2" fill="#fff"/><circle cx="17" cy="18.5" r="2" fill="#fff"/>',
  camp: '<path d="M12 4 3 20h18z" fill="#fff"/><path d="M12 9 8.5 20h7z" fill="var(--c)"/>',
  drop: '<path d="M12 3c-3.2 4.2-6 7.3-6 10.3a6 6 0 0 0 12 0C18 10.3 15.2 7.2 12 3z" fill="#fff"/>',
  gate: `<g ${W}><path d="M4 6v12M20 6v12M4 9h16M4 15h16M4 12h16"/></g>`,
  bed: `<g ${W}><path d="M3 17V9h18v8M3 13h18"/></g><circle cx="7" cy="11" r="1.5" fill="#fff"/>`,
  sign: `<g ${W}><path d="M7 4l3 4-3 4M14 4l3 4-3 4"/><path d="M5 20l7-6 7 6"/></g>`,
  roost: `<g ${W}><path d="M12 3v18M12 8c-3 0-5 2-5 4M12 8c3 0 5 2 5 4M12 13c-3 0-5 2-5 4M12 13c3 0 5 2 5 4"/></g>`,
  wallow: `<g ${W}><path d="M4 15c2-2 4-2 6 0s4 2 6 0 3-1 4 0"/><path d="M4 11c2-2 4-2 6 0s4 2 6 0 3-1 4 0"/></g>`,
  eye: `<g ${W}><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/></g><circle cx="12" cy="12" r="3" fill="#fff"/>`,
  flag: '<path d="M6 3v18" stroke="#fff" stroke-width="2"/><path d="M6 4h11l-2.5 4 2.5 4H6z" fill="#fff"/>',
  blood: '<path d="M12 3c-3.2 4.2-6 7.3-6 10.3a6 6 0 0 0 12 0C18 10.3 15.2 7.2 12 3z" fill="#fff"/><path d="M12 10v6" stroke="var(--c)" stroke-width="2"/>',
  shed: `<g ${W}><path d="M6 20V8l3 3 3-8 3 8 3-3v12"/></g>`,
  warn: `<g ${W}><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/></g>`,
  pin: '<circle cx="12" cy="12" r="4" fill="#fff"/>',
  arrow: `<g ${W}><path d="M12 4v16M6 14l6 6 6-6"/></g>`,
  mineral: '<path d="M12 3l7 7-7 11-7-11z" fill="#fff"/>',
  feed: '<path d="M6 4h12l-2 9H8z" fill="#fff"/><path d="M12 13v7" stroke="#fff" stroke-width="2"/>',
  track: '<ellipse cx="9" cy="14" rx="2.5" ry="4" fill="#fff"/><ellipse cx="15" cy="14" rx="2.5" ry="4" fill="#fff"/><circle cx="8" cy="7" r="1.5" fill="#fff"/><circle cx="12" cy="6" r="1.5" fill="#fff"/><circle cx="16" cy="7" r="1.5" fill="#fff"/>',
  photo: `<g ${W}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M21 16l-5-5-9 8"/></g><circle cx="8.5" cy="10" r="1.5" fill="#fff"/>`
};
export function markerSVG(glyph) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[glyph] || GLYPHS.pin}</svg>`;
}
