// Patch Node's fs with graceful-fs to avoid EMFILE errors on Windows
// (Metro opens hundreds of files in parallel; Windows hits the descriptor limit fast)
const gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(require('fs'));

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── IAP packages ────────────────────────────────────────────────────────────
// lib/iap-shim.ts picks react-native-iap or expo-iap at runtime, so the JS
// bundle is the same for every store (one Android OTA works on both the Play
// and Amazon binaries). EAS builds still install only their own IAP package
// (scripts/eas-pre-install-iap-variant.js); the missing one resolves to an
// empty module here. The router never loads it, because its native module
// isn't in that binary either.
const OPTIONAL_IAP_PACKAGES = new Set(['react-native-iap', 'expo-iap']);

const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = baseResolveRequest ?? context.resolveRequest;
  try {
    return resolve(context, moduleName, platform);
  } catch (err) {
    if (OPTIONAL_IAP_PACKAGES.has(moduleName)) return { type: 'empty' };
    throw err;
  }
};

module.exports = config;
