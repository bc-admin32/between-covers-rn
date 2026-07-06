import * as SecureStore from 'expo-secure-store';
import {
  getResolvedPlatform,
  isGooglePlay,
  restorePurchases,
  ensureConnection,
  type ShimPurchase,
} from './iap-shim';

const API_BASE = 'https://api.betweencovers.app';

// ── Membership product IDs ──────────────────────────────────────────────────
// Single source of truth, imported by door.tsx, hard-paywall.tsx, and the
// launch reconcile in index.tsx (previously duplicated in each paywall screen).
export const MONTHLY_PRODUCT_ID = 'com.betweencovers.app.membership.monthly';
export const ANNUAL_PRODUCT_ID = 'com.betweencovers.app.membership.annual';
export const ALL_PRODUCT_IDS = [MONTHLY_PRODUCT_ID, ANNUAL_PRODUCT_ID];

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
    transactionId: purchase.transactionId,
    platform,
  };

  if (platform === 'android') {
    // The field the backend needs to verify the purchase against Google.
    // Without it there's nothing to verify, so don't claim success.
    if (!purchase.purchaseToken) return false;
    body.purchaseToken = purchase.purchaseToken;
  } else {
    // iOS / Amazon: preserve the existing payload shape (no purchaseToken).
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
  } catch {
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
  } catch {
    return false;
  }
}
