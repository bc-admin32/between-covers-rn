import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

type ArchiveThread = {
  threadId: string;
  sectionType: 'PRIMARY' | 'SECONDARY' | 'IRIS_THOUGHT' | 'MONTHLY_PROMPT';
  label: string;
  body: string | null;
  replyCount: number;
};

type ArchiveWeek = {
  weekId: string;
  startDate: string;
  endDate: string;
  publishedAt: string | null;
  threads: ArchiveThread[];
};

function formatWeekRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { day: 'numeric' })}, ${end.getFullYear()}`;
}

function getThreadStyle(type: ArchiveThread['sectionType']) {
  switch (type) {
    case 'PRIMARY': return { color: '#B83255', bg: '#FFE5E5' };
    case 'SECONDARY': return { color: '#5B5FC7', bg: '#E8E6FF' };
    case 'IRIS_THOUGHT': return { color: '#9B6B9B', bg: '#F1E8FF' };
    case 'MONTHLY_PROMPT': return { color: '#2E7D5C', bg: '#E0F4EC' };
    default: return { color: '#6A5550', bg: '#F5F0EB' };
  }
}

function getThreadTypeLabel(type: ArchiveThread['sectionType']): string {
  switch (type) {
    case 'PRIMARY': return 'Discussion';
    case 'SECONDARY': return 'Reading';
    case 'IRIS_THOUGHT': return 'Iris Has Thoughts';
    case 'MONTHLY_PROMPT': return 'Monthly Prompt';
    default: return 'Thread';
  }
}

function WeekRow({ week, onThreadClick }: { week: ArchiveWeek; onThreadClick: (threadId: string) => void }) {
  const [open, setOpen] = useState(false);
  const totalReplies = week.threads.reduce((sum, t) => sum + t.replyCount, 0);

  return (
    <View style={styles.weekRow}>
      <TouchableOpacity style={styles.weekHeader} onPress={() => setOpen(!open)}>
        <View style={styles.weekHeaderLeft}>
          <Text style={styles.weekLabel}>{formatWeekRange(week.startDate, week.endDate)}</Text>
          <View style={styles.weekTags}>
            {week.threads.map((t) => {
              const style = getThreadStyle(t.sectionType);
              return (
                <View key={t.threadId} style={[styles.tag, { backgroundColor: style.bg }]}>
                  <Text style={[styles.tagText, { color: style.color }]}>{getThreadTypeLabel(t.sectionType)}</Text>
                </View>
              );
            })}
          </View>
        </View>
        <View style={styles.weekHeaderRight}>
          <Text style={styles.weekReplies}>{totalReplies} replies</Text>
          <Text style={styles.weekChevron}>{open ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {open && (
        <View style={styles.weekThreads}>
          {week.threads.map((thread) => {
            const style = getThreadStyle(thread.sectionType);
            return (
              <TouchableOpacity
                key={thread.threadId}
                style={styles.threadCard}
                onPress={() => onThreadClick(thread.threadId)}
              >
                <View style={styles.threadCardHeader}>
                  <View style={[styles.tag, { backgroundColor: style.bg }]}>
                    <Text style={[styles.tagText, { color: style.color }]}>{getThreadTypeLabel(thread.sectionType)}</Text>
                  </View>
                  <Text style={styles.threadReplies}>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</Text>
                </View>
                <Text style={styles.threadLabel}>{thread.label}</Text>
                {thread.body && <Text style={styles.threadBody} numberOfLines={2}>{thread.body}</Text>}
                <Text style={[styles.threadCta, { color: style.color }]}>Read the thread →</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function LoungeArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [weeks, setWeeks] = useState<ArchiveWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ weeks: ArchiveWeek[] }>('/lounge/archive')
      .then((res) => setWeeks(res.weeks ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>The Lounge</Text>
          </TouchableOpacity>
          <Text style={styles.title}>The Archive</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={styles.weeksList}>
            {weeks.map((week) => (
              <WeekRow
                key={week.weekId}
                week={week}
                onThreadClick={(threadId) => router.push(`/(tabs)/lounge/thread?id=${encodeURIComponent(threadId)}` as any)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  scrollContent: { paddingBottom: 100 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  backArrow: { fontSize: 20, color: '#6A5550' },
  backText: { fontSize: 13, color: '#6A5550' },
  title: { fontSize: 42, color: '#1A1A2E', fontStyle: 'italic', fontWeight: '700' },
  weeksList: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  weekRow: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: '#DDD5C4', backgroundColor: '#FDFAF6' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  weekHeaderLeft: { flex: 1 },
  weekHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekLabel: { fontSize: 12, fontWeight: '600', color: '#1A1A2E', marginBottom: spacing.xs },
  weekTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  weekReplies: { fontSize: 10, color: '#C4A882' },
  weekChevron: { fontSize: 10, color: '#C4A882' },
  weekThreads: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 9, fontWeight: '600' },
  threadCard: { backgroundColor: '#FDFAF6', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#EDE8DF' },
  threadCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  threadReplies: { fontSize: 11, color: '#C4A882' },
  threadLabel: { fontSize: 18, color: '#1A1A2E', lineHeight: 24, marginBottom: spacing.xs },
  threadBody: { fontSize: 12, color: '#6A5550', lineHeight: 18, marginBottom: spacing.sm },
  threadCta: { fontSize: 11, fontWeight: '600' },
});