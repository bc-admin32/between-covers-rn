// Patch Node's fs with graceful-fs to avoid EMFILE errors on Windows
// (Metro opens hundreds of files in parallel; Windows hits the descriptor limit fast)
const gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(require('fs'));

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── IAP variant selection (SPIKE) ──────────────────────────────────────────
// RNIAP_VARIANT is set per EAS profile: `play` (iOS + Google Play, expo-iap) or
// `amazon` (Fire OS, react-native-iap@12.16.4). Defaults to amazon so a plain
// `expo start` / amazon build resolves lib/iap-shim.ts unchanged.
//
// On the play build, redirect any import that resolves to lib/iap-shim.ts to
// lib/iap-shim.play.ts. Because the amazon file is then unreachable, Metro never
// resolves its `require('react-native-iap')` — and, symmetrically, the amazon
// build never bundles iap-shim.play.ts, so it never resolves `expo-iap`.
const IAP_VARIANT = process.env.RNIAP_VARIANT ?? 'amazon';
const PLAY_SHIM = path.resolve(__dirname, 'lib/iap-shim.play.ts');

const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = baseResolveRequest ?? context.resolveRequest;
  const resolved = resolve(context, moduleName, platform);

  if (
    IAP_VARIANT === 'play' &&
    resolved &&
    resolved.type === 'sourceFile' &&
    typeof resolved.filePath === 'string' &&
    resolved.filePath.replace(/\\/g, '/').endsWith('/lib/iap-shim.ts')
  ) {
    return { type: 'sourceFile', filePath: PLAY_SHIM };
  }
  return resolved;
};

module.exports = config;
