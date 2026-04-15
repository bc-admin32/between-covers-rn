import { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { normalizeRoute } from '../lib/routes';
import { signOut } from '../lib/signout';
import {
  initConnection,
  endConnection,
  getAvailablePurchases,
} from 'expo-iap';

const IAP_PRODUCT_ID = 'com.betweencovers.app.membership.monthly';

const API_BASE = 'https://api.betweencovers.app';
const MIN_SPLASH_TIME = 1600;

const JWT_RE = /^[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+$/;

function isValidJwt(token: string): boolean {
  return JWT_RE.test(token.trim());
}

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const start = Date.now();

      const goPaywall = () => router.replace('/(auth)/paywall' as any);
      const goLogin  = () => router.replace('/(auth)/login');

      const elapsed = () => Date.now() - start;
      const waitForSplash = () =>
        new Promise(resolve =>
          setTimeout(resolve, Math.max(0, MIN_SPLASH_TIME - elapsed()))
        );

      try {
        const raw = await SecureStore.getItemAsync('bc_id_token');
        const idToken = raw?.trim() ?? null;

        // ── RETURNING USER: valid token → resolve and route ──────────────
        if (idToken && isValidJwt(idToken)) {
          const res = await fetch(`${API_BASE}/auth/resolve`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
          });

          await waitForSplash();

          if (res.ok) {
            const result = await res.json();
            if (result?.nextRoute?.startsWith('/')) {
              router.replace(normalizeRoute(result.nextRoute) as any);
              return;
            }
          }

          // Token rejected — wipe and fall through to subscription check.
          await signOut();
        } else {
          await waitForSplash();
        }

        // ── NEW / LOGGED-OUT USER: check subscription ────────────────────
        // Fast path: check cached flag written after purchase/restore.
        const cached = await SecureStore.getItemAsync('bc_subscription_active');
        if (cached === 'true') {
          goLogin();
          return;
        }

        // Slow path: query StoreKit for active purchases.
        try {
          await initConnection();
          const purchases = await getAvailablePurchases();
          await endConnection();
          const active = purchases.find(p => p.productId === IAP_PRODUCT_ID);
          if (active) {
            await SecureStore.setItemAsync('bc_subscription_active', 'true');
            goLogin();
            return;
          }
        } catch {
          // StoreKit unavailable (e.g. simulator without Apple ID) — show paywall.
        }

        goPaywall();
      } catch {
        goPaywall();
      }
    };

    run();
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/logo-shadow.png' }}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F2A48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 220,
    height: 120,
  },
});