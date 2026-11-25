# Fenceline on an iPhone as a real app

Fenceline also ships as a native iOS app: the same web files wrapped in a WKWebView by Capacitor, plus two native
plugins that keep GPS running with the screen locked. Every push to `main` builds `Fenceline.ipa` on GitHub Actions
(`.github/workflows/ios.yml`), and every `v*` tag attaches it to a GitHub Release.

The IPA is **unsigned**. Apple does not let an iPhone install an app that nobody signed, so the last step always
happens on your PC: a sideloading tool signs the IPA with an Apple ID and pushes it to the phone over USB or Wi-Fi.
No Mac is needed at any point.

What you get over the Home Screen web app:

- GPS keeps running while the screen is locked (track recording, Follow, boundary alerts).
- One native Location prompt instead of Safari's, and the app shows up under Settings → Privacy → Location.
- A real app icon, portrait lock, no Safari storage eviction.
- Map tiles and layer data saved from Offline maps work exactly as before (the app reads the same caches).

## 1. Download `Fenceline.ipa`

- Latest release: https://github.com/shawlerheath-oss/fenceline-az/releases/latest → Assets → `Fenceline.ipa`.
- Latest build from `main` (no release needed): https://github.com/shawlerheath-oss/fenceline-az/actions/workflows/ios.yml
  → open the newest green run → Artifacts → `Fenceline-ipa` (a zip holding the IPA; unzip it).

## 2. Install from Windows with a free Apple ID

A free Apple ID can sign apps for 7 days at a time, for up to 3 apps on the phone. Two tools do this well from Windows.

### Option A: Sideloadly (one-off install, refresh by hand)

1. Install iTunes from apple.com (not the Microsoft Store version) so Windows gets the Apple USB driver, then
   https://sideloadly.io → Download → install.
2. Plug the iPhone into the PC with a cable. On the phone tap **Trust This Computer** and enter the passcode.
3. Open Sideloadly, drag `Fenceline.ipa` onto the IPA box, type your Apple ID in **Apple account**, click **Start**,
   enter the Apple ID password when asked (Sideloadly sends it straight to Apple to get a signing certificate; use an
   app-specific password from https://account.apple.com if the account has two-factor turned on and the login fails).
4. On the phone: Settings → General → **VPN & Device Management** → tap your Apple ID under Developer App → **Trust**.
5. Open Fenceline. Allow Location ("While Using" with Precise Location on). The first time a track is recorded iOS will
   later ask whether to allow **Always**; either answer works, tracking continues with the screen locked on "While Using"
   as long as the recording started with the app open.

After 7 days the icon still shows but the app will not open. Plug in and click **Start** again in Sideloadly (it keeps
the settings); data on the phone is kept, the app is only re-signed. Sideloadly's **Wi-Fi** option under Advanced
re-signs over the network once the phone has been paired by cable.

### Option B: AltStore (refreshes itself over Wi-Fi)

1. Install iTunes and iCloud from apple.com (again not the Store versions), then https://altstore.io → AltServer for
   Windows → install and run it. It lives in the system tray.
2. Plug the phone in once. Tray icon → **Install AltStore** → pick the phone → sign in with the Apple ID.
3. On the phone trust the developer profile as in Option A, step 4, then open AltStore.
4. Copy `Fenceline.ipa` to the phone (AirDrop is not available from Windows; use iCloud Drive, the Files app over USB
   in iTunes, or open the GitHub release page in Safari and tap the IPA, then "Open in AltStore").
   In AltStore: **My Apps** → **+** → pick `Fenceline.ipa`.
5. Leave AltServer running on the PC. When the phone and PC are on the same Wi-Fi, AltStore re-signs its apps in the
   background before the 7 days run out, so Fenceline keeps opening. If the PC was off for more than a week, open
   AltStore on the phone while on the same Wi-Fi and tap **Refresh All**.

Either way, keep exporting GPX from Markup now and then: reinstalling with a different Apple ID gives the app a fresh
container and the old markup is gone.

## 3. If you buy an Apple Developer account later ($99/year)

With a paid account the 7-day limit disappears and installs can happen from Safari without the PC.

### Ad hoc, over the air (1-year profile, up to 100 devices)

1. In https://developer.apple.com/account → Certificates, Identifiers & Profiles:
   - Devices → **+** → register the iPhone's UDID (Finder/iTunes shows it when you click the serial number; or on the
     phone, Settings → General → About, tap through to the UDID, or read it in Sideloadly's device panel).
   - Identifiers → **+** → App ID `com.fenceline.app`, capability list can stay default.
   - Certificates → **+** → **Apple Distribution** (create the CSR on Windows with `openssl req -new -newkey rsa:2048
     -nodes -keyout fenceline.key -out fenceline.csr`), download the `.cer`, and bundle it with the key into a `.p12`:
     `openssl pkcs12 -export -inkey fenceline.key -in distribution.cer -out fenceline.p12` (convert the `.cer` with
     `openssl x509 -inform der -in distribution.cer -out distribution.pem` first).
   - Profiles → **+** → **Ad Hoc** → select the App ID, certificate and the device → download `Fenceline_adhoc.mobileprovision`.
2. Add the `.p12` (base64), its password and the profile (base64) as repository secrets, and extend the workflow so the
   archive step signs: replace the three `CODE_SIGN…` overrides with `CODE_SIGN_STYLE=Manual
   CODE_SIGN_IDENTITY="Apple Distribution" PROVISIONING_PROFILE_SPECIFIER="Fenceline_adhoc" DEVELOPMENT_TEAM=<team id>`
   after importing the certificate into a temporary keychain (`security import`), then run
   `xcodebuild -exportArchive -exportOptionsPlist` with `method: ad-hoc` to get a signed IPA.
3. Host three files on GitHub Pages (this repo's `main` branch is the site):
   - `ios/Fenceline.ipa` (the signed one),
   - `ios/manifest.plist` with `software-package` pointing at the IPA URL, `bundle-identifier` `com.fenceline.app`,
     `bundle-version` and `title` `Fenceline`,
   - `ios/index.html` with a link `itms-services://?action=download-manifest&url=https://shawlerheath-oss.github.io/fenceline-az/ios/manifest.plist`.
   Open that page in Safari on the phone and tap Install. Profiles last one year; a new build needs only the IPA and
   `bundle-version` updated.

### TestFlight (simplest once the account exists)

Create the app record in App Store Connect, change the workflow's export method to `app-store` and add an
`xcrun altool --upload-app` (or `xcrun notarytool`-free `altool` with an App Store Connect API key) step, then install
TestFlight on the phone and accept the internal-tester invite. Builds last 90 days each and update in place.

## How the native app differs under the hood

- `capacitor.config.json` points Capacitor at `dist/`, which `npm run build:web` fills with a copy of the web files.
  The PWA at the repo root is untouched and GitHub Pages still serves it.
- `js/native.js` detects the Capacitor bridge; `js/geo.js` swaps `navigator.geolocation` for the
  `@capacitor/geolocation` and `@capacitor-community/background-geolocation` plugins; `js/tile-cache.js` replaces the
  service worker's tile interception (WKWebView runs no service worker on `capacitor://localhost`) with a MapLibre
  protocol that reads the `fl-offline-v1` and `fl-runtime-v1` caches first.
- `ios/App/App/Info.plist` holds the Location, Camera, Photos and Motion usage strings, `UIBackgroundModes: location`,
  the portrait lock and the light status bar.

Build it locally on a Mac with `npm ci && npm run ios:sync && npm run ios:open`.
