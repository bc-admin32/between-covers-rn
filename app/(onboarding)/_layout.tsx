import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

const BG = 'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/background.png';

export default function OnboardingLayout() {
  return (
    <View style={styles.container}>
      {/* Persistent background — loaded once, cached (memory+disk via
          expo-image). Survives all screen transitions so there is never a
          black flash. */}
      <Image
        source={{ uri: BG }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
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
