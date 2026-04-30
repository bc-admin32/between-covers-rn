import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiPost } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
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
