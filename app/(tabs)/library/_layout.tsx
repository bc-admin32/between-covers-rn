import { Stack } from 'expo-router';

export default function LibraryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="details/index" />
      <Stack.Screen name="discover/index" />
    </Stack>
  );
}
