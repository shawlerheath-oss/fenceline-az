// Data layer registry and manager. Raster overlays, one-shot static layers, and bbox-driven ArcGIS layers.
import { SERVICES, COUNTY_PARCELS, TILES, FONT } from './config.js';
import { queryFeatures } from './arcgis.js';
import { pickValue } from './arcgis.js';
import { store } from './store.js';
import { bboxExpand, bboxContains, bboxIntersects, bboxOfGeom, centroid, debounce } from './util.js';

export const GROUPS = ['Land & Access', 'Hunt Units', 'Water', 'Roads & Trails', 'Terrain', 'Fire & Habitat', 'Hunt Tools'];

const S = SERVICES;
const name = (fields) => ['coalesce', ...fields.map((f) => ['get', f]), ''];

export const LAYER_DEFS = {
  sma: { kind: 'raster', group: 'Land & Access', label: 'Land ownership', desc: 'BLM yellow, Forest Service green, State Trust blue, tribal tan, private white. Tap for manager, owner, and public access.',
    tiles: S.sma.tiles, maxzoom: 15, opacity: 0.5, default: true,
    legend: [['#fdf1a0', 'BLM'], ['#9fd49f', 'Forest Service'], ['#a8c8ff', 'State Trust'], ['#e9c4a0', 'Tribal'], ['#d8b4f0', 'Park Service'], ['#f6c89f', 'Fish & Wildlife'], ['#ffffff', 'Private']] },
  stateTrust: { kind: 'bbox', group: 'Land & Access', label: 'State Trust parcels', desc: 'ASLD surface parcels with lessee and legal description. Hunting license covers access while hunting.', minzoom: 9, cap: 2500, precision: 5,
    urls: [S.stateTrust.url], outFields: 'township,townshipdirection,range,rangedirection,section,county,parcelnumber,gisacres,parceltype,classification,accountname,ownership',
    style: { color: '#4f8dff', fill: 0.08, line: 1, label: name(['accountname']), labelMinZoom: 13 } },
  parcels: { kind: 'parcels', group: 'Land & Access', label: 'Private parcels & owners', desc: 'County assessor parcels with owner, APN, address, acres. Zoom in to 13+.', minzoom: 13, cap: 4000, precision: 6,
    style: { color: '#ffd166', fill: 0.05, line: 1.2, label: ['get', 'owner'], labelMinZoom: 15 } },
  wilderness: { kind: 'bbox', group: 'Land & Access', label: 'Wilderness areas', desc: 'No motorized or mechanized travel inside. USFS and BLM.', minzoom: 7, cap: 400, precision: 5,
    urls: [S.wilderness.url, S.wilderness.blmUrl], outFields: '*',
    style: { color: '#7bd389', fill: 0.1, line: 1.5, dash: [3, 2], label: name(['wildernessname', 'NLCS_NAME']), labelMinZoom: 9 } },
  forests: { kind: 'bbox', group: 'Land & Access', label: 'National Forest boundaries', desc: 'Administrative forest boundaries.', minzoom: 6, cap: 100, precision: 4,
    urls: [S.forests.url], outFields: 'forestname,gis_acres', style: { color: '#2e8b57', fill: 0, line: 2, label: name(['forestname']), labelMinZoom: 8 } },
  wildlifeAreas: { kind: 'bbox', group: 'Land & Access', label: 'AZGFD wildlife areas', desc: 'Department-managed wildlife areas; special rules apply.', minzoom: 7, cap: 300, precision: 5,
    urls: [S.wildlifeAreas.url], outFields: '*', style: { color: '#ff9f43', fill: 0.12, line: 1.5, label: ['coalesce', ['get', 'NAME'], ['get', 'Name'], ['get', 'name'], ''], labelMinZoom: 10 } },
  allotments: { kind: 'bbox', group: 'Land & Access', label: 'Grazing allotments', desc: 'Ranch allotment names and boundaries (AZGeo 2017).', minzoom: 10, cap: 600, precision: 5,
    urls: [S.allotments.url], outFields: '*', style: { color: '#c9a86b', fill: 0, line: 1, dash: [1, 2], label: ['coalesce', ['get', 'ALLOT_NAME'], ['get', 'ALLOTMENT'], ['get', 'NAME'], ['get', 'Name'], ['get', 'allot_name'], ''], labelMinZoom: 11 } },
  gmu: { kind: 'static', group: 'Hunt Units', label: 'Game management units', desc: 'AZGFD unit boundaries with unit numbers.', default: true,
    urls: [S.gmu.url], outFields: 'GMUNAME,GF_REGION,REG_NAME,SQ_MILES,ACRES,AGFDLink,USFSLink,BLMLink,USFWSLink', precision: 4, cacheKey: 'layer:gmu', ttl: 30 * 86400000,
    style: { color: '#ff5f5f', fill: 0, line: 2.2, labelCentroid: name(['GMUNAME']), labelSize: 16 } },
  tanks: { kind: 'bbox', group: 'Water', label: 'Stock tanks & ponds', desc: 'NHD reservoirs, tanks, lakes and ponds. Dirt tanks go dry; check before you count on them.', minzoom: 10, cap: 3000, precision: 6,
    urls: [S.tanks.url], where: S.tanks.where, outFields: 'GNIS_NAME,FTYPE,FCODE,AREASQKM',
    style: { color: '#39c5ff', fill: 0.55, line: 1.5, label: name(['GNIS_NAME']), labelMinZoom: 12, pointOnSmall: true } },
  springs: { kind: 'bbox', group: 'Water', label: 'Springs & seeps', desc: 'NHD spring and seep points.', minzoom: 9, cap: 2500, precision: 6,
    urls: [S.springs.url], where: S.springs.where, outFields: 'GNIS_NAME,FTYPE,FCODE',
    style: { color: '#2bd4c1', circle: 5, label: name(['GNIS_NAME']), labelMinZoom: 12 } },
  hpcWater: { kind: 'bbox', group: 'Water', label: 'AZGFD water projects', desc: 'Habitat Partnership catchments, drinkers and tank projects.', minzoom: 8, cap: 1500, precision: 6,
    urls: [S.hpcWater.url], where: S.hpcWater.where, outFields: 'project_name,gmu_number,project_type,water_type,water_action,reliable_water,perennial_water,project_status',
    style: { color: '#4cc3ff', circle: 6, stroke: '#003a5c', label: name(['project_name']), labelMinZoom: 12 } },
  springsWells: { kind: 'bbox', group: 'Water', label: 'Springs & wells (AZGFD)', desc: 'Watershed springs and wells.', minzoom: 9, cap: 1500, precision: 6,
    urls: [S.springsWells.url], outFields: 'name,watershed,mgmtUnit', style: { color: '#7fe3ff', circle: 4, label: name(['name']), labelMinZoom: 13 } },
  hydro: { kind: 'raster', group: 'Water', label: 'Streams & washes (USGS)', desc: 'USGS hydrography overlay: streams, washes, lakes, canals.', tiles: TILES.usgsHydro, maxzoom: 16, opacity: 0.9 },
  mvum: { kind: 'bbox', group: 'Roads & Trails', label: 'MVUM roads', desc: 'Forest roads open to motor vehicles, colored by designation. Tap for open dates.', minzoom: 10, cap: 4000, precision: 6,
    urls: [S.mvum.url], outFields: 'id,name,symbol,mvum_symbol_name,seasonal,surfacetype,forestname,gis_miles,highclearancevehicle,highclearancevehicle_datesopen,passengervehicle,passengervehicle_datesopen,atv,motorcycle',
    style: { lineColor: ['case', ['in', 'Highway Legal', ['coalesce', ['get', 'mvum_symbol_name'], '']], '#58d68d', ['in', 'High Clearance', ['coalesce', ['get', 'mvum_symbol_name'], '']], '#f5a623', ['in', 'Special', ['coalesce', ['get', 'mvum_symbol_name'], '']], '#c77dff', '#d0d0d0'],
      line: 2, lineLabel: ['coalesce', ['get', 'id'], ''], labelMinZoom: 12 },
    legend: [['#58d68d', 'Highway legal vehicles'], ['#f5a623', 'High clearance'], ['#c77dff', 'Special designation'], ['#d0d0d0', 'Other']] },
  mvumTrails: { kind: 'bbox', group: 'Roads & Trails', label: 'MVUM motorized trails', desc: 'OHV and motorcycle trails from the Motor Vehicle Use Map.', minzoom: 10, cap: 3000, precision: 6,
    urls: [S.mvum.trailsUrl], outFields: 'id,name,mvum_symbol_name,seasonal,gis_miles,atv,motorcycle,fourwd_gt50inches',
    style: { color: '#ff8c42', line: 1.6, dash: [2, 1.5], lineLabel: ['coalesce', ['get', 'id'], ''], labelMinZoom: 13 } },
  trails: { kind: 'bbox', group: 'Roads & Trails', label: 'Hiking trails (USFS)', desc: 'National Forest trail system.', minzoom: 10, cap: 3000, precision: 6,
    urls: [S.trails.url], outFields: 'trail_name,trail_no,trail_type,trail_class,allowed_terra_use,terra_motorized,gis_miles',
    style: { color: '#f6e58d', line: 1.4, dash: [3, 2], lineLabel: name(['trail_name']), labelMinZoom: 12 } },
  blmRec: { kind: 'bbox', group: 'Roads & Trails', label: 'BLM recreation sites', desc: 'Campgrounds, trailheads and sites on BLM Arizona.', minzoom: 8, cap: 800, precision: 6,
    urls: [S.blmRec.url], outFields: '*', style: { color: '#b8e994', circle: 5, label: ['coalesce', ['get', 'FET_NAME'], ['get', 'NAME'], ['get', 'Name'], ['get', 'SITE_NAME'], ''], labelMinZoom: 11 } },
  hillshade: { kind: 'hillshade', group: 'Terrain', label: 'Hillshade', desc: 'Shaded terrain under every basemap.', default: true },
  slope: { kind: 'raster', group: 'Terrain', label: 'Slope angle', desc: 'Yellow 15–25°, orange 25–30°, red 30–35°, purple 35–45°, dark 45°+. Computed on the phone.', tiles: 'slope://{z}/{x}/{y}', maxzoom: 14, minzoom: 8, opacity: 0.75,
    legend: [['#ffe600', '15–25°'], ['#ff9600', '25–30°'], ['#eb3232', '30–35°'], ['#9628be', '35–45°'], ['#3c145a', '45°+']] },
  aspect: { kind: 'raster', group: 'Terrain', label: 'Aspect (face direction)', desc: 'Blue north, green east, orange south, purple west. North faces hold shade and bedding.', tiles: 'aspect://{z}/{x}/{y}', maxzoom: 14, minzoom: 8, opacity: 0.6,
    legend: [['#286eff', 'North'], ['#28c878', 'East'], ['#ff961e', 'South'], ['#aa3cdc', 'West']] },
  fires: { kind: 'bbox', group: 'Fire & Habitat', label: 'Burn history (2005+)', desc: 'Wildfire perimeters colored by year; 3–10 year old burns are feed.', minzoom: 7, cap: 1200, precision: 4,
    urls: [S.fires.url], where: S.fires.where, outFields: 'INCIDENT,FIRE_YEAR_INT,FIRE_YEAR,GIS_ACRES',
    style: { fillColor: ['interpolate', ['linear'], ['coalesce', ['get', 'FIRE_YEAR_INT'], ['to-number', ['get', 'FIRE_YEAR'], 2005]], 2005, '#ffe0b2', 2015, '#ff8a50', 2026, '#d32f2f'], fill: 0.3, color: '#ff7043', line: 0.8,
      label: ['concat', name(['INCIDENT']), ' ', ['to-string', ['coalesce', ['get', 'FIRE_YEAR_INT'], ['get', 'FIRE_YEAR'], '']]], labelMinZoom: 10 },
    legend: [['#ffe0b2', '2005'], ['#ff8a50', '2015'], ['#d32f2f', '2026']] },
  firesCurrent: { kind: 'bbox', group: 'Fire & Habitat', label: 'Fires this year', desc: 'WFIGS year-to-date perimeters.', minzoom: 6, cap: 400, precision: 4,
    urls: [S.fires.currentUrl], outFields: 'poly_IncidentName,poly_GISAcres,poly_DateCurrent,attr_PercentContained',
    style: { color: '#ff1744', fill: 0.25, line: 2, label: name(['poly_IncidentName']), labelMinZoom: 8 } },
  scent: { kind: 'virtual', group: 'Hunt Tools', label: 'Scent cones at stands', desc: 'Shows where your scent travels from each stand with the current wind.', default: true },
  tracks: { kind: 'virtual', group: 'Hunt Tools', label: 'Recorded tracks', desc: 'Your recorded hikes.', default: true }
};

const PARCEL_NORMALIZE = (county) => (f) => {
  const p = f.properties || {};
  return { ...f, properties: {
    owner: pickValue(p, county.ownerFields) ?? '', apn: pickValue(p, county.apnFields) ?? '', addr: pickValue(p, county.addrFields) ?? '',
    city: pickValue(p, county.cityFields) ?? '', acres: pickValue(p, county.acresFields) ?? null, county: county.name, __raw: JSON.stringify(p).slice(0, 4000)
  } };
};

function featureKey(f, i) {
  const p = f.properties || {};
  return f.id ?? p.OBJECTID ?? p.objectid ?? p.FID ?? p.apn ?? p.PARCEL ?? `${i}:${JSON.stringify(f.geometry && f.geometry.coordinates).slice(0, 40)}`;
}

export class LayerManager {
  constructor(map, { onChange, onStatus } = {}) {
    this.map = map; this.on = new Set(); this.features = new Map(); this.covered = new Map(); this.pending = new Map();
    this.status = new Map(); this.offlineProvider = null;
    this.onChange = onChange || (() => {}); this.onStatus = onStatus || (() => {});
    this.refresh = debounce(() => this._refreshAll(), 400);
    map.on('moveend', () => this.refresh());
  }
  isOn(id) { return this.on.has(id); }
  listOn() { return Array.from(this.on); }
  def(id) { return LAYER_DEFS[id]; }
  setOfflineProvider(fn) { this.offlineProvider = fn; }
  getFeatures(id) { const m = this.features.get(id); return m ? Array.from(m.values()) : []; }
  getStatus(id) { return this.status.get(id) || (this.on.has(id) ? 'ok' : 'off'); }

  toggle(id) { return this.on.has(id) ? this.disable(id) : this.enable(id); }

  enable(id, { silent = false } = {}) {
    const def = LAYER_DEFS[id]; if (!def || this.on.has(id)) return;
    this.on.add(id);
    if (def.kind === 'raster') this._addRaster(id, def);
    else if (def.kind === 'hillshade') this._addHillshade(id);
    else if (def.kind !== 'virtual') { this._addGeo(id, def); this._load(id, def); }
    if (!silent) this.onChange(id, true);
  }
  disable(id, { silent = false } = {}) {
    const def = LAYER_DEFS[id]; if (!def || !this.on.has(id)) return;
    this.on.delete(id);
    const ac = this.pending.get(id); if (ac) ac.abort(); this.pending.delete(id);
    for (const l of this.map.getStyle().layers) if (l.id === id || l.id.startsWith(`${id}-`)) this.map.removeLayer(l.id);
    for (const s of Object.keys(this.map.getStyle().sources)) if (s === `src-${id}` || s === `src-${id}-lab`) this.map.removeSource(s);
    this.features.delete(id); this.covered.delete(id); this.status.delete(id);
    if (!silent) this.onChange(id, false);
  }
  setOpacity(id, v) {
    const def = LAYER_DEFS[id]; if (!def) return;
    if (def.kind === 'raster' && this.map.getLayer(id)) this.map.setPaintProperty(id, 'raster-opacity', v);
    if (def.kind === 'hillshade' && this.map.getLayer(id)) this.map.setPaintProperty(id, 'hillshade-exaggeration', v);
  }

  _addRaster(id, def) {
    this.map.addSource(`src-${id}`, { type: 'raster', tiles: [def.tiles], tileSize: 256, maxzoom: def.maxzoom || 18, minzoom: def.minzoom || 0 });
    this.map.addLayer({ id, type: 'raster', source: `src-${id}`, minzoom: def.minzoom || 0, paint: { 'raster-opacity': def.opacity ?? 0.7, 'raster-fade-duration': 100 } }, 'anchor-fill');
  }
  _addHillshade(id) {
    // Separate DEM source from the one used for 3D terrain; MapLibre renders better when they are not shared.
    if (!this.map.getSource('dem-hs')) this.map.addSource('dem-hs', { type: 'raster-dem', tiles: [TILES.terrarium], tileSize: 256, encoding: 'terrarium', maxzoom: 14 });
    this.map.addLayer({ id, type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#000000' } }, 'anchor-fill');
  }
  _addGeo(id, def) {
    const st = def.style || {}; const src = `src-${id}`; const mz = def.minzoom || 0;
    const empty = { type: 'FeatureCollection', features: [] };
    this.map.addSource(src, { type: 'geojson', data: empty, generateId: true });
    const isPoly = ['==', ['geometry-type'], 'Polygon']; const isLine = ['==', ['geometry-type'], 'LineString']; const isPt = ['==', ['geometry-type'], 'Point'];
    if ((st.fill ?? 0) > 0 || st.fillColor) {
      this.map.addLayer({ id: `${id}-fill`, type: 'fill', source: src, minzoom: mz, filter: isPoly, paint: { 'fill-color': st.fillColor || st.color, 'fill-opacity': st.fill ?? 0.1 } }, 'anchor-line');
    } else if (!st.circle) {
      // Invisible fill so polygons are tappable.
      this.map.addLayer({ id: `${id}-fill`, type: 'fill', source: src, minzoom: mz, filter: isPoly, paint: { 'fill-color': st.color || '#fff', 'fill-opacity': 0.01 } }, 'anchor-line');
    }
    if (!st.circle || st.pointOnSmall) {
      const paint = { 'line-color': st.lineColor || st.color, 'line-width': st.line ?? 1.5, 'line-opacity': 0.95 };
      if (st.dash) paint['line-dasharray'] = st.dash;
      this.map.addLayer({ id: `${id}-line`, type: 'line', source: src, minzoom: mz, filter: ['any', isPoly, isLine], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint }, 'anchor-point');
    }
    if (st.circle) {
      this.map.addLayer({ id: `${id}-pt`, type: 'circle', source: src, minzoom: mz, filter: isPt, paint: { 'circle-radius': st.circle, 'circle-color': st.color, 'circle-stroke-color': st.stroke || '#0b0f0a', 'circle-stroke-width': 1.5 } }, 'anchor-label');
    }
    if (st.label) {
      this.map.addLayer({ id: `${id}-label`, type: 'symbol', source: src, minzoom: Math.max(mz, st.labelMinZoom || 0), filter: ['any', isPt, isPoly],
        layout: { 'text-field': st.label, 'text-font': FONT, 'text-size': st.labelSize || 11, 'text-offset': st.circle ? [0, 1.1] : [0, 0], 'text-anchor': st.circle ? 'top' : 'center', 'text-max-width': 9, 'text-optional': true },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.4 } });
    }
    if (st.lineLabel) {
      this.map.addLayer({ id: `${id}-llabel`, type: 'symbol', source: src, minzoom: Math.max(mz, st.labelMinZoom || 0), filter: isLine,
        layout: { 'symbol-placement': 'line', 'text-field': st.lineLabel, 'text-font': FONT, 'text-size': 10.5, 'symbol-spacing': 320, 'text-max-angle': 35 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.3 } });
    }
    if (st.labelCentroid) {
      this.map.addSource(`${src}-lab`, { type: 'geojson', data: empty });
      this.map.addLayer({ id: `${id}-clabel`, type: 'symbol', source: `${src}-lab`, layout: { 'text-field': st.labelCentroid, 'text-font': FONT, 'text-size': st.labelSize || 14, 'text-allow-overlap': false },
        paint: { 'text-color': '#ffd0d0', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.6 } });
    }
  }

  _setStatus(id, s) { this.status.set(id, s); this.onStatus(id, s); }

  _refreshAll() { for (const id of this.on) { const def = LAYER_DEFS[id]; if (def && (def.kind === 'bbox' || def.kind === 'parcels')) this._load(id, def); } }

  _viewBbox() { const b = this.map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; }

  async _load(id, def) {
    if (!this.on.has(id)) return;
    if (def.kind === 'static') return this._loadStatic(id, def);
    const z = this.map.getZoom();
    if (z < (def.minzoom || 0)) { this._setStatus(id, 'zoom'); return; }
    const view = this._viewBbox(); const bbox = bboxExpand(view, 0.3);
    const cov = this.covered.get(id);
    if (cov && bboxContains(cov, view)) { this._setStatus(id, 'ok'); return; }
    const prev = this.pending.get(id); if (prev) prev.abort();
    const ac = new AbortController(); this.pending.set(id, ac);
    this._setStatus(id, 'loading');
    try {
      let fc = null; let fromOffline = false;
      if (navigator.onLine === false && this.offlineProvider) { fc = await this.offlineProvider(id, bbox); fromOffline = true; }
      if (!fc) {
        try { fc = def.kind === 'parcels' ? await this._fetchParcels(bbox, ac.signal, def) : await this._fetchBbox(def, bbox, ac.signal); }
        catch (e) { if (ac.signal.aborted) return; if (this.offlineProvider) { fc = await this.offlineProvider(id, bbox); fromOffline = true; } if (!fc) throw e; }
      }
      if (ac.signal.aborted || !this.on.has(id)) return;
      this._merge(id, def, fc, bbox);
      this.covered.set(id, fromOffline ? view : bbox);
      this._setStatus(id, fromOffline ? 'offline' : 'ok');
    } catch (e) {
      if (!ac.signal.aborted) { console.warn(`[layer ${id}]`, e.message); this._setStatus(id, 'error'); }
    } finally { if (this.pending.get(id) === ac) this.pending.delete(id); }
  }

  async _fetchBbox(def, bbox, signal) {
    const results = await Promise.allSettled(def.urls.map((u) => queryFeatures(u, { bbox, where: def.where || '1=1', outFields: def.outFields || '*', maxPages: def.maxPages || 2, signal, precision: def.precision || 6 })));
    const feats = []; let okCount = 0;
    for (const r of results) { if (r.status === 'fulfilled') { okCount++; feats.push(...r.value.features); } }
    if (!okCount) throw results[0].reason || new Error('fetch failed');
    return { type: 'FeatureCollection', features: feats };
  }

  async _fetchParcels(bbox, signal) {
    const counties = COUNTY_PARCELS.filter((c) => bboxIntersects(c.bbox, bbox));
    const feats = []; let ok = 0; let lastErr = null;
    await Promise.all(counties.map(async (c) => {
      const urls = c.alt ? [c.alt, c.url] : [c.url];
      for (const u of urls) {
        try {
          const fc = await queryFeatures(u, { bbox, outFields: '*', maxPages: 2, signal, precision: 6 });
          feats.push(...fc.features.map(PARCEL_NORMALIZE(c))); ok++; return;
        } catch (e) { lastErr = e; if (signal.aborted) return; }
      }
    }));
    if (!ok && counties.length) throw lastErr || new Error('parcels unavailable');
    return { type: 'FeatureCollection', features: feats };
  }

  _merge(id, def, fc, bbox) {
    let m = this.features.get(id); if (!m) { m = new Map(); this.features.set(id, m); }
    fc.features.forEach((f, i) => { if (!f.geometry) return; f.bbox = f.bbox || bboxOfGeom(f.geometry); m.set(featureKey(f, i), f); });
    const cap = def.cap || 3000;
    if (m.size > cap) for (const [k, f] of m) { if (m.size <= cap) break; if (!bboxIntersects(f.bbox, bbox)) m.delete(k); }
    if (def.style && def.style.pointOnSmall) {
      // Add a point twin for tiny polygons so tanks show at low zoom.
      const z = this.map.getZoom();
      for (const f of m.values()) { if (f.geometry.type !== 'Point' && !f.__pt) f.__pt = centroid(f.geometry); }
      void z;
    }
    this._setData(id, m);
  }
  _setData(id, m) {
    const src = this.map.getSource(`src-${id}`); if (!src) return;
    const feats = Array.from(m.values());
    const def = LAYER_DEFS[id];
    if (def.style && def.style.pointOnSmall) {
      const pts = feats.filter((f) => f.__pt).map((f) => ({ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: f.__pt } }));
      src.setData({ type: 'FeatureCollection', features: feats.concat(pts) });
    } else src.setData({ type: 'FeatureCollection', features: feats });
    const lab = this.map.getSource(`src-${id}-lab`);
    if (lab) lab.setData({ type: 'FeatureCollection', features: feats.filter((f) => f.geometry.type !== 'Point').map((f) => ({ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: centroid(f.geometry) } })) });
  }

  async _loadStatic(id, def) {
    this._setStatus(id, 'loading');
    try {
      let fc = def.cacheKey ? await store.get('cache', def.cacheKey) : null;
      if (fc && def.ttl && Date.now() - (fc.fetchedAt || 0) > def.ttl && navigator.onLine !== false) fc = null;
      if (!fc) {
        fc = await this._fetchBbox(def, null, new AbortController().signal);
        fc.fetchedAt = Date.now();
        if (def.cacheKey) await store.put('cache', def.cacheKey, fc);
      }
      if (!this.on.has(id)) return;
      this._merge(id, def, fc, [-180, -90, 180, 90]);
      this._setStatus(id, 'ok');
    } catch (e) { console.warn(`[layer ${id}]`, e.message); this._setStatus(id, 'error'); }
  }

  // Features under a screen point from every enabled GeoJSON layer.
  identify(point) {
    const ids = []; for (const l of this.map.getStyle().layers) { const base = l.id.split('-')[0]; if (this.on.has(base) && l.source === `src-${base}` && l.type !== 'symbol') ids.push(l.id); }
    if (!ids.length) return [];
    const hits = this.map.queryRenderedFeatures(point, { layers: ids });
    const seen = new Set(); const out = [];
    for (const f of hits) { const base = f.layer.id.split('-')[0]; const key = `${base}:${f.id}`; if (seen.has(key)) continue; seen.add(key); out.push({ id: base, def: LAYER_DEFS[base], feature: f }); }
    return out;
  }

  applyPreset(ids) { for (const id of ids) this.enable(id); }
  restore(ids) { for (const id of ids) if (LAYER_DEFS[id]) this.enable(id, { silent: true }); }
}
