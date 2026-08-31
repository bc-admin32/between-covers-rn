const { withGradleProperties, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Enables R8/ProGuard code shrinking and Android resource shrinking for
 * release builds — prep for Google Play's App Quality thresholds (DEX
 * code-optimization scoring, enforced from Feb 2027).
 *
 * android/app/build.gradle already wires both flags up conditionally:
 *   def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()
 *   def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
 * — they just default to false, and nothing in this repo has ever set them.
 * withGradleProperties persists the override into android/gradle.properties
 * at every prebuild (that file is otherwise regenerated from scratch and not
 * committed, so a plugin is the only way to make this stick — same reason
 * withAdmApiKey.js etc. exist as plugins rather than hand-edited native files).
 *
 * SCOPING NOTE: these two properties are read once per release build TYPE,
 * shared across both product flavors (amazonRelease and googlePlayRelease
 * both derive from the same `release` block in build.gradle) — Gradle has no
 * clean per-flavor override point for a plain gradle.properties boolean, so
 * this applies to the Amazon release build too, not just Google Play. The
 * compliance driver (Google Play's App Quality thresholds) is Play-specific,
 * but there's no reason to exclude Amazon — a smaller, more optimized Amazon
 * build is a harmless side effect, not a requirement either way.
 *
 * KEEP RULES: React Native resolves locally-bundled images
 * (require('./x.png')) via Resources.getIdentifier() at runtime — a
 * reflection-based lookup the Android resource shrinker's static analysis
 * can't see, since it only traces R.drawable.x references in compiled
 * Java/Kotlin/XML, not the JS bundle. This app has exactly three such assets
 * (assets/splash.png, assets/wig.png, assets/lips-loader.png — grepped for
 * every require('*.png'/'*.jpg'/etc.) in the repo); the raw/keep.xml below
 * protects the drawable resources those get bundled into so shrinkResources
 * can't strip them as apparently-unused.
 */
const KEEP_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@drawable/*splash*,@drawable/*wig*,@drawable/*lips_loader*,@drawable/*lips-loader*" />
`;

module.exports = function withAndroidReleaseOptimizations(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const upsert = (key, value) => {
      const existing = props.find((p) => p.type === 'property' && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    };
    upsert('android.enableMinifyInReleaseBuilds', 'true');
    upsert('android.enableShrinkResourcesInReleaseBuilds', 'true');
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'raw',
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'keep.xml'), KEEP_XML, 'utf8');
      return cfg;
    },
  ]);
};
