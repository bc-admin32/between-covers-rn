import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiPost } from '../../lib/api';
import { spacing } from '../../lib/theme';

// SecureStore flag — persists across launches/reinstalls of the same user
// to suppress the long-press tutorial after the first report opens.
const TUTORIAL_FLAG_KEY = 'bc_report_tutorial_seen';

export type ReportReason = 'HARASSMENT' | 'HATE_SPEECH' | 'SEXUAL_CONTENT' | 'SPAM' | 'OTHER';

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'HARASSMENT',     label: 'Harassment' },
  { value: 'HATE_SPEECH',    label: 'Hate speech' },
  { value: 'SEXUAL_CONTENT', label: 'Sexual content' },
  { value: 'SPAM',           label: 'Spam' },
  { value: 'OTHER',          label: 'Other' },
];

export type ReportTarget = {
  eventId: string;
  // roomId stays optional for the legacy single-event flow (no rooms).
  // Backend route is /live/{eventId}/rooms/{roomId}/report when present;
  // callers in the single-event flow pass roomId = 'main' (or whatever
  // the backend designates).
  roomId: string;
  reportedUserId: string;
  messageId: string;
  reportedMessageContent: string;
  reportedDisplayName: string;
};

type Props = {
  visible: boolean;
  target: ReportTarget | null;
  onClose: () => void;
  onToast: (text: string, kind: 'success' | 'error') => void;
};

export default function ReportMessageSheet({ visible, target, onClose, onToast }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);

  // Reset local state every time a new target opens the sheet. Without this,
  // the previous report's reason/freetext carries over to the next long-press.
  useEffect(() => {
    if (visible && target) {
      setReason(null);
      setFreeText('');
    }
  }, [visible, target?.messageId]);

  // First-time tutorial. SecureStore read is async — gate on visible so we
  // don't bump the flag for every mount.
  useEffect(() => {
    if (!visible) return;
    SecureStore.getItemAsync(TUTORIAL_FLAG_KEY)
      .then((seen) => {
        if (!seen) setTutorialVisible(true);
      })
      .catch(() => {});
  }, [visible]);

  async function dismissTutorial() {
    setTutorialVisible(false);
    try { await SecureStore.setItemAsync(TUTORIAL_FLAG_KEY, '1'); } catch {}
  }

  async function handleSubmit() {
    if (!target || !reason || submitting) return;
    setSubmitting(true);
    try {
      await apiPost(`/live/${target.eventId}/rooms/${target.roomId}/report`, {
        reportedUserId: target.reportedUserId,
        messageId: target.messageId,
        reportedMessageContent: target.reportedMessageContent,
        reportedDisplayName: target.reportedDisplayName,
        reason,
        freeTextReason: freeText.trim() || undefined,
      });
      onToast('Report sent', 'success');
      onClose();
    } catch {
      onToast("Couldn't send report. Try again?", 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Report message</Text>
            <Text style={styles.subtitle}>
              Reports are reviewed by our team and stay anonymous.
            </Text>

            {target && (
              <View style={styles.quoteBox}>
                <Text style={styles.quoteSender}>{target.reportedDisplayName}</Text>
                <Text style={styles.quoteText}>"{target.reportedMessageContent}"</Text>
              </View>
            )}

            <Text style={styles.sectionLabel}>What's the issue?</Text>
            <View style={styles.reasonList}>
              {REASON_OPTIONS.map((opt) => {
                const selected = reason === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                    onPress={() => setReason(opt.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Anything else? (optional)</Text>
            <TextInput
              style={styles.freeTextInput}
              value={freeText}
              onChangeText={setFreeText}
              placeholder="Add context for our team…"
              placeholderTextColor="#B0A597"
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              style={[styles.submitBtn, (!reason || submitting) && styles.submitBtnDisabled]}
              disabled={!reason || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>Submit Report</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {tutorialVisible && (
          <View style={styles.tutorialOverlay} pointerEvents="box-none">
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={dismissTutorial}
            />
            <View style={styles.tutorialCard}>
              <Text style={styles.tutorialTitle}>How reports work</Text>
              <Text style={styles.tutorialBody}>
                Long-press any message to report it. Reports are reviewed by our team and stay anonymous.
              </Text>
              <TouchableOpacity onPress={dismissTutorial} style={styles.tutorialBtn}>
                <Text style={styles.tutorialBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#FDFAF6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD5C4',
    alignSelf: 'center', marginBottom: spacing.md,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  title: {
    fontSize: 22, fontFamily: 'Cormorant_700Bold_Italic',
    color: '#0F2A48', marginBottom: 6,
  },
  subtitle: {
    fontSize: 13, color: '#6A5550', lineHeight: 19, marginBottom: spacing.lg,
  },
  quoteBox: {
    backgroundColor: '#F0EDE4',
    borderLeftWidth: 3,
    borderLeftColor: '#B83255',
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  quoteSender: {
    fontSize: 11, fontWeight: '700', color: '#9c8f7e',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  quoteText: { fontSize: 14, color: '#3A2C28', fontStyle: 'italic', lineHeight: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9c8f7e',
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: spacing.sm,
  },
  reasonList: { gap: spacing.xs, marginBottom: spacing.lg },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, paddingHorizontal: spacing.md,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#DDD5C4',
    backgroundColor: '#fff',
  },
  reasonRowSelected: { borderColor: '#B83255', backgroundColor: 'rgba(184,50,85,0.06)' },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: '#B83255',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { backgroundColor: '#B83255' },
  radioDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  reasonLabel: { fontSize: 14, color: '#3A2C28' },
  reasonLabelSelected: { color: '#B83255', fontWeight: '600' },
  freeTextInput: {
    minHeight: 88,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DDD5C4',
    padding: spacing.md,
    fontSize: 14,
    color: '#3A2C28',
    lineHeight: 20,
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
    flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#DDD5C4',
  },
  cancelBtnText: { fontSize: 14, color: '#6A5550', fontWeight: '600' },
  submitBtn: {
    flex: 2, backgroundColor: '#B83255',
    borderRadius: 999, paddingVertical: 14, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#D4B5BF' },
  submitBtnText: { fontSize: 14, color: '#fff', fontWeight: '700', letterSpacing: 0.3 },

  // ── First-run tutorial overlay ──
  tutorialOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  tutorialCard: {
    backgroundColor: '#FDFAF6',
    borderRadius: 18,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: spacing.md,
  },
  tutorialTitle: {
    fontSize: 18, fontWeight: '700', color: '#0F2A48',
  },
  tutorialBody: {
    fontSize: 14, color: '#6A5550', textAlign: 'center', lineHeight: 21,
  },
  tutorialBtn: {
    backgroundColor: '#B83255', borderRadius: 999,
    paddingHorizontal: 28, paddingVertical: 10, marginTop: 4,
  },
  tutorialBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },
});
