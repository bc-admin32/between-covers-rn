import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { track } from '../../lib/analytics';
import { GUEST_DAYS, clearGuestIntent } from '../../lib/guest';
import { spacing, radius } from '../../lib/theme';

const TERMS_URL   = 'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/terms-of-use.html';
const PRIVACY_URL = 'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/privacy-policy.html';

// Shown to guests (no account) once GUEST_DAYS have passed since first launch.
// Sign-up only — purchasing needs an account. After sign-in, /auth/resolve
// routes an out-of-trial account to the regular hard-paywall.
export default function GuestPaywallScreen() {
  const router = useRouter();

  useEffect(() => {
    track('paywall_shown', { type: 'guest', source: 'guest_expired' });
    // Signing up from here starts fresh — not a return to an earlier gate.
    clearGuestIntent();
  }, []);

  // No escaping back into the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const goLogin = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(auth)/login?gate=expired' as any);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Image
        source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/backgrounds/logo.png' }}
        style={styles.logo}
        contentFit="contain"
      />

      <View style={styles.card}>
        <Text style={styles.title}>Your {GUEST_DAYS}-day preview has ended</Text>
        <Text style={styles.body}>
          Create a free account or sign in to keep reading, chatting with Iris, and joining the Lounge.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={goLogin}>
          <Text style={styles.primaryButtonText}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={goLogin}>
          <Text style={styles.secondaryButtonText}>I already have an account — Sign in</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.legalLinks}>
        <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} activeOpacity={0.7}>
          <Text style={styles.legalLinkText}>Terms of Use</Text>
        </TouchableOpacity>
        <Text style={styles.legalLinkSep}>•</Text>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} activeOpacity={0.7}>
          <Text style={styles.legalLinkText}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6E6EA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  logo: {
    width: 200,
    height: 96,
    marginBottom: spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    color: '#0F2A48',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: '#6A5969',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#B83255',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: '#E8E0E6',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0F2A48',
    fontSize: 15,
    fontWeight: '500',
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  legalLinkText: {
    color: '#B83255',
    fontSize: 12,
    opacity: 0.8,
  },
  legalLinkSep: {
    color: '#B83255',
    fontSize: 12,
    opacity: 0.6,
  },
});
