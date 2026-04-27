import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { normalizeRoute } from '../../lib/routes';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';

const COGNITO_DOMAIN = 'https://auth.betweencovers.app';
const CLIENT_ID = '4q0pjkqv3btdopk9n6q9ch776i';
const REDIRECT_URI = 'com.betweencovers.app://redirect';
const API_BASE = 'https://api.betweencovers.app';

function buildCognitoUrl(provider: 'Google' | 'LoginWithAmazon' | 'SignInWithApple') {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email',
    redirect_uri: REDIRECT_URI,
    identity_provider: provider,
  });
  return `${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

export default function LoginScreen() {
  const router = useRouter();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [checking, setChecking] = useState(true);

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

    const rawToken = await SecureStore.getItemAsync('bc_id_token');
    const accessToken = await SecureStore.getItemAsync('bc_access_token');
    const idToken = rawToken?.trim() ?? null;
    if (!idToken || !accessToken) return;
    // Reject malformed tokens before they hit the API
    const jwtRe = /^[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+$/;
    if (!jwtRe.test(idToken)) return;

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

  async function handleSocialLogin(provider: 'Google' | 'LoginWithAmazon' | 'SignInWithApple') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = buildCognitoUrl(provider);
    const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI);
    if (result.type === 'success') {
      try {
        const code = new URL(result.url).searchParams.get('code');
        if (code) router.push(`/(auth)/redirect?code=${code}` as any);
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
        resizeMode="contain"
      />

      <Text style={styles.tagline}>A cozy escape into romance</Text>

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

        <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLogin('SignInWithApple')}>
          <Text style={styles.socialButtonText}>Continue with Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLogin('Google')}>
          <Text style={styles.socialButtonText}>Continue with Google</Text>
        </TouchableOpacity>
      </View>
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
  socialButtonText: {
    color: '#0F2A48',
    fontSize: 15,
    fontWeight: '500',
  },
});
