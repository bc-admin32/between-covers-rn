import { Stack } from 'expo-router';

export default function LoungeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="thread/index" />
      <Stack.Screen name="archive/index" />
      <Stack.Screen name="iris-thoughts/index" />
      <Stack.Screen name="monthly/index" />
      <Stack.Screen name="monthly/submit/index" />
    </Stack>
  );
}
