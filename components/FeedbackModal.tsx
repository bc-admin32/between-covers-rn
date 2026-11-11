import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from './icons';
import { PF } from '../lib/profileTheme';
import { apiPost } from '../lib/api';

const MAX_MESSAGE = 2000;

const Q1_OPTIONS = [
  { value: 'LOVED', label: 'I loved it' },
  { value: 'LIKED', label: 'I liked it' },
  { value: 'OKAY', label: 'It was okay' },
  { value: 'NOT_FOR_ME', label: "It wasn't for me" },
];

const Q2_OPTIONS = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'FEW_TIMES_WEEK', label: 'A few times a week' },
  { value: 'ONCE_OR_TWICE', label: 'Once or twice' },
  { value: 'HAVENT_USED', label: "I haven't really used it" },
];

const Q3_TRIAL_OPTIONS = [
  { value: 'THINKING_ABOUT_SUBSCRIBING', label: "I'm thinking about subscribing" },
  { value: 'NOT_SURE_YET', label: "I'm not sure yet" },
  { value: 'IDEA_OR_RECOMMENDATION', label: 'I have an idea or recommendation' },
  { value: 'DIDNT_FEEL_RIGHT', label: "Something didn't feel right" },
  { value: 'SOMETHING_ELSE', label: 'Something else' },
];

const Q3_PROFILE_OPTIONS = [
  { value: 'LOVED_SOMETHING', label: 'Something specific I loved' },
  { value: 'DIDNT_FEEL_RIGHT', label: "Something didn't feel right" },
  { value: 'IDEA_OR_RECOMMENDATION', label: 'I have an idea or recommendation' },
  { value: 'CHECKING_IN', label: 'Just checking in' },
  { value: 'SOMETHING_ELSE', label: 'Something else' },
];

const Q5_OPTIONS = [
  { value: 'YES', label: 'Yes' },
  { value: 'MAYBE', label: 'Maybe' },
  { value: 'NO', label: 'No' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  source?: 'trial' | 'profile';
};

// `source` defaults to 'profile' — profile home is the canonical caller and
// omits the prop. Other call sites (e.g. home/index.tsx for trial flow) pass it.
export function FeedbackModal({ visible, onClose, source = 'profile' }: Props) {
  const insets = useSafeAreaInsets();
  const [overall, setOverall] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [recommend, setRecommend] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q3Options = source === 'trial' ? Q3_TRIAL_OPTIONS : Q3_PROFILE_OPTIONS;
  const canSubmit = overall !== null && !submitting;
  const hasAnyAnswer = !!(overall || frequency || intent || message.trim() || recommend);

  const reset = () => {
    setOverall(null);
    setFrequency(null);
    setIntent(null);
    setMessage('');
    setRecommend(null);
    setError(null);
    setSubmitting(false);
    setSubmitted(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const requestClose = () => {
    if (submitted) {
      close();
      return;
    }
    if (hasAnyAnswer) {
      Alert.alert('Discard your feedback?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: close },
      ]);
      return;
    }
    close();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/feedback', {
        source,
        overall,
        frequency: frequency ?? null,
        intent: intent ?? null,
        message: message.trim() || null,
        recommend: recommend ?? null,
        appVersion: Constants.expoConfig?.version ?? 'unknown',
      });
      setSubmitted(true);
      setTimeout(() => close(), 1500);
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Share Feedback</Text>
          <TouchableOpacity onPress={requestClose} style={styles.closeBtn} hitSlop={12}>
            <X size={18} color={PF.icon} />
          </TouchableOpacity>
        </View>

        {submitted ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              Thank you for sharing this with me…{'\n'}I really do read everything.{'\n\n'}🤍 Iris
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            // Room for the home indicator / system bar under the Send button.
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 20 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>Hey…</Text>
            <Text style={styles.intro}>I'd love to hear your thoughts.</Text>

            <View style={styles.question}>
              <View style={styles.qHeaderRow}>
                <Text style={styles.qHeader}>How did Between Covers feel to you?</Text>
                <Text style={styles.required}>required</Text>
              </View>
              <View style={styles.options}>
                {Q1_OPTIONS.map((o) => (
                  <OptionRow
                    key={o.value}
                    label={o.label}
                    selected={overall === o.value}
                    onPress={() => setOverall(overall === o.value ? null : o.value)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.question}>
              <Text style={styles.qHeader}>How often do you open the app?</Text>
              <View style={styles.options}>
                {Q2_OPTIONS.map((o) => (
                  <OptionRow
                    key={o.value}
                    label={o.label}
                    selected={frequency === o.value}
                    onPress={() => setFrequency(frequency === o.value ? null : o.value)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.question}>
              <Text style={styles.qHeader}>What made you want to share feedback today?</Text>
              <View style={styles.options}>
                {q3Options.map((o) => (
                  <OptionRow
                    key={o.value}
                    label={o.label}
                    selected={intent === o.value}
                    onPress={() => setIntent(intent === o.value ? null : o.value)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.question}>
              <Text style={styles.qHeader}>Tell me about it.</Text>
              <Text style={styles.qSubheader}>Whatever came to mind—I'd love to hear it.</Text>
              <TextInput
                style={styles.textArea}
                value={message}
                onChangeText={(t) => setMessage(t.slice(0, MAX_MESSAGE))}
                placeholder="…"
                placeholderTextColor={PF.placeholder}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{message.length} / {MAX_MESSAGE}</Text>
            </View>

            <View style={styles.question}>
              <Text style={styles.qHeader}>Would you recommend Between Covers to a friend?</Text>
              <View style={styles.recommendRow}>
                {Q5_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.recommendBtn, recommend === o.value && styles.recommendBtnSelected]}
                    onPress={() => setRecommend(recommend === o.value ? null : o.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.recommendBtnText, recommend === o.value && styles.recommendBtnTextSelected]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.closing}>
              Thank you for sharing this with me… I really do read everything{'\n'}
              🤍 Iris
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, !canSubmit && styles.submitBtnTextDisabled]}>Send</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.optionSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PF.page },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: PF.inputBorder,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: PF.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: PF.text },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 22 },
  intro: {
    fontSize: 18, color: PF.text,
    fontStyle: 'italic', textAlign: 'center',
  },
  question: { gap: 8 },
  qHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  qHeader: { fontSize: 15, fontWeight: '700', color: PF.text, flexShrink: 1 },
  qSubheader: { fontSize: 13, color: PF.secondary, fontStyle: 'italic' },
  required: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1,
    color: PF.accent, textTransform: 'uppercase',
  },
  options: { gap: 8, marginTop: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: PF.inputBorder,
    backgroundColor: PF.card,
  },
  optionSelected: { borderColor: PF.accent, backgroundColor: 'rgba(184,50,85,0.06)' },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5,
    borderColor: PF.accent, alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { backgroundColor: PF.accent, borderColor: PF.accent },
  radioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  optionLabel: { flex: 1, fontSize: 14, color: PF.text },
  optionLabelSelected: { color: PF.accent, fontWeight: '600' },
  textArea: {
    minHeight: 110,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1, borderColor: PF.inputBorder,
    padding: 14, fontSize: 14, color: PF.text,
    lineHeight: 20,
  },
  charCount: { fontSize: 11, color: PF.label, textAlign: 'right' },
  recommendRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  recommendBtn: {
    flex: 1, height: 44, borderRadius: 12,
    borderWidth: 1, borderColor: PF.inputBorder,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: PF.card,
  },
  recommendBtnSelected: { backgroundColor: PF.accent, borderColor: PF.accent },
  recommendBtnText: { fontSize: 14, fontWeight: '600', color: PF.text },
  recommendBtnTextSelected: { color: '#fff' },
  closing: {
    fontSize: 13, color: PF.secondary, fontStyle: 'italic',
    textAlign: 'center', lineHeight: 20,
    marginTop: 8, marginBottom: 4,
  },
  error: { fontSize: 13, color: PF.accent, textAlign: 'center' },
  submitBtn: {
    height: 52, borderRadius: 12, backgroundColor: PF.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: PF.pill },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  submitBtnTextDisabled: { color: PF.secondary }, // 4.9:1 on the pill
  successContainer: {
    flex: 1, padding: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  successText: {
    fontSize: 17, color: PF.text,
    textAlign: 'center', lineHeight: 26, fontStyle: 'italic',
  },
});
