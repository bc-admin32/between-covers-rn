import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { spacing, colors } from '../../../../lib/theme';
import BookCard, { BookCardData } from '../../../../components/cozy/BookCard';

type OffShelfData = {
  enabled: boolean;
  blurb: string;
  books: BookCardData[];
};

export default function OffShelfScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<OffShelfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet<OffShelfData>('/cozy/off-shelf');
        setData(response ?? null);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const books = data?.enabled ? (data.books ?? []) : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <CaretLeft size={20} color="#0F2A48" weight="bold" />
        </TouchableOpacity>
        <Text style={styles.masthead}>Between Covers</Text>
      </View>

      {/* TITLE BLOCK */}
      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>OFF SHELF</Text>
        {!!data?.blurb && <Text style={styles.blurb}>{data.blurb}</Text>}
      </View>

      {/* GRID */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : books.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>Check back soon.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {books.map((book, i) => (
              <BookCard key={book?.bookId ?? i} book={book} />
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  masthead: { fontSize: 24, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48' },
  titleBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: '#B11E45', marginBottom: 4 },
  blurb: { fontSize: 14, fontWeight: '300', fontStyle: 'italic', color: '#8a7c6e', marginTop: 2, lineHeight: 20 },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});
