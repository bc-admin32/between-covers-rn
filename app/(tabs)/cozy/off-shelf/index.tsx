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
import BookCard, { BookCardData } from '../../../../components/cozy/BookCard';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

type OffShelfData = {
  enabled: boolean;
  blurb: string;
  books: BookCardData[];
};

export default function OffShelfScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<OffShelfData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet<OffShelfData>('/cozy/off-shelf');
        setData(response ?? null);
      } catch {} finally {
        setLoaded(true);
      }
    }
    load();
  }, []);

  const books = data?.enabled ? (data.books ?? []) : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/cozy' as any)}
          >
            <CaretLeft size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerLabel}>SUSPICIOUS BEHAVIOR</Text>
            <Text style={styles.headerTitle}>Off The Shelf</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.irisButton} onPress={() => router.push('/iris/chat?from=cozy/off-shelf' as any)}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
        </TouchableOpacity>
      </View>

      {/* IRIS NOTE — tagline, same treatment as sibling View All pages */}
      <View style={styles.irisNote}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={styles.irisNoteText}>
          If you weren't side-eyeing everyone already...you will be now. 💀📚
        </Text>
      </View>

      {/* COUNT */}
      <View style={styles.countRow}>
        <View style={styles.countLine} />
        {loaded && books.length > 0 && (
          <Text style={styles.countText}>{books.length} {books.length === 1 ? 'Book' : 'Books'}</Text>
        )}
        <View style={styles.countLine} />
      </View>

      {/* GRID */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : books.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={styles.emptyTitle}>Coming soon</Text>
            <Text style={styles.emptyText}>Iris is still pulling together this month's picks. Check back soon.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {books.map((book, i) => (
              <BookCard key={book?.bookId ?? i} book={book} style={styles.gridCard} />
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
  gridContent: { paddingHorizontal: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gridCard: { width: '45%' },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});
