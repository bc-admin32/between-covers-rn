import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { apiPost } from '../lib/api';

/* =========================
   TYPES
========================= */
export type ChurnAction = 'deactivate' | 'delete';

export type ChurnReason =
  | 'NO_CONTENT_LIKED'
  | 'NOT_USING_ENOUGH'
  | 'TOO_EXPENSIVE'
  | 'NOT_WORTH_PRICE'
  | 'PRIVACY_CONCERNS'
  | 'TECHNICAL_ISSUES'
  | 'USING_ANOTHER_APP'
  | 'NOT_ENGAGING'
  | 'JUST_EXPLORING'
  | 'OTHER';

type ReasonOption = {
  value: ChurnReason;
  label: string;
};

type Props = {
  visible: boolean;
  action: ChurnAction;
  onClose: () => void;
  onContinue: () => void;
};

/* =========================
   CONSTANTS
========================= */
const REASONS: ReasonOption[] = [
  { value: 'NO_CONTENT_LIKED',   label: "Couldn't find content I liked" },
  { value: 'NOT_USING_ENOUGH',   label: 'Not using the app enough right now' },
  { value: 'TOO_EXPENSIVE',      label: 'Too expensive' },
  { value: 'NOT_WORTH_PRICE',    label: "Didn't feel worth the price" },
  { value: 'PRIVACY_CONCERNS',   label: 'Privacy concerns' },
  { value: 'TECHNICAL_ISSUES',   label: 'Technical issues or bugs' },
  { value: 'USING_ANOTHER_APP',  label: 'Using another app instead' },
  { value: 'NOT_ENGAGING',       label: "Didn't feel engaging enough" },
  { value: 'JUST_EXPLORING',     label: 'Just exploring / was curious' },
  { value: 'OTHER',              label: 'Other' },
];

const MAX_FREE_TEXT = 1000;

/* =========================
   COMPONENT
========================= */
export function ChurnFeedbackModal({ visible, action, onClose, onContinue }: Props) {
  const [reasons, setReasons] = useState<ChurnReason[]>([]);
  const [freeText, setFreeText] = useState('');

  // Reset form when modal opens fresh
  useEffect(() => {
    if (visible) {
      setReasons([]);
      setFreeText('');
    }
  }, [visible]);

  const toggleReason = (value: ChurnReason) => {
    Haptics.selectionAsync().catch(() => {});
    setReasons((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    // Skip path: no POST, just proceed straight to the destructive Alert.
    onContinue();
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const trimmedText = freeText.trim();
    const hasFeedback = reasons.length > 0 || trimmedText.length > 0;

    // Fire-and-forget — never block the user from leaving.
    if (hasFeedback) {
      apiPost('/churn-feedback', {
        action,
        reasons,
        freeText: trimmedText.length > 0 ? trimmedText : null,
      }).catch((err) => {
        console.warn('Churn feedback POST failed (non-fatal):', err);
      });
    }

    onClose();
    onContinue();
  };

  const continueLabel = action === 'delete'
    ? 'Continue to delete account'
    : 'Continue to deactivate';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Before you go…</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            We'd love to know what made you decide to leave.
          </Text>
          <Text style={styles.subtext}>(Select all that apply)</Text>

          <View style={styles.chipsContainer}>
            {REASONS.map((reason) => {
              const selected = reasons.includes(reason.value);
              return (
                <TouchableOpacity
                  key={reason.value}
                  onPress={() => toggleReason(reason.value)}
                  activeOpacity={0.75}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={reason.label}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.textSection}>
            <Text style={styles.textLabel}>Want to share a little more?</Text>
            <Text style={styles.textHelper}>(optional)</Text>
            <TextInput
              style={styles.textInput}
              value={freeText}
              onChangeText={setFreeText}
              placeholder="What didn't work for you?"
              placeholderTextColor="#9b8a99"
              multiline
              maxLength={MAX_FREE_TEXT}
              textAlignVertical="top"
              accessibilityLabel="Additional feedback"
            />
            <Text style={styles.charCount}>
              {freeText.length} / {MAX_FREE_TEXT}
            </Text>
          </View>

          <Text style={styles.irisVoice}>
            🤍 We're sad to see you go. Whatever you share helps us be better for the next reader.
            {'\n'}— Iris
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>{continueLabel}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* =========================
   STYLES — matches FeedbackModal token system
========================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F4F8',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15,42,72,0.15)',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,42,72,0.10)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2A48',
  },
  closeIcon: {
    fontSize: 16,
    color: '#6b7280',
    paddingHorizontal: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  intro: {
    fontSize: 16,
    color: '#0F2A48',
    lineHeight: 22,
    marginBottom: 4,
  },
  subtext: {
    fontSize: 13,
    color: '#6A5969',
    fontStyle: 'italic',
    marginBottom: 18,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,42,72,0.12)',
    backgroundColor: '#fff',
    gap: 8,
  },
  chipSelected: {
    borderColor: '#B83255',
    backgroundColor: 'rgba(184,50,85,0.06)',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(15,42,72,0.30)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#B83255',
    borderColor: '#B83255',
  },
  checkmark: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 12,
  },
  chipLabel: {
    fontSize: 14,
    color: '#0F2A48',
    fontWeight: '500',
  },
  chipLabelSelected: {
    color: '#0F2A48',
    fontWeight: '600',
  },
  textSection: {
    marginBottom: 16,
  },
  textLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F2A48',
  },
  textHelper: {
    fontSize: 12,
    color: '#6A5969',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  textInput: {
    minHeight: 96,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,42,72,0.12)',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0F2A48',
  },
  charCount: {
    fontSize: 11,
    color: '#9b8a99',
    textAlign: 'right',
    marginTop: 4,
  },
  irisVoice: {
    fontSize: 13,
    color: '#6A5969',
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,42,72,0.10)',
    gap: 12,
    backgroundColor: '#F1F4F8',
  },
  skipBtn: {
    flex: 1,
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,42,72,0.20)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F2A48',
  },
  continueBtn: {
    flex: 2,
    height: 50,
    borderRadius: 999,
    backgroundColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
});
