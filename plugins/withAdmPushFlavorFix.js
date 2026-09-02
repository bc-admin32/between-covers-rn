const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

/**
 * GOOGLE PLAY VARIANT ONLY (RNIAP_VARIANT=play). Fixes:
 *
 *   Could not resolve project :adm-push.
 *   The consumer was configured to find ... attribute
 *   'com.android.build.api.attributes.ProductFlavor:platform' with value 'play'
 *   ... we cannot choose between the following variants of project :adm-push:
 *     - amazonReleaseRuntimeElements (declares attribute 'appstore' = 'amazon')
 *     - googlePlayReleaseRuntimeElements (declares attribute 'appstore' = 'googlePlay')
 *
 * Root cause verified against a real failed EAS build log (production-google,
 * commit 7cd0e91) and a real `RNIAP_VARIANT=play` prebuild — NOT assumed from
 * the bug report alone, which turned out to be accurate but easy to
 * misdiagnose: a first pass checking the DEFAULT prebuild (RNIAP_VARIANT
 * unset -> 'amazon') showed :app and adm-push already sharing the same
 * "appstore" dimension/flavor names, which is correct for that variant and
 * looks like there's no bug at all — but it's the wrong variant to check.
 *
 * For the play variant, app.config.js removes react-native-iap's plugin
 * (which is what normally gives :app its own "appstore" flavorDimensions /
 * productFlavors block) and adds expo-iap's plugin instead — which only
 * knows about its OWN dependency (openiap-google) and injects
 * `missingDimensionStrategy "platform", "play"` for that. Nothing tells
 * Gradle how to resolve adm-push's "appstore" dimension, because in this
 * variant :app has NO product flavors of its own at all (confirmed: the
 * generated android/app/build.gradle for RNIAP_VARIANT=play has no
 * flavorDimensions/productFlavors block whatsoever).
 *
 * Fix approach: add missingDimensionStrategy for "appstore" -> "googlePlay",
 * mirroring exactly how expo-iap's own plugin solves the same class of
 * problem for "platform" -> "play". Scoped to the play variant only via
 * app.config.js's existing IAP_VARIANT branch — adm-push's build.gradle
 * itself is untouched, since its "appstore"/googlePlay/amazon declaration is
 * already correct (verified: it's what the AMAZON variant successfully
 * resolves against today). The alternative (renaming adm-push's dimension to
 * match some "platform"/"play" scheme) would be wrong on two counts: :app
 * doesn't have a "platform" dimension of its own either in this variant, and
 * it would break the amazon/iOS variant's already-working "appstore" match.
 *
 * Round 2: the :app-only fix below was necessary but not sufficient — :expo
 * (Expo's own autolinking module, included as a plain subproject by
 * expoAutolinking.useExpoModules() in settings.gradle, not something we
 * hand-edit) ALSO transitively depends on adm-push and hit the identical
 * ambiguity one module later (:expo:compileReleaseJavaWithJavac instead of
 * :app:bundleRelease). Rather than chase this module-by-module as each one
 * happens to surface it, the second fix below applies the same strategy to
 * every Android subproject via a root-level `subprojects { afterEvaluate }`
 * block — the standard Gradle/RN pattern for exactly this "some library
 * needs a flavor dimension resolved and I don't want to hunt down every
 * consumer" problem. Applying it to adm-push itself (which already has its
 * own real "appstore" flavor) is harmless: missingDimensionStrategy is only
 * ever consulted for a dimension a module doesn't itself participate in, so
 * on adm-push it's simply never read.
 */
module.exports = function withAdmPushFlavorFix(config) {
  config = withAppBuildGradle(config, (cfg) => {
    const marker = 'missingDimensionStrategy "appstore", "googlePlay"';
    if (!cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /defaultConfig\s*{/,
        `defaultConfig {\n        ${marker}`,
      );
    }
    return cfg;
  });

  return withProjectBuildGradle(config, (cfg) => {
    const marker = 'adm-push flavor fix: project-wide "appstore" strategy';
    if (!cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents += `
// ${marker} (RNIAP_VARIANT=play only — see plugins/withAdmPushFlavorFix.js).
// :app already gets its own strategy above, but any OTHER module that
// transitively depends on adm-push (e.g. Expo's own :expo autolinking
// module) needs the same resolution or hits the identical variant-ambiguity
// error one module later. Apply it to every Android subproject so nothing
// else surfaces this bug next.
subprojects {
  afterEvaluate { project ->
    if (project.plugins.hasPlugin('com.android.library') || project.plugins.hasPlugin('com.android.application')) {
      android {
        defaultConfig {
          missingDimensionStrategy "appstore", "googlePlay"
        }
      }
    }
  }
}
`;
    }
    return cfg;
  });
};
