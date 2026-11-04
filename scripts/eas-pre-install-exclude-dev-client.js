#!/usr/bin/env node
/**
 * eas-build-pre-install hook — keep expo-dev-client out of production Android
 * builds.
 *
 * On iOS, expo-dev-launcher is "debugOnly" and never reaches a Release build.
 * Android has no equivalent, so release APKs/AABs linked the dev launcher and,
 * through it, ML Kit barcode scanning (libbarhopper_v3.so, .tflite models,
 * Inter fonts): about 10 MB in the Amazon APK. The app uses none of it.
 *
 * When BC_EXCLUDE_DEV_CLIENT=1 (set only on production-google and
 * production-amazon in eas.json), this adds the dev-client packages to
 * `expo.autolinking.android.exclude` in package.json. The autolinking CLI reads
 * that list itself, for module discovery, the generated package list and the
 * React Native config, so all of them stay consistent.
 *
 * Why not `expoAutolinking.exclude` in settings.gradle (tried in 005587b,
 * reverted in f85027f): expo-modules-autolinking 3.0.24's Gradle plugin joins
 * that list into one `--exclude "a b c"` argument, which matches no package.
 *
 * Runs before eas-pre-install-iap-variant.js, which re-reads package.json from
 * disk and writes the whole object back, so this key is kept. Locally nothing
 * runs this, so dev builds keep the dev client.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.IAP_VARIANT_ROOT || path.resolve(__dirname, '..');
const DEV_CLIENT_PACKAGES = ['expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface'];
const log = (msg) => console.log(`[exclude-dev-client] ${msg}`);

if (process.env.BC_EXCLUDE_DEV_CLIENT !== '1') {
  log('BC_EXCLUDE_DEV_CLIENT not set → dev client stays linked');
  process.exit(0);
}

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.expo = pkg.expo || {};
pkg.expo.autolinking = pkg.expo.autolinking || {};
const android = (pkg.expo.autolinking.android = pkg.expo.autolinking.android || {});
android.exclude = [...new Set([...(android.exclude || []), ...DEV_CLIENT_PACKAGES])];

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
log(`android autolinking exclude: ${android.exclude.join(', ')}`);
