const { withSettingsGradle } = require('expo/config-plugins');

/**
 * Keeps expo-dev-client out of production Android builds.
 *
 * On iOS, expo-dev-launcher is marked "debugOnly" in its expo-module.config.json
 * and never reaches a Release build. Android has no equivalent, so the 1.5.0
 * release APK/AAB linked the dev launcher and, through it, ML Kit barcode
 * scanning (libbarhopper_v3.so, 3-6 MB per ABI, plus .tflite models, the Inter
 * fonts and its Compose/Apollo dex) — none of which the app uses.
 *
 * This adds an autolinking exclude to settings.gradle that applies only when
 * BC_EXCLUDE_DEV_CLIENT=1. The production-google and production-amazon EAS
 * profiles set it; development and preview don't, so they keep the dev client.
 * The variable is read when Gradle runs, not at prebuild, so the generated
 * settings.gradle is the same for every profile.
 *
 * expoAutolinking.exclude feeds both module discovery and the generated
 * ExpoModulesPackageList, so the two stay consistent. The four packages are
 * expo-dev-client and the dev-only modules it pulls in; nothing else depends
 * on them (expo-manifests / expo-updates-interface stay, expo-updates uses them).
 */

const MARKER = '// withExcludeDevClientInProduction';
const ANCHOR = 'expoAutolinking.useExpoModules()';

const SNIPPET = `${MARKER}
if (System.getenv('BC_EXCLUDE_DEV_CLIENT') == '1') {
  expoAutolinking.exclude = ['expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface']
}
`;

module.exports = function withExcludeDevClientInProduction(config) {
  return withSettingsGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }
    if (!contents.includes(ANCHOR)) {
      throw new Error(
        `withExcludeDevClientInProduction: "${ANCHOR}" not found in settings.gradle; ` +
          'the exclude must be set before it runs.',
      );
    }
    cfg.modResults.contents = contents.replace(ANCHOR, `${SNIPPET}${ANCHOR}`);
    return cfg;
  });
};
