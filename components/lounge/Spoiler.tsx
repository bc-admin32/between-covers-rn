import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ApiError } from '../../lib/api';

// Spoiler support for Lounge replies (all threads, incl. Iris Thoughts).
// A reply with spoiler: true is covered — text AND image/GIF — until tapped.
// Own replies are never covered; they show a small "Spoiler" tag instead.

// Revealed replies, kept for the app session (module scope) so a reply stays
// revealed when the reader leaves the thread and comes back.
const revealedThisSession = new Set<string>();

export function useSpoilerReveal() {
  const [, bump] = useState(0);
  const isRevealed = useCallback((replyId: string) => revealedThisSession.has(replyId), []);
  const reveal = useCallback((replyId: string) => {
    revealedThisSession.add(replyId);
    bump((n) => n + 1);
  }, []);
  return { isRevealed, reveal };
}

// Covers the reply content. `tone` matches the bubble it sits in: light
// bubbles (thread screen, Iris's own) or dark ones (Iris Thoughts users).
export function SpoilerCover({ onReveal, tone = 'light' }: { onReveal: () => void; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <TouchableOpacity
      onPress={onReveal}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Spoiler. Tap to reveal."
      style={[styles.cover, dark ? styles.coverDark : styles.coverLight]}
    >
      <Text style={[styles.coverText, dark ? styles.coverTextDark : styles.coverTextLight]}>
        🙈 Spoiler — tap to reveal
      </Text>
    </TouchableOpacity>
  );
}

export function SpoilerTag({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <View style={[styles.tag, dark ? styles.tagDark : styles.tagLight]}>
      <Text style={[styles.tagText, dark ? styles.tagTextDark : styles.tagTextLight]}>Spoiler</Text>
    </View>
  );
}

// Composer / edit chip that marks the reply as a spoiler.
export function SpoilerToggle({ value, onChange, disabled }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <Text style={[styles.toggleText, value && styles.toggleTextOn]}>
        {value ? '🙈 Spoiler' : '🙈 Mark as spoiler'}
      </Text>
    </TouchableOpacity>
  );
}

// POST /lounge/thread/reply|edit answers 403 "This discussion is closed."
// once a thread has closed (e.g. the Book Club at month end). Other 403s
// (e.g. a Lounge restriction) are not treated as "closed".
export function isThreadClosedError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = (err.body ?? {}) as { message?: unknown; error?: unknown };
  const text = [body.message, body.error].filter((v) => typeof v === 'string').join(' ');
  return /closed/i.test(text);
}

export const THREAD_CLOSED_MESSAGE = 'This discussion is closed';

const styles = StyleSheet.create({
  cover: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  coverLight: { backgroundColor: '#EDE6DA', borderColor: '#D9CBB6' },
  coverDark: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.35)' },
  coverText: { fontSize: 13, fontFamily: 'Nunito_700Bold' },
  coverTextLight: { color: '#8A7560' },
  coverTextDark: { color: '#fff' },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, marginBottom: 4 },
  tagLight: { backgroundColor: '#F3E7D6' },
  tagDark: { backgroundColor: 'rgba(255,255,255,0.2)' },
  tagText: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Nunito_700Bold' },
  tagTextLight: { color: '#9A7B55' },
  tagTextDark: { color: '#fff' },
  toggle: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#DDD5C4', backgroundColor: '#FDFAF6' },
  toggleOn: { borderColor: '#B83255', backgroundColor: '#FDF0F4' },
  toggleText: { fontSize: 11, color: '#9C8F7E', fontFamily: 'Nunito_600SemiBold' },
  toggleTextOn: { color: '#B83255', fontFamily: 'Nunito_700Bold' },
});
