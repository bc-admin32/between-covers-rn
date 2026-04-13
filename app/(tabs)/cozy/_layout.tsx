import { Stack } from 'expo-router';

export default function CozyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="items/index" />
      <Stack.Screen name="media/index" />
      <Stack.Screen name="archive/index" />
      <Stack.Screen name="books/index" />
      <Stack.Screen name="events/index" />
    </Stack>
  );
}
