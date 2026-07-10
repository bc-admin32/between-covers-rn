import * as SecureStore from 'expo-secure-store';
import {
  getResolvedPlatform,
  isGooglePlay,
  restorePurchases,
  ensureConnection,
  type ShimPurchase,
} from './iap-shim';
// TEMPORARY DEBUG INSTRUMENTATION — remove with the IAP trace capture.
import { recordIapError } from './iapDebug';

const API_BASE = 'https://api.betweencovers.app';

// ── Membership product IDs ──────────────────────────────────────────────────
// Single source of truth, imported by door.tsx, hard-paywall.tsx, and the
// launch reconcile in index.tsx (previously duplicated in each paywall screen).
export const MONTHLY_PRODUCT_ID = 'com.betweencovers.app.membership.monthly';
export const ANNUAL_PRODUCT_ID = 'com.betweencovers.app.membership.annual';
export const ALL_PRODUCT_IDS = [MONTHLY_PRODUCT_ID, ANNUAL_PRODUCT_ID];

// ── Canonical catalog prices (display strings) ──────────────────────────────
// Fallback headline prices, keyed by product id. Used when the store's own
// price is unusable — on Amazon, getSubscriptions normalizes auto-renew
// subscription SKUs to the literal string "0.0" because Amazon's native
// Product.getPrice() returns null/empty for them (see toShimSubscription /
// react-native-iap fillProductsWithAdditionalData). These MUST track the prices
// configured in the store consoles.
export const PRODUCT_DISPLAY_PRICE: Record<string, string> = {
  [MONTHLY_PRODUCT_ID]: '$9.99',
  [ANNUAL_PRODUCT_ID]: '$89.99',
};

/**
 * Returns the trimmed store price when it's a real, non-zero price; otherwise
 * null. Treats missing/empty and zero sentinels ("0.0", "0", "$0.00") as
 * unusable — that's what the Amazon path yields when it has no real price.
 */
export function usableStorePrice(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/[^\d.,]/g, '').replace(',', '.'));
  if (!Number.isNaN(numeric) && numeric === 0) return null;
  return trimmed;
}

/**
 * Headline price label for a product: the store price when usable, else the
 * canonical catalog price. `suffix` is appended (e.g. "/year"). Empty string
 * only if the product id is unknown and the store price is unusable.
 */
export function priceLabelFor(
  productId: string,
  storePrice?: string | null,
  suffix = '',
): string {
  const price = usableStorePrice(storePrice) ?? PRODUCT_DISPLAY_PRICE[productId] ?? '';
  return price ? `${price}${suffix}` : '';
}

// Routes /auth/resolve returns when the user is NOT entitled (paywalled).
export function isPaywallRoute(route: string | null | undefined): boolean {
  if (!route) return false;
  return route.includes('/door') || route.includes('/hard-paywall');
}

/**
 * Send a purchase to the backend for verification + recording.
 *
 * The backend (subscriptionWrite v4) verifies Android purchases against Google
 * when a `purchaseToken` is present and returns `{ success, verified,
 * subscription }`. It also ACKNOWLEDGES the purchase server-side.
 *
 * Returns true only when the backend accepted/verified the purchase. On any
 * failure returns false so callers can leave the purchase PENDING (do NOT
 * finishTransaction) and let the next launch reconcile retry. Awaited — never
 * fire-and-forget.
 */
export async function writeSubscription(purchase: ShimPurchase): Promise<boolean> {
  const idToken = await SecureStore.getItemAsync('bc_id_token');
  if (!idToken) return false;

  const platform = getResolvedPlatform();
  const body: Record<string, unknown> = {
    productId: purchase.productId,
    // Amazon receipts have no transactionId; fall back to the receiptId
    // (carried as purchaseToken) so the backend always gets a non-empty id.
    transactionId: purchase.transactionId || purchase.purchaseToken || '',
    platform,
  };

  if (platform === 'android') {
    // The field the backend needs to verify the purchase against Google.
    // Without it there's nothing to verify, so don't claim success.
    if (!purchase.purchaseToken) return false;
    body.purchaseToken = purchase.purchaseToken;
  } else if (platform === 'amazon') {
    // Amazon verification needs the receiptId (mapped to purchaseToken by the
    // shim) and the Amazon userId — together they address Amazon's Receipt
    // Verification Service (verifyReceiptId/user/{userId}/receiptId/{receiptId}).
    // Without the receiptId there's nothing to verify, so don't claim success.
    //
    // BACKEND DEPENDENCY: subscriptionWrite (AWS Lambda) must accept + verify
    // these Amazon fields (receiptId / amazonUserId / transactionReceipt) and
    // record the subscription. Until it does, this write will not grant
    // entitlement even though the payload is now correct.
    const receiptId = purchase.purchaseToken;
    if (!receiptId) return false;
    body.receiptId = receiptId;
    body.purchaseToken = receiptId;
    const amazonUserId = purchase.amazonUserId ?? (purchase as any).userIdAmazon;
    if (amazonUserId) body.amazonUserId = amazonUserId;
    const receipt = purchase.transactionReceipt ?? (purchase as any).transactionReceipt;
    if (receipt) body.transactionReceipt = receipt;
    body.originalPurchaseDate = purchase.transactionDate
      ? new Date(purchase.transactionDate).toISOString()
      : new Date().toISOString();
  } else {
    // iOS: preserve the existing payload shape (no purchaseToken).
    body.originalPurchaseDate = purchase.transactionDate
      ? new Date(purchase.transactionDate).toISOString()
      : new Date().toISOString();
  }

  try {
    const res = await fetch(`${API_BASE}/subscription/write`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    // { success, verified, subscription } — treat an explicit failure as failure.
    const data = await res.json().catch(() => null);
    if (data && (data.success === false || data.verified === false)) return false;
    return true;
  } catch (e) {
    // TEMPORARY DEBUG: record-only (this path intentionally swallows and returns
    // false so the caller leaves the purchase PENDING; behavior unchanged).
    recordIapError('writeSubscription', e);
    return false;
  }
}

type FinishFn = (opts: { purchase: ShimPurchase; isConsumable: boolean }) => Promise<void>;

/**
 * finishTransaction that tolerates benign post-verification errors. Because the
 * backend acknowledges the purchase server-side, the client finish can race into
 * "already acknowledged" / "already owned" / already-finished — all harmless
 * once the write has succeeded. Never throws: an entitled user must not be
 * blocked by a finish hiccup.
 */
export async function safeFinishTransaction(
  finishTransaction: FinishFn,
  purchase: ShimPurchase,
): Promise<void> {
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch (err: any) {
    const msg = String(err?.message ?? err?.code ?? '').toLowerCase();
    const benign =
      msg.includes('acknowledg') ||
      msg.includes('already') ||
      msg.includes('finish') ||
      msg.includes('not found');
    if (!benign) {
      console.warn('[subscription] finishTransaction failed (non-blocking):', err);
    }
  }
}

/**
 * Launch reconcile: if the backend says the user is not entitled but Google
 * still holds an active subscription, push that purchase to the backend so the
 * next /auth/resolve grants access. GOOGLE PLAY ONLY; silent/best-effort.
 * Returns true only if a verified write was made (caller should then re-resolve).
 *
 * This is Play-only reconciliation (`getAvailablePurchases()` against Google
 * Billing). It MUST be gated on the shim's store detector (`isGooglePlay()`),
 * NOT `Platform.OS === 'android'`: Amazon Fire reports `Platform.OS === 'android'`,
 * so a Platform.OS gate would run this Play path on Amazon — the same class of
 * bug as the PurchasingListener error, one step later. `isGooglePlay()` returns
 * false on Amazon (and iOS), so this is a hard no-op there.
 */
export async function reconcileAndroidPurchases(): Promise<boolean> {
  if (!isGooglePlay()) return false;
  try {
    // getAvailablePurchases needs an IAP connection; at cold start no paywall
    // screen has mounted useIAP() yet, so establish it ourselves (tolerant).
    await ensureConnection();
    const purchases = await restorePurchases();
    const active = purchases.find(
      (p) => ALL_PRODUCT_IDS.includes(p.productId) && !!p.purchaseToken,
    );
    if (!active) return false;
    return await writeSubscription(active);
  } catch (e) {
    // TEMPORARY DEBUG: record-only (this path intentionally swallows and returns
    // false so launch never blocks; re-throwing would change behavior).
    recordIapError('reconcileAndroidPurchases', e);
    return false;
  }
}

/**
 * Amazon analogue of reconcileAndroidPurchases. Queries Amazon for existing
 * purchases (getAvailablePurchases → PurchaseUpdatesResponse) and, if an active
 * membership receipt is found, writes it to the backend for verification +
 * recording. Returns true only if a verified write was made (caller should then
 * re-resolve). AMAZON ONLY; hard no-op on Google/iOS (getResolvedPlatform gate).
 *
 * This is the recovery path for the case that actually happened: a direct
 * requestPurchase rejected with E_UNKNOWN while the Amazon purchase truly
 * completed, so `currentPurchase` never fired and nothing was written. Querying
 * available purchases recovers the receipt regardless of the failed request.
 *
 * NOTE: entitlement is only granted once subscriptionWrite (AWS) verifies the
 * Amazon receipt — see writeSubscription's amazon branch.
 *
 * Amazon readiness (register the PurchasingListener + resolve the current user
 * before querying entitlements) and the E_UNKNOWN retry are handled inside the
 * shim's restorePurchases() — see lib/iap-shim.ts. Amazon's getAvailableItems
 * otherwise rejects with E_UNKNOWN when called before that setup, which is what
 * made this reconcile throw before ever reaching the backend. restorePurchases()
 * now degrades to an empty result instead of throwing, so a no-purchase (or
 * transiently-unavailable) query simply returns false here.
 */
export async function reconcileAmazonPurchases(): Promise<boolean> {
  if (getResolvedPlatform() !== 'amazon') return false;
  try {
    // ensureConnection is idempotent; the shim's restorePurchases() also
    // guarantees listener+user readiness for the Amazon query.
    await ensureConnection();
    const purchases = await restorePurchases();
    const active = purchases.find(
      (p) => ALL_PRODUCT_IDS.includes(p.productId) && !!p.purchaseToken,
    );
    if (!active) return false;
    return await writeSubscription(active);
  } catch (e) {
    // Record-only: best-effort recovery must never throw into the paywall.
    recordIapError('reconcileAmazonPurchases', e);
    return false;
  }
}

/**
 * Backend-authoritative entitlement check. POSTs /auth/resolve and returns the
 * next route string when the user is entitled (a non-null, app-relative route);
 * returns null on any failure or when no route is given. Never throws.
 */
export async function resolveEntitlementRoute(): Promise<string | null> {
  const idToken = await SecureStore.getItemAsync('bc_id_token');
  if (!idToken) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const next = data?.nextRoute;
    return typeof next === 'string' && next.startsWith('/') ? next : null;
  } catch (e) {
    recordIapError('resolveEntitlementRoute', e);
    return null;
  }
}
