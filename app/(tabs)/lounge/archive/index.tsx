import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft } from '../../../../components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';
import { parseLocalDate } from '../../../../lib/dateUtils';

type ArchiveThread = {
  threadId: string;
  sectionType: 'PRIMARY' | 'SECONDARY' | 'IRIS_THOUGHT' | 'MONTHLY_PROMPT' | 'BOOK_CLUB';
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
  bookClub?: ArchiveBookClub | null;
};

// A month's Book Club discussion. One per month, shown once above that
// month's weeks. The response may carry it at the top level and/or on weeks;
// both are read and de-duplicated by threadId.
type ArchiveBookClub = {
  type: 'BOOK_CLUB';
  threadId: string;
  month: string; // YYYY-MM
  book: { workId: string; title: string; author: string; coverUrl: string | null };
  body: string | null;
  replyCount: number;
  closed: boolean;
};

type ArchiveResponse = { weeks?: ArchiveWeek[]; bookClub?: ArchiveBookClub | null };

function collectBookClubs(res: ArchiveResponse): ArchiveBookClub[] {
  const seen = new Set<string>();
  const out: ArchiveBookClub[] = [];
  for (const club of [res.bookClub, ...(res.weeks ?? []).map((w) => w.bookClub)]) {
    if (!club?.threadId || !club.book || seen.has(club.threadId)) continue;
    seen.add(club.threadId);
    out.push(club);
  }
  return out;
}

function formatWeekRange(startDate: string, endDate: string): string {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { day: 'numeric' })}, ${end.getFullYear()}`;
}

function getThreadStyle(type: ArchiveThread['sectionType']) {
  switch (type) {
    case 'PRIMARY': return { color: '#B83255', bg: '#FFE5E5' };
    case 'SECONDARY': return { color: '#5B5FC7', bg: '#E8E6FF' };
    case 'IRIS_THOUGHT': return { color: '#9B6B9B', bg: '#F1E8FF' };
    case 'MONTHLY_PROMPT': return { color: '#2E7D5C', bg: '#E0F4EC' };
    case 'BOOK_CLUB': return { color: '#9A4A12', bg: '#FCEBDC' };
    default: return { color: '#6A5550', bg: '#F5F0EB' };
  }
}

function getThreadTypeLabel(type: ArchiveThread['sectionType']): string {
  switch (type) {
    case 'PRIMARY': return 'Discussion';
    case 'SECONDARY': return 'Reading';
    case 'IRIS_THOUGHT': return 'Iris Has Thoughts';
    case 'MONTHLY_PROMPT': return 'Monthly Prompt';
    case 'BOOK_CLUB': return 'Book Club';
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

function BookClubCard({ club, onPress }: { club: ArchiveBookClub; onPress: () => void }) {
  const style = getThreadStyle('BOOK_CLUB');
  return (
    <TouchableOpacity style={[styles.threadCard, styles.clubCard]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.threadCardHeader}>
        <View style={[styles.tag, { backgroundColor: style.bg }]}>
          <Text style={[styles.tagText, { color: style.color }]}>{getThreadTypeLabel('BOOK_CLUB')}</Text>
        </View>
        <Text style={styles.threadReplies}>{club.replyCount} {club.replyCount === 1 ? 'reply' : 'replies'}</Text>
      </View>
      <View style={styles.clubBook}>
        {club.book.coverUrl ? (
          <Image source={{ uri: club.book.coverUrl }} style={styles.clubCover} />
        ) : (
          <View style={[styles.clubCover, styles.clubCoverEmpty]}><Text>📖</Text></View>
        )}
        <View style={styles.clubBookText}>
          <Text style={styles.clubEyebrow}>Book of the Month</Text>
          <Text style={styles.clubTitle} numberOfLines={2}>{club.book.title}</Text>
          <Text style={styles.clubAuthor} numberOfLines={1}>by {club.book.author}</Text>
        </View>
      </View>
      <Text style={[styles.threadCta, { color: style.color }]}>Read the discussion →</Text>
    </TouchableOpacity>
  );
}

export default function LoungeArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [weeks, setWeeks] = useState<ArchiveWeek[]>([]);
  const [bookClubs, setBookClubs] = useState<ArchiveBookClub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ArchiveResponse>('/lounge/archive')
      .then((res) => {
        setWeeks(res.weeks ?? []);
        setBookClubs(collectBookClubs(res));
      })
      .finally(() => setLoading(false));
  }, []);

  // Each Book Club goes once, above the first listed week of its month.
  // A club whose month has no archived week is shown at the very top.
  const { clubBeforeWeek, unplacedClubs } = useMemo(() => {
    const byMonth = new Map(bookClubs.map((c) => [c.month, c]));
    const before = new Map<string, ArchiveBookClub>();
    for (const w of weeks) {
      const club = byMonth.get(w.startDate.slice(0, 7));
      if (club) { before.set(w.weekId, club); byMonth.delete(club.month); }
    }
    return { clubBeforeWeek: before, unplacedClubs: [...byMonth.values()] };
  }, [weeks, bookClubs]);

  const openBookClub = (club: ArchiveBookClub) => router.push(
    `/(tabs)/lounge/thread?id=${encodeURIComponent(club.threadId)}&kind=book_club` +
    `&bookWorkId=${encodeURIComponent(club.book.workId)}` +
    `&bookTitle=${encodeURIComponent(club.book.title)}` +
    `&bookAuthor=${encodeURIComponent(club.book.author)}` +
    `&bookCover=${encodeURIComponent(club.book.coverUrl ?? '')}` as any
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <CaretLeft size={22} color="#6A5550" weight="bold" />
            </TouchableOpacity>
            <Text style={styles.title}>The Archive</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={styles.weeksList}>
            {unplacedClubs.map((club) => (
              <BookClubCard key={club.threadId} club={club} onPress={() => openBookClub(club)} />
            ))}
            {weeks.map((week) => {
              const club = clubBeforeWeek.get(week.weekId);
              return (
                <View key={week.weekId} style={styles.weekGroup}>
                  {club && <BookClubCard club={club} onPress={() => openBookClub(club)} />}
                  <WeekRow
                    week={week}
                    onThreadClick={(threadId) => router.push(`/(tabs)/lounge/thread?id=${encodeURIComponent(threadId)}` as any)}
                  />
                </View>
              );
            })}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(106,85,80,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 42, color: '#1A1A2E', fontFamily: 'Nunito_800ExtraBold_Italic', flexShrink: 1 },
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
  weekGroup: { gap: spacing.sm },
  clubCard: { borderColor: '#F3D3B8' },
  clubBook: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  clubCover: { width: 48, height: 72, borderRadius: 6, backgroundColor: '#E6EAF0' },
  clubCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  clubBookText: { flex: 1, justifyContent: 'center' },
  clubEyebrow: { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: '#9A4A12', fontWeight: '700', marginBottom: 2 },
  clubTitle: { fontSize: 16, color: '#1A1A2E', lineHeight: 21 },
  clubAuthor: { fontSize: 12, color: '#6A5550', marginTop: 1 },
});