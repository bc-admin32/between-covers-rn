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

    // DEFERRED — Fire OS / ADM branch goes here.
    // On Amazon devices detectPlatform() returns 'amazon', but the call below
    // uses FCM, which is unavailable on Fire OS (no Google Play Services) → it
    // throws and is swallowed by the catch, so Fire never registers. When the
    // ADM native module lands (credential bundled via plugins/withAdmApiKey.js),
    // branch here: if detectPlatform() === 'amazon', obtain the ADM registration
    // token from that module instead of getDevicePushTokenAsync(), then POST to
    // /push/register with platform: 'amazon' exactly as below. Deferred until a
    // Fire HD device is available to test against.
    const tokenResult = await Notifications.getDevicePushTokenAsync();
    const token = tokenResult.data;

    if (!token) {
      console.warn('No push token returned from device');
      return;
    }

    const platform = detectPlatform();

    await apiPost('/push/register', { token, platform });

    console.log(`Push registered: platform=${platform}`);
  } catch (err) {
    console.warn('Push registration failed:', err);
  }
}
