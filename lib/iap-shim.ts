/**
 * IAP shim router — picks the in-app purchase library at RUNTIME, from the
 * native modules this binary actually contains:
 *
 *   react-native-iap native module (iOS, Amazon build) → lib/iap-shim.rniap.ts
 *   expo-iap native module (Google Play build)         → lib/iap-shim.play.ts
 *   neither                                            → no-op stub (app still opens)
 *
 * Why runtime: `eas update` builds ONE Android JS bundle for both the Play and
 * Amazon binaries, and they embed different IAP native modules. When this was
 * chosen at bundle time (Metro + RNIAP_VARIANT), an Android OTA bundled the
 * react-native-iap shim, whose withIAPContext throws at launch on the Play
 * binary (no RNIap native module) and crashed it.
 *
 * Both shims export the same surface, so callers import from here unchanged.
 * Each shim is only require()d after its native module is confirmed, so the
 * other library's JS never runs. On EAS builds the unused package isn't
 * installed; metro.config.js resolves it to an empty module.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { requireOptionalNativeModule } from 'expo';
import { NativeModules, Platform } from 'react-native';
import type * as Shim from './iap-shim.rniap';

export type {
  ResolvedPlatform,
  ShimSubscription,
  ShimPurchase,
  IAPHookReturn,
  UseIAP,
  RestorePurchases,
  EnsureConnection,
  WithIAPContext,
} from './iap-shim.rniap';

type ShimModule = typeof Shim;

const isExpoGo = Constants.executionEnvironment === 'storeClient';

function hasReactNativeIap(): boolean {
  const { RNIapIos, RNIapIosSk2, RNIapModule, RNIapAmazonModule } = NativeModules;
  return !!(RNIapIos || RNIapIosSk2 || RNIapModule || RNIapAmazonModule);
}

function hasExpoIap(): boolean {
  try {
    return requireOptionalNativeModule('ExpoIap') != null;
  } catch {
    return false;
  }
}

// No IAP native module at all: keep the app usable (no products, nothing to
// restore) instead of crashing at launch.
function useIAPUnavailable(): Shim.IAPHookReturn {
  return {
    connected: false,
    subscriptions: [],
    currentPurchase: null,
    currentPurchaseError: null,
    fetchProducts: async () => [],
    requestPurchase: async () => {},
    finishTransaction: async () => {},
  };
}

function loadShim(): ShimModule | null {
  // Expo Go: the react-native-iap shim has its own Expo Go stubs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (isExpoGo || hasReactNativeIap()) return require('./iap-shim.rniap');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (hasExpoIap()) return require('./iap-shim.play');
  console.warn('[iap-shim] No IAP native module found; purchases unavailable');
  return null;
}

const shim = loadShim();

// Store detection is the same in both shims (Amazon = Android device made by
// Amazon); kept here too so it works when no shim loaded.
let cachedPlatform: Shim.ResolvedPlatform | null = null;
export function getResolvedPlatform(): Shim.ResolvedPlatform {
  if (cachedPlatform) return cachedPlatform;
  if (Platform.OS === 'android') cachedPlatform = Device.manufacturer === 'Amazon' ? 'amazon' : 'android';
  else cachedPlatform = 'ios';
  return cachedPlatform;
}

// True only on Google Play (Android, not Amazon). Gate all Play-only billing
// logic on this, never on Platform.OS — Fire reports 'android' too.
export function isGooglePlay(): boolean {
  return getResolvedPlatform() === 'android';
}

export const useIAP: Shim.UseIAP = shim?.useIAP ?? useIAPUnavailable;
export const restorePurchases: Shim.RestorePurchases = shim?.restorePurchases ?? (async () => []);
export const ensureConnection: Shim.EnsureConnection = shim?.ensureConnection ?? (async () => {});
export const withIAPContext: Shim.WithIAPContext = shim?.withIAPContext ?? ((Component) => Component);
