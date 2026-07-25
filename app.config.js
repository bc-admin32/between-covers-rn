/**
 * app.config.js — variant-aware Expo config (SPIKE).
 *
 * app.json stays the single source of static config; Expo passes it in as
 * `config` and this function layers per-variant plugin changes on top. Selected
 * by RNIAP_VARIANT (set per EAS build profile):
 *
 *   amazon (default): unchanged from app.json — react-native-iap@12.16.4 with
 *     paymentProvider "both" + the three Amazon config plugins.
 *   play:            drop the Amazon plugins and swap the react-native-iap
 *     plugin for expo-iap (iOS + Google Play, Billing 8/9). No Amazon code.
 *
 * NOTE: this only governs NATIVE config (plugins/entitlements). The JS shim swap
 * (lib/iap-shim.ts → iap-shim.play.ts) is handled separately by the Metro
 * resolver in metro.config.js, also keyed on RNIAP_VARIANT.
 *
 * ⚠️ SPIKE — VERIFY before trunk:
 *   - the expo-iap config-plugin name/options ("expo-iap" here is a guess — check
 *     the installed package's plugin export and whether it needs config).
 *   - that the play plugin set still produces the Sign in with Apple entitlement
 *     etc. (those come from expo-apple-authentication / ios config, untouched).
 */

const IAP_VARIANT = process.env.RNIAP_VARIANT ?? 'amazon';

// Plugin entries (string) that only make sense on the Amazon build.
const AMAZON_ONLY_PLUGINS = [
  './plugins/withRNIapAmazonActivityListener',
  './plugins/withAmazonIapAuthKey',
  './plugins/withAdmApiKey',
];

// Returns true if a plugins[] entry is the react-native-iap plugin (it's an
// array: ["react-native-iap", { paymentProvider: "both" }]).
const isReactNativeIapPlugin = (entry) =>
  entry === 'react-native-iap' || (Array.isArray(entry) && entry[0] === 'react-native-iap');

const isAmazonOnlyPlugin = (entry) => {
  const name = Array.isArray(entry) ? entry[0] : entry;
  return AMAZON_ONLY_PLUGINS.includes(name);
};

module.exports = ({ config }) => {
  // amazon (default): identical to app.json — return untouched.
  if (IAP_VARIANT !== 'play') {
    return config;
  }

  // play: rebuild the plugins array without the Amazon-only plugins and with
  // react-native-iap replaced by expo-iap.
  const basePlugins = config.plugins ?? [];
  const playPlugins = basePlugins
    .filter((entry) => !isAmazonOnlyPlugin(entry))
    .filter((entry) => !isReactNativeIapPlugin(entry));

  // VERIFY: confirm the expo-iap config-plugin name + whether it takes options.
  playPlugins.push('expo-iap');

  return {
    ...config,
    plugins: playPlugins,
  };
};
