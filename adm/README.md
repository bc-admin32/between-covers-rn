# ADM credential

Drop the Amazon Device Messaging key here as **`api_key.txt`** (generated in the
Amazon Developer console for package `com.betweencovers.app`), then commit it.

The `plugins/withAdmApiKey.js` config plugin copies `api_key.txt` into the
Amazon flavor's assets (`android/app/src/amazon/assets/`) at prebuild, so it
ships **only** in the Amazon APK — never the Google Play AAB.

Until `api_key.txt` is present the plugin warns and skips (builds still succeed).
Fire OS push also requires the deferred ADM registration module before it can
deliver — see the NOTE in `lib/pushNotifications.ts`.
