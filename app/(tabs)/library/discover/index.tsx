import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

type DiscoverItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string | null;
  series?: string | null;
  seriesNumber?: number | null;
};

type DiscoverSection = {
  type: string;
  label: string;
  items: DiscoverItem[];
};

type StatusType = 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FINISHED';

export default function LibraryDiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [sections, setSections] = useState<DiscoverSection[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [added, setAdded] = useState<Record<string, true>>({});
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const latestQueryRef = useRef('');

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

  const allItems = sections.flatMap((s) => s.items);

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

      {/* SEARCH */}
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

      {/* RESULTS */}
      <ScrollView style={styles.results} showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultsContent}>

        {isSearching && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        )}

        {!isSearching && hasSearched && allItems.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No results found. Try a different title or author, or ask Iris for a recommendation ✦
            </Text>
          </View>
        )}

        {!isSearching && !hasSearched && (
          <View style={styles.emptyState}>
            <Text style={styles.placeholderText}>Search for a title, author, or series</Text>
          </View>
        )}

        {!isSearching && sections.map((section) => (
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
  irisButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  irisAvatar: { width: 44, height: 44, borderRadius: 22 },
  irisNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteIcon: { fontSize: 14, marginTop: 1 },
  irisNoteText: { flex: 1, fontSize: 14, fontStyle: 'italic', color: '#6A5969', lineHeight: 21 },
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