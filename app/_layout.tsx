import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    Font.loadAsync({
      ...Ionicons.font,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      DancingScript_400Regular: require('@expo-google-fonts/dancing-script/400Regular/DancingScript_400Regular.ttf'),
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      DancingScript_700Bold: require('@expo-google-fonts/dancing-script/700Bold/DancingScript_700Bold.ttf'),
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Cormorant_700Bold: require('@expo-google-fonts/cormorant/700Bold/Cormorant_700Bold.ttf'),
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Cormorant_700Bold_Italic: require('@expo-google-fonts/cormorant/700Bold_Italic/Cormorant_700Bold_Italic.ttf'),
    }).catch((e) => console.warn('[fonts] load error:', e));
  }, []);

  useEffect(() => {
    const handleDeepLink = ({ url }: { url: string }) => {
      console.log('GOT URL:', url);
      if (url.includes('redirect')) {
        try {
          const code = new URL(url).searchParams.get('code');
          console.log('CODE:', code);
          if (code) {
            router.push(`/(auth)/redirect?code=${code}` as any);
          }
        } catch (e) {
          console.log('URL parse error:', e);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
