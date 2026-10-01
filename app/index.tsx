import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { normalizeRoute } from '../lib/routes';
import { signOut } from '../lib/signout';
import { isPaywallRoute, reconcileAndroidPurchases, reconcileAmazonPurchases } from '../lib/subscription';
import { ensureFirstLaunchAt, guestEntryRoute } from '../lib/guest';
import { REFRESH_MARGIN_MS, refreshSession, readIdToken, tokenExpiresWithin } from '../lib/auth';

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

      // POST /auth/resolve. Throws on a network error (so the caller's outer
      // catch goes to login WITHOUT wiping tokens). Returns { ok, status, data }
      // where ok:false means the server explicitly rejected the token.
      const resolveOnce = async (idToken: string): Promise<{ ok: boolean; status: number; data: any | null }> => {
        const res = await fetch(`${API_BASE}/auth/resolve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) return { ok: false, status: res.status, data: null };
        const data = await res.json().catch(() => null);
        return { ok: true, status: res.status, data };
      };

      try {
        // Start the guest clock on the first run of this build (fresh and
        // existing installs alike). Never overwrites an existing value.
        await ensureFirstLaunchAt();

        const raw = await SecureStore.getItemAsync('bc_id_token');
        let idToken = raw?.trim() ?? null;

        // Expired (or expiring within 5 min) id token: refresh it first.
        //   refreshed        → continue with the new token (Face ID still
        //                      required below).
        //   rejected         → the refresh token is invalid/expired: hard wipe
        //                      and take the no-token path (age gate → guest →
        //                      guest paywall).
        //   failed (offline) → throw to the outer catch → /login, tokens
        //                      kept, same as an offline /auth/resolve.
        //   no-refresh-token → signed in before this build: unchanged, the
        //                      backend decides via /auth/resolve.
        if (idToken && isValidJwt(idToken) && tokenExpiresWithin(idToken, REFRESH_MARGIN_MS)) {
          const result = await refreshSession();
          if (result === 'refreshed') {
            idToken = (await readIdToken()) ?? idToken;
          } else if (result === 'rejected') {
            await signOut({ force: true });
            idToken = null;
          } else if (result === 'failed') {
            throw new Error('token refresh failed');
          }
        }

        // ── RETURNING USER: valid token → resolve and route ──────────────
        if (idToken && isValidJwt(idToken)) {
          // Backend-authoritative session + entitlement check. Runs BEFORE the
          // biometric gate so a dead token never triggers a Face ID prompt:
          // resolving only tells us where the token would route — nothing is
          // shown and the app isn't entered until the gate below passes.
          let resolved = await resolveOnce(idToken);

          // No valid session behind the stored token: expired, revoked, or a
          // stale token that survived an app reinstall in the iOS Keychain.
          // /auth/resolve reports this as 200 { authState: 'UNAUTHENTICATED',
          // nextRoute: '/login' }; a 401 means the same. Hard-wipe the dead
          // tokens (and the biometric preference, which would otherwise keep
          // prompting for a token that no longer exists) and continue down the
          // no-token path below (age gate → guest → guest paywall) instead of
          // stranding the user on /login. Other states that route to /login
          // (e.g. ACCOUNT_INACTIVE) still do.
          const sessionGone =
            (resolved.ok && resolved.data?.authState === 'UNAUTHENTICATED') ||
            (!resolved.ok && resolved.status === 401);

          if (sessionGone) {
            await signOut({ force: true });
            await waitForSplash();
          } else {
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

            // Launch reconcile: if the backend says NOT entitled (paywall route)
            // but Google still holds an active Android subscription, push it to
            // the backend and re-resolve. Android-only and silent (the helper
            // no-ops off-Android / on any error). Skipped entirely when the first
            // resolve already grants access — we never touch IAP for entitled users.
            if (resolved.ok && isPaywallRoute(resolved.data?.nextRoute)) {
              // Google and Amazon each self-heal against their own store; both
              // helpers hard no-op off their platform, so calling both is safe and
              // only one can do work. Amazon recovers the case where a direct
              // purchase rejected with E_UNKNOWN but actually completed.
              const reconciled =
                (await reconcileAndroidPurchases()) || (await reconcileAmazonPurchases());
              if (reconciled) {
                try {
                  const second = await resolveOnce(idToken);
                  if (second.ok) resolved = second;
                } catch {
                  // keep the first result if the re-resolve errors
                }
              }
            }

            await waitForSplash();

            if (resolved.ok && resolved.data?.nextRoute?.startsWith('/')) {
              router.replace(normalizeRoute(resolved.data.nextRoute) as any);
              return;
            }

            // Token rejected by the server — force-hard wipe overrides the
            // biometric-aware soft path because the stored token is invalid; soft
            // would leave it in place and trigger the same /auth/resolve failure
            // on every Face ID re-entry. Fall through to login after the wipe.
            await signOut({ force: true });
            goLogin();
            return;
          }
        } else {
          await waitForSplash();
        }

        // ── GUEST (no token, or its session is gone) ─────────────────────
        // 18+ gate first, then guest browsing for GUEST_DAYS from first
        // launch, then the sign-up-only guest paywall.
        router.replace((await guestEntryRoute()) as any);
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
        contentFit="contain"
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
