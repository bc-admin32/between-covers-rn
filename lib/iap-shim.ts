/**
 * react-native-iap shim — three-way platform routing for Apple App Store,
 * Google Play, and Amazon Appstore, plus an Expo Go stub.
 *
 * ── Platform detection ────────────────────────────────────────────────────
 * Amazon Fire devices identify as `Platform.OS === 'android'`. To distinguish
 * Fire OS from generic Android we read `Device.manufacturer` from
 * `expo-device` and treat the value `'Amazon'` as Amazon. Otherwise
 * `Platform.OS` is the source of truth.
 *
 * Why expo-device.manufacturer over alternatives:
 *   - Build-time flavor flags (e.g. BuildConfig.FLAVOR) require splitting
 *     into product flavors AND wiring a JS bridge — react-native-iap's Expo
 *     plugin already creates flavors on the native side, but exposing the
 *     flavor name to JS would need a custom native module.
 *   - User-agent / package-name heuristics are unreliable on side-loaded
 *     APKs and emulators.
 *   - `Device.manufacturer === 'Amazon'` is what react-native-iap's own
 *     internals use to pick the Amazon path (see modules/amazon), so we
 *     mirror their detection to stay consistent.
 *
 * ── Three code paths ──────────────────────────────────────────────────────
 *   1. Expo Go: stubs, dev-only Alert. Lets paywall screens render so the
 *      route tree can be tested without crashing on missing native modules.
 *   2. Apple + Google (iOS / non-Amazon Android): real react-native-iap via
 *      `useIAP` and `requestSubscription` with platform-specific shapes.
 *      Android requires `subscriptionOffers: [{ sku, offerToken }]`.
 *   3. Amazon (Fire OS): real react-native-iap via `useIAP` and
 *      `requestSubscription({ sku })` per the Amazon path documented in
 *      react-native-iap v12 (RequestPurchaseAmazon = sku-only).
 *
 * The exported surface (`useIAP`, `restorePurchases`, `withIAPContext`,
 * `getResolvedPlatform`) is stable across all three paths so callers
 * (`door.tsx`, `hard-paywall.tsx`) don't need branching logic of their own.
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Alert, Platform } from 'react-native';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

export type ResolvedPlatform = 'ios' | 'android' | 'amazon';

let cachedPlatform: ResolvedPlatform | null = null;

/**
 * Resolves the runtime platform with Amazon split out from generic Android.
 * Cached on first call — manufacturer doesn't change at runtime.
 */
export function getResolvedPlatform(): ResolvedPlatform {
  if (cachedPlatform) return cachedPlatform;
  if (Platform.OS === 'android' && Device.manufacturer === 'Amazon') {
    cachedPlatform = 'amazon';
  } else if (Platform.OS === 'android') {
    cachedPlatform = 'android';
  } else {
    cachedPlatform = 'ios';
  }
  return cachedPlatform;
}

export type ShimSubscription = {
  id: string;
  displayPrice: string;
  title?: string;
};

export type ShimPurchase = {
  productId: string;
  transactionId: string;
  transactionDate?: number;
};

type FetchProductsOpts = { skus: string[]; type: string };

type RequestPurchaseOpts = {
  request: {
    ios: { sku: string };
    android: { skus: string[] };
    amazon: { sku: string };
  };
  type: string;
};

type FinishTransactionOpts = { purchase: ShimPurchase; isConsumable: boolean };

export type IAPHookReturn = {
  connected: boolean;
  subscriptions: ShimSubscription[];
  currentPurchase: ShimPurchase | null;
  currentPurchaseError: { code?: string } | null;
  fetchProducts: (opts: FetchProductsOpts) => Promise<ShimSubscription[]>;
  requestPurchase: (opts: RequestPurchaseOpts) => Promise<void>;
  finishTransaction: (opts: FinishTransactionOpts) => Promise<void>;
};

export type UseIAP = () => IAPHookReturn;
export type RestorePurchases = () => Promise<ShimPurchase[]>;
export type WithIAPContext = <P extends object>(
  Component: React.ComponentType<P>,
) => React.ComponentType<P>;

// ── Expo Go stub ─────────────────────────────────────────────────────────
function useIAPStub(): IAPHookReturn {
  const stubSubs: ShimSubscription[] = [
    { id: 'com.betweencovers.app.membership.monthly', displayPrice: '$10.99', title: 'Monthly (DEV STUB)' },
    { id: 'com.betweencovers.app.membership.annual',  displayPrice: '$89.99', title: 'Annual (DEV STUB)' },
  ];

  return {
    connected: true,
    subscriptions: stubSubs,
    currentPurchase: null,
    currentPurchaseError: null,
    fetchProducts: async (_opts: FetchProductsOpts) => stubSubs,
    requestPurchase: async (_opts: RequestPurchaseOpts) => {
      Alert.alert(
        'Dev stub',
        'react-native-iap is not available in Expo Go. Build an EAS dev build to test real purchases.\n\nFor now, you can advance through the flow by tapping "Not now" or by manually setting subscriptionStatus on your user record in DynamoDB.',
      );
    },
    finishTransaction: async (_opts: FinishTransactionOpts) => {},
  };
}

const restorePurchasesStub: RestorePurchases = async () => {
  Alert.alert('Dev stub', 'Restore purchases is a no-op in Expo Go.');
  return [];
};

const passthroughHOC: WithIAPContext = (Component) => Component;

let resolvedUseIAP: UseIAP = useIAPStub;
let resolvedRestorePurchases: RestorePurchases = restorePurchasesStub;
let resolvedWithIAPContext: WithIAPContext = passthroughHOC;

// ── Real react-native-iap path (iOS / Android / Amazon) ──────────────────
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rniap = require('react-native-iap');

    resolvedWithIAPContext = rniap.withIAPContext as WithIAPContext;

    // Normalize a v12 Subscription (union of iOS/Android/Amazon shapes)
    // into the narrow ShimSubscription our paywalls consume.
    const toShimSubscription = (s: any): ShimSubscription => {
      const id: string = s.productId ?? s.id ?? '';
      const title: string | undefined = s.title ?? s.name;

      // Android Billing v5: price lives inside subscriptionOfferDetails[].pricingPhases.
      // We pick the LAST pricing phase, which is the recurring (post-trial) price —
      // the first phase is typically the free-trial introductory phase.
      const androidOffer = Array.isArray(s.subscriptionOfferDetails)
        ? s.subscriptionOfferDetails[0]
        : undefined;
      const androidPhases = androidOffer?.pricingPhases?.pricingPhaseList;
      const androidPrice =
        Array.isArray(androidPhases) && androidPhases.length > 0
          ? androidPhases[androidPhases.length - 1].formattedPrice
          : undefined;

      // iOS Sk1/Sk2 + Amazon both expose localizedPrice.
      const localized = s.localizedPrice ?? s.displayPrice ?? androidPrice ?? s.price ?? '';

      return { id, displayPrice: String(localized), title };
    };

    const useRealIAP: UseIAP = () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const real = rniap.useIAP();
      const platform = getResolvedPlatform();

      const shimSubs: ShimSubscription[] = (real.subscriptions ?? []).map(toShimSubscription);

      const fetchProducts = async (opts: FetchProductsOpts): Promise<ShimSubscription[]> => {
        if (opts.type === 'subs') {
          await real.getSubscriptions({ skus: opts.skus });
        } else {
          await real.getProducts({ skus: opts.skus });
        }
        // Hook state updates asynchronously; return the latest snapshot we have.
        return ((real.subscriptions ?? []) as any[]).map(toShimSubscription);
      };

      const requestPurchase = async (opts: RequestPurchaseOpts): Promise<void> => {
        const isSubs = opts.type === 'subs';

        if (platform === 'ios') {
          const sku = opts.request.ios.sku;
          if (isSubs) {
            await real.requestSubscription({ sku });
          } else {
            await rniap.requestPurchase({ sku });
          }
          return;
        }

        if (platform === 'amazon') {
          const sku = opts.request.amazon.sku;
          if (isSubs) {
            await real.requestSubscription({ sku });
          } else {
            await rniap.requestPurchase({ sku });
          }
          return;
        }

        // Google Play
        const skus = opts.request.android.skus;
        if (isSubs) {
          // Android subs require an offerToken pulled from the fetched product.
          const subscriptionOffers = skus.map((sku) => {
            const product: any = (real.subscriptions ?? []).find(
              (p: any) => p.productId === sku,
            );
            const offerToken: string | undefined =
              product?.subscriptionOfferDetails?.[0]?.offerToken;
            return { sku, offerToken: offerToken ?? '' };
          });
          await real.requestSubscription({ subscriptionOffers });
        } else {
          await rniap.requestPurchase({ skus });
        }
      };

      const finishTransaction = async (opts: FinishTransactionOpts): Promise<void> => {
        await real.finishTransaction({
          purchase: opts.purchase as any,
          isConsumable: opts.isConsumable,
        });
      };

      return {
        connected: !!real.connected,
        subscriptions: shimSubs,
        currentPurchase: (real.currentPurchase ?? null) as ShimPurchase | null,
        currentPurchaseError: (real.currentPurchaseError ?? null) as { code?: string } | null,
        fetchProducts,
        requestPurchase,
        finishTransaction,
      };
    };

    const realRestorePurchases: RestorePurchases = async () => {
      const purchases = await rniap.getAvailablePurchases();
      return (purchases ?? []).map((p: any) => ({
        productId: p.productId,
        transactionId: p.transactionId ?? p.purchaseToken ?? '',
        transactionDate: p.transactionDate,
      }));
    };

    resolvedUseIAP = useRealIAP;
    resolvedRestorePurchases = realRestorePurchases;
  } catch (err) {
    console.warn('[iap-shim] Failed to load react-native-iap, falling back to stub:', err);
  }
}

export const useIAP: UseIAP = resolvedUseIAP;
export const restorePurchases: RestorePurchases = resolvedRestorePurchases;
export const withIAPContext: WithIAPContext = resolvedWithIAPContext;
