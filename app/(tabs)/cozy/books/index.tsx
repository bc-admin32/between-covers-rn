import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

type BookItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string;
};

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
            <Text style={styles.headerTitle}>Iris's Picks</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.irisButton}
          onPress={() => router.push('/iris/chat?from=cozy/books' as any)}
        >
          <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
        </TouchableOpacity>
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
          <View style={styles.gridInner}>
            {books.map((book, i) => (
              <TouchableOpacity
                key={book.workId ?? i}
                style={styles.bookCard}
                onPress={() => router.push(`/(tabs)/library/details?workId=${book.workId}` as any)}
              >
                <View style={styles.bookCover}>
                  <Image source={{ uri: book.coverUrl }} style={styles.bookCoverImage} />
                </View>
                <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                <Text style={styles.bookAuthor} numberOfLines={1}>by {book.primaryAuthor}</Text>
                <View style={styles.detailsButton}>
                  <Text style={styles.detailsButtonText}>Details</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F2A48', fontWeight: '600' },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4' },
  headerTitle: { fontSize: 26, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 30 },
  irisButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  irisAvatar: { width: 44, height: 44, borderRadius: 22 },
  irisNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteIcon: { fontSize: 14, marginTop: 1 },
  irisNoteText: { flex: 1, fontSize: 15, fontStyle: 'italic', color: '#6A5969', lineHeight: 22 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  countLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.1)' },
  countText: { fontSize: 11, fontWeight: '700', color: '#A9C0D4', letterSpacing: 0.8, textTransform: 'uppercase' },
  grid: { paddingHorizontal: spacing.md },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  bookCard: { width: '45%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#D7E2E9', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  bookCover: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#D7E2E9', overflow: 'hidden' },
  bookCoverImage: { width: '100%', height: '100%' },
  bookTitle: { paddingHorizontal: 12, paddingTop: 10, fontSize: 15, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 20 },
  bookAuthor: { paddingHorizontal: 12, paddingTop: 3, fontSize: 11, fontWeight: '400', color: '#A9C0D4' },
  detailsButton: { margin: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#0F2A48', alignItems: 'center' },
  detailsButtonText: { fontSize: 11, fontWeight: '700', color: '#0F2A48', letterSpacing: 0.6, textTransform: 'uppercase' },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});