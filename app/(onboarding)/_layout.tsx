import { Stack } from 'expo-router';
import { View, Image, StyleSheet } from 'react-native';

const BG = 'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/background.png';

export default function OnboardingLayout() {
  return (
    <View style={styles.container}>
      {/* Persistent background — loaded once, cached by OS HTTP cache.
          Survives all screen transitions so there is never a black flash. */}
      <Image
        source={{ uri: BG }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          // Transparent so the layout background shows through during transitions
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
