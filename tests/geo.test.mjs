import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPosition, toGeoError, geo, WATCHER_OPTIONS } from '../js/geo.js';
import { isNative, hasPlugin, plugin, nativePlatform } from '../js/native.js';
import { installNativeBridge } from './helpers.mjs';

test('outside the app nothing is native and no plugin resolves', async () => {
  assert.equal(isNative(), false);
  assert.equal(nativePlatform(), 'web');
  assert.equal(hasPlugin('Geolocation'), false);
  assert.equal(await plugin('Geolocation'), null);
});

test('the injected bridge marks the app as native and lists compiled-in plugins', () => {
  const uninstall = installNativeBridge(['Geolocation']);
  try {
    assert.equal(isNative(), true);
    assert.equal(nativePlatform(), 'ios');
    assert.equal(hasPlugin('Geolocation'), true);
    assert.equal(hasPlugin('BackgroundGeolocation'), false);
  } finally { uninstall(); }
});

test('a BackgroundGeolocation location maps onto the GeolocationPosition shape', () => {
  const p = toPosition({ latitude: 34.3, longitude: -111.66, accuracy: 5, altitude: 1500, altitudeAccuracy: 3, bearing: 270, speed: 1.2, simulated: false, time: 1700000000000 });
  assert.equal(p.coords.latitude, 34.3);
  assert.equal(p.coords.longitude, -111.66);
  assert.equal(p.coords.heading, 270);
  assert.equal(p.coords.speed, 1.2);
  assert.equal(p.coords.altitude, 1500);
  assert.equal(p.timestamp, 1700000000000);
});

test('missing optional fields become null and a missing time becomes now', () => {
  const before = Date.now();
  const p = toPosition({ latitude: 1, longitude: 2, accuracy: 10 });
  assert.equal(p.coords.altitude, null);
  assert.equal(p.coords.heading, null);
  assert.equal(p.coords.speed, null);
  assert.ok(p.timestamp >= before);
});

test('plugin errors become GeolocationPositionError-style codes', () => {
  assert.equal(toGeoError({ code: 'NOT_AUTHORIZED', message: 'Permission denied.' }).code, 1);
  assert.equal(toGeoError({ message: 'User denied location permission' }).code, 1);
  assert.equal(toGeoError({ message: 'Location services are not enabled' }).code, 2);
  assert.equal(toGeoError(undefined).code, 2);
  assert.equal(toGeoError({ message: 'x' }).message, 'x');
});

test('background delivery is requested by the watcher options', () => {
  assert.ok(WATCHER_OPTIONS.backgroundMessage, 'backgroundMessage switches on background updates');
  assert.equal(WATCHER_OPTIONS.requestPermissions, true);
  assert.equal(WATCHER_OPTIONS.stale, false);
});

test('on the web the source is navigator.geolocation', async () => {
  const cleared = [];
  // Node ships its own navigator global; swap it for a fake geolocation for the length of this test.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        watchPosition: (ok) => { ok({ coords: { latitude: 1, longitude: 2 }, timestamp: 3 }); return 42; },
        clearWatch: (id) => cleared.push(id),
        getCurrentPosition: (ok) => ok({ coords: { latitude: 5, longitude: 6 }, timestamp: 7 })
      }
    }
  });
  try {
    assert.equal(geo.available, true);
    const got = [];
    const h = geo.watch((p) => got.push(p), () => {});
    h.stop();
    assert.deepEqual(cleared, [42]);
    assert.equal(got[0].coords.latitude, 1);
    assert.equal((await geo.current()).coords.latitude, 5);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  }
});
