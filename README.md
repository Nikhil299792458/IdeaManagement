# Idea Execution Console

Idea Execution Console is a vanilla HTML, CSS, and JavaScript research workflow app built to turn scattered ideas into finished work.

The same codebase now supports both:

- a normal static website that can run from `index.html` or GitHub Pages
- an Android app shell powered by Capacitor

The app keeps its core behavior unchanged:

- browser `localStorage` persistence
- JSON export and import
- optional GitHub gist sync
- dark mode
- Dashboard, Idea Garden, Current Work, Urgent Work, Time Blocking, Paper Tracker, and Weekly Review

## Project structure

Main web files:

- `index.html`
- `style.css`
- `app.js`
- `README.md`

Android packaging files:

- `package.json`
- `capacitor.config.json`
- `android-bridge.js`
- `scripts/copy-www.mjs`
- `scripts/android-prepare.mjs`
- `scripts/patch-android.mjs`
- `vendor/capacitor/capacitor.js`
- `www/`
- `android/`

## How it works

The original web app remains the source of truth.

- The website still runs as a plain static app.
- Capacitor copies the static files into `www/`.
- Capacitor then bundles `www/` into the native Android project.
- The Android app loads the local bundled web files inside a native WebView.

## Web usage

### Run locally

You can still use the project exactly like a normal website.

1. Open `index.html` directly in a modern browser.
2. For a smoother local preview, start a tiny local server:

```bash
python -m http.server 4173
```

3. Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/).

### Deploy on GitHub Pages

1. Push the project to a GitHub repository.
2. Open `Settings -> Pages`.
3. Set:
   - `Source`: `Deploy from a branch`
   - `Branch`: your main branch
   - `Folder`: `/ (root)`
4. Save.

Because the site is still fully static, GitHub Pages can host it without any backend or build pipeline.

## Android usage

### Install dependencies

```bash
npm install
```

### Prepare the Android app

This copies the static web files into `www/`, creates the Android platform if needed, syncs Capacitor, and patches the Android manifest.

```bash
npm run android:prepare
```

### Open in Android Studio

```bash
npm run android:open
```

### Run directly from the command line

If your Android SDK, Java, and a device are already configured:

```bash
npm run android:run
```

### Equivalent manual Capacitor flow

You can also use the underlying Capacitor commands directly:

```bash
npm install
npm run copy:www
npx cap add android
npx cap sync android
npx cap open android
```

Or:

```bash
npx cap run android
```

## Real Android phone setup

1. Install Android Studio.
2. Install the Android SDK and platform tools from Android Studio.
3. Make sure a Java runtime is available for Gradle.
4. Enable Developer Options on your Android phone.
5. Enable USB debugging.
6. Connect the phone with USB.
7. Accept the RSA debugging prompt on the phone.
8. Verify the phone is visible:

```bash
adb devices
```

9. Open the Android project:

```bash
npx cap open android
```

10. In Android Studio, choose the connected phone as the target device.
11. Click `Run`.
12. Confirm the app installs and opens.

## Android-specific behavior

### Bundled local app

The Android app loads the bundled local files from `www/`. It does not depend on an external URL.

### Internet access

`INTERNET` permission is enabled in `AndroidManifest.xml` so GitHub gist sync can make network requests.

### localStorage

The Android app keeps using the same localStorage keys:

- `idea-execution-console-data-v1`
- `idea-execution-console-theme`
- `idea-execution-console-github-sync-v1`

Inside the Android WebView, those values persist per installed app.

### JSON export and import on Android

- On the website, `Export JSON` still uses a browser download.
- On Android, `Export JSON` uses Capacitor native sharing. The app writes a temporary JSON file and opens the Android share sheet so you can save it to Drive, Files, email, or another app.
- `Import JSON` continues to use the file input and system picker.

If a particular Android device blocks file import/export behavior, GitHub gist sync remains the most reliable fallback for moving data between devices.

### Back button behavior

The app now keeps internal tab navigation in browser history.

- If you moved between app sections, Android back goes back through those sections first.
- If you are already at the default view, the app asks for confirmation before exiting.
- If an input is focused, the handler first blurs the field instead of exiting immediately.

## Available npm scripts

- `npm run copy:www`
  Copies the web app and Capacitor runtime into `www/`.

- `npm run android:prepare`
  Copies files into `www/`, adds Android if missing, runs `cap sync`, and patches the manifest.

- `npm run android:sync`
  Rebuilds `www/` and runs `cap sync android`.

- `npm run android:open`
  Prepares the project and opens Android Studio.

- `npm run android:run`
  Prepares the project and runs on a connected Android device or emulator.

## Backup and restore

Use the in-app controls:

- `Export JSON`
- `Import JSON`
- `Reset demo data`
- `Save to GitHub`
- `Load from GitHub`

Recommended cross-device workflows:

1. Export JSON on one device and import it on another.
2. Or use GitHub gist sync so both devices can read and write the same backup JSON.

## GitHub gist sync

Because this project is static, it does not write directly to your Git repository as app data changes.

Instead, GitHub sync stores your live app data in a secret gist JSON file.

Setup:

1. Create a fine-grained personal access token in GitHub.
2. Grant `Gists` permission with write access.
3. Paste the token into the app.
4. Leave `Gist ID` blank the first time and click `Save to GitHub`.
5. The app creates a secret gist containing `idea-execution-console-data.json`.
6. Use that token and gist ID on another device to load the same data.

## Testing checklist

What was prepared and verified here:

- Capacitor dependencies installed
- `www/` generation working
- Android platform added
- `cap sync android` completed
- Android manifest patched for `INTERNET` and `adjustResize`
- Static website regression-checked after Android integration
- Tab navigation now updates history and supports back navigation
- Web export still works
- No new console/runtime errors found in the local smoke checks

What is still environment-dependent:

- full Gradle build
- APK installation on a physical phone
- `adb devices`
- Android Studio launch

Those steps require a local Java runtime, Android SDK, and a connected device on your machine.

## Exact commands to run

From the project root:

```bash
npm install
npm run android:prepare
npx cap open android
```

If you prefer command-line install/run:

```bash
npm install
npm run android:prepare
npx cap run android
```

## Troubleshooting

### Device not detected

Symptoms:

- `adb devices` shows no device
- Android Studio does not list your phone

Fix:

1. Reconnect the USB cable.
2. Change USB mode to file transfer if needed.
3. Re-enable USB debugging.
4. Accept the RSA prompt on the phone.
5. Run:

```bash
adb kill-server
adb start-server
adb devices
```

6. Install OEM USB drivers on Windows if your phone still does not appear.

### Gradle build failure

Symptoms:

- `assembleDebug` or Android Studio build fails immediately

Common fixes:

1. Install Android Studio.
2. Install a JDK and set `JAVA_HOME`.
3. Install the Android SDK and required platform/build tools.
4. Open the project in Android Studio once so Gradle can finish setup.

Example Windows check:

```bash
java -version
echo %JAVA_HOME%
```

### White screen on app launch

Check:

1. Run `npm run android:prepare` again.
2. Confirm `android/app/src/main/assets/public/index.html` exists.
3. Confirm `android/app/src/main/assets/public/vendor/capacitor/capacitor.js` exists.
4. Rebuild and reinstall the app.

If you still see a white screen:

- inspect Logcat in Android Studio
- confirm there are no script path mistakes in `index.html`
- confirm the app is loading bundled assets and not an external URL

### localStorage not persisting

Check:

1. Make sure you are reopening the same installed app, not a different debug package.
2. Avoid clearing app storage from Android settings.
3. Confirm the WebView is not being recreated with a different package identity.

If data still matters, use:

- `Export JSON`
- GitHub gist sync

### GitHub sync network failure

Check:

1. Confirm internet access on the phone.
2. Confirm the token is valid.
3. Confirm the token has `Gists` write permission.
4. Confirm the gist ID is correct.
5. Confirm GitHub is reachable over HTTPS.

If save/load still fails:

- clear GitHub settings in the app
- re-enter the token
- create a fresh gist by leaving `Gist ID` blank and clicking `Save to GitHub`

### File export/import issues

Web:

- Export should download a `.json` file directly.
- Import uses the browser file picker.

Android:

- Export opens the Android share sheet instead of forcing a browser download.
- Import uses the system file picker through the `<input type="file">` flow.

If Android file handling is unreliable on a specific device:

- use GitHub gist sync
- or export to a cloud app through the share sheet and import from there later

## localStorage limitations

- Data is stored per browser or per installed app instance
- Clearing storage can erase it
- Different browsers do not automatically share it
- Different Android apps or build variants do not automatically share it
- localStorage is not a multi-user or collaborative database

## App philosophy

- Active work should be limited to 3 items
- New ideas should first go to the Idea Garden
- Time blocks should connect to active work
- Papers should remain the primary output layer

The system is intentionally biased toward execution, not unlimited collection.
# IdeaManagement
