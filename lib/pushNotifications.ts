import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiPost } from './api';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const content = notification.request.content;
    const data = content.data as Record<string, unknown> | undefined;
    // Silent badge-clear: either an explicit cross-platform flag (Android/Amazon
    // FCM data message), or an iOS content-available push with no visible alert.
    const isSilentBadgeClear =
      data?.clearBadge === 'true' ||
      (Platform.OS === 'ios' && !content.title && !content.body);
    if (isSilentBadgeClear) {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

function detectPlatform(): 'ios' | 'android' | 'amazon' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android' && Device.manufacturer === 'Amazon') return 'amazon';
  return 'android';
}

async function getAmazonAdmToken(): Promise<string | null> {
  // Lazy require, not a static import: modules/adm-push declares
  // platforms: ["android"] in its expo-module.config.json, so it isn't
  // linked into the iOS build at all. A top-level import would throw at
  // bundle-eval time on iOS; requiring it only inside this amazon-only
  // branch means the module is never touched there.
  const { isAdmSupported, registerAdmAsync } = require('../modules/adm-push');
  if (!isAdmSupported()) {
    // Expected on the googlePlay flavor (links the no-op AdmPushBridge) —
    // not an error, just means this build can't register ADM.
    return null;
  }
  return registerAdmAsync();
}

export async function registerForPushNotifications(): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;

    if (existing.status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return;
    }

    const platform = detectPlatform();

    // Fire OS has no Google Play Services, so getDevicePushTokenAsync() (FCM)
    // always throws there — route to the ADM native module instead. That
    // module (modules/adm-push) links a no-op on the googlePlay flavor and
    // the real ADM.startRegister() flow on the amazon flavor; see its README
    // for the SDK jar/credential it still needs to build.
    const token = platform === 'amazon'
      ? await getAmazonAdmToken()
      : (await Notifications.getDevicePushTokenAsync()).data;

    if (!token) {
      console.warn('No push token returned from device');
      return;
    }

    await apiPost('/push/register', { token, platform });

    console.log(`Push registered: platform=${platform}`);
  } catch (err) {
    console.warn('Push registration failed:', err);
  }
}
