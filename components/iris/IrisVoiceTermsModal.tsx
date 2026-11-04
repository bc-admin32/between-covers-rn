import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { acceptIrisVoiceTerms } from '../../lib/irisVoiceTerms';
import { spacing } from '../../lib/theme';

// Shown the first time a signed-in user switches Iris chat to voice, and again
// whenever CURRENT_IRIS_VOICE_TERMS_VERSION changes. The microphone is never
// requested before this is accepted. Modeled on LiveEventTermsModal.

const POINTS = [
  'While voice mode is on, your microphone is on so Iris can hear you. It turns off when you leave voice mode.',
  "What you say is sent to Amazon's speech service to turn it into text. We don't keep the recording, but the text is saved in your Iris conversation, just like a typed message.",
  "Iris's replies are turned into speech by our voice provider.",
  'Iris is AI, and her voice is AI-generated.',
  "Iris may say mature things out loud — use headphones if you're around others.",
];

type Props = {
  visible: boolean;
  onAccept: () => void; // fires after the POST succeeds
  onCancel: () => void;
  // The sheet is a native Modal, so a pushed route would render behind it.
  // The parent closes the sheet, opens the document, and reopens on return.
  onOpenDocument: (doc: 'terms-of-use' | 'privacy-policy') => void;
};

export default function IrisVoiceTermsModal({ visible, onAccept, onCancel, onOpenDocument }: Props) {
  const { width } = useWindowDimensions();
  // Same 375pt-baseline scaling as LiveEventTermsModal.
  const scale = (size: number) => Math.round(size * Math.min(Math.max(width / 375, 0.85), 1.15));
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      await acceptIrisVoiceTerms();
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
            <Text style={styles.title}>Talk with Iris</Text>

            {POINTS.map((point) => (
              <View key={point} style={styles.pointRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.paragraph}>{point}</Text>
              </View>
            ))}

            <Text style={styles.footer}>
              By tapping Accept &amp; Continue, you agree to these terms, our{' '}
              <Text style={styles.link} onPress={() => onOpenDocument('terms-of-use')} suppressHighlighting>
                Terms of Service
              </Text>
              , and{' '}
              <Text style={styles.link} onPress={() => onOpenDocument('privacy-policy')} suppressHighlighting>
                Privacy Policy
              </Text>
              .
            </Text>

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
    marginBottom: spacing.md,
  },
  pointRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  bullet: { fontSize: 14, color: '#B83255', lineHeight: 21 },
  paragraph: { flex: 1, fontSize: 14, color: '#3A2C28', lineHeight: 21 },
  footer: { marginTop: spacing.sm, fontSize: 12, color: '#6A5550', lineHeight: 18 },
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
