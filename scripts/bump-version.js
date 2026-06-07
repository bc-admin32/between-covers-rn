#!/usr/bin/env node
/*
 * Bump the MARKETING version (expo.version → CFBundleShortVersionString /
 * versionName) in app.json. This is the version Apple/Google/Amazon check
 * against the previously-approved build; for a live app it MUST be raised
 * before building iOS (it's compiled into the binary), or App Store Connect
 * rejects the upload (error 90062/90186 "must be higher than approved 1.0.0").
 *
 * It does NOT touch the build number (buildNumber/versionCode) — EAS owns that
 * via appVersionSource: "remote" + autoIncrement in eas.json. Run this, not a
 * hand-edit, and only when you mean to (the version stays meaningful).
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major|X.Y.Z]   (default: minor)
 * or via package.json: npm run release:patch | release:minor | release:major
 */
const fs = require('fs');
const path = require('path');

const APP_JSON = path.join(__dirname, '..', 'app.json');
// Match expo.version only (the single "version": "X.Y.Z" in app.json). Capture
// the surrounding quotes/whitespace so we swap the number and nothing else —
// preserving the file's exact formatting and trailing newline.
const VERSION_RE = /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/;

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

// returns 1 if a > b, -1 if a < b, 0 if equal
function compare(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    if (a[k] !== b[k]) return a[k] > b[k] ? 1 : -1;
  }
  return 0;
}

function nextVersion(current, kind) {
  const cur = parse(current);
  if (!cur) throw new Error(`Current expo.version "${current}" is not X.Y.Z`);

  // Explicit target version (e.g. 1.4.0)
  if (/^\d+\.\d+\.\d+$/.test(kind)) {
    const target = parse(kind);
    if (compare(target, cur) <= 0) {
      throw new Error(
        `Explicit version ${kind} is not higher than current ${current}. ` +
        `For a live app the marketing version must increase.`
      );
    }
    return kind;
  }

  switch (kind) {
    case 'major': return `${cur.major + 1}.0.0`;
    case 'minor': return `${cur.major}.${cur.minor + 1}.0`;
    case 'patch': return `${cur.major}.${cur.minor}.${cur.patch + 1}`;
    default:
      throw new Error(`Unknown bump "${kind}" — use patch | minor | major | X.Y.Z`);
  }
}

function main() {
  const kind = (process.argv[2] || 'minor').trim();

  const raw = fs.readFileSync(APP_JSON, 'utf8');
  const found = VERSION_RE.exec(raw);
  if (!found) {
    console.error('✗ Could not find "version": "X.Y.Z" in app.json');
    process.exit(1);
  }
  const current = found[2];

  let next;
  try {
    next = nextVersion(current, kind);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }

  const updated = raw.replace(VERSION_RE, `$1${next}$3`);
  fs.writeFileSync(APP_JSON, updated);

  console.log(`✓ expo.version: ${current} → ${next}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. git add app.json && git commit -m "chore(release): v${next}"`);
  console.log('  2. EXPO_NO_CAPABILITY_SYNC=1 eas build --profile production-ios     --platform ios');
  console.log('     EXPO_NO_CAPABILITY_SYNC=1 eas build --profile production-google  --platform android');
  console.log('     EXPO_NO_CAPABILITY_SYNC=1 eas build --profile production-amazon  --platform android');
  console.log('  3. eas submit per platform (Amazon APK uploaded manually).');
  console.log('');
  console.log('Build number (buildNumber/versionCode) auto-increments via EAS — do not edit it.');
}

main();
