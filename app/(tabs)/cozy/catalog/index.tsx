import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { spacing, colors } from '../../../../lib/theme';
import { PRIMARY_SUBGENRES, TROPES } from '../../../../lib/tagTaxonomy';
import BookCard, { BookCardData } from '../../../../components/cozy/BookCard';

// Entered via the filter (funnel) button in the Cozy Books ("On Iris's Shelf")
// header — see app/(tabs)/cozy/books/index.tsx.

type TropeMode = 'any' | 'all';

const SPICE_LEVELS = [1, 2, 3, 4, 5];

type FilterResponse = {
  count: number;
  appliedFilters?: unknown;
  boundariesApplied: string[];
  books: BookCardData[];
};

export default function CatalogFilterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [spices, setSpices] = useState<number[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [tropes, setTropes] = useState<string[]>([]);
  const [tropeMode, setTropeMode] = useState<TropeMode>('any');

  const [data, setData] = useState<FilterResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Build the query string from active filters. Enum keys and numbers are
  // URL-safe, so we join with raw commas to match the API's expected shape.
  const queryString = useMemo(() => {
    const parts: string[] = [];
    if (genres.length) parts.push(`genre=${genres.join(',')}`);
    if (spices.length) parts.push(`spice=${[...spices].sort((a, b) => a - b).join(',')}`);
    if (tropes.length) {
      parts.push(`tropes=${tropes.join(',')}`);
      parts.push(`tropeMode=${tropeMode}`); // only meaningful alongside tropes
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }, [genres, spices, tropes, tropeMode]);

  // Re-fetch whenever filters change, debounced so rapid tap-toggling doesn't
  // fire a request per tap. Empty filters load the full catalog.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiGet<FilterResponse>(`/catalog/filter${queryString}`);
        if (!cancelled) setData(res ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [queryString]);

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) => (value: T) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };
  const toggleSpice = toggle(setSpices);
  const toggleGenre = toggle(setGenres);
  const toggleTrope = toggle(setTropes);

  const hasFilters = spices.length > 0 || genres.length > 0 || tropes.length > 0;
  const clearAll = () => { setSpices([]); setGenres([]); setTropes([]); setTropeMode('any'); };

  const books = data?.books ?? [];
  const boundaries = data?.boundariesApplied ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <CaretLeft size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerLabel}>Browse the Catalog</Text>
            <Text style={styles.headerTitle}>Find Your Next Read</Text>
          </View>
        </View>
        {hasFilters && (
          <TouchableOpacity style={styles.clearButton} onPress={clearAll}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* SPICE — primary control */}
        <Text style={styles.filterLabel}>Spice Level</Text>
        <View style={styles.pepperRow}>
          {SPICE_LEVELS.map((n) => {
            const active = spices.includes(n);
            return (
              <TouchableOpacity
                key={n}
                style={[styles.pepper, active && styles.pepperActive]}
                onPress={() => toggleSpice(n)}
                activeOpacity={0.85}
              >
                <Text style={[styles.pepperEmoji, !active && styles.pepperEmojiMuted]}>🌶️</Text>
                <Text style={[styles.pepperNum, active && styles.pepperNumActive]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* GENRE */}
        <Text style={styles.filterLabel}>Genre</Text>
        <View style={styles.chipRow}>
          {PRIMARY_SUBGENRES.map((g) => {
            const active = genres.includes(g.value);
            return (
              <TouchableOpacity
                key={g.value}
                style={[styles.genrePill, active && styles.genrePillActive]}
                onPress={() => toggleGenre(g.value)}
                activeOpacity={0.85}
              >
                <Text style={[styles.genrePillText, active && styles.genrePillTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TROPES */}
        <View style={styles.tropeHeader}>
          <Text style={styles.filterLabel}>Tropes</Text>
          <View style={styles.modeToggle}>
            {(['any', 'all'] as TropeMode[]).map((mode) => {
              const active = tropeMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeSegment, active && styles.modeSegmentActive]}
                  onPress={() => setTropeMode(mode)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.modeText, active && styles.modeTextActive]}>
                    Match {mode}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.chipRow}>
          {TROPES.map((t) => {
            const active = tropes.includes(t.key);
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tropePill, active && styles.tropePillActive]}
                onPress={() => toggleTrope(t.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tropePillText, active && styles.tropePillTextActive]}>
                  {t.emoji} {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* RESULTS */}
        <View style={styles.countRow}>
          <View style={styles.countLine} />
          {!loading && (
            <Text style={styles.countText}>
              {books.length} {books.length === 1 ? 'Match' : 'Matches'}
            </Text>
          )}
          <View style={styles.countLine} />
        </View>

        {boundaries.length > 0 && (
          <Text style={styles.boundaryNote}>
            Some books are hidden by your comfort settings.
          </Text>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : books.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyText}>Try broadening your filters.</Text>
          </View>
        ) : (
          <View style={styles.gridInner}>
            {books.map((book, i) => (
              <BookCard key={book?.bookId ?? i} book={book} style={styles.bookCard} />
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
  clearButton: { borderWidth: 1, borderColor: '#ddd4c8', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 4 },
  clearButtonText: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', letterSpacing: 0.2 },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  filterLabel: { fontSize: 15, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: '#7a6e62', marginBottom: 12, paddingHorizontal: spacing.xs },
  // Spice — the prominent primary control: 5 tappable peppers.
  pepperRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg, paddingHorizontal: spacing.xs },
  pepper: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#D7E2E9' },
  pepperActive: { backgroundColor: '#FDE8ED', borderColor: '#B83255' },
  pepperEmoji: { fontSize: 24 },
  pepperEmojiMuted: { opacity: 0.25 },
  pepperNum: { fontSize: 10, fontWeight: '700', color: '#A9C0D4', marginTop: 4 },
  pepperNumActive: { color: '#B83255' },
  // Genre — filled pills
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg, paddingHorizontal: spacing.xs },
  genrePill: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#D7E2E9' },
  genrePillActive: { backgroundColor: '#0F2A48', borderColor: '#0F2A48' },
  genrePillText: { fontSize: 12, fontWeight: '400', color: '#6A5969' },
  genrePillTextActive: { color: '#fff', fontWeight: '600' },
  // Tropes — mirror the trope pills used on the book cards
  tropeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  tropePill: { backgroundColor: 'rgba(15,42,72,0.06)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  tropePillActive: { backgroundColor: '#0F2A48' },
  tropePillText: { fontSize: 10, fontWeight: '700', color: '#6A5969', textTransform: 'uppercase', letterSpacing: 0.5 },
  tropePillTextActive: { color: '#fff' },
  // Match any/all — deliberately minor
  modeToggle: { flexDirection: 'row', borderRadius: 20, borderWidth: 1, borderColor: '#D7E2E9', overflow: 'hidden', marginBottom: 12 },
  modeSegment: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fff' },
  modeSegmentActive: { backgroundColor: '#A9C0D4' },
  modeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: '#9c8f7e' },
  modeTextActive: { color: '#0F2A48' },
  // Results
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.md },
  countLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.1)' },
  countText: { fontSize: 11, fontWeight: '700', color: '#A9C0D4', letterSpacing: 0.8, textTransform: 'uppercase' },
  boundaryNote: { fontSize: 12, fontStyle: 'italic', color: '#9c8f7e', textAlign: 'center', marginBottom: spacing.md, paddingHorizontal: spacing.lg, lineHeight: 18 },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  bookCard: { width: '45%' },
  emptyState: { alignItems: 'center', paddingTop: 48, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});
