import { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { normalizeRoute } from '../lib/routes';
import { signOut } from '../lib/signout';

const API_BASE = 'https://api.betweencovers.app';
const MIN_SPLASH_TIME = 1600;

const JWT_RE = /^[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+$/;

function isValidJwt(token: string): boolean {
  return JWT_RE.test(token.trim());
}

// SplashScreen's effect can run more than once (React StrictMode double-invoke,
// or a remount). Latch the launch routing at module scope so the biometric gate
// prompts authenticateAsync() at most once per process launch — prompts can't
// stack, and a second invocation defers to the first's navigation. Mirrors the
// exchangedCodes dedupe in (auth)/redirect.tsx.
let launchHandled = false;

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      if (launchHandled) return;
      launchHandled = true;

      const start = Date.now();

      const goLogin   = () => router.replace('/(auth)/login');

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
          // Biometric launch gate (cold launch only). If the user enabled
          // Face ID / Touch ID, the retained token must NOT be trusted until
          // biometric auth passes. Fail closed: any non-success (cancel, fail,
          // sensor removed, not enrolled) routes to /login and never falls
          // through to a resolved session. Full re-login (Google/Apple/Amazon)
          // on the login screen is not biometric-gated, so a broken/removed
          // sensor can't permanently lock a user out.
          const biometricEnabled = await SecureStore.getItemAsync('bc_biometric_enabled');
          if (biometricEnabled === 'true') {
            const compatible = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();
            if (!compatible || !enrolled) {
              await waitForSplash();
              goLogin();
              return;
            }
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Unlock Between Covers',
              fallbackLabel: 'Use passcode',
            });
            if (!result.success) {
              await waitForSplash();
              goLogin();
              return;
            }
          }

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

          // Token rejected — force-hard wipe overrides the biometric-aware soft
          // path because the stored token is invalid; soft would leave it in
          // place and trigger the same /auth/resolve failure on every Face ID
          // re-entry. Fall through to subscription check after the wipe.
          await signOut({ force: true });
        } else {
          await waitForSplash();
        }

        // ── NEW / LOGGED-OUT USER ────────────────────────────────────────
        goLogin();
      } catch {
        goLogin();
      }
    };

    run();
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/splash.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E7AEB7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '80%',
    height: '80%',
  },
});