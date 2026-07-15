import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft, Funnel } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';
import { PRIMARY_SUBGENRES, prettifyEnum } from '../../../../lib/tagTaxonomy';
import BookCard, { BookCardData } from '../../../../components/cozy/BookCard';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet('/cozy/home?view=full');
        const data =
          response?.active?.sections?.BOOKS ??
          response?.active?.sections?.books ?? [];
        setBooks(data);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Group by primarySubgenre, ordered by the shared taxonomy so this screen's
  // genre order matches New Releases. Untagged books fall into "Other", last.
  const sections = useMemo(() => {
    const groups = new Map<string, BookItem[]>();
    for (const book of books) {
      const key = book.primarySubgenre || 'OTHER';
      const arr = groups.get(key);
      if (arr) arr.push(book);
      else groups.set(key, [book]);
    }

    const ordered: { key: string; label: string; books: BookItem[] }[] = [];
    for (const g of PRIMARY_SUBGENRES) {
      const arr = groups.get(g.value);
      if (arr?.length) {
        ordered.push({ key: g.value, label: prettifyEnum(g.value), books: arr });
        groups.delete(g.value);
      }
    }
    // Any unexpected non-empty subgenre keys, alphabetized, before Other.
    for (const key of [...groups.keys()].filter((k) => k !== 'OTHER').sort()) {
      ordered.push({ key, label: prettifyEnum(key), books: groups.get(key)! });
    }
    const other = groups.get('OTHER');
    if (other?.length) ordered.push({ key: 'OTHER', label: 'Other', books: other });

    return ordered;
  }, [books]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <CaretLeft size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerLabel}>This Month's Bookshelf</Text>
            <Text style={styles.headerTitle}>On Iris's Shelf</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => router.push('/(tabs)/cozy/catalog' as any)}
            accessibilityLabel="Filter the catalog"
          >
            <Funnel size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.irisButton}
            onPress={() => router.push('/iris/chat?from=cozy/books' as any)}
          >
            <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
          </TouchableOpacity>
        </View>
      </View>

      {/* IRIS NOTE */}
      <View style={styles.irisNote}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={styles.irisNoteText}>
          Handpicked for this month's theme — find your next obsession.
        </Text>
      </View>

      {/* COUNT */}
      <View style={styles.countRow}>
        <View style={styles.countLine} />
        {!loading && books.length > 0 && (
          <Text style={styles.countText}>
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
        ) : books.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={styles.emptyTitle}>Coming soon</Text>
            <Text style={styles.emptyText}>
              Iris is still curating this month's picks. Check back soon.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                <Text style={styles.sectionCount}>{section.books.length}</Text>
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
          ))
        )}
        <View style={{ height: 100 }} />
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
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});