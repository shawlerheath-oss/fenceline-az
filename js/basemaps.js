// Basemap definitions and switching. Every basemap is one or more raster tile layers inserted below 'anchor-raster'.
import { TILES } from './config.js';

export const BASEMAPS = {
  sat: { label: 'Satellite', layers: [{ id: 'bm-sat', tiles: TILES.esriImagery, maxzoom: 19 }] },
  hybrid: { label: 'Hybrid', layers: [{ id: 'bm-sat', tiles: TILES.esriImagery, maxzoom: 19 }, { id: 'bm-labels', tiles: TILES.esriLabels, maxzoom: 19 }] },
  topo: { label: 'USGS Topo', layers: [{ id: 'bm-topo', tiles: TILES.usgsTopo, maxzoom: 16 }] },
  esritopo: { label: 'Esri Topo', layers: [{ id: 'bm-etopo', tiles: TILES.esriTopo, maxzoom: 19 }] },
  relief: { label: 'Shaded relief', layers: [{ id: 'bm-relief', tiles: TILES.usgsShadedRelief, maxzoom: 16 }, { id: 'bm-labels', tiles: TILES.esriLabels, maxzoom: 19 }] },
  usgssat: { label: 'USGS Imagery', layers: [{ id: 'bm-usgs', tiles: TILES.usgsImageryOnly, maxzoom: 16 }] }
};
export const BASEMAP_ORDER = ['sat', 'hybrid', 'topo', 'esritopo', 'relief', 'usgssat'];

export function applyBasemap(map, key) {
  const def = BASEMAPS[key] || BASEMAPS.sat;
  // Remove any existing basemap layers/sources.
  for (const l of map.getStyle().layers) if (l.id.startsWith('bm-')) map.removeLayer(l.id);
  for (const s of Object.keys(map.getStyle().sources)) if (s.startsWith('bm-')) map.removeSource(s);
  for (const L of def.layers) {
    const src = `${L.id}-src`;
    map.addSource(src, { type: 'raster', tiles: [L.tiles], tileSize: 256, maxzoom: L.maxzoom, attribution: '' });
    map.addLayer({ id: L.id, type: 'raster', source: src, paint: { 'raster-fade-duration': 150 } }, 'anchor-raster');
  }
  map.__basemap = key;
  return def;
}

export function nextBasemap(current) {
  const i = BASEMAP_ORDER.indexOf(current);
  return BASEMAP_ORDER[(i + 1) % BASEMAP_ORDER.length];
}
