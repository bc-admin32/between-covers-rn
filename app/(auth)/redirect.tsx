import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
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
          const compatible = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (compatible && enrolled) {
            await SecureStore.setItemAsync('bc_biometric_enabled', 'true');
          }
        } catch {}

        setStatus('Resolving account…');

        const resolveRes = await fetch(`${API_BASE}/auth/resolve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!resolveRes.ok) {
          setErrorCode('REDIRECT_AUTH_RESOLVE_FAILED');
          return;
        }

        const result = await resolveRes.json();
console.log('Resolve result:', JSON.stringify(result));
console.log('nextRoute:', result?.nextRoute);

        setStatus(`Routing to ${result?.nextRoute}…`);

        if (result?.nextRoute?.startsWith('/')) {
          router.replace(result.nextRoute as any);
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
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Hmm… something didn't go as expected.</Text>
        <Text style={styles.errorSubtitle}>Please try signing in again.</Text>
        <Text style={styles.errorCode}>Error code: {errorCode}</Text>
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
});