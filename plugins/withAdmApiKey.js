const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Lands ADM's api_key.txt in the Amazon flavor's assets at prebuild so the
// Amazon Device Messaging SDK can authenticate on Fire OS.
//
// Flavor-scoped to `src/amazon` (the amazon product flavor created by the
// react-native-iap config plugin) → ONLY the Amazon APK includes the file. The
// Google Play AAB and the FCM/expo-notifications path are untouched.
//
// Tolerant by design: if ./adm/api_key.txt is absent (e.g. this prep wiring is
// committed before the real key is dropped in), it warns and skips rather than
// failing prebuild/EAS. Drop the real key at ./adm/api_key.txt and it activates
// automatically on the next Amazon build. Note: the key only authenticates the
// SDK — Fire push won't deliver until the deferred ADM registration module
// exists (see the NOTE in lib/pushNotifications.ts).
module.exports = function withAdmApiKey(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'adm', 'api_key.txt');
      if (!fs.existsSync(src)) {
        console.warn(
          '[withAdmApiKey] ./adm/api_key.txt not found — skipping ADM key bundling. ' +
          'Fire OS push will not authenticate until the key is added.'
        );
        return cfg;
      }
      const destDir = path.join(
        cfg.modRequest.platformProjectRoot, // android/
        'app', 'src', 'amazon', 'assets'
      );
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, 'api_key.txt'));
      return cfg;
    },
  ]);
};
