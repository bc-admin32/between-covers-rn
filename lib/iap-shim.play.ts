/**
 * iap-shim.play.ts — GOOGLE PLAY variant, backed by expo-iap (OpenIAP).
 *
 * ⚠️ SPIKE / UNVERIFIED. Selected at build time for RNIAP_VARIANT=play (the
 * production-google EAS profile ONLY) via the Metro resolver redirect in
 * metro.config.js. iOS and the Amazon build both keep the existing
 * lib/iap-shim.ts on react-native-iap@12.16.4 (RNIAP_VARIANT=amazon) — iOS is
 * out of scope for the Billing-8 migration (Aug 31 is Google Play only). A build
 * only ever bundles ONE shim, so the play build never resolves react-native-iap
 * and the amazon build never resolves expo-iap.
 *
 * The iOS branch in requestPurchase() below is retained (defensive/self-
 * contained) but is DEAD on this variant — iOS never resolves to this file.
 *
 * Exported surface is byte-identical to lib/iap-shim.ts, so subscription.ts,
 * _layout.tsx, and the paywalls import the SAME symbols and need zero changes:
 *   getResolvedPlatform, isGooglePlay, useIAP, restorePurchases,
 *   ensureConnection, withIAPContext, ShimSubscription, ShimPurchase, ...
 *
 * VERIFY markers = the device checklist. expo-iap is "not 1:1" with
 * react-native-iap@14 (hyochan/expo-iap#100), so confirm each flagged field
 * against the pinned expo-iap `.d.ts` AND a real Play/StoreKit purchase before
 * this merges to trunk.
 */
import { Platform, Alert } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

// ── Platform resolution (identical to the current shim) ────────────────────
export type ResolvedPlatform = 'ios' | 'android' | 'amazon';

let cachedPlatform: ResolvedPlatform | null = null;
export function getResolvedPlatform(): ResolvedPlatform {
  if (cachedPlatform) return cachedPlatform;
  if (Platform.OS === 'android' && Device.manufacturer === 'Amazon') {
    cachedPlatform = 'amazon'; // never happens in the play binary; kept for parity
  } else if (Platform.OS === 'android') {
    cachedPlatform = 'android';
  } else {
    cachedPlatform = 'ios';
  }
  return cachedPlatform;
}

export function isGooglePlay(): boolean {
  return getResolvedPlatform() === 'android';
}

// ── Stable interface (identical to the current shim — do NOT change) ───────
export type ShimSubscription = { id: string; displayPrice: string; title?: string };

export type ShimPurchase = {
  productId: string;
  transactionId: string;
  transactionDate?: number;
  // Android (Google Play) purchase token — REQUIRED by subscriptionWrite. The
  // backend now resolves purchaseToken ?? purchaseTokenAndroid server-side as a
  // safety net, but sending the correctly-named field is still the right
  // frontend behavior → see the fallback in toShimPurchase().
  purchaseToken?: string;
  // Amazon-only; never set on the play variant, kept so the type matches the
  // Amazon shim and subscription.ts stays identical.
  amazonUserId?: string;
  transactionReceipt?: string;
};

type FetchProductsOpts = { skus: string[]; type: string };
type RequestPurchaseOpts = {
  request: { ios: { sku: string }; android: { skus: string[] }; amazon: { sku: string } };
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
export type EnsureConnection = () => Promise<void>;
export type WithIAPContext = <P extends object>(
  Component: React.ComponentType<P>,
) => React.ComponentType<P>;

// ── Expo Go stub (unchanged from current shim) ─────────────────────────────
function useIAPStub(): IAPHookReturn {
  const stubSubs: ShimSubscription[] = [
    { id: 'com.betweencovers.app.membership.monthly', displayPrice: '$9.99', title: 'Monthly (DEV STUB)' },
    { id: 'com.betweencovers.app.membership.annual', displayPrice: '$89.99', title: 'Annual (DEV STUB)' },
  ];
  return {
    connected: true,
    subscriptions: stubSubs,
    currentPurchase: null,
    currentPurchaseError: null,
    fetchProducts: async () => stubSubs,
    requestPurchase: async () => {
      Alert.alert('Dev stub', 'expo-iap is not available in Expo Go. Build an EAS dev build to test real purchases.');
    },
    finishTransaction: async () => {},
  };
}
const restorePurchasesStub: RestorePurchases = async () => {
  Alert.alert('Dev stub', 'Restore purchases is a no-op in Expo Go.');
  return [];
};
const ensureConnectionStub: EnsureConnection = async () => {};
const passthroughHOC: WithIAPContext = (Component) => Component;

let resolvedUseIAP: UseIAP = useIAPStub;
let resolvedRestorePurchases: RestorePurchases = restorePurchasesStub;
let resolvedEnsureConnection: EnsureConnection = ensureConnectionStub;
let resolvedWithIAPContext: WithIAPContext = passthroughHOC;

// ── Real expo-iap path (iOS / Google Play) ─────────────────────────────────
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iap = require('expo-iap');

    // OpenIAP has no context provider — withIAPContext is gone. Pass-through so
    // _layout.tsx's `export default withIAPContext(RootLayout)` is unchanged.
    resolvedWithIAPContext = passthroughHOC;

    // Cache the RAW OpenIAP purchase so finishTransaction can hand the native
    // object back (a lossy ShimPurchase may not satisfy expo-iap's finish call).
    const rawByKey = new Map<string, any>();
    const keyOf = (p: any): string =>
      // VERIFY: token field name (`purchaseToken` vs `purchaseTokenAndroid`).
      p.purchaseToken ?? p.purchaseTokenAndroid ?? p.id ?? p.transactionId ?? '';

    // Product → ShimSubscription. VERIFY OpenIAP Product field names:
    //   displayPrice, subscriptionOfferDetailsAndroid[].pricingPhases.pricingPhaseList[].formattedPrice
    const toShimSubscription = (p: any): ShimSubscription => {
      const id: string = p.id ?? p.productId ?? '';
      const title: string | undefined = p.title ?? p.displayName ?? p.name;
      const androidOffer = Array.isArray(p.subscriptionOfferDetailsAndroid)
        ? p.subscriptionOfferDetailsAndroid[0]
        : undefined;
      const phases = androidOffer?.pricingPhases?.pricingPhaseList;
      const androidPrice =
        Array.isArray(phases) && phases.length > 0
          ? phases[phases.length - 1].formattedPrice // last phase = recurring price
          : undefined;
      const localized = p.displayPrice ?? androidPrice ?? p.price ?? '';
      return { id, displayPrice: String(localized), title };
    };

    // Purchase → ShimPurchase. The token fallback is the backend-critical line.
    const toShimPurchase = (p: any): ShimPurchase => {
      const k = keyOf(p);
      if (k) rawByKey.set(k, p);
      return {
        productId: p.productId ?? p.id ?? '',
        // transactionId restored to types in expo-iap ≥3.1; fall back defensively.
        transactionId: p.transactionId ?? p.id ?? p.purchaseToken ?? p.purchaseTokenAndroid ?? '',
        transactionDate: typeof p.transactionDate === 'number' ? p.transactionDate : undefined,
        // Read the unified field first, then the platform-suffixed one.
        purchaseToken: p.purchaseToken ?? p.purchaseTokenAndroid,
        amazonUserId: undefined, // never on play
        transactionReceipt: p.transactionReceipt,
      };
    };

    const useRealIAP: UseIAP = () => {
      // Reconstruct currentPurchase/currentPurchaseError from the callbacks —
      // OpenIAP's useIAP does NOT expose a currentPurchase field (RNIap #2806).
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [currentPurchase, setCurrentPurchase] = useState<ShimPurchase | null>(null);
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [currentPurchaseError, setCurrentPurchaseError] = useState<{ code?: string } | null>(null);

      // eslint-disable-next-line react-hooks/rules-of-hooks
      const real = iap.useIAP({
        onPurchaseSuccess: (p: any) => {
          setCurrentPurchaseError(null);
          setCurrentPurchase(toShimPurchase(p));
        },
        onPurchaseError: (e: any) => {
          setCurrentPurchaseError({ code: e?.code });
        },
      });

      // Readiness gate: flip true only after initConnection resolves (same
      // rationale as today; Amazon race is moot on play but the gate is harmless
      // and keeps `connected` semantics identical for the paywalls).
      // VERIFY: expo-iap's useIAP may auto-connect — confirm this double-init is
      // a no-op (initConnection is idempotent) and that `real.connected` isn't
      // preferable.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [ready, setReady] = useState(false);
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useEffect(() => {
        let cancelled = false;
        iap
          .initConnection()
          .then(() => { if (!cancelled) setReady(true); })
          .catch(() => {});
        return () => { cancelled = true; };
      }, []);

      // VERIFY: useIAP products may surface under `subscriptions` or `products`.
      const rawProducts = (real.subscriptions ?? real.products ?? []) as any[];
      const shimSubs: ShimSubscription[] = rawProducts.map(toShimSubscription);

      const fetchProducts = async (opts: FetchProductsOpts): Promise<ShimSubscription[]> => {
        // v14/expo-iap fetchProducts RETURNS the array (v12 returned void).
        const products = await iap.fetchProducts({
          skus: opts.skus,
          type: opts.type === 'subs' ? 'subs' : 'in-app',
        });
        return ((products ?? []) as any[]).map(toShimSubscription);
      };

      const requestPurchase = async (opts: RequestPurchaseOpts): Promise<void> => {
        const isSubs = opts.type === 'subs';
        const platform = getResolvedPlatform();
        const type = isSubs ? 'subs' : 'in-app';

        if (platform === 'ios') {
          // Platform key renamed ios → apple.
          await iap.requestPurchase({ request: { apple: { sku: opts.request.ios.sku } }, type });
          return;
        }

        // Google Play (android). Amazon can't occur in this binary.
        const skus = opts.request.android.skus;
        let subscriptionOffers: Array<{ sku: string; offerToken: string }> | undefined;
        if (isSubs) {
          subscriptionOffers = skus.map((sku) => {
            const product: any = rawProducts.find((p) => (p.id ?? p.productId) === sku);
            if (!product) {
              throw new Error(`Subscription product unavailable: ${sku}. Please try again or contact support.`);
            }
            // VERIFY field name: subscriptionOfferDetailsAndroid.
            const offers = product.subscriptionOfferDetailsAndroid;
            if (!Array.isArray(offers) || offers.length === 0) {
              throw new Error(`Subscription offer unavailable: ${sku}. Please try again or contact support.`);
            }
            const usable = offers.find(
              (o: any) => typeof o?.offerToken === 'string' && o.offerToken.length > 0,
            );
            if (!usable) {
              throw new Error(`Subscription offer token missing: ${sku}. Please try again or contact support.`);
            }
            return { sku, offerToken: usable.offerToken };
          });
        }
        // Platform key renamed android → google; offers passed inline.
        await iap.requestPurchase({ request: { google: { skus, subscriptionOffers } }, type });
      };

      const finishTransaction = async (opts: FinishTransactionOpts): Promise<void> => {
        // Hand back the RAW OpenIAP purchase if we still have it (keyed by token).
        const k = opts.purchase.purchaseToken ?? opts.purchase.transactionId ?? '';
        const raw = (k && rawByKey.get(k)) ?? opts.purchase;
        await iap.finishTransaction({ purchase: raw as any, isConsumable: opts.isConsumable });
      };

      return {
        connected: ready,
        subscriptions: shimSubs,
        currentPurchase,
        currentPurchaseError,
        fetchProducts,
        requestPurchase,
        finishTransaction,
      };
    };

    const realRestorePurchases: RestorePurchases = async () => {
      // Play path only — no Amazon getUser/retry dance needed here.
      const purchases = await iap.getAvailablePurchases();
      return ((purchases ?? []) as any[]).map(toShimPurchase);
    };

    const realEnsureConnection: EnsureConnection = async () => {
      try {
        await iap.initConnection(); // idempotent
      } catch {
        // ignore — caller treats a missing connection as "no purchases found"
      }
    };

    resolvedUseIAP = useRealIAP;
    resolvedRestorePurchases = realRestorePurchases;
    resolvedEnsureConnection = realEnsureConnection;
  } catch (err) {
    console.warn('[iap-shim.play] Failed to load expo-iap, falling back to stub:', err);
  }
}

export const useIAP: UseIAP = resolvedUseIAP;
export const restorePurchases: RestorePurchases = resolvedRestorePurchases;
export const ensureConnection: EnsureConnection = resolvedEnsureConnection;
export const withIAPContext: WithIAPContext = resolvedWithIAPContext;
