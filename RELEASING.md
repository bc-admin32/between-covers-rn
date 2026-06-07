# Releasing

This is a managed Expo (SDK 53) app, live on **iOS (App Store)**, **Android
(Google Play)**, and **Amazon Appstore**.

## Two version numbers — know the difference

| Number | Where | Who bumps it |
|---|---|---|
| **Marketing version** — `expo.version` in `app.json` (→ `CFBundleShortVersionString` / `versionName`) | `app.json` | **You**, deliberately, via the commands below |
| **Build number** — `buildNumber` / `versionCode` | EAS (remote) | **Automatic** — `eas.json` has `appVersionSource: "remote"` + `autoIncrement: true` on the production profiles |

> ⚠️ **For a live app you MUST bump the marketing version before building iOS.**
> `expo.version` is compiled into the binary. If you ship a build whose
> `expo.version` equals an already-approved version, App Store Connect rejects
> the upload (error **90062 / 90186** — "train 1.0 is closed" / "must be higher
> than previously approved version 1.0.0"). Auto-incrementing the *build number*
> does **not** satisfy this — the *marketing version* must increase.

## Release flow

1. **Bump the marketing version** (pick one — default is minor):
   ```bash
   npm run release:patch   # 1.0.0 → 1.0.1   (bug-fix build)
   npm run release:minor   # 1.0.0 → 1.1.0   (features)
   npm run release:major   # 1.0.0 → 2.0.0   (big release)
   # or an explicit version:
   node scripts/bump-version.js 1.4.0
   ```
   This edits only `expo.version` in `app.json` (never the build number) and
   prints the next steps.

2. **Commit** the bump:
   ```bash
   git add app.json && git commit -m "chore(release): vX.Y.Z"
   ```

3. **Build** per platform (the `EXPO_NO_CAPABILITY_SYNC=1` env is already set in
   each production profile in `eas.json`; setting it inline too is harmless):
   ```bash
   EXPO_NO_CAPABILITY_SYNC=1 eas build --profile production-ios     --platform ios
   EXPO_NO_CAPABILITY_SYNC=1 eas build --profile production-google  --platform android
   EXPO_NO_CAPABILITY_SYNC=1 eas build --profile production-amazon  --platform android
   ```
   The build number auto-increments remotely — do not touch it.

4. **Submit:**
   - iOS / Google Play: `eas submit --profile production --platform <ios|android>`
   - Amazon Appstore: upload the APK manually.

## OTA vs. native build

- **OTA-eligible** (EAS Update, no new binary): JS-only changes.
- **Requires a native build** (and therefore a marketing-version bump if the app
  is live): anything touching `app.json` native config / config plugins / native
  deps — e.g. the FCM `google-services.json` wiring, the ADM `api_key.txt`
  plugin, adaptive icon, or new native modules.

## Notes

- The version bump is a **single deliberate command**, not a per-build
  auto-bump, so the version number stays meaningful.
- `package.json` also has a `"version"` field — that's the npm package version
  and is unrelated to the app's store version; the script does not touch it.
