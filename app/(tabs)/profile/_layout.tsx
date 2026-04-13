import { Stack } from 'expo-router';

export default function ProfileLayout() {
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
