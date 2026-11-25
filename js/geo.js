// One position source for both shells.
// Safari: navigator.geolocation, which iOS pauses when the screen locks.
// App: the BackgroundGeolocation watcher keeps GPS running with the screen locked (UIBackgroundModes location), and
// the Geolocation plugin answers one-shot fixes without WebKit's second permission prompt.
import { isNative, hasPlugin, plugin } from './native.js';

export const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 };
export const LOCATE_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };
// backgroundMessage is what turns background delivery on (its text is only shown on Android).
export const WATCHER_OPTIONS = { backgroundMessage: 'Fenceline is recording your track.', backgroundTitle: 'Fenceline', requestPermissions: true, stale: false, distanceFilter: 0 };

// BackgroundGeolocation Location -> the GeolocationPosition shape the rest of the app reads.
export function toPosition(loc) {
  return {
    coords: {
      latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy,
      altitude: loc.altitude ?? null, altitudeAccuracy: loc.altitudeAccuracy ?? null,
      heading: loc.bearing ?? null, speed: loc.speed ?? null
    },
    timestamp: loc.time || Date.now()
  };
}

// Plugin errors carry string codes; the UI knows GeolocationPositionError codes (1 denied, 2 unavailable).
export function toGeoError(err) {
  const message = (err && err.message) || 'GPS error';
  const denied = !!err && (err.code === 'NOT_AUTHORIZED' || err.code === 1 || /denied|not authori[sz]ed/i.test(message));
  const e = new Error(message);
  e.code = denied ? 1 : 2;
  return e;
}

const web = {
  get available() { return typeof navigator !== 'undefined' && !!navigator.geolocation; },
  watch(onPos, onErr) {
    const id = navigator.geolocation.watchPosition(onPos, onErr, WATCH_OPTIONS);
    return { stop: () => navigator.geolocation.clearWatch(id) };
  },
  current() { return new Promise((ok, bad) => navigator.geolocation.getCurrentPosition(ok, bad, LOCATE_OPTIONS)); }
};

const native = {
  get available() { return hasPlugin('BackgroundGeolocation') || hasPlugin('Geolocation') || web.available; },
  watch(onPos, onErr) {
    if (!hasPlugin('BackgroundGeolocation')) return web.watch(onPos, onErr);
    let stopped = false; let id = null; let bg = null;
    plugin('BackgroundGeolocation').then(async (BG) => {
      bg = BG;
      const wid = await BG.addWatcher(WATCHER_OPTIONS, (loc, err) => {
        if (stopped) return;
        if (err) onErr(toGeoError(err)); else if (loc) onPos(toPosition(loc));
      });
      if (stopped) BG.removeWatcher({ id: wid }).catch(() => {}); else id = wid;
    }).catch((e) => { if (!stopped) onErr(toGeoError(e)); });
    return {
      stop() { stopped = true; if (bg && id != null) bg.removeWatcher({ id }).catch(() => {}); id = null; }
    };
  },
  async current() {
    if (!hasPlugin('Geolocation')) return web.current();
    const Geolocation = await plugin('Geolocation');
    try { return await Geolocation.getCurrentPosition(LOCATE_OPTIONS); } catch (e) { throw toGeoError(e); }
  }
};

const source = () => (isNative() ? native : web);
export const geo = {
  get available() { return source().available; },
  watch: (onPos, onErr) => source().watch(onPos, onErr),
  current: () => source().current()
};
