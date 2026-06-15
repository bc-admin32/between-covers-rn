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

type NewReleasesData = {
  month: string;
  monthLabel: string;
  currentMonth: string;
  previousMonth: string | null;
  hasPrevious: boolean;
  isCurrent: boolean;
  sections: { genre: string; books: BookCardData[] }[];
};

export default function NewReleasesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<NewReleasesData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (month?: string) => {
    setLoading(true);
    try {
      const response = await apiGet<NewReleasesData>(
        '/cozy/new-releases' + (month ? `?month=${month}` : '')
      );
      setData(response ?? null);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sections = data?.sections ?? [];

  // Pill state is driven entirely by the backend flags.
  const showPill = data ? (data.hasPrevious || !data.isCurrent) : false;
  const handlePill = () => {
    if (!data) return;
    if (data.isCurrent) {
      if (data.previousMonth) load(data.previousMonth);
    } else {
      load(); // return to current
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* MASTHEAD */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <CaretLeft size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
          <Text style={styles.masthead}>Between Covers</Text>
        </View>
        {showPill && (
          <TouchableOpacity style={styles.pill} onPress={handlePill}>
            <Text style={styles.pillText}>
              {data?.isCurrent ? '← Last Month' : 'Current →'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* TITLE BLOCK */}
      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>NEW RELEASES</Text>
        {!!data?.monthLabel && <Text style={styles.monthLabel}>{data.monthLabel}</Text>}
        <Text style={styles.subtitle}>Fresh arrivals, sorted by genre</Text>
      </View>

      {/* BODY */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : sections.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={styles.emptyTitle}>Nothing new yet</Text>
            <Text style={styles.emptyText}>
              No new releases for this month. Check back soon.
            </Text>
          </View>
        ) : (
          sections.map((section, i) => (
            <View key={`${section.genre}-${i}`} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.genre}</Text>
                <Text style={styles.sectionCount}>{section.books.length}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
                {section.books.map((book, j) => (
                  <BookCard key={book?.bookId ?? j} book={book} />
                ))}
              </ScrollView>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  masthead: { fontSize: 24, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48' },
  pill: { borderWidth: 1, borderColor: '#ddd4c8', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', letterSpacing: 0.2 },
  titleBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: '#B11E45', marginBottom: 4 },
  monthLabel: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: '#2a1f18', lineHeight: 38 },
  subtitle: { fontSize: 14, fontWeight: '300', fontStyle: 'italic', color: '#8a7c6e', marginTop: 4 },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: 15, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: '#7a6e62' },
  sectionCount: { fontSize: 11, fontWeight: '700', color: '#A9C0D4' },
  scrollRow: { gap: 14, paddingBottom: 4, paddingHorizontal: spacing.xs },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});
