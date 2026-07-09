import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { useIAP, restorePurchases as doRestorePurchases, getResolvedPlatform } from '../../lib/iap-shim';
import {
  MONTHLY_PRODUCT_ID,
  ANNUAL_PRODUCT_ID,
  ALL_PRODUCT_IDS,
  writeSubscription,
  safeFinishTransaction,
  priceLabelFor,
  reconcileAmazonPurchases,
  resolveEntitlementRoute,
  isPaywallRoute,
} from '../../lib/subscription';
import { normalizeRoute } from '../../lib/routes';
import { signOut } from '../../lib/signout';
import { track } from '../../lib/analytics';
// TEMPORARY DEBUG INSTRUMENTATION — remove with the IAP trace capture.
import { recordIapError } from '../../lib/iapDebug';

const TERMS_URL   = 'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/terms-of-use.html';
const PRIVACY_URL = 'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/privacy-policy.html';

export default function DoorScreen() {
  const router = useRouter();
  const {
    connected,
    subscriptions,
    currentPurchase,
    currentPurchaseError,
    fetchProducts,
    requestPurchase,
    finishTransaction,
  } = useIAP();

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');
  const finishingRef = useRef(false);

  useEffect(() => {
    track('paywall_shown', { type: 'soft', source: 'door' });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' })
      // TEMPORARY DEBUG: record-only (effect already swallows; behavior unchanged).
      .catch((e) => recordIapError('door.fetchProducts', e))
      .finally(() => setLoading(false));
  }, [connected]);

  // Amazon entitlement recovery on paywall load. If a direct purchase rejected
  // with E_UNKNOWN while the Amazon subscription actually completed, no write
  // happened — so on load we query Amazon's existing purchases, verify the
  // receipt with the backend, and route away if the user is now entitled.
  // Amazon-only (helper no-ops off-Amazon); silent and best-effort.
  useEffect(() => {
    if (getResolvedPlatform() !== 'amazon') return;
    let cancelled = false;
    (async () => {
      const recovered = await reconcileAmazonPurchases();
      if (cancelled || !recovered) return;
      const next = await resolveEntitlementRoute();
      if (cancelled || !next || isPaywallRoute(next)) return;
      router.replace(normalizeRoute(next) as any);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentPurchase) return;
    if (!ALL_PRODUCT_IDS.includes(currentPurchase.productId)) return;
    if (finishingRef.current) return;
    finishingRef.current = true;

    const confirm = async () => {
      try {
        // 1. Verify + record with the backend FIRST (awaited). On Android the
        //    backend verifies the purchaseToken against Google and acknowledges
        //    the purchase server-side.
        const written = await writeSubscription(currentPurchase);
        if (!written) {
          // Leave the purchase PENDING (do NOT finishTransaction) so the launch
          // reconcile retries it next time; surface a retry to the user.
          showError("Couldn't confirm your purchase. Please try again.");
          setPurchasing(false);
          return;
        }

        // 2. Only after a successful write, finish the transaction — tolerating
        //    "already acknowledged" (the backend acked it server-side).
        await safeFinishTransaction(finishTransaction, currentPurchase);

        track('subscription_started', {
          platform: getResolvedPlatform(),
          plan: currentPurchase.productId === ANNUAL_PRODUCT_ID ? 'annual' : 'monthly',
          trial: true,
        });

        // 3. Route via the backend entitlement check, as today.
        try {
          const token = await SecureStore.getItemAsync('bc_id_token');
          if (token) {
            const resolveRes = await fetch('https://api.betweencovers.app/auth/resolve', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (resolveRes.ok) {
              const result = await resolveRes.json();
              if (result?.nextRoute?.startsWith('/')) {
                router.replace(normalizeRoute(result.nextRoute) as any);
                return;
              }
            }
          }
        } catch (err) {
          console.warn('Post-purchase resolve failed:', err);
        }
        router.replace('/(auth)/login');
      } catch {
        showError('Purchase verification failed. Please try again.');
        setPurchasing(false);
      } finally {
        finishingRef.current = false;
      }
    };

    confirm();
  }, [currentPurchase]);

  useEffect(() => {
    if (!currentPurchaseError) return;
    setPurchasing(false);
    const code = (currentPurchaseError as any).code;
    if (code !== 'E_USER_CANCELLED' && code !== 'user_cancelled') {
      showError('Purchase failed. Please try again.');
    }
  }, [currentPurchaseError]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 3500);
  };

  const handlePurchase = async () => {
    if (purchasing || restoring) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setPurchasing(true);
    const sku = selectedPlan === 'annual' ? ANNUAL_PRODUCT_ID : MONTHLY_PRODUCT_ID;
    try {
      await requestPurchase({
        request: {
          ios: { sku },
          android: { skus: [sku] },
          amazon: { sku },
        },
        type: 'subs',
      });
    } catch (err: any) {
      showError(err?.message ?? 'Purchase failed. Please try again.');
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (purchasing || restoring) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    try {
      const purchases = await doRestorePurchases();
      const active = purchases.find((p) => ALL_PRODUCT_IDS.includes(p.productId));
      if (active) {
        // Write the device-verified purchase back to the backend before
        // re-resolving, so a stale/missing record can self-heal.
        await writeSubscription(active);
        try {
          const idToken = await SecureStore.getItemAsync('bc_id_token');
          if (idToken) {
            const resolveRes = await fetch('https://api.betweencovers.app/auth/resolve', {
              method: 'POST',
              headers: { Authorization: `Bearer ${idToken}` },
            });
            if (resolveRes.ok) {
              const result = await resolveRes.json();
              if (result?.nextRoute?.startsWith('/')) {
                router.replace(normalizeRoute(result.nextRoute) as any);
                return;
              }
            }
          }
        } catch (err) {
          console.warn('Post-restore resolve failed:', err);
        }
        router.replace('/(auth)/login');
      } else {
        showError('No active subscription found.');
      }
    } catch {
      showError('Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const handleNotNow = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await signOut();
    router.replace('/(auth)/login' as any);
  };

  const annualProduct  = subscriptions.find((s) => s.id === ANNUAL_PRODUCT_ID);
  const monthlyProduct = subscriptions.find((s) => s.id === MONTHLY_PRODUCT_ID);
  // Use the store price when it's a real price; fall back to the canonical
  // catalog price when the store returns none — Amazon normalizes these subs to
  // "0.0", which would otherwise render as "0.0/year".
  const annualPriceLabel  = priceLabelFor(ANNUAL_PRODUCT_ID, annualProduct?.displayPrice, '/year');
  const monthlyPriceLabel = priceLabelFor(MONTHLY_PRODUCT_ID, monthlyProduct?.displayPrice, '/month');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headline}>Your next obsession is waiting.</Text>

      <Text style={styles.body}>
        Find your next obsession, settle into the vibe, and stay for the conversations. Your first 7 days are on us.
      </Text>

      <View style={styles.plans}>
        <TouchableOpacity
          style={[styles.planCard, selectedPlan === 'annual' && styles.planCardSelected]}
          onPress={() => setSelectedPlan('annual')}
          activeOpacity={0.8}
        >
          <View style={styles.planCardInner}>
            <View style={styles.planCardLeft}>
              <Text style={styles.planTitle}>Annual</Text>
              {loading ? (
                <ActivityIndicator color="#FDFAF6" style={styles.planLoader} />
              ) : (
                <>
                  <Text style={styles.planPrice}>7 days free, then {annualPriceLabel}</Text>
                  <Text style={styles.planSub}>About $7.50/month</Text>
                </>
              )}
            </View>
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>Best Value</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardSelected]}
          onPress={() => setSelectedPlan('monthly')}
          activeOpacity={0.8}
        >
          <View style={styles.planCardInner}>
            <View style={styles.planCardLeft}>
              <Text style={styles.planTitle}>Monthly</Text>
              {loading ? (
                <ActivityIndicator color="#FDFAF6" style={styles.planLoader} />
              ) : (
                <Text style={styles.planPrice}>7 days free, then {monthlyPriceLabel}</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.cta}>
        <TouchableOpacity
          style={[styles.primaryBtn, (purchasing || loading) && styles.btnDisabled]}
          onPress={handlePurchase}
          disabled={purchasing || loading}
          activeOpacity={0.85}
        >
          {purchasing ? (
            <ActivityIndicator color="#FDFAF6" />
          ) : (
            <Text style={styles.primaryBtnText}>Start your free 7-day trial</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.microcopy}>Instant access. Cancel anytime.</Text>
        <Text style={styles.microcopy}>We'll remind you the day before your free trial ends.</Text>

        <TouchableOpacity
          onPress={handleRestore}
          disabled={restoring || purchasing}
          activeOpacity={0.7}
        >
          {restoring ? (
            <ActivityIndicator color="#C4A882" size="small" />
          ) : (
            <Text style={styles.restoreText}>Restore Purchase</Text>
          )}
        </TouchableOpacity>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} activeOpacity={0.7}>
            <Text style={styles.legalLinkText}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={styles.legalLinkSep}>•</Text>
          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} activeOpacity={0.7}>
            <Text style={styles.legalLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.notNowBtn} onPress={handleNotNow} activeOpacity={0.7}>
          <Text style={styles.notNowText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    paddingTop: 80,
    paddingBottom: 56,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  headline: {
    fontFamily: 'Georgia',
    fontSize: 42,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#FDFAF6',
    textAlign: 'center',
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    color: '#C4A882',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 40,
  },
  plans: {
    width: '100%',
    gap: 12,
    marginBottom: 28,
  },
  planCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
  },
  planCardSelected: {
    borderColor: '#B83255',
    backgroundColor: 'rgba(184,50,85,0.08)',
  },
  planCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planCardLeft: {
    flex: 1,
    gap: 4,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FDFAF6',
  },
  planPrice: {
    fontSize: 13,
    color: '#C4A882',
  },
  planSub: {
    fontSize: 12,
    color: 'rgba(196,168,130,0.7)',
  },
  planLoader: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  bestValueBadge: {
    backgroundColor: 'rgba(184,50,85,0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  bestValueText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FDFAF6',
  },
  cta: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    height: 56,
    backgroundColor: '#B83255',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FDFAF6',
  },
  microcopy: {
    fontSize: 12,
    color: 'rgba(196,168,130,0.7)',
    textAlign: 'center',
  },
  restoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C4A882',
    textDecorationLine: 'underline',
  },
  error: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  legalLinkText: {
    fontSize: 12,
    color: '#C4A882',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  legalLinkSep: {
    fontSize: 12,
    color: 'rgba(196,168,130,0.5)',
  },
  notNowBtn: {
    marginTop: 8,
    paddingVertical: 4,
  },
  notNowText: {
    fontSize: 13,
    color: 'rgba(196,168,130,0.5)',
  },
});
