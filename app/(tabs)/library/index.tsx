import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Image, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { apiGet, hasSession } from '../../../lib/api';
import { getGuestBooks, type GuestBook } from '../../../lib/guest';
import { useGuest } from '../../../lib/useGuest';
import { spacing, radius, colors } from '../../../lib/theme';
import { parseLocalDate } from '../../../lib/dateUtils';
import { groupBooksBySubgenre } from '../../../lib/tagTaxonomy';
import type { LibraryStatus } from '../../../lib/libraryStatus';
import BookCardMeta from '../../../components/cozy/BookCardMeta';

type LibraryItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string;
  status: LibraryStatus;
  currentPage?: number;
  totalPages?: number;
  finishedAt?: string;
  spice?: number | null;
  spiceLevel?: string | null;
  tropes?: string[];
  primarySubgenre?: string | null;
  triggers?: string[];
};

type LibrarySnapshot = {
  reading: number;
  wishlist: number;
  finished: number;
  // Optional until librarySnapshot returns it; the pill shows 0 meanwhile.
  dnf?: number;
};

type LibrarySnapshotResponse = {
  displayName: string;
  snapshot: LibrarySnapshot;
};

// Guest library: books saved on-device (lib/guest), filtered and sorted
// locally since guests can't call /library or /library/snapshot.
function guestSnapshot(books: GuestBook[]): LibrarySnapshot {
  return {
    reading: books.filter((b) => b.status === 'CURRENTLY_READING').length,
    wishlist: books.filter((b) => b.status === 'WANT_TO_READ').length,
    finished: books.filter((b) => b.status === 'FINISHED').length,
    dnf: books.filter((b) => b.status === 'DNF').length,
  };
}

function guestItems(books: GuestBook[], status: LibraryItem['status'] | null, asc: boolean): LibraryItem[] {
  return books
    .filter((b) => !status || b.status === status)
    .sort((a, b) => (asc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)))
    .map((b) => ({
      workId: b.workId,
      title: b.title,
      primaryAuthor: b.primaryAuthor,
      coverUrl: b.coverUrl ?? '',
      status: b.status,
      spice: b.spice,
      spiceLevel: b.spiceLevel,
      tropes: b.tropes,
      primarySubgenre: b.primarySubgenre,
      triggers: b.triggers,
    }));
}

// The query for the current filter and sort. Used for both the reload when
// the screen comes back into view and the reload when the filter or sort changes.
function libraryQuery(status: LibraryItem['status'] | null, asc: boolean): string {
  const p = new URLSearchParams({ sort: 'title', order: asc ? 'asc' : 'desc' });
  if (status) p.set('status', status);
  return p.toString();
}

// Grid: three equal columns that fill the row, with room between rows so a
// book's details never run into the next row.
const COL_GAP = 12;
const ROW_GAP = 20;

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LibraryItem['status'] | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [gridView, setGridView] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [guestView, setGuestView] = useState(false);
  const guestBooksRef = useRef<GuestBook[]>([]);
  const { requireAccount } = useGuest();
  const { width } = useWindowDimensions();
  const cellWidth = Math.floor((width - spacing.md * 2 - COL_GAP * 2) / 3);
  // The reload on focus reads these, so coming back to the Library keeps the
  // filter and sort that are showing (it used to reload everything A–Z while
  // the old pill stayed selected).
  const statusRef = useRef(statusFilter);
  statusRef.current = statusFilter;
  const sortRef = useRef(sortAsc);
  sortRef.current = sortAsc;

  useFocusEffect(useCallback(() => {
    async function load() {
      try {
        if (!(await hasSession())) {
          const books = await getGuestBooks();
          guestBooksRef.current = books;
          setGuestView(true);
          setSnapshot(guestSnapshot(books));
          setUserName(null);
          setItems(guestItems(books, statusRef.current, sortRef.current));
          return;
        }
        setGuestView(false);
        const [snapshotRes, libraryRes] = await Promise.all([
          apiGet<LibrarySnapshotResponse>('/library/snapshot'),
          apiGet<{ items: LibraryItem[] }>(`/library?${libraryQuery(statusRef.current, sortRef.current)}`),
        ]);
        setSnapshot(snapshotRes.snapshot);
        setUserName(snapshotRes.displayName || null);
        setItems(libraryRes.items || []);
      } catch {
        setItems([]);
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, []));

  useEffect(() => {
    if (!loaded) return;
    if (guestView) {
      setItems(guestItems(guestBooksRef.current, statusFilter, sortAsc));
      return;
    }
    async function reload() {
      try {
        const res = await apiGet<{ items: LibraryItem[] }>(`/library?${libraryQuery(statusFilter, sortAsc)}`);
        setItems(res.items || []);
      } catch {
        setItems([]);
      }
    }
    reload();
  }, [statusFilter, sortAsc]);

  // Group the status-filtered items into genre sections, same taxonomy order as
  // CozyBooksScreen. `items` already arrives sorted by title (A–Z / Z–A) from the
  // API, and grouping preserves that order, so the sort applies within each
  // section. Untagged books land in "Other", last.
  const sections = useMemo(() => groupBooksBySubgenre(items), [items]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={styles.header}>
          {loaded && (
            // Long names wrap to two lines, then shrink a little, never clipped.
            <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
              {userName ? `${userName}'s Library` : 'My Library'}
            </Text>
          )}
          <Text style={styles.subtitle}>Your personal collection</Text>
        </View>

        {guestView && (
          <TouchableOpacity style={styles.guestBanner} onPress={() => requireAccount('library')}>
            <Text style={styles.guestBannerText}>
              Saved on this device only. Create a free account to keep your library.
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#B83255" />
          </TouchableOpacity>
        )}

        <View style={styles.divider} />

        {/* FILTER PILLS */}
        {snapshot && (
          // One row that scrolls sideways; it doesn't block the page's vertical scroll.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterPill
              label="All Books"
              count={snapshot.reading + snapshot.wishlist + snapshot.finished + (snapshot.dnf ?? 0)}
              active={statusFilter === null}
              onPress={() => setStatusFilter(null)}
            />
            <FilterPill
              label="Reading"
              count={snapshot.reading}
              active={statusFilter === 'CURRENTLY_READING'}
              onPress={() => setStatusFilter(statusFilter === 'CURRENTLY_READING' ? null : 'CURRENTLY_READING')}
            />
            <FilterPill
              label="Wishlist"
              count={snapshot.wishlist}
              active={statusFilter === 'WANT_TO_READ'}
              onPress={() => setStatusFilter(statusFilter === 'WANT_TO_READ' ? null : 'WANT_TO_READ')}
            />
            <FilterPill
              label="Finished"
              count={snapshot.finished}
              active={statusFilter === 'FINISHED'}
              onPress={() => setStatusFilter(statusFilter === 'FINISHED' ? null : 'FINISHED')}
            />
            <FilterPill
              label="DNF"
              count={snapshot.dnf ?? 0}
              active={statusFilter === 'DNF'}
              onPress={() => setStatusFilter(statusFilter === 'DNF' ? null : 'DNF')}
            />
          </ScrollView>
        )}

        {/* ACTION ROW */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.sortButton} onPress={() => setSortAsc(!sortAsc)}>
            <Ionicons name="swap-vertical" size={18} color="#0F2A48" />
            <Text style={styles.sortText}>{sortAsc ? 'A–Z' : 'Z–A'}</Text>
          </TouchableOpacity>

          <View style={styles.viewButtons}>
            <TouchableOpacity
              style={[styles.viewButton, gridView && styles.viewButtonActive]}
              onPress={() => setGridView(true)}
            >
              <Ionicons name="grid" size={18} color={gridView ? '#B83255' : '#0F2A48'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewButton, !gridView && styles.viewButtonActive]}
              onPress={() => setGridView(false)}
            >
              <Ionicons name="list" size={18} color={!gridView ? '#B83255' : '#0F2A48'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/(tabs)/library/discover' as any)}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTENT */}
        <View style={styles.content}>
          {!loaded && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )}

          {loaded && items.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={36} color="#A9C0D4" />
              <Text style={styles.emptyText}>
                {statusFilter ? 'No books in this category yet.' : 'Your library is empty.'}
              </Text>
              <TouchableOpacity
                style={styles.discoverButton}
                onPress={() => router.push('/(tabs)/library/discover' as any)}
              >
                <Text style={styles.discoverButtonText}>Discover Books</Text>
              </TouchableOpacity>
            </View>
          )}

          {loaded && items.length > 0 && gridView && sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                <Text style={styles.sectionCount}>{section.books.length}</Text>
              </View>
              <View style={styles.grid}>
                {section.books.map((item) => (
                  <TouchableOpacity
                    key={item.workId}
                    style={{ width: cellWidth }}
                    onPress={() => router.push(`/book?workId=${item.workId}` as any)}
                  >
                    <View style={styles.coverWrapper}>
                      {item.coverUrl ? (
                        <Image source={{ uri: item.coverUrl }} style={styles.coverImage} />
                      ) : (
                        <View style={[styles.coverImage, styles.noCover]}>
                          <Ionicons name="book" size={24} color="#A9C0D4" />
                        </View>
                      )}
                      {/* Status on the cover's corner, so it never overlaps the title or details. */}
                      {item.status === 'DNF' && <Text style={styles.coverBadge}>DNF</Text>}
                    </View>
                    <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.bookAuthor} numberOfLines={2}>{item.primaryAuthor}</Text>
                    {/* Tighter 3-col card: peppers, the first trope, and "+N" for the rest. */}
                    <BookCardMeta spice={item.spice} tropes={item.tropes} maxTropes={1} showMoreCount />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {loaded && items.length > 0 && !gridView && sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                <Text style={styles.sectionCount}>{section.books.length}</Text>
              </View>
              <View style={styles.list}>
                {section.books.map((item, i) => (
                  <TouchableOpacity
                    key={item.workId}
                    style={[
                      styles.listItem,
                      i === 0 && styles.listItemFirst,
                      i === section.books.length - 1 && styles.listItemLast,
                    ]}
                    onPress={() => router.push(`/book?workId=${item.workId}` as any)}
                  >
                    <View style={styles.listCover}>
                      {item.coverUrl ? (
                        <Image source={{ uri: item.coverUrl }} style={styles.listCoverImage} />
                      ) : (
                        <View style={[styles.listCoverImage, styles.noCover]}>
                          <Ionicons name="book" size={16} color="#A9C0D4" />
                        </View>
                      )}
                    </View>
                    <View style={styles.listInfo}>
                      <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.listAuthor} numberOfLines={1}>{item.primaryAuthor}</Text>
                      <BookCardMeta spice={item.spice} tropes={item.tropes} maxTropes={2} />
                    </View>
                    {item.status === 'DNF' && <Text style={styles.listMeta}>DNF</Text>}
                    {item.status === 'CURRENTLY_READING' && item.currentPage && (
                      <Text style={styles.listMeta}>p. {item.currentPage}</Text>
                    )}
                    {item.status === 'FINISHED' && item.finishedAt && (
                      <Text style={styles.listMeta}>
                        {(/^\d{4}-\d{2}-\d{2}$/.test(item.finishedAt)
                          ? parseLocalDate(item.finishedAt)
                          : new Date(item.finishedAt)
                        ).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function FilterPill({ label, count, active, onPress }: {
  label: string; count: number; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterPill, active && styles.filterPillActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
        {label} ({count})
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FBEFF2',
  },
  guestBannerText: {
    flex: 1,
    color: '#0F2A48',
    fontSize: 13,
    lineHeight: 18,
  },
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  header: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs, paddingHorizontal: spacing.lg },
  // lineHeight keeps Dancing Script's tall letters from clipping.
  title: { fontSize: 34, lineHeight: 42, color: '#B83255', fontFamily: 'DancingScript_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 11, color: '#6A5969', letterSpacing: 1.5, textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.xs },
  filterRow: { gap: 8, paddingVertical: spacing.xs, paddingHorizontal: spacing.lg },
  // The border gives the pill a 3:1 edge on the cream page.
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#D7E2E9', borderWidth: 1, borderColor: '#8E8478' },
  filterPillActive: { backgroundColor: '#0F2A48', borderColor: '#0F2A48' },
  filterPillText: { fontSize: 12, fontWeight: '700', color: '#0F2A48' },
  filterPillTextActive: { color: '#fff' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortText: { fontSize: 11, fontWeight: '700', color: '#0F2A48', textTransform: 'uppercase', letterSpacing: 0.5 },
  viewButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewButton: { padding: 6, borderRadius: radius.sm },
  viewButtonActive: { backgroundColor: 'rgba(184,50,85,0.1)' },
  addButton: { padding: 6, borderRadius: radius.sm, backgroundColor: '#0F2A48', marginLeft: 4 },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  emptyState: { alignItems: 'center', marginTop: 80, gap: spacing.md },
  emptyText: { fontSize: 14, color: '#6A5969', fontWeight: '300' },
  discoverButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: '#0F2A48' },
  discoverButtonText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  // Genre section header — mirrors CozyBooksScreen ("On Iris's Shelf").
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: 15, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: '#7a6e62' },
  sectionCount: { fontSize: 11, fontWeight: '700', color: '#A9C0D4' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: COL_GAP, rowGap: ROW_GAP },
  coverWrapper: { width: '100%', aspectRatio: 2 / 3, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#D7E2E9', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3, marginBottom: 6 },
  coverImage: { width: '100%', height: '100%' },
  noCover: { alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontSize: 11, fontWeight: '700', color: '#0F2A48', lineHeight: 14 },
  bookAuthor: { fontSize: 10, fontWeight: '400', color: '#6E6255', lineHeight: 13, marginTop: 2 },
  coverBadge: { position: 'absolute', top: 4, right: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(15,42,72,0.85)', color: '#FFFFFF', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  list: { gap: 1 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#fff', paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 4 },
  listItemFirst: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  listItemLast: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  listCover: { width: 40, height: 56, borderRadius: 6, overflow: 'hidden', flexShrink: 0, backgroundColor: '#D7E2E9' },
  listCoverImage: { width: 40, height: 56 },
  listInfo: { flex: 1 },
  listTitle: { fontSize: 13, fontWeight: '600', color: '#0F2A48', lineHeight: 18 },
  listAuthor: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', marginTop: 2 },
  listMeta: { fontSize: 10, fontWeight: '700', color: '#B83255', flexShrink: 0 },
});