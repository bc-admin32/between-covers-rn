import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { apiPost } from '../../lib/api';
import { spacing } from '../../lib/theme';

// Bump when the terms text below is materially revised. Must match the
// backend env var LIVE_EVENT_TERMS_VERSION exactly — the gate Lambdas
// (liveEventChatToken, liveEventRoomJoin) compare profile.liveEventTermsVersion
// against that env var to decide whether to return TERMS_ACCEPTANCE_REQUIRED,
// and bcAcceptLiveEvent writes that env var into the user's row on accept.
// Compared as a string (not semver-parsed) so any mismatch invalidates.
export const CURRENT_LIVE_EVENT_TERMS_VERSION = '1.0.0';

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
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      await apiPost('/accept/live-event', { version: CURRENT_LIVE_EVENT_TERMS_VERSION });
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
            <Text style={styles.title}>Before You Step Inside ✦</Text>
            <Text style={styles.subtitle}>
              Live events are intimate, real-time spaces. A few ground rules to keep them feeling that way:
            </Text>

            <View style={styles.bullets}>
              <Bullet>Be kind. No harassment, slurs, or personal attacks — anyone can long-press a message to report it.</Bullet>
              <Bullet>Keep it appropriate. Sexual content, threats, and spam will get you removed from the room.</Bullet>
              <Bullet>Don't break the moment. Iris is hosting — let her drive, and use chat to react and connect.</Bullet>
              <Bullet>Repeat violations may pause or end your live event access. Severe ones may end it permanently.</Bullet>
            </View>

            <Text style={styles.legalese}>
              By tapping Accept, you agree to participate respectfully and acknowledge that Between Covers may
              remove messages, temporarily restrict your access, or permanently revoke it for violations.
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} disabled={accepting}>
              <Text style={styles.cancelBtnText}>Not Right Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAccept}
              style={[styles.acceptBtn, accepting && styles.acceptBtnDisabled]}
              disabled={accepting}
            >
              {accepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptBtnText}>Accept &amp; Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>✦</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
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
  subtitle: {
    fontSize: 14,
    color: '#6A5550',
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  bullets: { gap: spacing.md, marginBottom: spacing.lg },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletDot: { fontSize: 12, color: '#B83255', marginTop: 2 },
  bulletText: { flex: 1, fontSize: 13, color: '#3A2C28', lineHeight: 20 },
  legalese: {
    fontSize: 12,
    color: '#9c8f7e',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: spacing.sm,
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
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD5C4',
  },
  cancelBtnText: { fontSize: 14, color: '#6A5550', fontWeight: '600' },
  acceptBtn: {
    flex: 2,
    backgroundColor: '#B83255',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  acceptBtnDisabled: { backgroundColor: '#D4B5BF' },
  acceptBtnText: { fontSize: 14, color: '#fff', fontWeight: '700', letterSpacing: 0.3 },
});
