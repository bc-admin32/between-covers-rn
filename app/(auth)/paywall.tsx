import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { useIAP, restorePurchases as doRestorePurchases } from 'expo-iap';
import { normalizeRoute } from '../../lib/routes';

const MONTHLY_PRODUCT_ID = 'com.betweencovers.app.membership.monthly';
const ANNUAL_PRODUCT_ID  = 'com.betweencovers.app.membership.annual';
const ALL_PRODUCT_IDS    = [MONTHLY_PRODUCT_ID, ANNUAL_PRODUCT_ID];

export default function PaywallScreen() {
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

  // Fallback: stop loading after 8s if StoreKit never connects
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, []);

  // Fetch subscription product once StoreKit connection is ready
  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [connected]);

  // Handle successful purchase event
  useEffect(() => {
    if (!currentPurchase) return;
    if (!ALL_PRODUCT_IDS.includes(currentPurchase.productId)) return;
    if (finishingRef.current) return;
    finishingRef.current = true;

    const confirm = async () => {
  try {
    await finishTransaction({ purchase: currentPurchase, isConsumable: false });

    // Write subscription to DynamoDB
    const idToken = await SecureStore.getItemAsync('bc_id_token');
    if (idToken) {
      await fetch('https://api.betweencovers.app/subscription/write', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: currentPurchase.productId,
          transactionId: currentPurchase.transactionId,
          platform: 'ios',
          originalPurchaseDate: currentPurchase.transactionDate
            ? new Date(currentPurchase.transactionDate).toISOString()
            : new Date().toISOString(),
        }),
      }).catch(err => console.warn('Subscription write failed:', err));
    }

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

  // Handle purchase error event
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
        },
        type: 'subs',
      });
    } catch {
      // Purchase error handled by currentPurchaseError effect
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

  const handleSignIn = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/(auth)/login');
  };

  const annualProduct  = subscriptions.find((s) => s.id === ANNUAL_PRODUCT_ID);
  const monthlyProduct = subscriptions.find((s) => s.id === MONTHLY_PRODUCT_ID);

  const annualPriceLabel  = annualProduct  ? `${annualProduct.displayPrice}/year`  : '$89.99/year';
  const monthlyPriceLabel = monthlyProduct ? `${monthlyProduct.displayPrice}/month` : '$10.99/month';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.brand}>Between Covers</Text>
      <Text style={styles.tagline}>Your romance escape starts here</Text>

      <View style={styles.features}>
        <FeatureRow icon="✨" text="Meet Iris, your romance book bestie" />
        <FeatureRow icon="💬" text="Join the Lounge for romance chats and community discussions" />
        <FeatureRow icon="📚" text="Discover curated reads, cozy picks, and your next obsession" />
        <FeatureRow icon="🎥" text="Join live moments as the community grows" />
        <FeatureRow icon="🌙" text="Unlock the full Between Covers experience" />
      </View>

      <View style={styles.plans}>
        {/* Annual card */}
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
              <Text style={styles.bestValueText}>⭐ Best Value</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Monthly card */}
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
            <Text style={styles.primaryBtnText}>Start My Free Trial</Text>
          )}
        </TouchableOpacity>

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

        <Text style={styles.legal}>
          Cancel anytime. Subscription renews automatically unless canceled before renewal.
        </Text>
      </View>

      <TouchableOpacity style={styles.signInLink} onPress={handleSignIn} activeOpacity={0.7}>
        <Text style={styles.signInText}>Already a member? </Text>
        <Text style={[styles.signInText, styles.signInUnderline]}>Sign In</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    paddingTop: 72,
    paddingBottom: 48,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  brand: {
    fontFamily: 'Georgia',
    fontSize: 38,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#FDFAF6',
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: '#C4A882',
    textAlign: 'center',
    marginBottom: 36,
  },
  features: {
    width: '100%',
    gap: 14,
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  featureText: {
    fontSize: 15,
    color: '#F0EDE4',
    flex: 1,
    lineHeight: 22,
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
  legal: {
    fontSize: 11,
    color: 'rgba(196,168,130,0.7)',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
  signInLink: {
    flexDirection: 'row',
    marginTop: 32,
  },
  signInText: {
    fontSize: 14,
    color: '#C4A882',
  },
  signInUnderline: {
    textDecorationLine: 'underline',
  },
});