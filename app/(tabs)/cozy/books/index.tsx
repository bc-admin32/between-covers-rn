import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft, Funnel } from '../../../../components/icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { cozyMonthKey } from '../../../../lib/cozyLayout';
import { PR, prStyles, usePlayroom } from '../../../../lib/playroomPage';
import { useDarkStatusBarWhileFocused } from '../../../../lib/statusBarTone';
import { tileLabel } from '../../../../components/playroom/tiles';
import { spacing, radius, colors } from '../../../../lib/theme';
import { groupBooksBySubgenre } from '../../../../lib/tagTaxonomy';
import BookCard, { BookCardData } from '../../../../components/cozy/BookCard';
import BookOfMonthCard, { type BookOfMonth } from '../../../../components/cozy/BookOfMonthCard';
import { IRIS_AVATAR } from '../../../../lib/irisAvatar';

type BookItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string | null;
  spice?: number | null;
  spiceLevel?: string | null;
  tropes?: string[];
  primarySubgenre?: string | null;
  triggers?: string[];
  isBookOfMonth?: boolean;
};

// Books are grouped under genre headers on this screen, so primarySubgenre is
// intentionally omitted from the card — the per-card genre line would be
// redundant. Peppers, trope pills, and CW badges stay.
function toCard(book: BookItem): BookCardData {
  return {
    bookId: book.workId,
    title: book.title,
    author: book.primaryAuthor,
    coverUrl: book.coverUrl,
    spice: book.spice,
    spiceLevel: book.spiceLevel,
    tropes: book.tropes,
    triggers: book.triggers,
  };
}

export default function CozyBooksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<BookItem[]>([]);
  const [bookOfMonth, setBookOfMonth] = useState<BookOfMonth | null>(null);
  const [loading, setLoading] = useState(true);
  useDarkStatusBarWhileFocused();
  // PlayRoom months make this Between the Sheets: after the shelf come the
  // reader's personal pick ("I Saw This Book and Thought of You") and Keep Me
  // Guessing (Off The Shelf, this month only). month=previous → last month.
  const playroom = usePlayroom();
  const isBetweenTheSheets = playroom;
  const params = useLocalSearchParams<{ month?: string }>();
  const monthKey = cozyMonthKey(params.month);
  const iconColor = playroom ? PR.heading : '#0F2A48';
  const [spotlight, setSpotlight] = useState<BookItem | null>(null);
  const [offShelf, setOffShelf] = useState<{ blurb?: string; books: BookCardData[] } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet('/cozy/home?view=full');
        const month = response?.[monthKey];
        const data: BookItem[] =
          month?.sections?.BOOKS ??
          month?.sections?.books ?? [];
        setBooks(data);
        setBookOfMonth(
          month?.sections?.bookOfMonth ??
          data.find((b) => b.isBookOfMonth) ?? null
        );
        if (isBetweenTheSheets) setSpotlight(month?.sections?.spotlight?.book ?? null);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, [monthKey, isBetweenTheSheets]);

  useEffect(() => {
    if (!isBetweenTheSheets || monthKey !== 'active') return;
    apiGet<{ enabled?: boolean; blurb?: string; books?: BookCardData[] }>('/cozy/off-shelf')
      .then((res) => {
        if (res?.enabled && Array.isArray(res.books) && res.books.length > 0) {
          setOffShelf({ blurb: res.blurb, books: res.books });
        }
      })
      .catch(() => {});
  }, [isBetweenTheSheets, monthKey]);

  const hasExtras = isBetweenTheSheets && (!!spotlight || !!offShelf);

  // Group by primarySubgenre, ordered by the shared taxonomy so this screen's
  // genre order matches New Releases. Untagged books fall into "Other", last.
  // The Book of the Month is featured above the groups, so it's left out of them.
  const sections = useMemo(
    () => groupBooksBySubgenre(bookOfMonth ? books.filter((b) => b.workId !== bookOfMonth.workId) : books),
    [books, bookOfMonth],
  );

  return (
    <View style={[styles.container, playroom && prStyles.page, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backButton, playroom && prStyles.softButton]}
            onPress={() => router.back()}
          >
            <CaretLeft size={20} color={iconColor} weight="bold" />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerLabel, playroom && prStyles.eyebrow]}>{monthKey === 'previous' ? "Last Month's Bookshelf" : "This Month's Bookshelf"}</Text>
            <Text style={[styles.headerTitle, playroom && prStyles.heading]}>{playroom ? tileLabel('betweenTheSheets') : "On Iris's Shelf"}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.filterButton, playroom && prStyles.softButton]}
            onPress={() => router.push('/(tabs)/cozy/catalog' as any)}
            accessibilityLabel="Filter the catalog"
          >
            <Funnel size={20} color={iconColor} weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.irisButton, playroom && prStyles.cardBorder]}
            onPress={() => router.push('/iris/chat?from=cozy/books' as any)}
          >
            <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
          </TouchableOpacity>
        </View>
      </View>

      {/* IRIS NOTE */}
      <View style={[styles.irisNote, playroom && prStyles.cardBorder]}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={[styles.irisNoteText, playroom && prStyles.body]}>
          Handpicked for this month's theme — find your next obsession.
        </Text>
      </View>

      {/* COUNT */}
      <View style={styles.countRow}>
        <View style={styles.countLine} />
        {!loading && books.length > 0 && (
          <Text style={[styles.countText, playroom && prStyles.eyebrow]}>
            {books.length} {books.length === 1 ? 'Book' : 'Books'}
          </Text>
        )}
        <View style={styles.countLine} />
      </View>

      {/* GRID */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : books.length === 0 && !hasExtras ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={[styles.emptyTitle, playroom && prStyles.heading]}>Coming soon</Text>
            <Text style={[styles.emptyText, playroom && prStyles.body]}>
              Iris is still curating this month's picks. Check back soon.
            </Text>
          </View>
        ) : (
          <>
            {bookOfMonth && <BookOfMonthCard book={bookOfMonth} />}
            {isBetweenTheSheets && sections.length > 0 && (
              <Text style={[styles.playroomHeading, prStyles.heading]}>Iris's Shelf</Text>
            )}
            {sections.map((section) => (
              <View key={section.key} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, playroom && prStyles.eyebrow]}>{section.label}</Text>
                  <Text style={[styles.sectionCount, playroom && prStyles.eyebrow]}>{section.books.length}</Text>
                </View>
                <View style={styles.gridInner}>
                  {section.books.map((book, i) => (
                    <BookCard
                      key={book.workId ?? i}
                      book={toCard(book)}
                      style={styles.bookCard}
                    />
                  ))}
                </View>
              </View>
            ))}

            {/* BETWEEN THE SHEETS: the personal pick, then Keep Me Guessing */}
            {isBetweenTheSheets && spotlight && (
              <View style={styles.section}>
                <Text style={[styles.playroomHeading, prStyles.heading]}>I Saw This Book and Thought of You</Text>
                <View style={styles.gridInner}>
                  <BookCard book={toCard(spotlight)} style={styles.bookCard} />
                </View>
              </View>
            )}
            {isBetweenTheSheets && offShelf && (
              <View style={styles.section}>
                <View style={styles.playroomHeadingRow}>
                  <Text style={[styles.playroomHeading, prStyles.heading, { marginBottom: 0 }]}>Keep Me Guessing</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/cozy/off-shelf' as any)}>
                    <Text style={styles.viewAll}>View All →</Text>
                  </TouchableOpacity>
                </View>
                {!!offShelf.blurb && <Text style={[styles.playroomBlurb, prStyles.body]}>{offShelf.blurb}</Text>}
                <View style={styles.gridInner}>
                  {offShelf.books.slice(0, 6).map((book, i) => (
                    <BookCard key={book.bookId ?? i} book={book} style={styles.bookCard} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F2A48', fontWeight: '600' },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4' },
  headerTitle: { fontSize: 26, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 30 },
  irisButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#A9C0D4', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  irisAvatar: { width: 44, height: 44, borderRadius: 22 },
  irisNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteIcon: { fontSize: 14, marginTop: 1 },
  irisNoteText: { flex: 1, fontSize: 15, fontStyle: 'italic', color: '#6A5969', lineHeight: 22 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  countLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.1)' },
  countText: { fontSize: 11, fontWeight: '700', color: '#A9C0D4', letterSpacing: 0.8, textTransform: 'uppercase' },
  grid: { paddingHorizontal: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: 15, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: '#7a6e62' },
  sectionCount: { fontSize: 11, fontWeight: '700', color: '#A9C0D4' },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  bookCard: { width: '45%' },
  playroomHeading: { fontSize: 22, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', marginBottom: 12, paddingHorizontal: spacing.xs },
  playroomHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: spacing.xs },
  playroomBlurb: { fontSize: 14, fontStyle: 'italic', color: '#6A5969', lineHeight: 20, marginBottom: 12, paddingHorizontal: spacing.xs },
  viewAll: { fontSize: 12, fontWeight: '700', color: '#B83255' },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});