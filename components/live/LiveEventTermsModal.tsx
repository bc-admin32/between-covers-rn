import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiPost } from '../../lib/api';
import { spacing } from '../../lib/theme';

// Bump when the terms text below is materially revised. Must match the
// backend env var LIVE_EVENT_TERMS_VERSION exactly — the gate Lambdas
// (liveEventChatToken, liveEventRoomJoin) compare profile.liveEventTermsVersion
// against that env var to decide whether to return TERMS_ACCEPTANCE_REQUIRED.
// On accept, handleAccept POSTs this version to /legal/accept/live-event
// (handled by the liveEventAcceptTerms Lambda), which writes both
// liveEventTermsAcceptedAt and liveEventTermsVersion to the user record; the
// gate below (shouldShowLiveEventTermsGate) reads liveEventTermsVersion to
// decide whether to re-show this modal.
// Compared as a string (not semver-parsed) so any mismatch invalidates.
export const CURRENT_LIVE_EVENT_TERMS_VERSION = '2026-05';

// Profile shape this modal cares about. Callers pass profile.liveEventTermsAcceptedAt
// (and optionally liveEventTermsVersion) into shouldShowLiveEventTermsGate.
export function shouldShowLiveEventTermsGate(profile: {
  liveEventTermsAcceptedAt?: string | null;
  liveEventTermsVersion?: string | null;
} | null | undefined): boolean {
  if (!profile) return false; // profile not loaded yet — defer
  if (!profile.liveEventTermsAcceptedAt) return true;
  return profile.liveEventTermsVersion !== CURRENT_LIVE_EVENT_TERMS_VERSION;
}

type Props = {
  visible: boolean;
  onAccept: () => void; // fires after the POST succeeds
  onCancel: () => void;
};

export default function LiveEventTermsModal({ visible, onAccept, onCancel }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Scale relative to a 375pt baseline, clamped 0.85x–1.15x so buttons/text
  // never get too small or too large across phone sizes.
  const scale = (size: number) => Math.round(size * Math.min(Math.max(width / 375, 0.85), 1.15));
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCommunityGuidelines() {
    // Routes through the shared legal-document handler so the doc URL stays
    // centralized (mirrors the Lounge guidelines modal). Modal stays mounted
    // beneath the pushed route and remains visible on back-navigation.
    router.push('/legal/document?doc=community-guidelines' as any);
  }

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      await apiPost('/legal/accept/live-event', { context: 'live_event', appVersion: CURRENT_LIVE_EVENT_TERMS_VERSION });
      onAccept();
    } catch {
      setError("Couldn't save your acceptance. Try again?");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Before You Walk In</Text>

            <Text style={styles.paragraph}>Live events aren't the Lounge.</Text>

            <Text style={styles.paragraph}>
              Slurs, threats, harassment, and the other hard stops outlined in our{' '}
              <Text style={styles.link} onPress={openCommunityGuidelines} suppressHighlighting>
                Community Guidelines
              </Text>
              {' '}will get you removed from this live and restricted from all future live events — no warnings, no second chances.
            </Text>

            <Text style={styles.paragraph}>
              Sustained negativity toward other members or Iris may also lead to restrictions over time.
              Members can flag behavior they believe the team should review.
            </Text>

            <Text style={styles.paragraph}>Everything else on Between Covers stays yours.</Text>

            <Text style={styles.paragraph}>Chaos is welcome. Cruelty isn't.</Text>

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.cancelBtn, { paddingVertical: scale(14), minHeight: scale(48), justifyContent: 'center' }]}
              disabled={accepting}
            >
              <Text style={[styles.cancelBtnText, { fontSize: scale(14) }]} numberOfLines={1} adjustsFontSizeToFit>
                Not Right Now
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAccept}
              style={[styles.acceptBtn, { paddingVertical: scale(14), minHeight: scale(48), justifyContent: 'center' }, accepting && styles.acceptBtnDisabled]}
              disabled={accepting}
            >
              {accepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.acceptBtnText, { fontSize: scale(14) }]} numberOfLines={1} adjustsFontSizeToFit>
                  Accept &amp; Continue
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FDFAF6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD5C4',
    alignSelf: 'center', marginBottom: spacing.lg,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  title: {
    fontSize: 24,
    fontFamily: 'Cormorant_700Bold_Italic',
    color: '#0F2A48',
    marginBottom: spacing.sm,
  },
  paragraph: {
    fontSize: 14,
    color: '#3A2C28',
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  link: {
    color: '#B83255',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  error: {
    marginTop: spacing.md,
    fontSize: 13,
    color: '#B83255',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl + spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#EDE4D5',
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD5C4',
  },
  cancelBtnText: { color: '#6A5550', fontWeight: '600' },
  acceptBtn: {
    flex: 2,
    backgroundColor: '#B83255',
    borderRadius: 999,
    alignItems: 'center',
  },
  acceptBtnDisabled: { backgroundColor: '#D4B5BF' },
  acceptBtnText: { color: '#fff', fontWeight: '700', letterSpacing: 0.3 },
});
