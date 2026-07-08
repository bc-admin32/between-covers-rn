const { withMainActivity } = require('expo/config-plugins');

/**
 * Injects react-native-iap's Amazon Appstore activity-listener registration into
 * MainActivity.onCreate at prebuild.
 *
 * WHY: react-native-iap's Amazon flavor requires
 * `RNIapActivityListener.registerActivity(activity)` to be called in
 * `Activity.onCreate` (see the class's own KDoc: "AmazonPurchasingService must be
 * registered on Activity.onCreate"). Without it, `initConnection()` rejects on
 * Fire OS with `E_DEVELOPER_ERROR: RNIapActivityListener is not registered in your
 * MainActivity.onCreate`, and no Amazon purchase flow works. The managed Expo
 * build doesn't inject this, so every Amazon build shipped without it.
 *
 * SAFE FOR BOTH FLAVORS: MainActivity is shared by the `googlePlay` and `amazon`
 * product flavors (created by the react-native-iap plugin's `paymentProvider:
 * "both"`). The Play flavor ships a matching `RNIapActivityListener.registerActivity()`
 * that is a **no-op**, so the injected call compiles and runs harmlessly on Google
 * Play and does the real Amazon listener registration on Fire OS.
 *
 * API verified against react-native-iap@12.16.4:
 *   android/src/amazon/java/com/dooboolab/rniap/RNIapActivityListener.kt
 *     → `@JvmStatic fun registerActivity(activity: Activity)`
 *   android/src/play/java/com/dooboolab/rniap/RNIapActivityListener.kt
 *     → same signature, no-op body.
 *
 * Idempotent, and handles both Kotlin and Java MainActivity.
 */

const IMPORT_FQN = 'com.dooboolab.rniap.RNIapActivityListener';
const CALL_KT = 'RNIapActivityListener.registerActivity(this)';
const CALL_JAVA = 'RNIapActivityListener.registerActivity(this);';

function addImport(contents, isJava) {
  const importLine = isJava ? `import ${IMPORT_FQN};` : `import ${IMPORT_FQN}`;
  if (contents.includes(importLine)) return contents;
  // Insert right after the package declaration.
  const pkgRe = isJava ? /^(package .*;[ \t]*\r?\n)/m : /^(package .*\r?\n)/m;
  if (!pkgRe.test(contents)) return contents; // no package line — leave untouched
  return contents.replace(pkgRe, `$1\n${importLine}\n`);
}

function addRegistrationCall(contents, isJava) {
  // Idempotent: never double-insert.
  if (contents.includes('RNIapActivityListener.registerActivity')) return contents;
  const call = isJava ? CALL_JAVA : CALL_KT;
  // Match the `super.onCreate(...)` statement line, preserving its indentation,
  // and insert our call on the following line. Kotlin has no trailing semicolon;
  // Java does — the optional `;?` covers both.
  const superRe = /^([ \t]*)super\.onCreate\([^\n]*\)[ \t]*;?[ \t]*\r?$/m;
  const m = contents.match(superRe);
  if (!m) {
    console.warn(
      '[withRNIapAmazonActivityListener] Could not find super.onCreate(...) in ' +
        'MainActivity — Amazon listener registration was NOT injected. Amazon IAP ' +
        'will fail until this is added manually.'
    );
    return contents;
  }
  const indent = m[1];
  return contents.replace(superRe, (line) => `${line}\n${indent}${call}`);
}

module.exports = function withRNIapAmazonActivityListener(config) {
  return withMainActivity(config, (cfg) => {
    const isJava = cfg.modResults.language === 'java';
    let contents = cfg.modResults.contents;
    contents = addImport(contents, isJava);
    contents = addRegistrationCall(contents, isJava);
    cfg.modResults.contents = contents;
    return cfg;
  });
};
