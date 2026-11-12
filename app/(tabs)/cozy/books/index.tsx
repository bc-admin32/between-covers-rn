import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft, Funnel } from '../../../../components/icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, hasSession } from '../../../../lib/api';
import { cozyMonthKey, setMonthThemes } from '../../../../lib/cozyLayout';
import { CHAMPAGNE } from '../../../../components/playroom/playroomStyle';
import { PR, prStyles, usePlayroom } from '../../../../lib/playroomPage';
import { useLightStatusBarWhileFocused } from '../../../../lib/statusBarTone';
import RoomHeader, { PlayRoomStatusStrip, ROOM_INTROS, roomHeaderButton } from '../../../../components/playroom/RoomHeader';
import { tileLabel } from '../../../../components/playroom/tiles';
import { spacing, radius, colors } from '../../../../lib/theme';
import { groupBooksBySubgenre, TRIGGERS } from '../../../../lib/tagTaxonomy';
import BookCard, { BookCardData, type BookCardBadge } from '../../../../components/cozy/BookCard';
import type { LibraryStatus } from '../../../../lib/libraryStatus';
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
  // Per-user fields (sections.BOOKS and sections.spotlight.books). Read
  // defensively: absent until the backend ships them, and then no badges.
  matchesTropes?: boolean;
  boundaryHits?: string[];
};

// Badges under the cover, in this order: library status (from GET /library),
// "Matches your tropes", comfort-boundary flag. Only FINISHED and DNF get a
// library badge; Wishlist and Currently Reading don't.
function bookBadges(book: BookItem, libraryStatus: LibraryStatus | undefined): BookCardBadge[] {
  const badges: BookCardBadge[] = [];
  if (libraryStatus === 'FINISHED') badges.push({ label: 'In your library', tone: 'library' });
  else if (libraryStatus === 'DNF') badges.push({ label: 'DNF', tone: 'library', accessibilityLabel: 'Did not finish' });
  if (book.matchesTropes === true) badges.push({ label: 'Matches your tropes', tone: 'match' });
  const hits = Array.isArray(book.boundaryHits)
    ? book.boundaryHits.filter((h): h is string => typeof h === 'string' && h.length > 0)
    : [];
  if (hits.length > 0) {
    const names = hits.map((h) => TRIGGERS.find((t) => t.key === h)?.label ?? h).join(', ');
    badges.push({ label: '⚠️ Comfort boundary', tone: 'boundary', accessibilityLabel: `Hits your comfort boundaries: ${names}` });
  }
  return badges;
}

// spotlight.books (up to 3), else the single spotlight.book.
function readSpotlight(spotlight: any): BookItem[] {
  const list: unknown[] = Array.isArray(spotlight?.books)
    ? spotlight.books
    : spotlight?.book ? [spotlight.book] : [];
  return list
    .filter((b): b is BookItem => !!b && typeof (b as BookItem).workId === 'string')
    .slice(0, 3);
}

// Books are grouped under genre headers on this screen, so primarySubgenre is
// intentionally omitted from the card — the per-card genre line would be
// redundant. Peppers, trope pills, and CW badges stay.
function toCard(book: BookItem, withBadges = false, libraryStatus?: LibraryStatus): BookCardData {
  return {
    bookId: book.workId,
    title: book.title,
    author: book.primaryAuthor,
    coverUrl: book.coverUrl,
    spice: book.spice,
    spiceLevel: book.spiceLevel,
    tropes: book.tropes,
    triggers: book.triggers,
    badges: withBadges ? bookBadges(book, libraryStatus) : undefined,
  };
}

export default function CozyBooksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<BookItem[]>([]);
  const [bookOfMonth, setBookOfMonth] = useState<BookOfMonth | null>(null);
  const [loading, setLoading] = useState(true);
  // PlayRoom months make this Between the Sheets: after the shelf come the
  // reader's personal pick ("I Saw This Book and Thought of You") and Keep Me
  // Guessing (Off The Shelf, this month only). month=previous → last month.
  const playroom = usePlayroom();
  // PlayRoom: light status-bar icons over the plum strip and header. Classic
  // keeps the app's dark icons on the light page.
  useLightStatusBarWhileFocused(playroom);
  const isBetweenTheSheets = playroom;
  const params = useLocalSearchParams<{ month?: string }>();
  const monthKey = cozyMonthKey(params.month);
  const iconColor = playroom ? PR.heading : '#0F2A48';
  const [spotlight, setSpotlight] = useState<BookItem[]>([]);
  // workId → the member's library status, for the card badges. Empty for
  // guests or if /library fails (then no library badges).
  const [libraryStatus, setLibraryStatus] = useState<Record<string, LibraryStatus>>({});
  const [offShelf, setOffShelf] = useState<{ blurb?: string; books: BookCardData[] } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet('/cozy/home?view=full');
        setMonthThemes(response);
        const month = response?.[monthKey];
        const data: BookItem[] =
          month?.sections?.BOOKS ??
          month?.sections?.books ?? [];
        setBooks(data);
        setBookOfMonth(
          month?.sections?.bookOfMonth ??
          data.find((b) => b.isBookOfMonth) ?? null
        );
        if (isBetweenTheSheets) setSpotlight(readSpotlight(month?.sections?.spotlight));
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

  useEffect(() => {
    if (!isBetweenTheSheets) return;
    let cancelled = false;
    hasSession()
      .then((signedIn) => (signedIn ? apiGet<{ items?: { workId?: string; status?: LibraryStatus }[] }>('/library') : null))
      .then((res) => {
        if (cancelled || !res) return;
        const map: Record<string, LibraryStatus> = {};
        for (const item of res.items ?? []) {
          if (item?.workId && item.status) map[item.workId] = item.status;
        }
        setLibraryStatus(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isBetweenTheSheets]);

  const hasExtras = isBetweenTheSheets && (spotlight.length > 0 || !!offShelf);

  // Group by primarySubgenre, ordered by the shared taxonomy so this screen's
  // genre order matches New Releases. Untagged books fall into "Other", last.
  // The Book of the Month is featured above the groups, so it's left out of them.
  // PlayRoom months: BOOKS arrive sorted per member (best match first,
  // hard passes last), so the genre headings follow the first appearance of
  // each genre in that order; the API order is kept inside each heading.
  // Classic months keep the taxonomy order.
  const sections = useMemo(() => {
    const list = bookOfMonth ? books.filter((b) => b.workId !== bookOfMonth.workId) : books;
    const grouped = groupBooksBySubgenre(list);
    if (!isBetweenTheSheets) return grouped;
    return [...grouped].sort((a, b) => list.indexOf(a.books[0]) - list.indexOf(b.books[0]));
  }, [books, bookOfMonth, isBetweenTheSheets]);

  const countRow = (
    <View style={styles.countRow}>
      <View style={styles.countLine} />
      {!loading && books.length > 0 && (
        <Text style={[styles.countText, playroom && prStyles.eyebrow]}>
          {books.length} {books.length === 1 ? 'Book' : 'Books'}
        </Text>
      )}
      <View style={styles.countLine} />
    </View>
  );

  return (
    <View style={[styles.container, playroom && prStyles.page, { paddingTop: playroom ? 0 : insets.top }]}>
      {/* PlayRoom: plum behind the status bar, pinned while the header scrolls away. */}
      {playroom && <PlayRoomStatusStrip height={insets.top} />}
      {/* Classic header and Iris note (the PlayRoom header's intro replaces the note). */}
      {!playroom && (
      <>
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
      <View style={[styles.irisNote, playroom && prStyles.card]}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={[styles.irisNoteText, playroom && prStyles.body]}>
          Handpicked for this month's theme — find your next obsession.
        </Text>
      </View>

      </>
      )}

      {/* COUNT */}
      {!playroom && countRow}

      {/* GRID */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
      >
        {playroom && (
          <>
            <RoomHeader
              name={tileLabel('betweenTheSheets')}
              intro={ROOM_INTROS.betweenTheSheets}
              monthKey={monthKey}
              irisFrom="cozy/books"
              style={{ marginHorizontal: -spacing.md }}
              right={
                <TouchableOpacity style={roomHeaderButton} onPress={() => router.push('/(tabs)/cozy/catalog' as any)} accessibilityLabel="Filter the catalog">
                  <Funnel size={20} color={CHAMPAGNE} weight="bold" />
                </TouchableOpacity>
              }
            />
            <View style={{ marginHorizontal: -spacing.md }}>{countRow}</View>
          </>
        )}
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
            {/* PlayRoom: the personal pick comes right after the Book of the Month. */}
            {isBetweenTheSheets && spotlight.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.playroomHeading, prStyles.heading]}>I Saw This Book and Thought of You</Text>
                <View style={styles.gridInner}>
                  {spotlight.map((book) => (
                    <BookCard key={book.workId} book={toCard(book, true, libraryStatus[book.workId])} style={styles.bookCard} />
                  ))}
                </View>
              </View>
            )}
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
                      book={toCard(book, isBetweenTheSheets, libraryStatus[book.workId])}
                      style={styles.bookCard}
                    />
                  ))}
                </View>
              </View>
            ))}

            {/* BETWEEN THE SHEETS: Keep Me Guessing after the shelf */}
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
  // Two 48% cards pushed to the edges, so left and right margins match.
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  bookCard: { width: '48%' },
  playroomHeading: { fontSize: 22, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', marginBottom: 12, paddingHorizontal: spacing.xs },
  playroomHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: spacing.xs },
  playroomBlurb: { fontSize: 14, fontStyle: 'italic', color: '#6A5969', lineHeight: 20, marginBottom: 12, paddingHorizontal: spacing.xs },
  viewAll: { fontSize: 12, fontWeight: '700', color: '#B83255' },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});