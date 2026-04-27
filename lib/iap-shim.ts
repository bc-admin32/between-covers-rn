/**
 * Expo Go compatibility shim for expo-iap.
 *
 * expo-iap is a native module that isn't bundled in Expo Go. Importing it
 * directly from screens crashes the entire route tree at module load time
 * (see: "Cannot find native module 'ExpoIap'").
 *
 * This shim:
 *   - In Expo Go: exports stub implementations that let screens render with
 *     fake/empty IAP state. Purchase/restore flows are no-ops that show a
 *     dev-only alert. Routing-around-the-paywall can be tested.
 *   - In dev builds and production: re-exports the real expo-iap module.
 *
 * The exported types describe ONLY what door.tsx / hard-paywall.tsx consume
 * — they are intentionally narrower than real expo-iap. Real expo-iap is
 * structurally compatible at the runtime require() branch (the require()
 * result is `any`, so the narrow declared signature is honored downstream).
 *
 * IMPORTANT: This shim only exists for routing/UI testing in Expo Go.
 * Real StoreKit behavior MUST be tested in an EAS build before launch.
 */

import Constants from 'expo-constants';
import { Alert } from 'react-native';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

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
        'expo-iap is not available in Expo Go. Build an EAS dev build to test real purchases.\n\nFor now, you can advance through the flow by tapping "Not now" or by manually setting subscriptionStatus on your user record in DynamoDB.',
      );
    },
    finishTransaction: async (_opts: FinishTransactionOpts) => {},
  };
}

const restorePurchasesStub: RestorePurchases = async () => {
  Alert.alert('Dev stub', 'Restore purchases is a no-op in Expo Go.');
  return [];
};

let resolvedUseIAP: UseIAP = useIAPStub;
let resolvedRestorePurchases: RestorePurchases = restorePurchasesStub;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realIap = require('expo-iap');
    resolvedUseIAP = realIap.useIAP;
    resolvedRestorePurchases = realIap.restorePurchases;
  } catch (err) {
    console.warn('[iap-shim] Failed to load expo-iap, falling back to stub:', err);
  }
}

export const useIAP: UseIAP = resolvedUseIAP;
export const restorePurchases: RestorePurchases = resolvedRestorePurchases;
