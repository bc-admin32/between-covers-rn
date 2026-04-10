import { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://api.betweencovers.app';
const MIN_SPLASH_TIME = 1600;

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const start = Date.now();

      try {
        const idToken = await SecureStore.getItemAsync('bc_id_token');

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_SPLASH_TIME - elapsed);

        await new Promise(resolve => setTimeout(resolve, remaining));

        if (!idToken) {
          router.replace('/(auth)/login');
          return;
        }

        const res = await fetch(`${API_BASE}/auth/resolve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok) {
          router.replace('/(auth)/login');
          return;
        }

        const result = await res.json();

        if (result?.nextRoute?.startsWith('/')) {
          router.replace(result.nextRoute as any);
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      }
    };

    run();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.overlay} />
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
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(178,54,86,0.27)',
  },
  logo: {
    width: 220,
    height: 120,
  },
});