import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { useFonts } from 'expo-font';
import { colors } from '../lib/theme';
import { withIAPContext } from '../lib/iap-shim';
import { initAnalytics, track } from '../lib/analytics';
import { captureFromUrl } from '../lib/attribution';
// TEMPORARY DEBUG INSTRUMENTATION — remove with the IAP trace capture.
import IapDebugBanner from '../components/IapDebugBanner';
import { recordIapError } from '../lib/iapDebug';

// Global safety net: record any otherwise-unhandled JS error so we still capture
// the Amazon PurchasingListener trace even if it fires from an un-wrapped site.
// Chains (does NOT drop) the previous handler. Installed once at module load.
const __errorUtils: any = (globalThis as any)?.ErrorUtils;
const __prevGlobalHandler = __errorUtils?.getGlobalHandler?.();
__errorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
  try {
    recordIapError('global', error);
  } catch {
    // never let the debug net itself crash the handler chain
  }
  if (typeof __prevGlobalHandler === 'function') {
    __prevGlobalHandler(error, isFatal);
  }
});

// Fonts are natively bundled via expo-font plugin in app.json.
// We still call useFonts() so they're registered under these exact keys
// on iOS (which would otherwise use the PostScript name, e.g. 'Nunito-Bold').
// SplashScreen.preventAutoHideAsync() holds the splash open until ready.
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const router = useRouter();

  // Root navigator readiness. useRootNavigationState() returns undefined until
  // the <Stack> below mounts; deep-link / notification handlers can fire (cold
  // start via OAuth redirect or notification tap) before that, so navigating
  // immediately throws "Attempted to navigate before mounting the Root Layout
  // component." We stash the target and flush it once the navigator is ready.
  const navigationState = useRootNavigationState();
  const navReadyRef = useRef(false);
  const pendingNavRef = useRef<string | null>(null);

  useEffect(() => {
    navReadyRef.current = !!navigationState?.key;
    if (navReadyRef.current && pendingNavRef.current) {
      const target = pendingNavRef.current;
      pendingNavRef.current = null;
      router.push(target as any);
    }
  }, [navigationState?.key]);

  // OTA apply-on-launch. By default expo-updates fetches in the background and
  // applies on the NEXT cold start (fallbackToCacheTimeout: 0). Here we check on
  // mount and, only if an update is actually available, fetch it and reload so
  // it applies on THIS launch instead. Release builds only — guarded by !__DEV__
  // (Expo Go / dev-client skip it) and Updates.isEnabled. Best-effort: any error
  // is swallowed and the app starts normally; reloadAsync fires only after a
  // successful fetch, so there's no reload loop and no blocking spinner.
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const u = await Updates.checkForUpdateAsync();
        if (cancelled || !u.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        await Updates.reloadAsync();
      } catch {
        // Never let an update check crash or block startup.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Navigate now if the navigator is mounted, otherwise defer until it is.
  const navigateWhenReady = (path: string) => {
    if (navReadyRef.current) {
      router.push(path as any);
    } else {
      pendingNavRef.current = path;
    }
  };

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
    initAnalytics().then(() => {
      track('app_open', { coldStart: true });
    });
  }, []);

  useEffect(() => {
    const handleDeepLink = ({ url }: { url: string }) => {
      console.log('GOT URL:', url);
      captureFromUrl(url);
      if (url.includes('redirect')) {
        try {
          const parsed = new URL(url);
          const code = parsed.searchParams.get('code');
          // `state` carries the sign-in provider (set in login.tsx's authorize
          // URL); forward it so redirect.tsx can resolve method deterministically
          // even when this Linking path wins the redirect race.
          const state = parsed.searchParams.get('state');
          console.log('CODE:', code);
          if (code) {
            const query = state
              ? `?code=${code}&state=${encodeURIComponent(state)}`
              : `?code=${code}`;
            navigateWhenReady(`/(auth)/redirect${query}`);
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

  // Clear app icon badge whenever the app returns to foreground. Belt-and-suspenders
  // for users whose server-side silent badge-clear push didn't deliver (force-quit,
  // notification never opened, etc.).
  useEffect(() => {
    Notifications.setBadgeCountAsync(0).catch(() => {});
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Notification taps → route into the lounge.
  // Token registration lives in (tabs)/_layout.tsx so it only runs post-auth.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'iris_live' || data?.screen === 'lounge') {
        navigateWhenReady('/(tabs)/lounge');
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
        <Stack.Screen name="submissions/[type]" options={{ animation: 'slide_from_right' }} />
      </Stack>
      {/* TEMPORARY DEBUG INSTRUMENTATION — overlays the captured IAP trace above
          all screens (incl. the paywall). Remove with the trace capture. */}
      <IapDebugBanner />
    </>
  );
}

export default withIAPContext(RootLayout);
