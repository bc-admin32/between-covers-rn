const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Lands Amazon's `AppstoreAuthenticationKey.pem` in the Android app assets at
// prebuild so react-native-iap's Amazon Appstore SDK can authenticate the app to
// the Amazon IAP backend on Fire OS.
//
// WHY: Amazon support confirmed that getProductData()/getSubscriptions() fail with
// `E_PRODUCT_DATA_RESPONSE_FAILED` when `AppstoreAuthenticationKey.pem` is absent
// from the app's assets. The key (downloaded from the Amazon Developer Console and
// unique to package com.betweencovers.app) authenticates the app to Amazon's IAP
// backend; without it, product-data requests fail silently and no SKUs load.
//
// The Amazon SDK looks for the key by the exact filename `AppstoreAuthenticationKey.pem`
// at the root of the app's assets, so it must land at
// `android/app/src/main/assets/AppstoreAuthenticationKey.pem`. `src/main/assets` is
// merged into every flavor's APK — including the `amazon` product flavor built by
// the `production-amazon` EAS profile (:app:assembleAmazonRelease) — so the key
// ships in the Amazon release APK, not just debug. The key is a public app
// authentication key that is intended to be bundled inside the shipped APK (anyone
// can extract it), so shipping it in the Play flavor too is harmless.
//
// Idempotent: skips the copy when the destination already holds identical bytes.
// Tolerant by design: if ./assets/amazon/AppstoreAuthenticationKey.pem is absent
// (e.g. this wiring is committed before the real key is dropped in), it warns and
// skips rather than failing prebuild/EAS. Drop the real key at
// ./assets/amazon/AppstoreAuthenticationKey.pem and it activates automatically on
// the next build.
module.exports = function withAmazonIapAuthKey(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const src = path.join(
        cfg.modRequest.projectRoot,
        'assets',
        'amazon',
        'AppstoreAuthenticationKey.pem'
      );
      if (!fs.existsSync(src)) {
        console.warn(
          '[withAmazonIapAuthKey] ./assets/amazon/AppstoreAuthenticationKey.pem not ' +
            'found — skipping Amazon IAP auth key bundling. Amazon getProductData/' +
            'getSubscriptions will fail with E_PRODUCT_DATA_RESPONSE_FAILED until the ' +
            'key is added.'
        );
        return cfg;
      }

      const destDir = path.join(
        cfg.modRequest.platformProjectRoot, // android/
        'app',
        'src',
        'main',
        'assets'
      );
      const dest = path.join(destDir, 'AppstoreAuthenticationKey.pem');

      // Idempotent: only write when the file is missing or its bytes differ.
      if (
        fs.existsSync(dest) &&
        fs.readFileSync(dest).equals(fs.readFileSync(src))
      ) {
        return cfg;
      }

      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);
};
