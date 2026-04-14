import { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { normalizeRoute } from '../lib/routes';
import { signOut } from '../lib/signout';

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

      const forceLogin = async () => {
        // Wipe any stale tokens before landing on the login screen so the
        // user starts completely fresh (no Face ID prompt, no cached session).
        await signOut();
        router.replace('/(auth)/login');
      };

      try {
        const raw = await SecureStore.getItemAsync('bc_id_token');
        const idToken = raw?.trim() ?? null;

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_SPLASH_TIME - elapsed);
        await new Promise(resolve => setTimeout(resolve, remaining));

        // No token or malformed token — clean up and go to login.
        if (!idToken || !isValidJwt(idToken)) {
          await forceLogin();
          return;
        }

        const res = await fetch(`${API_BASE}/auth/resolve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });

        // Non-200 means the token is expired, the user was deleted/deactivated,
        // or the account no longer exists. Force a full signout so no stale
        // credentials remain and the login screen starts fresh.
        if (!res.ok) {
          await forceLogin();
          return;
        }

        const result = await res.json();

        if (result?.nextRoute?.startsWith('/')) {
          router.replace(normalizeRoute(result.nextRoute) as any);
        } else {
          await forceLogin();
        }
      } catch {
        await forceLogin();
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