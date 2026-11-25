// Guards for the pieces the native build depends on: the copy step, the Capacitor config, the Xcode project and the
// service worker's shell list, so a renamed file or a dropped Info.plist key fails here before it fails on the phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildWeb, WEB_FILES, WEB_DIRS } from '../scripts/build-web.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('build-web copies the whole app shell into the Capacitor webDir', () => {
  const out = mkdtempSync(join(tmpdir(), 'fenceline-dist-'));
  try {
    buildWeb(ROOT, out);
    for (const f of WEB_FILES) assert.ok(existsSync(join(out, f)), f);
    for (const d of WEB_DIRS) assert.ok(existsSync(join(out, d)), d);
    assert.ok(existsSync(join(out, 'js', 'app.js')));
    assert.ok(existsSync(join(out, 'vendor', 'maplibre-gl.js')));
    assert.ok(existsSync(join(out, 'vendor', 'capacitor-core.js')), 'the vendored Capacitor core ships with the app');
    assert.ok(!existsSync(join(out, 'node_modules')));
    assert.ok(!existsSync(join(out, 'ios')));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('every file the service worker precaches exists, including the native shell modules', () => {
  const sw = read('sw.js');
  const list = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const files = [...list.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((f) => f !== '');
  assert.ok(files.length > 20);
  for (const f of files) assert.ok(existsSync(join(ROOT, f)), `missing ${f}`);
  for (const f of ['js/native.js', 'js/tile-cache.js', 'js/geo.js']) assert.ok(files.includes(f), `${f} not in SHELL`);
  assert.ok(!files.includes('vendor/capacitor-core.js'), 'Capacitor core is only loaded inside the app');
});

test('capacitor.config.json names the app and the copied webDir', () => {
  const cfg = JSON.parse(read('capacitor.config.json'));
  assert.equal(cfg.appName, 'Fenceline');
  assert.equal(cfg.appId, 'com.fenceline.app');
  assert.equal(cfg.webDir, 'dist');
  assert.equal(cfg.ios.backgroundColor, '#10140e');
  assert.equal(cfg.ios.contentInset, 'never');
});

test('Info.plist carries the location strings, background mode and portrait lock', () => {
  const plist = read('ios/App/App/Info.plist');
  for (const key of ['NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSMotionUsageDescription']) {
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>[^<]{10,}</string>`), key);
  }
  assert.match(plist, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>location<\/string>\s*<\/array>/);
  assert.match(plist, /<key>UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
  assert.match(plist, /<key>UIStatusBarStyle<\/key>\s*<string>UIStatusBarStyleLightContent<\/string>/);
  assert.match(plist, /<key>CFBundleDisplayName<\/key>\s*<string>Fenceline<\/string>/);
});

test('the Xcode project builds Fenceline.app for iPhone with the package version', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pbx.includes('PRODUCT_NAME = Fenceline;'));
  assert.ok(pbx.includes('PRODUCT_BUNDLE_IDENTIFIER = com.fenceline.app;'));
  assert.ok(pbx.includes(`MARKETING_VERSION = ${pkg.version};`), `pbxproj marketing version should be ${pkg.version}`);
  assert.ok(pbx.includes('TARGETED_DEVICE_FAMILY = 1;'));
  assert.ok(existsSync(join(ROOT, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme')));
  assert.ok(existsSync(join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')));
  const swift = read('ios/App/CapApp-SPM/Package.swift');
  assert.ok(swift.includes('CapacitorGeolocation'));
  assert.ok(swift.includes('CapacitorCommunityBackgroundGeolocation'));
});

test('the app version is the same everywhere', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(read('js/config.js').includes(`APP_VERSION = '${pkg.version}'`), `config.js should carry APP_VERSION ${pkg.version}`);
});
