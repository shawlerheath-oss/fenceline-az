# Roadmap: onX Hunt parity and more animal help

Drafted 2026-11-24 from an audit of Fenceline 0.1.0 against onX Hunt (Premium + Elite, fall 2026 feature pages). Nothing below is built yet.

## onX features Fenceline does not have yet

| onX feature | Plan for Fenceline | Data source (probed 2026-11-24) |
|---|---|---|
| Recent Imagery (every ~2 weeks) | "Recent satellite" raster layer with a date stepper; fall back day by day until a tile exists | NASA GIBS WMTS, `VIIRS_SNPP_CorrectedReflectance_TrueColor` (250 m, daily, Level9) and `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` / `HLS_L30_…` (30 m, Level12). Both returned 404 for yesterday's date; snow layer on the same host worked, so it is a date-availability problem, not access. Probe 1–7 days back. |
| Lidar hunting maps | "Lidar hillshade" raster via exportImage with `{bbox-epsg-3857}` | USGS 3DEP ImageServer exportImage, renderingRule Hillshade Gray: **200 image/jpeg, works**. |
| Current Conditions: Precipitation Radar | Animated radar raster | RainViewer `public/weather-maps.json`: **200**, gives tile host + timestamps. |
| Current Conditions: Drought | Drought Monitor polygons | ArcGIS Online search for "US Drought Monitor" feature service returned results; pick the current-week layer. |
| Current Conditions: Air Quality | AQI + dust in the Weather panel | Open-Meteo air-quality API: **200** (us_aqi, pm2_5, dust). |
| Snow (HuntStand/onX conditions) | Snow cover + snow depth rasters | GIBS `MODIS_Terra_NDSI_Snow_Cover` Level8: **200**. NOAA NOHRSC_Snow_Analysis MapServer: **200** (depth). |
| Crop Data | Cropland Data Layer raster (WMS) | CropScape `wms_cdlall.cgi` GetCapabilities: **200**; use GetMap with bbox template, layer `cdl_<year>`. |
| Timber cuts | USFS timber harvest polygons by year | `EDW/EDW_TimberHarvest_01/MapServer/0`: **200 with fields**. Fuel treatments and roadless services need the right service name (probed names returned an error stub). |
| Section Lines (PLSS) | Township/range/section lines + identify T-R-S | `Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer`: **200**. |
| Rut Calendar / Deer Movement Forecast | Per-species rut and activity calendar with today's phase, Arizona timing | Built-in content (no API). |
| Whitetail Insights / Trail Cam Analysis | Sightings and camera log analysis: by hour, wind, moon, pressure | Built from existing waypoints with species/time fields. |
| Route Builder (snap to roads) | Partial: build a route along loaded MVUM/trail geometry | Existing layers; no routing engine. |
| Live Location Sharing / Collaborative folders | Not possible without a server; keep file sharing | — |
| Compass Mode, Connected Optics, CarPlay, SOS | Compass mode yes (device heading); the rest are native-only | — |
| CWD maps, Leaf-off imagery, Southern rut map | Not relevant to Arizona; note in coverage matrix | — |
| Hunt Research Tools (draw odds) | Draw deadline calendar + bonus-point notes + unit links; no odds tables | Built-in content |

## More animal help (new module `js/guides.js`, split by group if >800 lines)

Per species: where they live (elevation bands, vegetation), month-by-month calendar with rut/breeding highlighted and the current month marked, daily movement pattern, food and water by season, sign ID (track sizes, scat, rubs, beds, wallows), glassing / stalking / calling tactics with call sequences, field judging and scoring basics, shot placement diagram (SVG, broadside and quartering), after the shot (blood trail, Arizona heat meat care), Arizona rules (tag type, draw deadlines, bonus points, mandatory reporting or check), well-known units with a "reputation, not a guarantee" hedge. Add species: bison, Gould's turkey, sandhill crane, band-tailed pigeon, desert vs Rocky Mountain bighorn.

Habitat finder overlay: a `habitat://` raster protocol in terrain.js that shades terrain matching the species-season preset (elevation band + aspect + slope), reusing the Terrarium DEM tiles already cached.

Still to find: USGS "Ungulate Migrations of the Western US" feature service (Arizona mule deer, elk, pronghorn corridors and winter ranges) and any AZGFD wildlife-linkage service.

## Order of work

1. Layers with verified sources (lidar hillshade, snow cover, snow depth, radar, crops, timber, PLSS, air quality), then imagery once the date fallback is proven.
2. Species guides + rut calendar + habitat finder.
3. Sightings analysis, compass mode, route-along-roads.
4. Update `js/features.js` matrix and README; test at phone size; push to main.
