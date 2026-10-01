import { Stack } from 'expo-router';
import { useGuestRedirect } from '../../../lib/useGuest';

export default function ProfileLayout() {
  // Profile needs an account. The tab press is gated in (tabs)/_layout; this
  // catches any other way in.
  if (useGuestRedirect('profile')) return null;
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="account/index" />
      <Stack.Screen name="preferences/index" />
      <Stack.Screen name="legal/index" />
      <Stack.Screen name="legal/document/index" />
    </Stack>
  );
}
