import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { confirmAge, guestEntryRoute } from '../../lib/guest';
import { track } from '../../lib/analytics';
import { spacing, radius } from '../../lib/theme';

// age_gate_confirmed is on the backend allowlist (unknown event names are
// dropped server-side). Flip to false to stop sending it.
const SEND_AGE_GATE_CONFIRMED = true;

// First-launch 18+ confirmation. Blocks the app until confirmed; the
// confirmation is stored in SecureStore (bc_age_confirmed) and never asked
// again on this install.
export default function AgeGateScreen() {
  const router = useRouter();
  const [declined, setDeclined] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Hardware back must not skip the gate.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await confirmAge();
    } catch {
      setConfirming(false);
      return;
    }
    if (SEND_AGE_GATE_CONFIRMED) track('age_gate_confirmed');
    router.replace((await guestEntryRoute()) as any);
  };

  // Members skip the guest flow. Sign-in and sign-up are the same OAuth flow
  // and onboarding has no age check of its own, so signing in from here
  // counts as the 18+ confirmation (stated under the link).
  const handleSignIn = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await confirmAge();
    } catch {
      return;
    }
    router.push('/(auth)/login?from=age-gate' as any);
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
        {declined ? (
          <>
            <Text style={styles.title}>Sorry, not yet</Text>
            <Text style={styles.body}>
              Between Covers is for readers 18 and older. Come back when you're ready.
            </Text>
            {Platform.OS === 'android' && (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => BackHandler.exitApp()}>
                <Text style={styles.secondaryButtonText}>Close app</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Text style={styles.title}>Are you 18 or older?</Text>
            <Text style={styles.body}>
              Between Covers includes mature romance content. Please confirm you're at least 18 to continue.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, confirming && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={confirming}
            >
              <Text style={styles.primaryButtonText}>I'm 18 or older</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setDeclined(true)}>
              <Text style={styles.secondaryButtonText}>I'm under 18</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {!declined && (
        <View style={styles.memberRow}>
          <TouchableOpacity onPress={handleSignIn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.memberText}>
              Already a member? <Text style={styles.memberLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
          <Text style={styles.memberNote}>By signing in, you confirm you're 18 or older.</Text>
        </View>
      )}
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
  buttonDisabled: { opacity: 0.5 },
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
  memberRow: {
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  memberText: {
    color: '#0F2A48',
    fontSize: 14,
  },
  memberLink: {
    color: '#B83255',
    fontWeight: '600',
  },
  memberNote: {
    color: '#6A5969',
    fontSize: 12,
    opacity: 0.8,
  },
});
