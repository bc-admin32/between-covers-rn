import { useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';
import { PRIMARY_SUBGENRES, TROPES } from '../../../../lib/tagTaxonomy';
import BookCardMeta from '../../../../components/cozy/BookCardMeta';
import { BookCardData } from '../../../../components/cozy/BookCard';

type DiscoverItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string | null;
  series?: string | null;
  seriesNumber?: number | null;
  spice?: number | null;
  spiceLevel?: string | null;
  tropes?: string[];
  primarySubgenre?: string | null;
  triggers?: string[];
};

type DiscoverSection = {
  type: string;
  label: string;
  items: DiscoverItem[];
};

type StatusType = 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FINISHED';

type Mode = 'search' | 'filter';
type TropeMode = 'any' | 'all';

// 0 = "No Spice" (clean romance: books store spice:0). Flows through the same
// filterSpices state + `spice=<CSV>` query as 1–5; only its chip renders differently.
const FILTER_SPICE_LEVELS = [0, 1, 2, 3, 4, 5];

type FilterResponse = {
  count: number;
  appliedFilters?: unknown;
  boundariesApplied: string[];
  books: BookCardData[];
};

export default function LibraryDiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('search');

  // --- Text search (untouched) ---
  const [searchQuery, setSearchQuery] = useState('');
  const [sections, setSections] = useState<DiscoverSection[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const latestQueryRef = useRef('');

  // --- Filter/browse mode (reuses the Cozy catalog filter picker + endpoint) ---
  const [filterSpices, setFilterSpices] = useState<number[]>([]);
  const [filterGenres, setFilterGenres] = useState<string[]>([]);
  const [filterTropes, setFilterTropes] = useState<string[]>([]);
  const [filterTropeMode, setFilterTropeMode] = useState<TropeMode>('any');
  const [filterBooks, setFilterBooks] = useState<BookCardData[]>([]);
  const [filterBoundaries, setFilterBoundaries] = useState<string[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);

  const [added, setAdded] = useState<Record<string, true>>({});
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSections([]);
      setHasSearched(false);
      setAdded({});
      return;
    }
    const timeout = setTimeout(() => runSearch(query), 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function runSearch(query: string) {
    latestQueryRef.current = query;
    setIsSearching(true);
    setHasSearched(true);
    setAdded({});
    try {
      const res = await apiGet<{ sections: DiscoverSection[] }>(`/library/discover?query=${encodeURIComponent(query)}`);
      if (latestQueryRef.current !== query) return;
      setSections(res.sections || []);
    } catch {
      if (latestQueryRef.current === query) setSections([]);
    } finally {
      if (latestQueryRef.current === query) setIsSearching(false);
    }
  }

  // Build the query string from active filters, matching the Cozy catalog
  // filter screen's shape (comma-joined enum keys / numbers).
  const filterQueryString = useMemo(() => {
    const parts: string[] = [];
    if (filterGenres.length) parts.push(`genre=${filterGenres.join(',')}`);
    if (filterSpices.length) parts.push(`spice=${[...filterSpices].sort((a, b) => a - b).join(',')}`);
    if (filterTropes.length) {
      parts.push(`tropes=${filterTropes.join(',')}`);
      parts.push(`tropeMode=${filterTropeMode}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }, [filterGenres, filterSpices, filterTropes, filterTropeMode]);

  useEffect(() => {
    if (mode !== 'filter') return;
    let cancelled = false;
    setIsFiltering(true);
    setAdded({});
    const timer = setTimeout(async () => {
      try {
        const res = await apiGet<FilterResponse>(`/catalog/filter${filterQueryString}`);
        if (cancelled) return;
        setFilterBooks(res?.books ?? []);
        setFilterBoundaries(res?.boundariesApplied ?? []);
      } catch {
        if (!cancelled) {
          setFilterBooks([]);
          setFilterBoundaries([]);
        }
      } finally {
        if (!cancelled) setIsFiltering(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, filterQueryString]);

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) => (value: T) => {
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };
  const toggleFilterSpice = toggle(setFilterSpices);
  const toggleFilterGenre = toggle(setFilterGenres);
  const toggleFilterTrope = toggle(setFilterTropes);

  const hasActiveFilters = filterSpices.length > 0 || filterGenres.length > 0 || filterTropes.length > 0;
  const clearFilters = () => {
    setFilterSpices([]);
    setFilterGenres([]);
    setFilterTropes([]);
    setFilterTropeMode('any');
  };

  // Normalize catalog-filter results (bookId/author) into the same item shape
  // the text-search results use (workId/primaryAuthor) so the existing grid +
  // add-to-library rendering below can serve both modes unchanged.
  const filterItems: DiscoverItem[] = filterBooks.map((b) => ({
    workId: b.bookId,
    title: b.title,
    primaryAuthor: b.author,
    coverUrl: b.coverUrl,
    spice: b.spice,
    spiceLevel: b.spiceLevel,
    tropes: b.tropes,
    primarySubgenre: b.primarySubgenre,
    triggers: b.triggers,
  }));

  const displaySections: DiscoverSection[] =
    mode === 'search' ? sections : filterItems.length > 0 ? [{ type: 'filtered', label: '', items: filterItems }] : [];
  const isLoading = mode === 'search' ? isSearching : isFiltering;

  async function addBook(book: DiscoverItem, status: StatusType) {
    if (added[book.workId]) return;
    try {
      await apiPost('/library', {
        workId: book.workId,
        title: book.title,
        primaryAuthor: book.primaryAuthor,
        coverUrl: book.coverUrl ?? null,
        series: book.series ?? null,
        seriesNumber: book.seriesNumber ?? null,
        status,
        source: 'discover',
      });
      setAdded((prev) => ({ ...prev, [book.workId]: true }));
      setActiveMenu(null);
    } catch {}
  }

  const allItems = displaySections.flatMap((s) => s.items);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <CaretLeft size={20} color="#0F2A48" weight="bold" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>Discover</Text>
          <Text style={styles.headerTitle}>Find Your Next Read</Text>
        </View>
        <TouchableOpacity
          style={styles.irisButton}
          onPress={() => router.push('/iris/chat?from=library/discover' as any)}
        >
          <Image
            source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png' }}
            style={styles.irisAvatar}
          />
        </TouchableOpacity>
      </View>

      {/* IRIS NOTE */}
      <View style={styles.irisNote}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={styles.irisNoteText}>
          Not sure what to read next? Tap my avatar and I'll help you find something you'll love.
        </Text>
      </View>

      {/* MODE SWITCH */}
      <View style={styles.modeSwitch}>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'search' && styles.modeTabActive]}
          onPress={() => setMode('search')}
          activeOpacity={0.85}
        >
          <Text style={[styles.modeTabText, mode === 'search' && styles.modeTabTextActive]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'filter' && styles.modeTabActive]}
          onPress={() => setMode('filter')}
          activeOpacity={0.85}
        >
          <Text style={[styles.modeTabText, mode === 'filter' && styles.modeTabTextActive]}>Browse Filters</Text>
        </TouchableOpacity>
      </View>

      {/* SEARCH */}
      {mode === 'search' && (
        <>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by title or author"
              placeholderTextColor="#9c8f7e"
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>
          <View style={styles.divider} />
        </>
      )}

      {/* RESULTS */}
      <ScrollView style={styles.results} showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultsContent}>

        {mode === 'filter' && (
          <View style={styles.filterPanel}>
            <View style={styles.filterPanelHeader}>
              <Text style={styles.filterLabel}>Spice Level</Text>
              {hasActiveFilters && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.clearFiltersText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.pepperRow}>
              {FILTER_SPICE_LEVELS.map((n) => {
                const active = filterSpices.includes(n);
                const isNone = n === 0;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.pepper, active && styles.pepperActive]}
                    onPress={() => toggleFilterSpice(n)}
                    activeOpacity={0.85}
                  >
                    {/* "No Spice" gets a teapot (clean/cozy), not a pepper — 0 peppers
                        would read as nothing selected. */}
                    <Text style={[styles.pepperEmoji, !active && styles.pepperEmojiMuted]}>
                      {isNone ? '🫖' : '🌶️'}
                    </Text>
                    {isNone ? (
                      <Text style={[styles.noneLabel, active && styles.pepperNumActive]} numberOfLines={1}>
                        No Spice
                      </Text>
                    ) : (
                      <Text style={[styles.pepperNum, active && styles.pepperNumActive]}>{n}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterLabel}>Genre</Text>
            <View style={styles.chipRow}>
              {PRIMARY_SUBGENRES.map((g) => {
                const active = filterGenres.includes(g.value);
                return (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.genrePill, active && styles.genrePillActive]}
                    onPress={() => toggleFilterGenre(g.value)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.genrePillText, active && styles.genrePillTextActive]}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.tropeHeader}>
              <Text style={styles.filterLabel}>Tropes</Text>
              <View style={styles.tropeModeToggle}>
                {(['any', 'all'] as TropeMode[]).map((m) => {
                  const active = filterTropeMode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.tropeModeSegment, active && styles.tropeModeSegmentActive]}
                      onPress={() => setFilterTropeMode(m)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.tropeModeText, active && styles.tropeModeTextActive]}>
                        Match {m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.chipRow}>
              {TROPES.map((t) => {
                const active = filterTropes.includes(t.key);
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tropePill, active && styles.tropePillActive]}
                    onPress={() => toggleFilterTrope(t.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.tropePillText, active && styles.tropePillTextActive]}>
                      {t.emoji} {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {filterBoundaries.length > 0 && (
              <Text style={styles.boundaryNote}>
                Some books are hidden by your comfort settings.
              </Text>
            )}

            <View style={styles.divider} />
          </View>
        )}

        {isLoading && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        )}

        {!isLoading && mode === 'search' && hasSearched && allItems.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No results found. Try a different title or author, or ask Iris for a recommendation ✦
            </Text>
          </View>
        )}

        {!isLoading && mode === 'search' && !hasSearched && (
          <View style={styles.emptyState}>
            <Text style={styles.placeholderText}>Search for a title, author, or series</Text>
          </View>
        )}

        {!isLoading && mode === 'filter' && allItems.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No matches. Try broadening your filters.</Text>
          </View>
        )}

        {!isLoading && displaySections.map((section) => (
          <View key={section.type} style={styles.section}>
            {section.label && (
              <Text style={styles.sectionLabel}>{section.label}</Text>
            )}
            <View style={styles.grid}>
              {section.items.map((book) => {
                const isAdded = !!added[book.workId];
                const isMenuOpen = activeMenu === book.workId;

                return (
                  <View key={book.workId} style={styles.gridItem}>
                    <TouchableOpacity
                      onPress={() => router.push(`/book?workId=${book.workId}` as any)}
                    >
                      <View style={styles.coverWrapper}>
                        {book.coverUrl ? (
                          <Image source={{ uri: book.coverUrl }} style={styles.coverImage} />
                        ) : (
                          <View style={[styles.coverImage, styles.noCover]}>
                            <Text style={styles.noCoverText}>No cover</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                      <Text style={styles.bookAuthor} numberOfLines={1}>{book.primaryAuthor}</Text>
                      <BookCardMeta spice={book.spice} tropes={book.tropes} />
                    </TouchableOpacity>

                    {isAdded ? (
                      <View style={styles.addedRow}>
                        <Text style={styles.addedText}>✓ Added</Text>
                      </View>
                    ) : (
                      <View>
                        <TouchableOpacity
                          style={styles.addButton}
                          onPress={() => setActiveMenu(isMenuOpen ? null : book.workId)}
                        >
                          <Text style={styles.addButtonText}>+ Add</Text>
                        </TouchableOpacity>
                        {isMenuOpen && (
                          <View style={styles.addMenu}>
                            {(['WANT_TO_READ', 'CURRENTLY_READING', 'FINISHED'] as StatusType[]).map((status) => (
                              <TouchableOpacity
                                key={status}
                                style={styles.addMenuItem}
                                onPress={() => addBook(book, status)}
                              >
                                <Text style={styles.addMenuItemText}>
                                  {status === 'WANT_TO_READ' ? 'Wishlist' : status === 'CURRENTLY_READING' ? 'Reading' : 'Finished'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F2A48', fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4' },
  headerTitle: { fontSize: 26, fontWeight: '600', color: '#0F2A48', fontStyle: 'italic' },
  irisButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#C4A882', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  irisAvatar: { width: 44, height: 44, borderRadius: 22 },
  irisNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteIcon: { fontSize: 14, marginTop: 1 },
  irisNoteText: { flex: 1, fontSize: 14, fontStyle: 'italic', color: '#6A5969', lineHeight: 21 },
  modeSwitch: { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: '#fff', borderRadius: 999, borderWidth: 1.5, borderColor: '#D7E2E9', padding: 3 },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  modeTabActive: { backgroundColor: '#0F2A48' },
  modeTabText: { fontSize: 12, fontWeight: '700', color: '#9c8f7e' },
  modeTabTextActive: { color: '#fff' },
  filterPanel: { marginBottom: spacing.sm },
  filterPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#7a6e62', marginBottom: 12 },
  clearFiltersText: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', letterSpacing: 0.2 },
  pepperRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  pepper: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#D7E2E9' },
  pepperActive: { backgroundColor: '#FDE8ED', borderColor: '#B83255' },
  pepperEmoji: { fontSize: 24 },
  pepperEmojiMuted: { opacity: 0.25 },
  pepperNum: { fontSize: 10, fontWeight: '700', color: '#A9C0D4', marginTop: 4 },
  pepperNumActive: { color: '#B83255' },
  noneLabel: { fontSize: 8, fontWeight: '700', color: '#A9C0D4', marginTop: 4, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  genrePill: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#D7E2E9' },
  genrePillActive: { backgroundColor: '#0F2A48', borderColor: '#0F2A48' },
  genrePillText: { fontSize: 12, fontWeight: '400', color: '#6A5969' },
  genrePillTextActive: { color: '#fff', fontWeight: '600' },
  tropeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tropePill: { backgroundColor: 'rgba(15,42,72,0.06)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  tropePillActive: { backgroundColor: '#0F2A48' },
  tropePillText: { fontSize: 10, fontWeight: '700', color: '#6A5969', textTransform: 'uppercase', letterSpacing: 0.5 },
  tropePillTextActive: { color: '#fff' },
  tropeModeToggle: { flexDirection: 'row', borderRadius: 20, borderWidth: 1, borderColor: '#D7E2E9', overflow: 'hidden', marginBottom: 12 },
  tropeModeSegment: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fff' },
  tropeModeSegmentActive: { backgroundColor: '#A9C0D4' },
  tropeModeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: '#9c8f7e' },
  tropeModeTextActive: { color: '#0F2A48' },
  boundaryNote: { fontSize: 12, fontStyle: 'italic', color: '#9c8f7e', textAlign: 'center', marginBottom: spacing.md, lineHeight: 18 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: '#fff', borderRadius: 999, borderWidth: 1.5, borderColor: '#D7E2E9', paddingHorizontal: spacing.md },
  searchIcon: { fontSize: 14, marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: '#0F2A48' },
  divider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginHorizontal: spacing.lg, marginBottom: spacing.md },
  results: { flex: 1 },
  resultsContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  emptyState: { paddingTop: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#6A5969', fontWeight: '300', lineHeight: 22, textAlign: 'center' },
  placeholderText: { fontSize: 18, fontStyle: 'italic', color: '#9c8f7e', textAlign: 'center' },
  section: { marginBottom: spacing.xl },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '30%' },
  coverWrapper: { width: '100%', aspectRatio: 2 / 3, borderRadius: 6, overflow: 'hidden', backgroundColor: '#D7E2E9', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3, marginBottom: 4 },
  coverImage: { width: '100%', height: '100%' },
  noCover: { alignItems: 'center', justifyContent: 'center' },
  noCoverText: { fontSize: 9, color: '#A9C0D4' },
  bookTitle: { fontSize: 9, fontWeight: '700', color: '#0F2A48', lineHeight: 13, marginBottom: 2 },
  bookAuthor: { fontSize: 8, fontWeight: '300', color: '#9c8f7e', marginBottom: 4 },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3 },
  addedText: { fontSize: 9, fontWeight: '700', color: '#B83255' },
  addButton: { width: '100%', paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(15,42,72,0.07)', alignItems: 'center' },
  addButtonText: { fontSize: 9, fontWeight: '700', color: '#0F2A48', letterSpacing: 0.4 },
  addMenu: { position: 'absolute', bottom: '100%', left: 0, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D7E2E9', borderRadius: radius.md, overflow: 'hidden', zIndex: 40, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
  addMenuItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ede4' },
  addMenuItemText: { fontSize: 11, fontWeight: '600', color: '#0F2A48' },
});