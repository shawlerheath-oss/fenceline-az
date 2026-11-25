# Fenceline

A personal Arizona hunting map for iPhone. It runs as a home-screen web app (PWA) with GPS, offline map downloads, and live public GIS data. No account, no subscription, no app store.

## What it does

- Land ownership colors (BLM, Forest Service, State Trust, tribal, private) with tap-to-identify manager, owner and public-access flag.
- Private parcels with owner name, APN, address and acreage for all 15 Arizona counties (county assessor data via ADWR, plus fresher Maricopa, Pima and Coconino feeds).
- Game management units with unit numbers and links to AZGFD pages.
- Water: NHD stock tanks and ponds, springs and seeps, AZGFD water projects, USGS stream and wash overlay.
- Roads and trails: Forest Service MVUM roads colored by designation with open dates, motorized trails, hiking trails, BLM recreation sites, wilderness and forest boundaries, grazing allotments, State Trust parcels with lessee.
- Terrain: 3D tilt, hillshade, slope-angle and aspect shading computed on the phone.
- Burn history since 2005 colored by year, plus this year's fires.
- Weather: 7-day hourly forecast, pressure trend, activity score, legal shooting hours, sunrise and sunset, moon.
- Stands with approach bearing: good / marginal / bad wind rating, best winds, 48-hour wind calendar, live scent cones on the map.
- Waypoints with 23 hunting icons, notes, tags, photos; lines and areas; measure distance and area; GPX, KML and GeoJSON import and export.
- Track recording, back-to-truck distance and bearing, boundary alerts for parcels you have permission on.
- Offline: download imagery, topo, land, terrain and layer data for any area.

## Install on an iPhone

Live copy: **https://shawlerheath-oss.github.io/fenceline-az/** (GitHub Pages, rebuilt on every push to `main`). The app has to be served over HTTPS for GPS, the service worker and offline storage to work.

1. Open that URL in Safari on the iPhone.
2. Tap Share, then **Add to Home Screen**, then **Add**.
3. Open Fenceline from the Home Screen. Allow Location when asked (choose "While Using" and turn on Precise Location).
4. Before heading out: More → Offline maps, zoom to your unit, download.

### Test on the same Wi-Fi without hosting

From this folder on the PC: `python -m http.server 8793`, then on the phone open `http://<pc-ip>:8793`. GPS does not work over plain http on a non-localhost address, so this is only for a look at the map.

## Updating

The app caches itself for offline use. After new files are uploaded to the host, the next launch loads the old copy and refreshes the cache in the background; the launch after that shows the new version. A toast says "Update ready" when a new service worker is installed.

## iOS limits to know

- GPS stops when the screen locks. The app keeps the screen awake while tracking or following; carry a battery.
- No push notifications. Alerts are on-screen and audible while the app is open.
- The app's storage is tied to the Home Screen icon. Deleting the icon deletes markup and downloads; export GPX regularly.
- Safari can evict data from web apps not opened for a long time. Open the app every few weeks.

## Data sources

All data comes directly from public servers; nothing is proxied or stored by anyone else.

- Imagery: Esri World Imagery. Topo, imagery, hydrography, shaded relief: USGS The National Map.
- Land ownership: BLM Surface Management Agency (national cached tiles; Arizona polygons with owner and access).
- Game units, wildlife areas, water projects, statewide ownership: Arizona Game and Fish Department (ArcGIS Online).
- State Trust parcels: Arizona State Land Department.
- Parcels: county assessors via Arizona Department of Water Resources; Maricopa County Assessor; Pima County; Coconino County.
- MVUM roads, trails, wilderness, forest boundaries: USDA Forest Service EDW. BLM Arizona wilderness and recreation sites.
- Fire perimeters: NIFC / WFIGS.
- Elevation: Mapzen Terrarium tiles on AWS (USGS 3DEP, SRTM).
- Weather: Open-Meteo (CC BY 4.0). Place search: OpenStreetMap Nominatim.
- Map engine: MapLibre GL JS 4.7.1 (BSD-3), vendored in `vendor/`.

## Project layout

```
index.html            app shell
manifest.webmanifest  PWA manifest
sw.js                 service worker: app shell, tile and data caching
css/app.css           styles
js/app.js             bootstrap and orchestration
js/config.js          Arizona bounds, tile templates, every GIS endpoint
js/layers.js          layer registry and loading engine
js/panels.js          sheet panels          js/editors.js   editors and dialogs
js/markup.js          waypoints/lines/areas js/tracking.js  GPS and tracks
js/tools.js           measure, scent, boundary guard, identify
js/weather.js         Open-Meteo and wind logic        js/sun.js  sun, legal light, moon
js/terrain.js         elevation, slope and aspect tiles js/offline.js  area downloads
js/species.js         species presets        js/features.js  competitor feature coverage
js/units.js           GMU helpers            js/basemaps.js  basemaps
js/arcgis.js          ArcGIS REST client     js/store.js     IndexedDB
js/util.js            geometry and formatting js/ui.js      sheet, card, modal, toast
```

Nothing to build. Edit a file, reload.

## Disclaimer

Boundaries, ownership and unit lines are informational. Confirm on the ground and in the current Arizona hunting regulations. Water layers do not say whether a tank holds water today.
