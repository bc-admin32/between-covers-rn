#!/usr/bin/env node
/**
 * eas-build-pre-install hook — select the IAP library per RNIAP_VARIANT.
 *
 * Runs on EAS builders BEFORE `npm ci`/`npm install` (EAS invokes the
 * "eas-build-pre-install" package.json script explicitly). It is NOT a standard
 * npm lifecycle hook, so a local `npm install` never runs it — locally both IAP
 * libraries stay in package.json, which is fine for dev.
 *
 *   RNIAP_VARIANT=play   → Google Play build. Remove react-native-iap so Expo
 *     autolinking can't pull its native module in alongside expo-iap, and drop
 *     its patch (the package won't be installed). Keep expo-iap.
 *   RNIAP_VARIANT=amazon → Amazon + iOS builds (default). Keep
 *     react-native-iap@12.16.4 + patches/react-native-iap+12.16.4.patch exactly
 *     as today; remove expo-iap so it can't autolink alongside.
 *
 * LOCKFILE: EAS runs `npm ci` when package-lock.json is present, and `npm ci`
 * HARD-FAILS when package.json no longer matches the lock (we just edited it).
 * So after editing package.json we regenerate the lock in place with
 * `npm install --package-lock-only`: it prunes the removed IAP package (and any
 * deps only it used) and keeps every other entry at its committed version.
 *
 * Do NOT delete the lockfile instead. With no lockfile EAS picks yarn (its
 * default), not npm, and resolves every dependency fresh — that is how
 * @heycatch/sdk floated to 0.7.1 (engines node >=22) and broke the build. It
 * also drops .npmrc's legacy-peer-deps, which yarn doesn't read.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// IAP_VARIANT_ROOT lets tests point the script at a scratch copy; defaults to
// the repo root (this file lives in scripts/).
const ROOT = process.env.IAP_VARIANT_ROOT || path.resolve(__dirname, '..');
const variant = process.env.RNIAP_VARIANT || 'amazon';

const pkgPath = path.join(ROOT, 'package.json');
const lockPath = path.join(ROOT, 'package-lock.json');
const rniapPatch = path.join(ROOT, 'patches', 'react-native-iap+12.16.4.patch');

const log = (msg) => console.log(`[iap-variant] ${msg}`);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};

if (variant === 'play') {
  // expo-iap only — react-native-iap must be absent (autolinking) + no patch.
  delete pkg.dependencies['react-native-iap'];
  if (!pkg.dependencies['expo-iap']) {
    log('WARNING: expo-iap is missing from package.json — add it before building play.');
  }
  if (fs.existsSync(rniapPatch)) {
    fs.rmSync(rniapPatch);
    log('removed patches/react-native-iap+12.16.4.patch (react-native-iap not installed)');
  }
  log('variant=play → expo-iap only; react-native-iap removed');
} else {
  // Amazon + iOS: react-native-iap@12.16.4 (+patch) unchanged; expo-iap absent.
  delete pkg.dependencies['expo-iap'];
  log('variant=amazon → react-native-iap@12.16.4 (+patch) only; expo-iap removed');
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

if (!fs.existsSync(lockPath)) {
  throw new Error('[iap-variant] package-lock.json missing — refusing to let EAS fall back to yarn');
}
// Throws (failing the build) if npm can't produce a matching lock — better than
// silently building with unpinned dependencies.
execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', {
  cwd: ROOT,
  stdio: 'inherit',
});
log('regenerated package-lock.json for this variant → EAS will use `npm ci` with existing pins');
