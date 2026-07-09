# Amazon IAP authentication key

Drop the Amazon IAP app authentication key here as **`AppstoreAuthenticationKey.pem`**
(downloaded from the Amazon Developer Console for package `com.betweencovers.app`),
then commit it.

The `plugins/withAmazonIapAuthKey.js` config plugin copies
`AppstoreAuthenticationKey.pem` into the Android app assets
(`android/app/src/main/assets/AppstoreAuthenticationKey.pem`) at prebuild, so it
ships inside the Amazon release APK (`production-amazon` EAS profile →
`:app:assembleAmazonRelease`). Without it, `getProductData()`/`getSubscriptions()`
fail with `E_PRODUCT_DATA_RESPONSE_FAILED` and no SKUs load on Fire OS.

The repo's `.gitignore` ignores `*.pem` globally; this specific file is
force-tracked via a `!assets/amazon/AppstoreAuthenticationKey.pem` negation, so a
plain `git add` picks it up. Until the key is present the plugin warns and skips
(builds still succeed).

Note: this key is a **public** app authentication key intended to be bundled inside
the shipped APK — it is not a private secret.
