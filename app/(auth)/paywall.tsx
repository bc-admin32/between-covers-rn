import { useEffect, useState } from 'react';
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
import {
  IAPProvider,
  useIAP,
  getAvailablePurchases,
  type ProductPurchase,
} from 'expo-iap';

const PRODUCT_ID = 'com.betweencovers.app.membership.monthly';

// IAPProvider must wrap the component that calls useIAP.
export default function PaywallScreen() {
  return (
    <IAPProvider>
      <PaywallContent />
    </IAPProvider>
  );
}

function PaywallContent() {
  const router = useRouter();
  const {
    subscriptions,
    currentPurchase,
    currentPurchaseError,
    getSubscriptions,
    requestSubscription,
    finishTransaction,
  } = useIAP();

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load product price on mount.
  useEffect(() => {
    getSubscriptions({ skus: [PRODUCT_ID] })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Handle successful purchase.
  useEffect(() => {
    if (!currentPurchase || currentPurchase.productId !== PRODUCT_ID) return;
    const confirm = async () => {
      try {
        await finishTransaction({ purchase: currentPurchase, isConsumable: false });
        await SecureStore.setItemAsync('bc_subscription_active', 'true');
        router.replace('/(auth)/login');
      } catch {
        showError('Purchase verification failed. Please try again.');
      } finally {
        setPurchasing(false);
      }
    };
    confirm();
  }, [currentPurchase]);

  // Handle purchase error.
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
    try {
      await requestSubscription({ sku: PRODUCT_ID });
    } catch {
      // currentPurchaseError effect handles the error UI.
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (purchasing || restoring) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    try {
      const purchases: ProductPurchase[] = await getAvailablePurchases();
      const active = purchases.find(p => p.productId === PRODUCT_ID);
      if (active) {
        await SecureStore.setItemAsync('bc_subscription_active', 'true');
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

  const product = subscriptions.find(s => s.productId === PRODUCT_ID);
  const priceText = product
    ? `${(product as any).localizedPrice ?? (product as any).price} / month`
    : '$7.99 / month';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.brand}>Between Covers</Text>
      <Text style={styles.tagline}>Your cozy romance reading escape</Text>

      <View style={styles.features}>
        <FeatureRow icon="📚" text="Weekly book discussions & hot takes" />
        <FeatureRow icon="✨" text="The Lounge — your book club community" />
        <FeatureRow icon="🌹" text="Iris, your AI romance reading guide" />
        <FeatureRow icon="📖" text="Monthly prompts & reading challenges" />
      </View>

      <View style={styles.pricing}>
        {loading ? (
          <ActivityIndicator color="#FDFAF6" />
        ) : (
          <>
            <Text style={styles.price}>{priceText}</Text>
            <Text style={styles.trial}>7-day free trial · cancel anytime</Text>
          </>
        )}
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
            <Text style={styles.primaryBtnText}>Start Free Trial</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, (restoring || purchasing) && styles.btnDisabled]}
          onPress={handleRestore}
          disabled={restoring || purchasing}
          activeOpacity={0.7}
        >
          {restoring ? (
            <ActivityIndicator color="#FDFAF6" size="small" />
          ) : (
            <Text style={styles.secondaryBtnText}>Restore Purchase</Text>
          )}
        </TouchableOpacity>

        {errorMsg ? (
          <Text style={styles.error}>{errorMsg}</Text>
        ) : null}

        <Text style={styles.legal}>
          Cancel anytime. Billed monthly after free trial.{'\n'}
          Subscriptions auto-renew unless cancelled.
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
    backgroundColor: '#0F2A48',
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
    marginBottom: 40,
  },
  features: {
    width: '100%',
    gap: 16,
    marginBottom: 36,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIcon: {
    fontSize: 22,
  },
  featureText: {
    fontSize: 15,
    color: '#F0EDE4',
    flex: 1,
  },
  pricing: {
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 32,
  },
  price: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FDFAF6',
    marginBottom: 4,
  },
  trial: {
    fontSize: 13,
    color: '#C4A882',
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
  secondaryBtn: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
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
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FDFAF6',
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
