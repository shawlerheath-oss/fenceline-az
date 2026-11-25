// Fenceline configuration: Arizona bounds, tile templates, and public GIS services.
// Every endpoint below was checked live (HTTP 200, CORS allowed, f=geojson where queried) on 2026-11-24.

export const APP_VERSION = '0.4.0';
export const TZ = 'America/Phoenix';

export const AZ_BOUNDS = [[-115.2, 31.0], [-108.6, 37.3]];
export const AZ_BBOX = [AZ_BOUNDS[0][0], AZ_BOUNDS[0][1], AZ_BOUNDS[1][0], AZ_BOUNDS[1][1]];
export const DEFAULT_CENTER = [-111.66, 34.3];
export const DEFAULT_ZOOM = 6.2;

const RULE = (name) => encodeURIComponent(JSON.stringify({ rasterFunction: name }));
const DEP3 = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&f=image';

export const TILES = {
  esriImagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  esriLabels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  esriTopo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  usgsTopo: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
  usgsImageryOnly: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
  usgsHydro: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}',
  usgsShadedRelief: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}',
  terrarium: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  // USGS 3DEP image service: lidar-grade hillshade and contours rendered per tile from the bbox placeholder MapLibre fills in.
  lidarHillshade: `${DEP3}&format=jpgpng&renderingRule=${RULE('Hillshade Multidirectional')}`,
  contours: `${DEP3}&format=png32&transparent=true&renderingRule=${RULE('Contour 25')}`,
  // USGS-hosted NAIP aerial photography (60 cm, flown every 2 to 3 years).
  naip: 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&f=image',
  // NOAA NOHRSC national snow analysis, layer 0 = snow depth, updated daily.
  snowDepth: 'https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&layers=show:0&format=png32&transparent=true&f=image',
  // USDA NASS Cropland Data Layer (CroplandCROS image service, latest year on top).
  cropland: 'https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image'
};

// NASA GIBS (Worldview) dated WMTS layers. Level = deepest zoom published; dates are UTC; 8-day products start Jan 1.
export const GIBS = {
  base: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
  trueColor: { id: 'MODIS_Terra_CorrectedReflectance_TrueColor', level: 9, ext: 'jpg', lag: 1 },
  viirs: { id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', level: 9, ext: 'jpg', lag: 1 },
  snowCover: { id: 'MODIS_Terra_NDSI_Snow_Cover', level: 8, ext: 'png', lag: 1 },
  ndvi: { id: 'MODIS_Terra_NDVI_8Day', level: 9, ext: 'png', period: 8, lag: 10 },
  hlsS30: { id: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance', level: 12, ext: 'png', lag: 2 },
  hlsL30: { id: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', level: 12, ext: 'png', lag: 2 }
};
// RainViewer public radar composite: fetch the frame list, then tile the newest past frame.
export const RAINVIEWER = { api: 'https://api.rainviewer.com/public/weather-maps.json', suffix: '/256/{z}/{x}/{y}/2/1_1.png' };

export const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
export const FONT = ['Open Sans Semibold'];

const AGFD = 'https://services2.arcgis.com/os1CphwIyxBDDUGn/arcgis/rest/services';
const EDW = 'https://apps.fs.usda.gov/arcx/rest/services/EDW';
const MIG2 = 'https://services1.arcgis.com/IAQQkLXctKHrf8Av/arcgis/rest/services/Ungulate_Migrations_USGS_Vol2/FeatureServer';

export const SERVICES = {
  sma: {
    label: 'Land ownership (BLM Surface Management Agency)',
    tiles: 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 15,
    // Arizona-specific polygons carry manager, owner and public-access flags.
    queryAZ: 'https://gis.blm.gov/azarcgis/rest/services/lands/BLM_AZ_SMA/FeatureServer/0',
    query: 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1',
    managerFields: ['LAND_MNGR', 'ADMIN_AGENCY_CODE', /mngr/i, /agency/i],
    ownerFields: ['LAND_OWNER', 'ADMIN_UNIT_NAME', /owner/i, /unit_name/i],
    accessFields: ['PUB_ACC', /acc/i],
    unitFields: ['ADMIN_UNIT_NAME', 'NATL_SYM', /unit_name/i]
  },
  ownership: {
    label: 'Statewide land ownership (AZGFD)',
    url: `${AGFD}/LandOwnership_updated/FeatureServer/0`,
    nameFields: ['OWNNAME', /ownname/i], categoryFields: ['CATEGORY', /categ/i], managerFields: ['MANAGEDNAM', /managed/i], descFields: ['DESC_', /desc/i]
  },
  gmu: {
    label: 'Game Management Units (AZGFD)',
    url: `${AGFD}/HunterDonationInteractiveWebmap_1921/FeatureServer/0`,
    nameFields: ['GMUNAME', /gmu/i, /unit/i],
    regionFields: ['REG_NAME', 'GF_REGION'], acresFields: ['ACRES', 'SQ_MILES'],
    linkFields: { agfd: 'AGFDLink', usfs: 'USFSLink', blm: 'BLMLink', fws: 'USFWSLink' }
  },
  stateTrust: {
    label: 'Arizona State Trust land (ASLD)',
    url: 'https://gisdata.azland.gov/server/rest/services/ASLD/Arizona_State_Trust_Land_Parcels/FeatureServer/0',
    lesseeFields: ['accountname', /account/i, /lessee/i], typeFields: ['parceltype', 'classification', /type/i],
    acresFields: ['gisacres', 'acres', /acre/i], fundFields: ['fund'], legalFields: ['legaldescription', /legal/i],
    trsFields: ['township', 'townshipdirection', 'range', 'rangedirection', 'section']
  },
  wildlifeAreas: {
    label: 'AZGFD wildlife areas and properties',
    url: `${AGFD}/AGFDLands/FeatureServer/1`,
    otherUrl: `${AGFD}/AGFDLands/FeatureServer/5`,
    nameFields: ['MasterName', /name/i, /area/i]
  },
  hpcWater: {
    label: 'Habitat Partnership water projects (AZGFD)',
    url: `${AGFD}/HPC_Projects_submissions/FeatureServer/0`,
    nameFields: ['project_name', /name/i], unitFields: ['gmu_number'], typeFields: ['water_type', 'project_type'],
    statusFields: ['project_status'], reliableFields: ['reliable_water'], perennialFields: ['perennial_water'],
    where: "water_action IS NOT NULL OR water_type IS NOT NULL OR water_catchment IS NOT NULL OR dirt_tank IS NOT NULL OR project_type LIKE '%ater%'"
  },
  springs: {
    label: 'Springs and seeps (USGS NHD)',
    url: 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/0',
    where: 'FTYPE=458', nameFields: ['GNIS_NAME', /name/i]
  },
  tanks: {
    label: 'Stock tanks, ponds and reservoirs (USGS NHD)',
    url: 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12',
    where: 'FTYPE IN (436,390)', nameFields: ['GNIS_NAME', /name/i], typeFields: ['FTYPE'], areaFields: ['AREASQKM']
  },
  springsWells: {
    label: 'Springs and wells (AZGFD watershed)',
    url: `${AGFD}/Watershed_Mgmt_Waters/FeatureServer/0`,
    nameFields: ['name', /name/i]
  },
  mvum: {
    label: 'USFS Motor Vehicle Use Map roads',
    url: `${EDW}/EDW_MVUM_01/MapServer/1`,
    trailsUrl: `${EDW}/EDW_MVUM_01/MapServer/2`,
    idFields: ['id', /^id$/i], nameFields: ['name', /name/i],
    designationFields: ['mvum_symbol_name', 'symbol', /symbol/i],
    seasonFields: ['seasonal'], openFields: ['highclearancevehicle_datesopen', 'passengervehicle_datesopen'],
    vehicleFields: ['passengervehicle', 'highclearancevehicle', 'atv', 'motorcycle', 'fourwd_gt50inches'],
    surfaceFields: ['surfacetype'], forestFields: ['forestname'], milesFields: ['gis_miles']
  },
  trails: {
    label: 'USFS trails',
    url: `${EDW}/EDW_TrailNFSPublish_01/MapServer/0`,
    nameFields: ['trail_name', /name/i], noFields: ['trail_no'], typeFields: ['trail_type', 'allowed_terra_use'],
    motorFields: ['terra_motorized'], milesFields: ['gis_miles'], surfaceFields: ['trail_surface']
  },
  wilderness: {
    label: 'Wilderness areas',
    url: `${EDW}/EDW_Wilderness_01/MapServer/0`,
    blmUrl: 'https://gis.blm.gov/azarcgis/rest/services/nlcs/BLM_AZ_WLD/FeatureServer/0',
    nameFields: ['wildernessname', 'NLCS_NAME', /name/i], acresFields: ['gis_acres', /acre/i]
  },
  forests: {
    label: 'National Forest boundaries',
    url: `${EDW}/EDW_ForestSystemBoundaries_01/MapServer/0`,
    nameFields: ['forestname', /name/i]
  },
  allotments: {
    label: 'Grazing allotments (ranches)',
    url: 'https://services6.arcgis.com/clPWQMwZfdWn4MQZ/arcgis/rest/services/allot/FeatureServer/24',
    nameFields: [/allot.*name/i, /name/i, /allot/i], permitteeFields: [/permit/i, /ranch/i, /operator/i]
  },
  blmRec: {
    label: 'BLM recreation sites',
    url: 'https://gis.blm.gov/azarcgis/rest/services/recreation/BLM_AZ_RECS/FeatureServer/0',
    nameFields: [/name/i], typeFields: [/type/i, /feat/i]
  },
  fires: {
    label: 'Wildfire perimeter history (NIFC)',
    url: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0',
    currentUrl: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0',
    nameFields: ['INCIDENT', 'poly_IncidentName', /incident/i, /name/i],
    yearFields: ['FIRE_YEAR_INT', 'FIRE_YEAR', /year/i], acresFields: ['GIS_ACRES', 'poly_GISAcres', /acres/i],
    where: 'FIRE_YEAR_INT >= 2005'
  },
  // ---- Added in 0.2.0 (onX parity) ----
  plss: {
    label: 'Public Land Survey System (BLM CadNSDI)',
    townships: 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/1',
    sections: 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/2'
  },
  roadless: { label: 'Inventoried Roadless Areas (USFS, 2001 rule)', url: `${EDW}/EDW_InventoriedRoadlessAreas2001_01/MapServer/0` },
  timber: { label: 'Timber harvest and thinning (USFS FACTS)', recentUrl: `${EDW}/EDW_TimberHarvest_01/MapServer/11`, olderUrl: `${EDW}/EDW_TimberHarvest_01/MapServer/0` },
  fuels: { label: 'Hazardous fuels treatments and prescribed fire (USFS FACTS)', url: `${EDW}/EDW_HazardousFuelsTreatments_01/MapServer/15` },
  restoration: { label: 'Habitat restoration projects (AZGFD)', url: `${AGFD}/HabitatRestoration_points/FeatureServer/0` },
  ranges: { label: 'Shooting and archery ranges (AZGFD)', rangesUrl: `${AGFD}/AGFDLands/FeatureServer/6`, archeryUrl: `${AGFD}/More_layers_718/FeatureServer/2` },
  cwd: { label: 'CWD surveillance zones (AZGFD)', url: `${AGFD}/Adjacent_Surveillance_Zones/FeatureServer/0` },
  wolf: { label: 'Mexican wolf occupied range (AZGFD)', url: `${AGFD}/WolfOccupiedRange/FeatureServer/0` },
  huntSpecies: { label: 'Huntable species by unit (AZGFD)', base: `${AGFD}/Hunt_Species/FeatureServer`, layers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  // USGS Western Migrations (Ungulate Migrations of the Western United States, vol. 2) plus AZGFD's Interstate 17 elk study.
  // Each entry: [url, species, season]. GRIDCODE 1 / 10 / 20 (or Use_ Low / Medium / High) = corridor use intensity.
  migration: {
    label: 'Big game migration corridors and seasonal ranges (USGS)',
    corridors: [
      [`${MIG2}/75`, 'Mule deer', 'Corridor'], [`${MIG2}/71`, 'Mule deer', 'Corridor'], [`${MIG2}/37`, 'Pronghorn', 'Corridor'],
      [`${MIG2}/90`, 'Elk', 'Corridor'], [`${MIG2}/92`, 'Elk', 'Corridor'],
      ['https://services1.arcgis.com/CNfeg2bqPqhTN34y/arcgis/rest/services/Elk_AZ_17/FeatureServer/0', 'Elk', 'Corridor']
    ],
    routes: [
      [`${MIG2}/19`, 'Mule deer', 'Route'], [`${MIG2}/17`, 'Mule deer', 'Route'], [`${MIG2}/18`, 'Mule deer', 'Route'],
      [`${MIG2}/3`, 'Pronghorn', 'Route'], [`${MIG2}/29`, 'Elk', 'Route'], [`${MIG2}/30`, 'Elk', 'Route'],
      ['https://services1.arcgis.com/CNfeg2bqPqhTN34y/arcgis/rest/services/Elk_AZ_Interstate17_Routes_Ver1_2019/FeatureServer/0', 'Elk', 'Route']
    ],
    ranges: [
      [`${MIG2}/73`, 'Mule deer', 'Winter range'], [`${MIG2}/69`, 'Mule deer', 'Winter range'], [`${MIG2}/36`, 'Pronghorn', 'Winter range'],
      [`${MIG2}/89`, 'Elk', 'Winter range'], [`${MIG2}/91`, 'Elk', 'Winter range'],
      [`${MIG2}/74`, 'Mule deer', 'Stopover'], [`${MIG2}/70`, 'Mule deer', 'Stopover'],
      [`${MIG2}/72`, 'Mule deer', 'Annual range'], [`${MIG2}/35`, 'Pronghorn', 'Annual range']
    ]
  },
  drought: { label: 'US Drought Monitor (NDMC / USDA / NOAA, via Esri Living Atlas)', url: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/US_Drought_Intensity_v1/FeatureServer/3' },
  cropland: {
    label: 'Cropland Data Layer (USDA NASS CroplandCROS)',
    identify: 'https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/identify',
    legend: 'https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/legend'
  },
  naip: { label: 'NAIP aerial photography (USGS)', query: 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/query' },
  airQuality: { label: 'Air quality (Open-Meteo)', url: 'https://air-quality-api.open-meteo.com/v1/air-quality' }
};

// Parcel services. ADWR republishes every county assessor roll with OWNER_NAME in one MapServer;
// three counties also publish fresher official layers, listed as `alt` and tried first.
const ADWR = 'https://azwatermaps.azwater.gov/arcgis/rest/services/General/Parcels/MapServer/';
const ADWR_FIELDS = {
  ownerFields: ['OWNER_NAME', 'OwnerName', 'OWNERNAME', 'MAIL1', /owner/i],
  apnFields: ['APN', 'PARCEL', 'PARCEL_ID', /apn/i, /parcel/i],
  addrFields: ['SITE_ADDRESS', 'PropertyFullStreetAddress', 'SITUS', 'SITUS_ADD_DOR', /situs/i, /addr/i],
  acresFields: ['ACRES_US', 'LotSize_Acre', 'GISACRES', /acre/i],
  cityFields: ['SITE_CITY', 'SITUS_CITY', 'OwnerCity', /city/i]
};
export const COUNTY_PARCELS = [
  { id: 'apache', name: 'Apache County', bbox: [-110.0, 33.4, -109.04, 37.0], url: `${ADWR}0`, ...ADWR_FIELDS },
  { id: 'cochise', name: 'Cochise County', bbox: [-110.46, 31.33, -109.04, 32.43], url: `${ADWR}1`, ...ADWR_FIELDS },
  { id: 'coconino', name: 'Coconino County', bbox: [-113.35, 34.26, -110.75, 37.0], url: `${ADWR}2`, ...ADWR_FIELDS,
    alt: 'https://services1.arcgis.com/Rlvx5g8pKeK13apH/arcgis/rest/services/Coconino_County_Parcels_Public_View/FeatureServer/0' },
  { id: 'gila', name: 'Gila County', bbox: [-111.7, 33.0, -109.9, 34.4], url: `${ADWR}3`, ...ADWR_FIELDS },
  { id: 'graham', name: 'Graham County', bbox: [-110.45, 32.4, -109.1, 33.5], url: `${ADWR}4`, ...ADWR_FIELDS },
  { id: 'greenlee', name: 'Greenlee County', bbox: [-109.5, 32.4, -109.04, 33.8], url: `${ADWR}5`, ...ADWR_FIELDS },
  { id: 'lapaz', name: 'La Paz County', bbox: [-114.75, 33.0, -113.3, 34.3], url: `${ADWR}6`, ...ADWR_FIELDS },
  { id: 'maricopa', name: 'Maricopa County', bbox: [-113.34, 32.5, -111.04, 34.05], url: `${ADWR}7`, ...ADWR_FIELDS,
    alt: 'https://services.arcgis.com/ykpntM6e3tHvzKRJ/ArcGIS/rest/services/Parcel_Data_View/FeatureServer/0' },
  { id: 'mohave', name: 'Mohave County', bbox: [-114.82, 33.99, -112.53, 37.0], url: `${ADWR}8`, ...ADWR_FIELDS },
  { id: 'navajo', name: 'Navajo County', bbox: [-111.0, 33.9, -109.8, 37.0], url: `${ADWR}9`, ...ADWR_FIELDS },
  { id: 'pima', name: 'Pima County', bbox: [-113.34, 31.33, -110.45, 32.52], url: `${ADWR}10`, ...ADWR_FIELDS,
    alt: 'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/ThriveParcels/FeatureServer/0' },
  { id: 'pinal', name: 'Pinal County', bbox: [-112.21, 32.5, -110.45, 33.47], url: `${ADWR}11`, ...ADWR_FIELDS },
  { id: 'santacruz', name: 'Santa Cruz County', bbox: [-111.37, 31.33, -110.45, 31.73], url: `${ADWR}12`, ...ADWR_FIELDS },
  { id: 'yavapai', name: 'Yavapai County', bbox: [-113.33, 33.99, -111.49, 35.53], url: `${ADWR}13`, ...ADWR_FIELDS },
  { id: 'yuma', name: 'Yuma County', bbox: [-114.82, 32.0, -113.3, 33.5], url: `${ADWR}14`, ...ADWR_FIELDS }
];

export const RULES = {
  // Arizona legal shooting hours (A.A.C. R12-4-318 and Commission Order footnotes).
  legal: {
    bigGame: { before: 30, after: 30, label: 'Big game, small game, predators: ½ hr before sunrise to ½ hr after sunset' },
    migratory: { before: 30, after: 0, label: 'Dove, waterfowl, crane, band-tailed pigeon: ½ hr before sunrise to sunset' }
  },
  boundaryWarnYd: 100,
  boundaryAlertYd: 50
};

export const ATTRIBUTIONS = [
  'Imagery © Esri, Maxar, Earthstar Geographics',
  'Topo, imagery, hydrography, NAIP aerials, 3DEP lidar hillshade and contours: USGS The National Map',
  'Daily satellite imagery, HLS 30 m scenes, snow cover, NDVI: NASA GIBS / Worldview',
  'Weather radar: RainViewer',
  'Snow depth: NOAA National Operational Hydrologic Remote Sensing Center',
  'Drought: US Drought Monitor (NDMC, USDA, NOAA) via Esri Living Atlas',
  'Cropland: USDA NASS Cropland Data Layer (CroplandCROS)',
  'Migration corridors and ranges: USGS Western Migrations / Ungulate Migrations of the Western US; AZGFD',
  'Land ownership: BLM Surface Management Agency; AZGFD',
  'Townships and sections: BLM PLSS CadNSDI',
  'Game units, wildlife areas, water projects, ranges, CWD zones, wolf range, habitat projects: Arizona Game and Fish Department',
  'State Trust land: Arizona State Land Department',
  'Parcels: Arizona county assessors via ADWR, Maricopa, Pima, Coconino',
  'Roads, trails, wilderness, forests, roadless areas, timber and fuels treatments: USDA Forest Service; BLM Arizona',
  'Fire perimeters: NIFC / WFIGS',
  'Elevation: Mapzen Terrain Tiles on AWS (USGS 3DEP, SRTM)',
  'Weather and air quality: Open-Meteo (CC BY 4.0)',
  'Map engine: MapLibre GL JS (BSD-3)'
];
