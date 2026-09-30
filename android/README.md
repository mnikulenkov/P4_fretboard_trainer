# Fretboard Trainer — Android app

A standalone, fully offline Android packaging of the guitar fretboard trainer web app.
The web app is bundled as WebView assets; nothing is fetched from the network and the
APK requests **no permissions at all** (not even INTERNET) — the OS guarantees the app
cannot make a network connection.

Runs on any Android 5.0+ phone with a system WebView, including Huawei devices without
Google Play Services.

## Layout

```
android/
├── app/src/main/assets/www/   ← the web app (13 files, copied from the repo root)
├── app/src/main/java/...      ← MainActivity: WebView shell + local asset serving
├── tools/make_icons.py        ← regenerates the launcher PNGs (needs Pillow)
├── release.keystore           ← release signing key (GITIGNORED — back it up!)
└── keystore.properties        ← its passwords       (GITIGNORED — back it up!)
```

The web app is served from the virtual origin `https://appassets.androidplatform.net/`
(not `file://`) because its score, practice settings, and answer logs are stored in
`document.cookie`, which needs a real secure origin to work inside a WebView.

## Prerequisites (all under `~/android-tools`, nothing system-wide)

- JDK 17 → `~/android-tools/jdk-17`
- Android SDK → `~/android-tools/android-sdk` (platform-tools, platforms;android-35, build-tools;35.0.0)
- Gradle 8.14.3 → `~/android-tools/gradle` (only needed to regenerate the wrapper)

If these are missing, reinstall with the standard Temurin JDK 17 tarball, the Android
command-line tools (`commandlinetools-linux-*_latest.zip`, unzipped to
`android-sdk/cmdline-tools/latest`), `sdkmanager "platform-tools" "platforms;android-35"
"build-tools;35.0.0"`, and the Gradle 8.14.3 zip. `local.properties` and
`gradle.properties` already point at these paths.

## Building

```bash
cd android
JAVA_HOME=$HOME/android-tools/jdk-17 ./gradlew assembleDebug assembleRelease
```

- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Release APK (signed with `release.keystore`): `app/build/outputs/apk/release/app-release.apk`

The **release** APK is the one to install on a phone. First build downloads the Android
Gradle Plugin dependencies (build-time only — the app itself has zero dependencies).

To regenerate the launcher icons after changing the motif:
`python3 tools/make_icons.py` (and edit `res/drawable/ic_launcher_foreground.xml` to match).

## Installing on a Huawei phone

1. Copy `app-release.apk` to the phone (USB cable, Bluetooth, cloud drive…).
2. Open it from the Files app. EMUI/HarmonyOS asks to allow installs from that source
   (Settings → Security → More settings → Install apps from external sources, or just
   confirm the on-screen prompt) — allow it once.
3. Install. No Google services are needed or used.

**Compatibility note:** works on EMUI and HarmonyOS 2.x–4.x (Android-based). Phones
running **HarmonyOS NEXT (5.x and later) do not run Android APKs at all.**

For debugging on-device: debug builds expose the WebView via USB — `adb` from
`~/android-tools/android-sdk/platform-tools`, then inspect at `chrome://inspect`.

## Updating the app after web-app changes

```bash
cp ../index.html ../styles.css ../tuning.js ../fretboard.js ../circleOfFifths.js \
   ../sound.js ../triads.js ../sequences.js ../mnemonics.js ../intervals.js \
   ../chords.js ../handbook.js ../app.js \
   app/src/main/assets/www/
```

(`getTriadShape.js` and `server.js` are not referenced by `index.html` and are not
packaged.) Then rebuild. Bump `versionCode`/`versionName` in `app/build.gradle` and
install over the existing app — updates must be signed with the same keystore.

## User data

Score, settings, and logs live in the app's WebView cookies/localStorage (app-private
storage). They survive restarts and app updates, and are removed by uninstalling or
"Clear data". The in-app reset button clears the score.

Known upstream quirk: the answer-log cookies (`noteLog`/`chordLog`) grow as JSON and
silently stop updating at the browser's ~4 KB per-cookie cap; scores and settings are
unaffected.
