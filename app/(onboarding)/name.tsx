import { useState } from 'react';
import {
  View, TextInput, TouchableOpacity, Text, StyleSheet, KeyboardAvoidingView, ScrollView, Keyboard, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiPost, ApiError } from '../../lib/api';
import { landAfterAuth } from '../../lib/guest';
import { track, takePendingSignup } from '../../lib/analytics';
import { PRIMARY_SUBGENRES } from '../../lib/tagTaxonomy';
import { PF } from '../../lib/profileTheme';
import { radius, spacing } from '../../lib/theme';

// The last onboarding step (after Welcome and Acceptance): name + 1–3
// favorite genres in one form. L3Nam saves both (genres is the same field
// Profile's Favorite Genres uses) plus the device time zone, completes
// onboarding and starts the trial; nextRoute is usually /home.

const MAX_GENRES = 3;

export default function NameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atMax = genres.length >= MAX_GENRES;
  const canSubmit = name.trim().length > 0 && genres.length >= 1 && !submitting;

  const toggle = (key: string) => {
    if (submitting) return;
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setError(null);
    setGenres((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : prev.length >= MAX_GENRES ? prev : [...prev, key]));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await apiPost('/onboarding/submit', { step: 'L3Nam', value: name.trim(), genres, timeZone });
      if (res?.nextRoute) {
        // Onboarding complete: the new account's signup_completed, held since
        // redirect.tsx (taking it clears it, so it can't fire twice).
        const pending = await takePendingSignup();
        if (pending) track('signup_completed', { ...pending, accountType: 'new' });
        track('onboarding_completed', {});
        await landAfterAuth(router, res.nextRoute);
        return;
      }
      setError('Something went wrong. Please try again.');
    } catch (err) {
      // 400s carry a member-facing message ("Pick up to 3 genres", …).
      const msg = err instanceof ApiError && err.status === 400 ? err.body?.message ?? err.body?.error : null;
      setError(typeof msg === 'string' && msg ? msg : 'Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Let's get to know you</Text>

          <Text style={styles.label}>What should we call you?</Text>
          <TextInput
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
            placeholder="Your name"
            placeholderTextColor={PF.placeholder}
            style={styles.input}
            returnKeyType="done"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={50}
            editable={!submitting}
            accessibilityLabel="Your name"
          />

          <View style={styles.genreHeader}>
            <Text style={styles.label}>Favorite genres</Text>
            <Text style={styles.counter}>{genres.length} of {MAX_GENRES}</Text>
          </View>
          <View style={styles.chipGroup}>
            {PRIMARY_SUBGENRES.map(({ value, label }) => {
              const active = genres.includes(value);
              const disabled = submitting || (!active && atMax);
              return (
                <TouchableOpacity
                  key={value}
                  disabled={disabled}
                  onPress={() => toggle(value)}
                  style={[styles.chip, active && styles.chipSelected, !active && atMax && styles.chipDisabled]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>{submitting ? 'Saving…' : 'Continue'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  title: { fontSize: 28, fontFamily: 'Cormorant_700Bold_Italic', color: PF.text, textAlign: 'center', marginBottom: spacing.lg },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: PF.accent, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: PF.inputBorder,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: PF.text,
    marginBottom: spacing.lg,
  },
  genreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  counter: { fontSize: 11, fontWeight: '700', color: PF.label, marginBottom: spacing.sm },
  // Same chips as Profile's Reading Preferences.
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: PF.inputBorder, backgroundColor: '#FFFFFF' },
  chipSelected: { backgroundColor: PF.text, borderColor: PF.text },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 12, color: PF.text },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
  error: { fontSize: 12, color: PF.accent, textAlign: 'center', marginTop: spacing.md },
  button: {
    marginTop: spacing.lg,
    height: 48,
    borderRadius: 12,
    backgroundColor: PF.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
