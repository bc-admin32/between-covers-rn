import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiGet, apiPost } from '../../../../../lib/api';
import { spacing, radius, colors } from '../../../../../lib/theme';

type Prompt = {
  promptId: string;
  title: string;
  body: string;
  anonymous: boolean;
  submissionsOpen: boolean;
  closesAt: string | null;
  submissionCount: number;
  userHasSubmitted: boolean;
  userSubmission: string | null;
};

export default function MonthlySubmitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { promptId } = useLocalSearchParams<{ promptId: string }>();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!promptId) { setError('No prompt specified.'); setLoading(false); return; }
    apiGet<{ prompt: Prompt }>(`/lounge/monthly/prompt?promptId=${promptId}`)
      .then((res) => {
        setPrompt(res.prompt);
        setPostAnonymous(res.prompt.anonymous ?? false);
        if (res.prompt.userHasSubmitted) setText(res.prompt.userSubmission ?? '');
      })
      .catch(() => setError("Couldn't load this prompt."))
      .finally(() => setLoading(false));
  }, [promptId]);

  const handleSubmit = async () => {
    if (submitting || !text.trim() || !promptId) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiPost('/lounge/monthly/submit', {
        promptId,
        content: text.trim(),
        anonymous: postAnonymous,
      });
      setSubmitted(true);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitError('Something went wrong. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#C4A882" />
        <Text style={styles.loadingText}>Setting the mood…</Text>
      </View>
    );
  }

  if (error || !prompt) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
        <Text style={styles.errorText}>{error ?? "This prompt couldn't be found."}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
        <Text style={styles.successTitle}>Confession received.</Text>
        <Text style={styles.successSubtitle}>
          {postAnonymous ? 'You posted anonymously.' : 'Your name is on it.'}
        </Text>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => router.back()}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <CaretLeft size={20} color="#C4A882" weight="bold" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={2}>{prompt.title}</Text>
        </View>
        <Text style={styles.body}>{prompt.body}</Text>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Write your confession…"
          placeholderTextColor="rgba(196,168,130,0.5)"
          style={styles.input}
        />

        <TouchableOpacity
          style={styles.anonymousRow}
          onPress={() => setPostAnonymous(!postAnonymous)}
        >
          <View style={[styles.checkbox, postAnonymous && styles.checkboxChecked]}>
            {postAnonymous && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.anonymousLabel}>Post anonymously</Text>
        </TouchableOpacity>

        {submitError && <Text style={styles.submitError}>{submitError}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, (!text.trim() || submitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !text.trim()}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Submitting…' : 'Submit'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A2E' },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  backButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(196,168,130,0.15)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: 28, flex: 1, color: '#FDFAF6', fontStyle: 'italic', fontWeight: '700', lineHeight: 34 },
  body: { fontSize: 14, color: 'rgba(253,250,246,0.6)', lineHeight: 22, marginBottom: spacing.xl },
  input: {
    backgroundColor: 'rgba(253,250,246,0.07)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(196,168,130,0.3)',
    padding: spacing.md,
    fontSize: 16,
    color: '#FDFAF6',
    fontStyle: 'italic',
    lineHeight: 24,
    minHeight: 160,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  anonymousRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#C4A882', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#B83255', borderColor: '#B83255' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  anonymousLabel: { fontSize: 13, color: 'rgba(196,168,130,0.8)' },
  submitError: { fontSize: 12, color: '#B83255', marginBottom: spacing.sm },
  submitButton: { borderRadius: 999, paddingVertical: 14, backgroundColor: '#B83255', alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#6A5969' },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  loadingText: { fontSize: 14, color: '#C4A882', marginTop: spacing.sm },
  errorText: { fontSize: 14, color: 'rgba(253,250,246,0.6)', textAlign: 'center' },
  backLink: { marginTop: spacing.md },
  backLinkText: { fontSize: 14, color: '#C4A882', textDecorationLine: 'underline' },
  successTitle: { fontSize: 32, color: '#FDFAF6', fontStyle: 'italic', fontWeight: '700', textAlign: 'center', marginBottom: spacing.md },
  successSubtitle: { fontSize: 14, color: 'rgba(253,250,246,0.6)', textAlign: 'center', marginBottom: spacing.xl },
  doneButton: { borderRadius: 999, paddingHorizontal: 32, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(196,168,130,0.5)' },
  doneButtonText: { fontSize: 14, fontWeight: '600', color: '#C4A882' },
});