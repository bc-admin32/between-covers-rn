import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { colors } from '../lib/theme';
import { withIAPContext } from '../lib/iap-shim';

// Fonts are natively bundled via expo-font plugin in app.json.
// We still call useFonts() so they're registered under these exact keys
// on iOS (which would otherwise use the PostScript name, e.g. 'Nunito-Bold').
// SplashScreen.preventAutoHideAsync() holds the splash open until ready.
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DancingScript_400Regular: require('@expo-google-fonts/dancing-script/400Regular/DancingScript_400Regular.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DancingScript_700Bold: require('@expo-google-fonts/dancing-script/700Bold/DancingScript_700Bold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Cormorant_700Bold: require('@expo-google-fonts/cormorant/700Bold/Cormorant_700Bold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Cormorant_700Bold_Italic: require('@expo-google-fonts/cormorant/700Bold_Italic/Cormorant_700Bold_Italic.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Lato_700Bold: require('@expo-google-fonts/lato/700Bold/Lato_700Bold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito_400Regular: require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito_400Regular_Italic: require('@expo-google-fonts/nunito/400Regular_Italic/Nunito_400Regular_Italic.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito_600SemiBold: require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito_700Bold: require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito_700Bold_Italic: require('@expo-google-fonts/nunito/700Bold_Italic/Nunito_700Bold_Italic.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito_800ExtraBold: require('@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito_800ExtraBold_Italic: require('@expo-google-fonts/nunito/800ExtraBold_Italic/Nunito_800ExtraBold_Italic.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

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

  // Notification taps → route into the lounge.
  // Token registration lives in (tabs)/_layout.tsx so it only runs post-auth.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'iris_live' || data?.screen === 'lounge') {
        router.push('/(tabs)/lounge' as any);
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

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
        <Stack.Screen name="legal" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="book/index" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default withIAPContext(RootLayout);
