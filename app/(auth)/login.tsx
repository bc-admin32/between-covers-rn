import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, BackHandler } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as AppleAuthentication from 'expo-apple-authentication';
import { normalizeRoute } from '../../lib/routes';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { track } from '../../lib/analytics';
import { clearGuestIntent, guestEntryRoute, landAfterAuth } from '../../lib/guest';
import { signOut } from '../../lib/signout';
import { hasSession } from '../../lib/api';
import { getFreshIdToken } from '../../lib/auth';
import { carryGuestPreferencesToAccount } from '../../lib/guestPreferences';
import type { GateReason } from '../../lib/useGuest';

const COGNITO_DOMAIN = 'https://auth.betweencovers.app';
const CLIENT_ID = '4q0pjkqv3btdopk9n6q9ch776i';
const REDIRECT_URI = 'com.betweencovers.app://redirect';
const API_BASE = 'https://api.betweencovers.app';

function buildCognitoUrl(provider: 'Google' | 'LoginWithAmazon' | 'SignInWithApple', method: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email',
    redirect_uri: REDIRECT_URI,
    identity_provider: provider,
    // Carry the provider through OAuth `state` so it round-trips back on the
    // redirect URL. This makes the provider resolvable in redirect.tsx no matter
    // whether the WebBrowser or the Linking deep-link path delivers the redirect
    // — otherwise the Linking path (common on Android / cold start) loses it and
    // signup_completed logs method: 'unknown'. (No CSRF state in use to preserve.)
    state: method,
  });
  return `${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

// Context line shown when a guest is sent here by a gated action.
const GATE_COPY: Record<GateReason, string> = {
  reply: 'Create a free account to join the conversation.',
  react: 'Create a free account to react to posts.',
  vote: 'Create a free account to cast your vote.',
  submit: 'Create a free account to share your submission.',
  report: 'Create a free account to report posts.',
  block: 'Create a free account to block members.',
  iris: "Create a free account to chat with Iris — we'll send your message as soon as you're in.",
  live: 'Create a free account to join live events.',
  rate: 'Create a free account to rate.',
  profile: 'Create a free account to set up your profile.',
  submission: 'Create a free account to send a submission.',
  feedback: 'Create a free account to share feedback.',
  library: 'Create a free account to keep your library.',
  expired: 'Create a free account or sign in to keep reading.',
};

export default function LoginScreen() {
  const router = useRouter();
  // gate: a guest sent here by a gated action. from: a guest who chose
  // "Already a member? Sign in" on Home ('guest') or the age gate ('age-gate').
  const { gate, from, source, resolveUnavailable } = useLocalSearchParams<{
    gate?: GateReason;
    from?: 'guest' | 'age-gate';
    source?: string;
    resolveUnavailable?: string;
  }>();
  // signup_started.source: the gated action (passed by requireAccount), the
  // "Already a member?" links, the guest paywall, or 'login' when there's no
  // guest context (after Log Out, a failed sign-in, an expired session).
  const signupSource =
    source ??
    (from === 'guest' ? 'guest_home_signin'
      : from === 'age-gate' ? 'age_gate_signin'
      : gate === 'expired' ? 'guest_paywall'
      : gate ?? 'login');
  const gateCopy = gate ? GATE_COPY[gate] : undefined;
  // Guests sent here from guest mode can go back to it; guests whose preview
  // expired cannot.
  const canDismiss = (!!gate && gate !== 'expired') || !!from;
  const [hasToken, setHasToken] = useState(true);
  // Anyone else here without a session (after Log Out, a failed sign-in, an
  // expired session) gets the same entry as launch: age gate -> guest mode ->
  // guest paywall. Not offered once the preview has expired: that's the guest
  // paywall they came from.
  const showContinueAsGuest = !hasToken && !canDismiss && gate !== 'expired';

  const handleContinueAsGuest = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearGuestIntent();
    router.replace((await guestEntryRoute()) as any);
  };

  const handleNotNow = () => {
    clearGuestIntent();
    // A deep-linked gate (useGuestRedirect) may have no history to return to.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  useEffect(() => {
    if (!canDismiss) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleNotNow();
      return true;
    });
    return () => sub.remove();
  }, [canDismiss]);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [checking, setChecking] = useState(true);
  const [resolveRetrying, setResolveRetrying] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    hasSession().then(setHasToken).catch(() => setHasToken(false));
  }, []);

  useEffect(() => {
    async function checkBiometric() {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (compatible && enrolled) {
          setBiometricAvailable(true);
          // Only show the Face ID button when the user has completed a full auth
          // flow before. bc_biometric_enabled is set in redirect.tsx after a
          // successful token exchange — stale/partial tokens won't trigger it.
          const biometricEnabled = await SecureStore.getItemAsync('bc_biometric_enabled');
          const idToken = await SecureStore.getItemAsync('bc_id_token');
          if (idToken && biometricEnabled === 'true') setHasSavedCredentials(true);
        }
      } catch {} finally {
        setChecking(false);
      }
    }
    checkBiometric();
  }, []);

  async function handleBiometricLogin() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to Between Covers',
      fallbackLabel: 'Use passcode',
    });
    if (!result.success) return;

    const accessToken = await SecureStore.getItemAsync('bc_access_token');
    // Well-formed stored id token, refreshed first if it's about to expire.
    const idToken = await getFreshIdToken();
    if (!idToken || !accessToken) return;
    if (resolveUnavailable === '1') {
      await retryAccountResolve(true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data?.nextRoute?.startsWith('/')) {
        router.replace(normalizeRoute(data.nextRoute) as any);
      }
    } catch {}
  }

  async function retryAccountResolve(biometricAlreadyPassed = false) {
    if (resolveRetrying) return;
    setResolveRetrying(true);
    setResolveError(null);
    try {
      if (
        !biometricAlreadyPassed &&
        (await SecureStore.getItemAsync('bc_biometric_enabled')) === 'true'
      ) {
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Between Covers',
          fallbackLabel: 'Use passcode',
        });
        if (!auth.success) return;
      }

      const idToken = await getFreshIdToken();
      if (!idToken) {
        router.replace('/(auth)/login');
        return;
      }
      const res = await fetch(`${API_BASE}/auth/resolve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + idToken },
      });
      if (!res.ok) {
        if (res.status === 401) {
          await signOut({ force: true });
          router.replace((await guestEntryRoute()) as any);
          return;
        }
        if (res.status >= 500) {
          setResolveError('We still can\'t connect. Check your connection and try again.');
          return;
        }
        await signOut({ force: true });
        router.replace('/(auth)/login');
        return;
      }

      const result = await res.json();
      if (result?.authState === 'UNAUTHENTICATED') {
        await signOut({ force: true });
        router.replace((await guestEntryRoute()) as any);
        return;
      }
      if (!result?.nextRoute?.startsWith('/')) {
        await signOut({ force: true });
        router.replace('/(auth)/login');
        return;
      }

      try {
        await carryGuestPreferencesToAccount(idToken);
      } catch (error) {
        console.warn('[guest-preferences] account transfer failed', error);
      }
      await landAfterAuth(router, result.nextRoute);
    } catch (error) {
      console.warn('[auth] account resolve retry failed', error);
      setResolveError('We still can\'t connect. Check your connection and try again.');
    } finally {
      setResolveRetrying(false);
    }
  }

  async function handleSocialLogin(provider: 'Google' | 'LoginWithAmazon' | 'SignInWithApple') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const method =
      provider === 'Google' ? 'google'
      : provider === 'SignInWithApple' ? 'apple'
      : 'amazon';
    track('signup_started', { method, source: signupSource });
    const url = buildCognitoUrl(provider, method);
    const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI);
    if (result.type === 'success') {
      try {
        const code = new URL(result.url).searchParams.get('code');
        if (code) router.push(`/(auth)/redirect?code=${code}&state=${method}` as any);
      } catch {}
    }
  }

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/backgrounds/logo.png' }}
        style={styles.logo}
        contentFit="contain"
      />

      <Text style={styles.tagline}>A cozy escape into romance</Text>

      {gateCopy && <Text style={styles.gateCopy}>{gateCopy}</Text>}

      {resolveUnavailable === '1' && (
        <View style={styles.resolveNotice}>
          <Text style={styles.resolveNoticeTitle}>You’re still signed in</Text>
          <Text style={styles.resolveNoticeText}>
            We couldn’t reach the service to finish loading your account. Your sign-in is saved.
          </Text>
          {resolveError && <Text style={styles.resolveNoticeError}>{resolveError}</Text>}
          <TouchableOpacity
            style={styles.resolveRetryButton}
            onPress={() => retryAccountResolve()}
            disabled={resolveRetrying}
          >
            <Text style={styles.resolveRetryText}>
              {resolveRetrying ? 'Retrying…' : 'Retry connection'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {biometricAvailable && hasSavedCredentials && (
        <View style={styles.biometricContainer}>
          <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricLogin}>
            <Text style={styles.biometricIcon}>🔒</Text>
            <Text style={styles.biometricText}>Log in with Face ID</Text>
          </TouchableOpacity>
          <Text style={styles.orText}>or choose another sign in method below</Text>
        </View>
      )}

      <View style={styles.card}>
        <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLogin('LoginWithAmazon')}>
          <Text style={styles.socialButtonText}>Continue with Amazon</Text>
        </TouchableOpacity>

        {/* iOS: Apple's own compliant button (App Store Guideline 4 requires it).
            Android has no native Apple button, so keep the existing styled button
            — same Cognito hosted-UI flow, unchanged. Apple-only; Amazon/Google
            below are untouched. */}
        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={8}
            style={styles.appleButton}
            onPress={() => handleSocialLogin('SignInWithApple')}
          />
        ) : (
          <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLogin('SignInWithApple')}>
            <Text style={styles.socialButtonText}>Continue with Apple</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLogin('Google')}>
          <Text style={styles.socialButtonText}>Continue with Google</Text>
        </TouchableOpacity>
      </View>

      {canDismiss && (
        <TouchableOpacity style={styles.notNow} onPress={handleNotNow}>
          <Text style={styles.notNowText}>
            {from === 'age-gate' ? 'Back' : 'Not now — keep browsing'}
          </Text>
        </TouchableOpacity>
      )}

      {showContinueAsGuest && (
        <TouchableOpacity style={styles.notNow} onPress={handleContinueAsGuest}>
          <Text style={styles.notNowText}>Continue as guest</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6E6EA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  logo: {
    width: 200,
    height: 96,
    marginBottom: spacing.md,
  },
  tagline: {
    color: '#B83255',
    fontSize: 16,
    marginBottom: spacing.xl,
    opacity: 0.8,
  },
  gateCopy: {
    color: '#0F2A48',
    fontSize: 15,
    textAlign: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  resolveNotice: {
    width: '100%',
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resolveNoticeTitle: { color: '#0F2A48', fontSize: 16, fontWeight: '700' },
  resolveNoticeText: { color: '#6A5969', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  resolveNoticeError: { color: '#B83255', fontSize: 13, textAlign: 'center' },
  resolveRetryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 11,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#B83255',
  },
  resolveRetryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  notNow: {
    marginTop: spacing.lg,
    padding: spacing.sm,
  },
  notNowText: {
    color: '#B83255',
    fontSize: 14,
    fontWeight: '600',
  },
  biometricContainer: {
    width: '100%',
    marginBottom: spacing.md,
  },
  biometricButton: {
    width: '100%',
    height: 56,
    backgroundColor: '#B83255',
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  biometricIcon: {
    fontSize: 22,
  },
  biometricText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  orText: {
    color: '#B83255',
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.sm,
    opacity: 0.6,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  socialButton: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: '#E8E0E6',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Apple's button controls its own color/radius (via buttonStyle/cornerRadius);
  // only width + height may be set here, per the component's docs.
  appleButton: {
    width: '100%',
    height: 52,
  },
  socialButtonText: {
    color: '#0F2A48',
    fontSize: 15,
    fontWeight: '500',
  },
});
