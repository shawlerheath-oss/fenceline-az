// Fenceline configuration: Arizona bounds, tile templates, and public GIS services.
// Every endpoint below was checked live on 2026-11-24 (HTTP 200, CORS allowed, f=geojson supported).

export const APP_VERSION = '0.1.0';
export const TZ = 'America/Phoenix';

export const AZ_BOUNDS = [[-115.2, 31.0], [-108.6, 37.3]];
export const DEFAULT_CENTER = [-111.66, 34.3];
export const DEFAULT_ZOOM = 6.2;

export const TILES = {
  esriImagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  esriLabels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  esriTopo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  usgsTopo: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
  usgsImageryOnly: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
  usgsHydro: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}',
  usgsShadedRelief: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}',
  terrarium: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
};

export const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
export const FONT = ['Open Sans Semibold'];

// ArcGIS REST services. Field lists are tried in order (exact name or RegExp) against returned properties.
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
    url: 'https://services2.arcgis.com/os1CphwIyxBDDUGn/ArcGIS/rest/services/LandOwnership_updated/FeatureServer/0',
    nameFields: ['OWNNAME', /ownname/i], categoryFields: ['CATEGORY', /categ/i], managerFields: ['MANAGEDNAM', /managed/i], descFields: ['DESC_', /desc/i]
  },
  gmu: {
    label: 'Game Management Units (AZGFD)',
    url: 'https://services2.arcgis.com/os1CphwIyxBDDUGn/ArcGIS/rest/services/HunterDonationInteractiveWebmap_1921/FeatureServer/0',
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
    label: 'AZGFD wildlife areas',
    url: 'https://services2.arcgis.com/os1CphwIyxBDDUGn/ArcGIS/rest/services/AGFD_Wildlife_Areas/FeatureServer/0',
    nameFields: [/name/i, /area/i]
  },
  hpcWater: {
    label: 'Habitat Partnership water projects (AZGFD)',
    url: 'https://services2.arcgis.com/os1CphwIyxBDDUGn/arcgis/rest/services/HPC_Projects_submissions/FeatureServer/0',
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
    url: 'https://services2.arcgis.com/os1CphwIyxBDDUGn/ArcGIS/rest/services/Watershed_Mgmt_Waters/FeatureServer/0',
    nameFields: ['name', /name/i]
  },
  mvum: {
    label: 'USFS Motor Vehicle Use Map roads',
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1',
    trailsUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/2',
    idFields: ['id', /^id$/i], nameFields: ['name', /name/i],
    designationFields: ['mvum_symbol_name', 'symbol', /symbol/i],
    seasonFields: ['seasonal'], openFields: ['highclearancevehicle_datesopen', 'passengervehicle_datesopen'],
    vehicleFields: ['passengervehicle', 'highclearancevehicle', 'atv', 'motorcycle', 'fourwd_gt50inches'],
    surfaceFields: ['surfacetype'], forestFields: ['forestname'], milesFields: ['gis_miles']
  },
  trails: {
    label: 'USFS trails',
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0',
    nameFields: ['trail_name', /name/i], noFields: ['trail_no'], typeFields: ['trail_type', 'allowed_terra_use'],
    motorFields: ['terra_motorized'], milesFields: ['gis_miles'], surfaceFields: ['trail_surface']
  },
  wilderness: {
    label: 'Wilderness areas',
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Wilderness_01/MapServer/0',
    blmUrl: 'https://gis.blm.gov/azarcgis/rest/services/nlcs/BLM_AZ_WLD/FeatureServer/0',
    nameFields: ['wildernessname', 'NLCS_NAME', /name/i], acresFields: ['gis_acres', /acre/i]
  },
  forests: {
    label: 'National Forest boundaries',
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer/0',
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
  }
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
  'Topo, imagery, hydrography: USGS The National Map',
  'Land ownership: BLM Surface Management Agency; AZGFD',
  'Game units, wildlife areas, water projects: Arizona Game and Fish Department',
  'State Trust land: Arizona State Land Department',
  'Parcels: Arizona county assessors via ADWR, Maricopa, Pima, Coconino',
  'Roads, trails, wilderness, forests: USDA Forest Service; BLM Arizona',
  'Fire perimeters: NIFC / WFIGS',
  'Elevation: Mapzen Terrain Tiles on AWS (USGS 3DEP, SRTM)',
  'Weather: Open-Meteo (CC BY 4.0)',
  'Map engine: MapLibre GL JS (BSD-3)'
];
