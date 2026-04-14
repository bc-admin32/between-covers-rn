import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

const EMOJI_TRAY = ['❤️', '😂', '😭', '🔥', '👏', '✨', '😍', '💀', '🫶', '📚'];

type Reaction = { emoji: string; count: number; reactedByMe: boolean };
type Submission = {
  sk: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
  reactions: Reaction[];
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function ConfessionCard({ submission, onReact }: {
  submission: Submission;
  onReact: (sk: string, emoji: string) => void;
}) {
  const [showEmojiTray, setShowEmojiTray] = useState(false);

  return (
    <View style={styles.confessionCard}>
      <Text style={styles.confessionText}>{submission.content}</Text>
      <Text style={styles.confessionTime}>{timeAgo(submission.createdAt)}</Text>

      {submission.reactions?.length > 0 && (
        <View style={styles.reactionBar}>
          {submission.reactions.map((r) => (
            <TouchableOpacity
              key={r.emoji}
              style={[styles.reactionButton, r.reactedByMe && styles.reactionButtonActive]}
              onPress={() => onReact(submission.sk, r.emoji)}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              <Text style={[styles.reactionCount, r.reactedByMe && styles.reactionCountActive]}>{r.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity onPress={() => setShowEmojiTray(!showEmojiTray)}>
        <Text style={styles.reactButton}>React 😊</Text>
      </TouchableOpacity>

      {showEmojiTray && (
        <View style={styles.emojiTray}>
          {EMOJI_TRAY.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.emojiButton}
              onPress={() => { onReact(submission.sk, emoji); setShowEmojiTray(false); }}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function MonthlyWallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { promptId } = useLocalSearchParams<{ promptId: string }>();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!promptId) return;
    apiGet<{ submissions: Submission[] }>(`/lounge/monthly/submissions?promptId=${promptId}`)
      .then((res) => setSubmissions(res.submissions ?? []))
      .finally(() => setLoading(false));
  }, [promptId]);

  const handleReact = useCallback(async (sk: string, emoji: string) => {
    setSubmissions((prev) => prev.map((s) => {
      if (s.sk !== sk) return s;
      const existing = s.reactions?.find((r) => r.emoji === emoji);
      if (existing) {
        return {
          ...s, reactions: s.reactions
            .map((r) => r.emoji === emoji ? { ...r, count: r.reactedByMe ? r.count - 1 : r.count + 1, reactedByMe: !r.reactedByMe } : r)
            .filter((r) => r.count > 0),
        };
      }
      return { ...s, reactions: [...(s.reactions ?? []), { emoji, count: 1, reactedByMe: true }] };
    }));
    try { await apiPost('/lounge/confession/react', { submissionSk: sk, emoji }); } catch {}
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Confession Wall</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : submissions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No confessions yet. Be the first!</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {submissions.map((s) => (
              <ConfessionCard key={s.sk} submission={s} onReact={handleReact} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A2E' },
  scrollContent: { paddingBottom: 100 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  backArrow: { fontSize: 20, color: '#C4A882' },
  backText: { fontSize: 13, color: '#C4A882' },
  title: { fontSize: 32, color: '#fff', fontFamily: 'Nunito_700Bold_Italic' },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyState: { paddingTop: 64, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#C4A882' },
  confessionCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  confessionText: { fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 22, fontStyle: 'italic', marginBottom: spacing.sm },
  confessionTime: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: spacing.sm },
  reactionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  reactionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  reactionButtonActive: { backgroundColor: 'rgba(184,50,85,0.2)' },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  reactionCountActive: { color: '#F5A3BC' },
  reactButton: { fontSize: 11, color: 'rgba(196,168,130,0.7)', marginTop: spacing.xs },
  emojiTray: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  emojiButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 18 },
});