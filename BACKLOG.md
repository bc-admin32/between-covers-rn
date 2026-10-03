# Backlog

Deferred app work, newest first. Each item says what's wrong, what's been
tried, and the plan.

## Exclude expo-dev-client from production Android builds

**Target:** the release after 1.5.0.

**Problem:** release APKs and AABs link the dev launcher, which brings in ML Kit
barcode scanning (`libbarhopper_v3.so`, `.tflite` models, Inter fonts). That's
about 10 MB in the Amazon APK and about 3–4 MB per Play download. iOS already
leaves it out (`debugOnly`).

**Why the first attempt failed (reverted in f85027f):** expo-modules-autolinking
3.0.24's Gradle plugin (`AutolinkingCommandBuilder.option(key, List)`) joins
`expoAutolinking.exclude` into a single `--exclude` argument, which matches no
package.

**Plan:**

1. patch-package `expo-modules-autolinking` so it passes each name as a separate
   argument.
2. Restore the env-gated `settings.gradle` exclude for `production-google` and
   `production-amazon` only.
3. Verify on a real EAS build: no `barhopper`, `.tflite`, Inter fonts or
   `DevLauncherPackage`.
4. Report the bug upstream, and re-check the patch on every Expo upgrade.

**Expected result:** Amazon APK about 53 → 43 MB.
