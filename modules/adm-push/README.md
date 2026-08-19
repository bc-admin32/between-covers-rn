# adm-push

Local Expo module bridging Amazon Device Messaging (ADM) registration to JS for
Fire OS. Backs the `amazon` branch in `lib/pushNotifications.ts`.

## ADM SDK jar

`amazon-device-messaging.jar` (v1.2.0, from the Amazon Developer console
download for package `com.betweencovers.app`) is committed at
`modules/adm-push/android/libs/amazon-device-messaging.jar`, matching the
`adm/api_key.txt` commit convention (see `adm/README.md`).
`android/build.gradle` references it via
`amazonImplementation files('libs/amazon-device-messaging.jar')` — scoped to
the `amazon` flavor only, so it never touches the Google Play build.

## Verified against Amazon's real sample source

The Kotlin here (`AdmPushBridge.kt`, `AdmMessageHandlerService.kt`,
`AdmMessageHandlerLegacy.kt`, `AdmMessageReceiver.kt`) and the manifest fragment
were cross-checked against the `ADMMessenger` example app bundled in the ADM
SDK download (`examples/ADMMessenger/`), not just Amazon's prose docs. That
example is the reason there are *two* handler classes:
`ADMMessageReceiver`'s constructor requires a legacy `ADMMessageHandlerBase`
class (`AdmMessageHandlerLegacy`) even though `registerJobServiceClass()`
routes actual registration/messages to the JobBase implementation
(`AdmMessageHandlerService`) on any device that supports it — passing the
JobBase class straight to `super()` (an earlier version of this file did) is
wrong per that sample. The manifest also needs Amazon's own
`<amazon:enable-feature>` tag (with the `amazon:` XML namespace) rather than
a generic `<uses-library>` tag — a separate mistake in an earlier version of
this file, also caught against the sample.

## Gradle plugin application (fixed)

`android/build.gradle` originally used an old-style manual plugin apply
(`apply from: new File(project(":expo-modules-core").projectDir.absolutePath,
"ExpoModulesCorePlugin.gradle")`, plus `applyKotlinExpoModulesCorePlugin()` /
`useCoreDependencies()` / `useExpoPublishing()`). That pattern doesn't exist in
this project's Expo SDK version — confirmed by checking every other installed
Expo module (`expo-device`, `expo-secure-store`, `expo-video`, `expo-image`,
`expo-notifications`), none of which use it. They all use the single-plugin
form instead:

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}
```

The old pattern caused the Amazon-flavor Windows build to fail during `:app`
configuration with "The filename, directory name, or volume label syntax is
incorrect" — `project(":expo-modules-core")` doesn't resolve the way that
line assumed under this SDK's module-inclusion mechanism (modules are pulled
in via `includeBuild` in `android/settings.gradle`, not as plain subprojects
at that path), and building a `File` from whatever it did resolve to threw a
raw Windows path error rather than a clean "project not found." Fixed to
match the verified-working pattern above.

## Publishing disabled (fixed)

`expo-module-gradle-plugin` (applied via the `plugins {}` block above)
unconditionally tries to set up Maven publishing for every module it's
applied to (`ExpoModulesGradlePlugin.kt` → `applyPublishing()` inside
`AndroidComponentsExtension.finalizeDsl`), which hardcodes a lookup of a
`SoftwareComponent` named exactly `"release"`
(`android/build/.../MavenPublicationExtension.kt` → `PublicationInfo`).
Declaring `flavorDimensions "appstore"` above means AGP produces
`amazonRelease` / `googlePlayRelease` components instead of a plain
`release` one, so that lookup threw `SoftwareComponent with name 'release'
not found` during `:app:assembleAmazonRelease` on EAS.

Fixed with the plugin's own supported opt-out —
`ExpoModuleExtension.canBePublished` (default `true`), checked first thing
inside `applyPublishing()` before the crashing lookup ever runs:

```gradle
expoModule {
  canBePublished = false
}
```

Correct here regardless of the crash: this is a `file:` local dependency,
never published to any registry, so the publishing setup this plugin exists
to provide isn't applicable in the first place. No other module in this repo
needs this flag because none of them declare product flavors — `adm-push` is
the first, so it's the first to hit this.

## Notification icon/color: compile-time resources, not a runtime lookup (fixed — needs device re-verification)

`AdmNotificationDisplay.kt` originally resolved its small icon and color at
runtime via `PackageManager.getApplicationInfo(GET_META_DATA)`, reading the
same `expo.modules.notifications.default_notification_icon` /
`..._color` manifest meta-data keys `ExpoNotificationBuilder.kt` (the FCM
path, in `expo-notifications`) reads — confirmed identical, both keys point
at `@drawable/notification_icon` / `@color/notification_icon_color` in the
shared main `AndroidManifest.xml`. On real Fire HD hardware this rendered
visibly differently (washed out, untinted) than the same push shown via FCM
on Google Play, despite the identical resource. Searched for a documented
Fire-OS-specific `PackageManager`/`ApplicationInfo.metaData` bug — found
nothing; the closest match was an unrelated Expo issue (location foreground
service icon) showing the same *symptom* (fallback-to-launcher-icon producing
a washed-out icon) from a metadata miss, not a Fire-OS-specific cause.

Since I couldn't pin down *why* the lookup diverges (no device/adb access to
add logging and actually watch it fire), fixed per the fallback plan: removed
the runtime lookup and its silent fallback entirely.
`modules/adm-push/android/src/amazon/res/` now carries its own copies of the
icon (all 5 densities, copied byte-for-byte from the app's already-generated,
confirmed-working-on-FCM `android/app/src/main/res/drawable-*/notification_icon.png`)
and color (`values/colors.xml`, `#B83255`, matching `app.json`'s
`notification.color`). `AdmNotificationDisplay.kt` references them as
`R.drawable.notification_icon` / `R.color.notification_icon_color` — this
module's own generated `R` class (namespace `expo.modules.admpush`), resolved
by the Kotlin compiler, not `PackageManager` at runtime. **Correction:** this
is *not* actually an independent copy in terms of packaged content — Android's
resource merge gives the app module's same-named resource precedence over a
library's, so only `assets/notification-icon.png` (the app's real source of
truth, regenerated into `android/app/src/main/res/` by expo-notifications'
config plugin at every prebuild) determines what's actually packaged; this
module's `src/amazon/res/` copy exists only so `R.drawable.notification_icon`
resolves to something at *this module's own* compile time. Confirmed via
`dexdump` on a real shipped APK that the compiled reference correctly patches
to the true final merged resource ID regardless (`aapt2 dump resources`
showed exactly one merged entry, not two) — so this was never a source of the
regression below, just a documentation inaccuracy worth fixing.

### Regression: icon went from washed-out-but-visible to not showing at all (fixed)

The compile-time-reference fix above shipped in `production-amazon` build 59
(commit `52bede3`) and regressed on real Fire HD hardware — worse than
before, not fixed. Root cause, confirmed against the actual shipped APK
(`aapt2 dump resources`, `dexdump` on the extracted `.dex`, and diffing
against the prior build's APK), not guessed:

1. `dexdump` showed `Lexpo/modules/admpush/R$drawable;.notification_icon`
   compiled to `2131231156` = `0x7f0801b4`, exactly matching the one merged
   `drawable/notification_icon` entry `aapt2 dump resources` reports — the
   compile-time reference was correctly wired all along.
2. Extracting the actual packaged icon file from the APK showed it's `8-bit
   gray+alpha`, not the `8-bit RGBA` the source file on disk is — AAPT2's PNG
   crunch (`crunchPngs`, on by default for release builds) losslessly
   converts a PNG to grayscale whenever every alpha-bearing pixel has exactly
   `R=G=B`, which — confirmed by manually decoding the PNG — was true for
   every one of this icon's 3725 alpha-bearing pixels.
3. Diffing that same packaged file against the *previous* build's APK (58,
   pre-fix) showed it byte-for-byte identical — the icon file itself never
   changed. So the regression isn't a content change at all: the old
   metadata-lookup code was almost certainly silently hitting its
   `context.applicationInfo.icon` fallback (the full-color launcher icon) the
   whole time on Fire OS, which is why *something* recognizable (if
   wrong-colored) showed before. The new code (per point 1) now correctly
   reaches the real, intended small icon for the first time — and Fire OS's
   notification renderer apparently doesn't display that specific gray+alpha
   PNG format the way stock Android/Google Play does (which has always used
   this same packaged file successfully).

**Fix:** rather than touch any build config (`cruncherEnabled`/`crunchPngs`
are module/variant-wide in this AGP version — no Gradle-DSL mechanism exists
to exempt a single named resource; confirmed via AOSP's own `aapt2 compile
--no-crunch` docs and the `androidResources`/`aaptOptions` DSL reference, and
via this module's own `compileAmazonReleaseLibraryResources` task existing
separately from `:app`'s resource step, which doesn't change that conclusion
since crunch eligibility is a property of the merged resource, not the
originating module), `assets/notification-icon.png` had every alpha-bearing
pixel's blue channel nudged by 1/255 (visually imperceptible — confirmed via
manual pixel diff, max channel delta 1 out of 255). That makes the
grayscale conversion lossy, so AAPT2's own documented safety check (it only
performs this optimization when it loses no information) skips it.
This module's own `src/amazon/res/` copies were updated to match, for
consistency, though per the correction above they aren't what's actually
packaged.

**Not yet confirmed on-device** — needs a real `production-amazon` build
tested on Fire HD hardware, same as last time.

## Still unverified

- The example app predates JobScheduler-only delivery and includes an
  `ADMHelper.IS_ADM_V2` runtime reflection check before calling
  `registerJobServiceClass()`, to support older/newer SDK jars in the same
  APK. This module skips that check and always registers the Job service,
  since exactly one jar version (1.2.0, which supports it) is bundled here —
  fine unless a future jar swap needs to support older Fire OS without
  JobScheduler.
- The `ADM_JOB_ID` constant in `AdmMessageReceiver.kt` (1001) must not collide
  with any other JobService id in the app.
