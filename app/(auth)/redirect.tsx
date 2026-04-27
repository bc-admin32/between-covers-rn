import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { normalizeRoute } from '../../lib/routes';
import { signOut } from '../../lib/signout';
import { colors } from '../../lib/theme';

const COGNITO_DOMAIN = 'https://auth.betweencovers.app';
const CLIENT_ID = '4q0pjkqv3btdopk9n6q9ch776i';
const REDIRECT_URI = 'com.betweencovers.app://redirect';
const API_BASE = 'https://api.betweencovers.app';

export default function RedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    const run = async () => {
      try {
        const code = params.code as string;
        
        if (!code) {
          setErrorCode('REDIRECT_NO_CODE');
          return;
        }

        setStatus('Exchanging token…');

        const tokenRes = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code,
          }).toString(),
        });

        if (!tokenRes.ok) {
          setErrorCode('REDIRECT_TOKEN_EXCHANGE_FAILED');
          return;
        }

        const tokenData = await tokenRes.json();
        const { id_token: idToken, access_token: accessToken } = tokenData;

        if (!idToken || !accessToken) {
          setErrorCode('REDIRECT_MISSING_TOKENS');
          return;
        }

        setStatus('Saving credentials…');

        await SecureStore.setItemAsync('bc_id_token', idToken);
        await SecureStore.setItemAsync('bc_access_token', accessToken);

        try {
          const profileRes = await fetch(`${API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          const profile = await profileRes.json();

          const compatible = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          const deviceSupportsBiometric = compatible && enrolled;

          if (profile.biometricPreferred === true && deviceSupportsBiometric) {
            await SecureStore.setItemAsync('bc_biometric_enabled', 'true');
          } else if (!profile.biometricPreferred && deviceSupportsBiometric) {
            const dismissed = await SecureStore.getItemAsync('bc_biometric_prompt_dismissed');
            const existing = await SecureStore.getItemAsync('bc_biometric_enabled');
            if (!existing && !dismissed) {
              await SecureStore.setItemAsync('bc_biometric_prompt_pending', 'true');
            }
          }
        } catch {}

        setStatus('Resolving account…');

        const resolveRes = await fetch(`${API_BASE}/auth/resolve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!resolveRes.ok) {
          // Tokens were stored above — clear them now so index.tsx doesn't
          // enter a loop (find token → resolve fails → forceLogin → login →
          // user logs in → tokens stored → repeat). Force-hard wipe overrides
          // the biometric-aware soft path because the tokens are invalid.
          await signOut({ force: true });
          const body = await resolveRes.json().catch(() => null);
          const isGone = resolveRes.status === 404 || resolveRes.status === 403;
          const msg = (body?.message ?? '') as string;
          const isDeactivated = isGone && (
            msg.toLowerCase().includes('deactivat') ||
            msg.toLowerCase().includes('suspend') ||
            msg.toLowerCase().includes('not found') ||
            resolveRes.status === 404
          );
          setErrorCode(isDeactivated ? 'ACCOUNT_DEACTIVATED' : 'REDIRECT_AUTH_RESOLVE_FAILED');
          return;
        }

        const result = await resolveRes.json();

        setStatus(`Routing to ${result?.nextRoute}…`);

        if (result?.nextRoute?.startsWith('/')) {
          router.replace(normalizeRoute(result.nextRoute) as any);
        } else {
          setErrorCode('REDIRECT_INVALID_NEXT_ROUTE');
        }
      } catch (err: any) {
        setErrorCode(`REDIRECT_UNEXPECTED_ERROR: ${err?.message}`);
      }
    };

    run();
  }, [params.code]);

  if (errorCode) {
    const isDeactivated = errorCode === 'ACCOUNT_DEACTIVATED';
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>
          {isDeactivated ? 'Account unavailable' : 'Hmm… something didn\'t go as expected.'}
        </Text>
        <Text style={styles.errorSubtitle}>
          {isDeactivated
            ? 'This account has been deactivated. Please contact support at support@betweencovers.app.'
            : 'Please try signing in again.'}
        </Text>
        {!isDeactivated && (
          <Text style={styles.errorCode}>Error code: {errorCode}</Text>
        )}
        <TouchableOpacity style={styles.retryButton} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.retryButtonText}>
            {isDeactivated ? 'Back to Sign In' : 'Try Again'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.signingIn}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6E6EA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  signingIn: {
    fontSize: 14,
    color: '#6A5969',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#d1d5db',
    textAlign: 'center',
  },
  errorCode: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6b7280',
  },
  retryButtonText: {
    fontSize: 14,
    color: '#d1d5db',
    fontWeight: '600',
  },
});