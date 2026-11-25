// Data layer registry and manager. Raster overlays (static, dated or live), one-shot static layers, and bbox-driven ArcGIS layers.
import { SERVICES, COUNTY_PARCELS, TILES, FONT, GIBS, AZ_BBOX } from './config.js';
import { queryFeatures, pickValue } from './arcgis.js';
import { store } from './store.js';
import { bboxExpand, bboxContains, bboxIntersects, bboxOfGeom, centroid, debounce } from './util.js';
import { resolveGibs, resolveHls, resolveRadar, dailyStamp } from './imagery.js';
import { habitatSource } from './habitat.js';

export const GROUPS = ['Land & Access', 'Hunt Units', 'Water', 'Roads & Trails', 'Terrain', 'Conditions', 'Imagery', 'Fire & Habitat', 'Wildlife', 'Hunt Tools'];

const S = SERVICES;
const DAY = 86400000;
const name = (fields) => ['coalesce', ...fields.map((f) => ['get', f]), ''];
const tagsOf = (list) => list.map(([, fl_species, fl_season]) => ({ fl_species, fl_season }));
const urlsOf = (list) => list.map((e) => e[0]);
export const SPECIES_COLORS = [['#ffb74d', 'Mule deer'], ['#ba68c8', 'Elk'], ['#4db6ac', 'Pronghorn']];
const SPECIES_COLOR = ['match', ['get', 'fl_species'], 'Mule deer', '#ffb74d', 'Elk', '#ba68c8', 'Pronghorn', '#4db6ac', '#90a4ae'];
const USE_OPACITY = ['match', ['coalesce', ['get', 'GRIDCODE'], 0], 20, 0.55, 10, 0.35, 0.16];

export const LAYER_DEFS = {
  // ---------- Land & Access ----------
  sma: { kind: 'raster', group: 'Land & Access', label: 'Land ownership', desc: 'BLM yellow, Forest Service green, State Trust blue, tribal tan, private white. Tap for manager, owner, and public access.',
    tiles: S.sma.tiles, maxzoom: 15, opacity: 0.5, default: true,
    legend: [['#fdf1a0', 'BLM'], ['#9fd49f', 'Forest Service'], ['#a8c8ff', 'State Trust'], ['#e9c4a0', 'Tribal'], ['#d8b4f0', 'Park Service'], ['#f6c89f', 'Fish & Wildlife'], ['#ffffff', 'Private']] },
  stateTrust: { kind: 'bbox', group: 'Land & Access', label: 'State Trust parcels', desc: 'ASLD surface parcels with lessee and legal description. Hunting license covers access while hunting.', minzoom: 9, cap: 2500, precision: 5,
    urls: [S.stateTrust.url], outFields: 'township,townshipdirection,range,rangedirection,section,county,parcelnumber,gisacres,parceltype,classification,accountname,ownership',
    style: { color: '#4f8dff', fill: 0.08, line: 1, label: name(['accountname']), labelMinZoom: 13 } },
  parcels: { kind: 'parcels', group: 'Land & Access', label: 'Private parcels & owners', desc: 'County assessor parcels with owner, APN, address, acres. Zoom in to 13+.', minzoom: 13, cap: 4000, precision: 6,
    style: { color: '#ffd166', fill: 0.05, line: 1.2, label: ['get', 'owner'], labelMinZoom: 15 } },
  plss: { kind: 'bbox', group: 'Land & Access', label: 'Townships & ranges (PLSS)', desc: 'Public Land Survey grid with township and range labels like 14N 4E. Legal descriptions, leases and ranch directions use these.', minzoom: 8, cap: 400, precision: 4,
    urls: [S.plss.townships], outFields: 'PLSSID,TWNSHPLAB,TWNSHPNO,TWNSHPDIR,RANGENO,RANGEDIR,PRINMER,SRVNAME',
    style: { color: '#e0c36b', fill: 0, line: 1.6, label: name(['TWNSHPLAB']), labelMinZoom: 9, labelSize: 12 } },
  sections: { kind: 'bbox', group: 'Land & Access', label: 'Sections (PLSS)', desc: 'One-square-mile sections numbered 1 to 36 inside each township. Tap one for township, range and section.', minzoom: 11, cap: 1500, precision: 5,
    urls: [S.plss.sections], outFields: 'PLSSID,FRSTDIVNO,FRSTDIVLAB,FRSTDIVTXT,SURVTYPTXT',
    style: { color: '#e0c36b', fill: 0, line: 0.8, dash: [2, 2], label: name(['FRSTDIVNO']), labelMinZoom: 12, labelSize: 11 } },
  wilderness: { kind: 'bbox', group: 'Land & Access', label: 'Wilderness areas', desc: 'No motorized or mechanized travel inside. USFS and BLM.', minzoom: 7, cap: 400, precision: 5,
    urls: [S.wilderness.url, S.wilderness.blmUrl], outFields: '*',
    style: { color: '#7bd389', fill: 0.1, line: 1.5, dash: [3, 2], label: name(['wildernessname', 'NLCS_NAME']), labelMinZoom: 9 } },
  roadless: { kind: 'bbox', group: 'Land & Access', label: 'Roadless areas (USFS)', desc: 'Inventoried Roadless Areas: no new roads, so the farthest country from traffic. Mature bulls and bucks hole up here.', minzoom: 7, cap: 300, precision: 4,
    urls: [S.roadless.url], outFields: 'name,forest,category,acres', style: { color: '#9ccc65', fill: 0.08, line: 1.2, dash: [4, 2], label: name(['name']), labelMinZoom: 10 } },
  forests: { kind: 'bbox', group: 'Land & Access', label: 'National Forest boundaries', desc: 'Administrative forest boundaries.', minzoom: 6, cap: 100, precision: 4,
    urls: [S.forests.url], outFields: 'forestname,gis_acres', style: { color: '#2e8b57', fill: 0, line: 2, label: name(['forestname']), labelMinZoom: 8 } },
  wildlifeAreas: { kind: 'bbox', group: 'Land & Access', label: 'AZGFD wildlife areas & properties', desc: 'Department wildlife areas and other properties with their hunting, camping and vehicle rules. Tap one.', minzoom: 7, cap: 300, precision: 5,
    urls: [S.wildlifeAreas.url, S.wildlifeAreas.otherUrl], outFields: '*', style: { color: '#ff9f43', fill: 0.12, line: 1.5, label: name(['MasterName', 'NAME', 'Name', 'name']), labelMinZoom: 10 } },
  allotments: { kind: 'bbox', group: 'Land & Access', label: 'Grazing allotments', desc: 'Ranch allotment names and boundaries (AZGeo 2017).', minzoom: 10, cap: 600, precision: 5,
    urls: [S.allotments.url], outFields: '*', style: { color: '#c9a86b', fill: 0, line: 1, dash: [1, 2], label: ['coalesce', ['get', 'ALLOT_NAME'], ['get', 'ALLOTMENT'], ['get', 'NAME'], ['get', 'Name'], ['get', 'allot_name'], ''], labelMinZoom: 11 } },
  ranges: { kind: 'bbox', group: 'Land & Access', label: 'Shooting & archery ranges', desc: 'AZGFD shooting ranges and archery ranges. Sight in before the season.', minzoom: 6, cap: 300, precision: 5,
    urls: [S.ranges.rangesUrl, S.ranges.archeryUrl], outFields: '*', style: { color: '#ff7043', circle: 6, stroke: '#3e1a00', label: name(['MasterName', 'Range_Name']), labelMinZoom: 9 } },
  // ---------- Hunt Units ----------
  gmu: { kind: 'static', group: 'Hunt Units', label: 'Game management units', desc: 'AZGFD unit boundaries with unit numbers. Tap a unit for its huntable species and links.', default: true,
    urls: [S.gmu.url], outFields: 'GMUNAME,GF_REGION,REG_NAME,SQ_MILES,ACRES,HUNT,LANDOWN,USFSName,AGFDLink,USFSLink,BLMLink,USFWSLink', precision: 4, cacheKey: 'layer:gmu2', ttl: 30 * DAY,
    style: { color: '#ff5f5f', fill: 0, line: 2.2, labelCentroid: name(['GMUNAME']), labelSize: 16 } },
  // ---------- Water ----------
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
  // ---------- Roads & Trails ----------
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
  // ---------- Terrain ----------
  hillshade: { kind: 'hillshade', group: 'Terrain', label: 'Hillshade', desc: 'Shaded terrain under every basemap.', default: true },
  lidar: { kind: 'raster', group: 'Terrain', label: 'Lidar hillshade (USGS 3DEP)', desc: 'Best-available USGS elevation, 1 m lidar where flown, shaded on the USGS server. Shows benches, cuts, old roads and tanks the regular hillshade smooths over. Zoom 11+.',
    tiles: TILES.lidarHillshade, minzoom: 11, maxzoom: 18, opacity: 0.8 },
  contours: { kind: 'raster', group: 'Terrain', label: 'Contours (USGS 3DEP)', desc: 'Elevation contours drawn live from the USGS 3DEP elevation service. Zoom 12+.', tiles: TILES.contours, minzoom: 12, maxzoom: 17, opacity: 0.9 },
  slope: { kind: 'raster', group: 'Terrain', label: 'Slope angle', desc: 'Yellow 15–25°, orange 25–30°, red 30–35°, purple 35–45°, dark 45°+. Computed on the phone.', tiles: 'slope://{z}/{x}/{y}', maxzoom: 14, minzoom: 8, opacity: 0.75,
    legend: [['#ffe600', '15–25°'], ['#ff9600', '25–30°'], ['#eb3232', '30–35°'], ['#9628be', '35–45°'], ['#3c145a', '45°+']] },
  aspect: { kind: 'raster', group: 'Terrain', label: 'Aspect (face direction)', desc: 'Blue north, green east, orange south, purple west. North faces hold shade and bedding.', tiles: 'aspect://{z}/{x}/{y}', maxzoom: 14, minzoom: 8, opacity: 0.6,
    legend: [['#286eff', 'North'], ['#28c878', 'East'], ['#ff961e', 'South'], ['#aa3cdc', 'West']] },
  habitat: { kind: 'raster', group: 'Terrain', label: 'Habitat finder (species)', desc: 'Highlights ground that matches the selected species and the current season: elevation band, aspect and slope. Computed on the phone. Change species in Hunt.', resolve: () => habitatSource(), dated: true, maxzoom: 14, minzoom: 8, opacity: 0.6,
    legend: [['#2bd4c1', 'Strong match'], ['#b4f0e6', 'Partial match']] },
  // ---------- Conditions ----------
  radar: { kind: 'raster', group: 'Conditions', label: 'Weather radar (live)', desc: 'RainViewer composite radar. Refreshes every 5 minutes while on.', resolve: () => resolveRadar(), maxzoom: 12, opacity: 0.7, dated: true },
  snowDepth: { kind: 'raster', group: 'Conditions', label: 'Snow depth (NOAA)', desc: 'National snow analysis, updated daily. Snow pushes deer and elk downhill and makes tracking easy.', resolve: () => dailyStamp(TILES.snowDepth), minzoom: 5, maxzoom: 12, opacity: 0.7, dated: true },
  snowCover: { kind: 'raster', group: 'Conditions', label: 'Snow cover (satellite)', desc: 'MODIS snow cover from the newest pass. Clouds leave gaps; step back a day in the details.', resolve: ({ step }) => resolveGibs(GIBS.snowCover, { step }), maxzoom: 8, opacity: 0.75, dated: true },
  greenup: { kind: 'raster', group: 'Conditions', label: 'Green-up (NDVI)', desc: 'MODIS 8-day vegetation greenness. Dark green is feed; after a monsoon or a burn, that is where the animals go.', resolve: ({ step }) => resolveGibs(GIBS.ndvi, { step, maxBack: 6 }), maxzoom: 9, opacity: 0.7, dated: true },
  drought: { kind: 'static', group: 'Conditions', label: 'Drought (US Drought Monitor)', desc: 'This week drought intensity. Dry years concentrate game on the reliable water.', precision: 2, simplify: 0.01, bbox: AZ_BBOX, cacheKey: 'layer:drought', ttl: 7 * DAY, cap: 20,
    urls: [S.drought.url], outFields: 'dm,period,ddate',
    style: { fillColor: ['match', ['coalesce', ['get', 'dm'], -1], 0, '#ffff00', 1, '#fcd37f', 2, '#ffaa00', 3, '#e60000', 4, '#730000', '#999999'], fill: 0.3, color: '#b36b00', line: 0.5 },
    legend: [['#ffff00', 'D0 abnormally dry'], ['#fcd37f', 'D1 moderate'], ['#ffaa00', 'D2 severe'], ['#e60000', 'D3 extreme'], ['#730000', 'D4 exceptional']] },
  // ---------- Imagery ----------
  daily: { kind: 'raster', group: 'Imagery', label: 'Daily satellite (MODIS)', desc: 'The latest 250 m true-color pass, usually yesterday. See the snow line, storms, dust and green-up statewide. Step back a day in the details.', resolve: ({ step }) => resolveGibs(GIBS.trueColor, { step }), maxzoom: 9, opacity: 1, dated: true },
  hls: { kind: 'raster', group: 'Imagery', label: 'Recent imagery (30 m)', desc: 'Newest clear Landsat or Sentinel-2 scene over the map center, usually within the week. Compare with the basemap for new water, burns and green-up. Zoom 8 to 12.',
    resolve: ({ map, step }) => resolveHls({ center: map.getCenter().toArray(), step }), minzoom: 7, maxzoom: 12, opacity: 1, dated: true, recenter: true },
  naip: { kind: 'raster', group: 'Imagery', label: 'NAIP aerials (USDA)', desc: 'Leaf-on aerial photos at 60 cm, flown every 2 to 3 years. A different date than the basemap, so compare for new tanks, roads and clearings. Zoom 12+.', tiles: TILES.naip, minzoom: 12, maxzoom: 18, opacity: 1 },
  // ---------- Fire & Habitat ----------
  fires: { kind: 'bbox', group: 'Fire & Habitat', label: 'Burn history (2005+)', desc: 'Wildfire perimeters colored by year; 3–10 year old burns are feed.', minzoom: 7, cap: 1200, precision: 4,
    urls: [S.fires.url], where: S.fires.where, outFields: 'INCIDENT,FIRE_YEAR_INT,FIRE_YEAR,GIS_ACRES',
    style: { fillColor: ['interpolate', ['linear'], ['coalesce', ['get', 'FIRE_YEAR_INT'], ['to-number', ['get', 'FIRE_YEAR'], 2005]], 2005, '#ffe0b2', 2015, '#ff8a50', 2026, '#d32f2f'], fill: 0.3, color: '#ff7043', line: 0.8,
      label: ['concat', name(['INCIDENT']), ' ', ['to-string', ['coalesce', ['get', 'FIRE_YEAR_INT'], ['get', 'FIRE_YEAR'], '']]], labelMinZoom: 10 },
    legend: [['#ffe0b2', '2005'], ['#ff8a50', '2015'], ['#d32f2f', '2026']] },
  firesCurrent: { kind: 'bbox', group: 'Fire & Habitat', label: 'Fires this year', desc: 'WFIGS year-to-date perimeters.', minzoom: 6, cap: 400, precision: 4,
    urls: [S.fires.currentUrl], outFields: 'poly_IncidentName,poly_GISAcres,poly_DateCurrent,attr_PercentContained',
    style: { color: '#ff1744', fill: 0.25, line: 2, label: name(['poly_IncidentName']), labelMinZoom: 8 } },
  timber: { kind: 'bbox', group: 'Fire & Habitat', label: 'Timber cuts & thinning (USFS)', desc: 'Forest Service harvest and thinning units with completion year. Thinned stands grow feed for 3 to 10 years.', minzoom: 9, cap: 1500, precision: 5,
    urls: [S.timber.recentUrl, S.timber.olderUrl], outFields: 'activity_name,treatment_type,sale_name,date_completed,fy_completed,gis_acres',
    style: { fillColor: ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'fy_completed'], 2011], 2011], 2011, '#c8e6c9', 2018, '#66bb6a', 2026, '#1b5e20'], fill: 0.35, color: '#2e7d32', line: 0.8,
      label: ['concat', name(['activity_name']), ' ', ['to-string', ['coalesce', ['get', 'fy_completed'], '']]], labelMinZoom: 12 },
    legend: [['#c8e6c9', '2011'], ['#66bb6a', '2018'], ['#1b5e20', '2026']] },
  fuels: { kind: 'bbox', group: 'Fire & Habitat', label: 'Fuels treatments & prescribed burns', desc: 'Hazardous fuels work: prescribed fire, mastication, thinning. Fresh burns green up first.', minzoom: 9, cap: 1500, precision: 5,
    urls: [S.fuels.url], outFields: 'activity,treatment_type,treatment_name,method,stage,date_completed,fiscal_year_completed,gis_acres',
    style: { color: '#ffb300', fill: 0.25, line: 0.8, dash: [2, 1], label: ['concat', name(['treatment_type', 'activity']), ' ', ['to-string', ['coalesce', ['get', 'fiscal_year_completed'], '']]], labelMinZoom: 12 } },
  restoration: { kind: 'bbox', group: 'Fire & Habitat', label: 'Habitat projects (AZGFD)', desc: 'Department habitat work: juniper removal, grassland restoration, water, fencing.', minzoom: 7, cap: 800, precision: 5,
    urls: [S.restoration.url], outFields: 'CoverType,HabitatAction,Acres,ProjID,HabitatAction2,Acres2', style: { color: '#aed581', circle: 5, stroke: '#1b3a00', label: name(['HabitatAction']), labelMinZoom: 11 } },
  cropland: { kind: 'raster', group: 'Fire & Habitat', label: 'Crops & farm fields (USDA)', desc: 'Cropland Data Layer: alfalfa, hay, corn, cotton, pasture, fallow. Tap a field to see the crop. Alfalfa pulls deer and elk every evening.', tiles: TILES.cropland, minzoom: 9, maxzoom: 15, opacity: 0.7 },
  // ---------- Wildlife ----------
  migration: { kind: 'static', group: 'Wildlife', label: 'Migration corridors', desc: 'GPS-collar corridors for mule deer, elk and pronghorn (USGS Western Migrations, AZGFD). Darker = heavier use. Kaibab, San Francisco Peaks, I-40 and I-17 herds.', cacheKey: 'layer:migration', ttl: 30 * DAY, precision: 4, cap: 1000,
    urls: urlsOf(S.migration.corridors), tags: tagsOf(S.migration.corridors), outFields: '*',
    style: { fillColor: SPECIES_COLOR, fill: USE_OPACITY, lineColor: SPECIES_COLOR, color: '#ffffff', line: 0.6 }, legend: SPECIES_COLORS },
  migrationRoutes: { kind: 'static', group: 'Wildlife', label: 'Migration routes (collars)', desc: 'Individual collared-animal spring and fall routes. Shows exactly where herds cross roads, fences and saddles.', cacheKey: 'layer:migrationRoutes', ttl: 30 * DAY, precision: 4, cap: 1500,
    urls: urlsOf(S.migration.routes), tags: tagsOf(S.migration.routes), outFields: '*',
    style: { lineColor: SPECIES_COLOR, color: '#ffffff', line: 1.2 }, legend: SPECIES_COLORS },
  winterRange: { kind: 'static', group: 'Wildlife', label: 'Winter & seasonal ranges', desc: 'Where collared herds spend winter, plus stopovers and year-round ranges. Late-season hunts live here.', cacheKey: 'layer:winterRange', ttl: 30 * DAY, precision: 4, cap: 600,
    urls: urlsOf(S.migration.ranges), tags: tagsOf(S.migration.ranges), outFields: '*',
    style: { fillColor: SPECIES_COLOR, fill: 0.18, lineColor: SPECIES_COLOR, color: '#ffffff', line: 1, dash: [3, 2], label: ['concat', ['get', 'fl_species'], ' ', ['downcase', ['get', 'fl_season']]], labelMinZoom: 9 }, legend: SPECIES_COLORS },
  cwd: { kind: 'static', group: 'Wildlife', label: 'CWD surveillance zones', desc: 'Chronic wasting disease watch zones along the state line. Extra carcass-transport rules and testing requests apply.', cacheKey: 'layer:cwd', ttl: 30 * DAY, precision: 3, cap: 50,
    urls: [S.cwd.url], outFields: 'counties,gmu,zone_type', style: { color: '#ef5350', fill: 0.12, line: 1.5, dash: [1, 2], label: name(['zone_type']), labelMinZoom: 7 } },
  wolf: { kind: 'static', group: 'Wildlife', label: 'Mexican wolf range', desc: 'Occupied Mexican wolf range (AZGFD). Know a wolf from a coyote before you shoot a predator here; wolves are protected.', cacheKey: 'layer:wolf', ttl: 30 * DAY, precision: 3, cap: 10,
    urls: [S.wolf.url], outFields: 'Acres', style: { color: '#8d6e63', fill: 0.1, line: 1.5, dash: [4, 3] } },
  // ---------- Hunt Tools ----------
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
    this.status = new Map(); this.meta = new Map(); this.dateStep = new Map(); this.timers = new Map(); this.offlineProvider = null;
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
  getMeta(id) { return this.meta.get(id) || null; }

  toggle(id) { return this.on.has(id) ? this.disable(id) : this.enable(id); }

  enable(id, { silent = false } = {}) {
    const def = LAYER_DEFS[id]; if (!def || this.on.has(id)) return;
    this.on.add(id);
    if (def.kind === 'raster') this._addRaster(id, def).catch((e) => console.warn(`[layer ${id}]`, e.message));
    else if (def.kind === 'hillshade') this._addHillshade(id);
    else if (def.kind !== 'virtual') { this._addGeo(id, def); this._load(id, def); }
    if (!silent) this.onChange(id, true);
  }
  disable(id, { silent = false } = {}) {
    const def = LAYER_DEFS[id]; if (!def || !this.on.has(id)) return;
    this.on.delete(id);
    const ac = this.pending.get(id); if (ac) ac.abort(); this.pending.delete(id);
    const t = this.timers.get(id); if (t) clearInterval(t); this.timers.delete(id);
    this._removeMapLayers(id);
    this.features.delete(id); this.covered.delete(id); this.status.delete(id); this.meta.delete(id);
    if (!silent) this.onChange(id, false);
  }
  _removeMapLayers(id) {
    for (const l of this.map.getStyle().layers) if (l.id === id || l.id.startsWith(`${id}-`)) this.map.removeLayer(l.id);
    for (const s of Object.keys(this.map.getStyle().sources)) if (s === `src-${id}` || s === `src-${id}-lab`) this.map.removeSource(s);
  }
  setOpacity(id, v) {
    const def = LAYER_DEFS[id]; if (!def) return;
    if (def.kind === 'raster' && this.map.getLayer(id)) this.map.setPaintProperty(id, 'raster-opacity', v);
    if (def.kind === 'hillshade' && this.map.getLayer(id)) this.map.setPaintProperty(id, 'hillshade-exaggeration', v);
  }

  // Rasters: a fixed tile template, or `resolve()` for dated and live sources (newest GIBS date, radar frame, daily stamp).
  async _addRaster(id, def) {
    let tiles = def.tiles; let meta = null;
    if (def.resolve) {
      this._setStatus(id, 'loading');
      try { meta = await def.resolve({ map: this.map, step: this.dateStep.get(id) || 0 }); }
      catch (e) { console.warn(`[layer ${id}]`, e.message); this._setStatus(id, 'error'); return; }
      if (!this.on.has(id)) return;
      tiles = meta.tiles; this.meta.set(id, meta);
    }
    if (this.map.getSource(`src-${id}`)) return;
    this.map.addSource(`src-${id}`, { type: 'raster', tiles: [tiles], tileSize: def.tileSize || 256, maxzoom: def.maxzoom || 18, minzoom: def.minzoom || 0 });
    this.map.addLayer({ id, type: 'raster', source: `src-${id}`, minzoom: def.minzoom || 0, paint: { 'raster-opacity': def.opacity ?? 0.7, 'raster-fade-duration': 100 } }, 'anchor-fill');
    this._setStatus(id, 'ok');
    if (meta && meta.refreshMs) this.timers.set(id, setInterval(() => this.reloadRaster(id), meta.refreshMs));
  }
  // Re-resolve a dated raster (new date step, map moved for HLS, radar refresh) and swap its tiles in place.
  async reloadRaster(id) {
    const def = LAYER_DEFS[id]; if (!def || !def.resolve || !this.on.has(id)) return null;
    this._setStatus(id, 'loading');
    try {
      const meta = await def.resolve({ map: this.map, step: this.dateStep.get(id) || 0 });
      if (!this.on.has(id)) return null;
      this.meta.set(id, meta);
      const src = this.map.getSource(`src-${id}`);
      if (src && typeof src.setTiles === 'function') src.setTiles([meta.tiles]);
      else { this._removeMapLayers(id); await this._addRaster(id, def); }
      this._setStatus(id, 'ok'); return meta;
    } catch (e) { console.warn(`[layer ${id}]`, e.message); this._setStatus(id, 'error'); return null; }
  }
  // delta +1 = one published date older, -1 = newer (clamped at the newest).
  stepDate(id, delta) { const s = Math.max(0, (this.dateStep.get(id) || 0) + delta); this.dateStep.set(id, s); return this.reloadRaster(id); }

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
    const hasFill = Array.isArray(st.fill) || (st.fill ?? 0) > 0 || st.fillColor;
    if (hasFill) {
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

  // Query every service URL of a layer in parallel. `def.tags[i]` (species, season) is merged into each feature's properties.
  async _fetchBbox(def, bbox, signal) {
    const opts = { bbox, where: def.where || '1=1', outFields: def.outFields || '*', maxPages: def.maxPages || 2, signal, precision: def.precision || 6, simplify: def.simplify };
    const results = await Promise.allSettled(def.urls.map((u) => queryFeatures(u, opts)));
    const feats = []; let okCount = 0;
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return; okCount++;
      const tag = def.tags && def.tags[i];
      feats.push(...(tag ? r.value.features.map((f, j) => ({ ...f, id: `${i}-${f.id ?? j}`, properties: { ...f.properties, ...tag } })) : r.value.features));
    });
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
      for (const f of m.values()) { if (f.geometry.type !== 'Point' && !f.__pt) f.__pt = centroid(f.geometry); }
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

  // One-shot layers: whole service (or `def.bbox`, e.g. Arizona) fetched once and cached in IndexedDB for `def.ttl`.
  async _loadStatic(id, def) {
    this._setStatus(id, 'loading');
    try {
      let fc = def.cacheKey ? await store.get('cache', def.cacheKey) : null;
      if (fc && def.ttl && Date.now() - (fc.fetchedAt || 0) > def.ttl && navigator.onLine !== false) fc = null;
      if (!fc) {
        fc = await this._fetchBbox(def, def.bbox || null, new AbortController().signal);
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
