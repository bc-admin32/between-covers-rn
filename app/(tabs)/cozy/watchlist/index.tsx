import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft } from '../../../../components/icons';
import { PR, prStyles, usePlayroom } from '../../../../lib/playroomPage';
import { useLightStatusBarWhileFocused } from '../../../../lib/statusBarTone';
import { PlayRoomStatusStrip } from '../../../../components/playroom/RoomHeader';
import { useGuestRedirect } from '../../../../lib/useGuest';
import { loadWatchlist, useWatchlistIds, type WatchlistMovie } from '../../../../lib/watchlist';
import { spacing, colors } from '../../../../lib/theme';
import { MovieDetailSheet, WatchCard, type VisualItem } from '../media';

// My Watchlist: the member's saved Watch Me titles, newest saved first
// (GET /cozy/watchlist). Unsaving here removes the card right away; a failed
// unsave brings it back. Guests are sent to sign up (members only).

function toVisualItem(m: WatchlistMovie): VisualItem {
  return {
    sk: m.movieId,
    movieId: m.movieId,
    title: m.title,
    imageUrl: m.imageUrl ?? undefined,
    status: m.status ?? undefined,
    description: m.synopsis ?? undefined,
    bcGenres: m.bcGenres ?? null,
    // Lets the sheet hide rating for Coming Soon titles before its detail loads.
    releaseStatus: m.releaseStatus ?? null,
  };
}

export default function WatchlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playroom = usePlayroom();
  useLightStatusBarWhileFocused(playroom);
  const blocked = useGuestRedirect('library', 'library');
  const ids = useWatchlistIds();
  const [items, setItems] = useState<VisualItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VisualItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (blocked) return;
    loadWatchlist()
      .then((res) => {
        if (!res) { setFailed(true); return; }
        setItems((res.items ?? []).filter((m) => m && typeof m.movieId === 'string').map(toVisualItem));
      })
      .finally(() => setLoaded(true));
  }, [blocked]);

  if (blocked) return null;

  // Only titles still saved (an unsave here hides the card straight away).
  const shown = items.filter((i) => i.movieId && ids.has(i.movieId));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/cozy/media' as any));

  return (
    <View style={[styles.container, playroom && prStyles.page, { paddingTop: playroom ? 0 : insets.top }]}>
      {playroom && <PlayRoomStatusStrip height={insets.top} />}
      <View style={[styles.header, playroom && { paddingTop: spacing.md }]}>
        <TouchableOpacity style={[styles.backButton, playroom && prStyles.softButton]} onPress={back} accessibilityRole="button" accessibilityLabel="Back">
          <CaretLeft size={20} color={playroom ? PR.heading : '#0F2A48'} weight="bold" />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerLabel, playroom && prStyles.eyebrow]}>Saved for Later</Text>
          <Text style={[styles.headerTitle, playroom && prStyles.heading]}>My Watchlist</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : failed ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, playroom && prStyles.heading]}>Couldn't load your watchlist</Text>
            <Text style={[styles.emptyText, playroom && prStyles.body]}>Check your connection and try again.</Text>
          </View>
        ) : shown.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🍿</Text>
            <Text style={[styles.emptyTitle, playroom && prStyles.heading]}>Nothing saved yet</Text>
            <Text style={[styles.emptyText, playroom && prStyles.body]}>Tap the bookmark on any Watch Me title to save it here.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {shown.map((item) => (
              <WatchCard key={item.movieId} item={item} onPress={() => { setSelectedItem(item); setSheetOpen(true); }} />
            ))}
          </View>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {selectedItem && (
        <MovieDetailSheet
          item={selectedItem}
          visible={sheetOpen}
          onClose={() => { setSheetOpen(false); setTimeout(() => setSelectedItem(null), 350); }}
          onRatingUpdate={(movieId, ratingSummary) =>
            setItems((prev) => prev.map((i) => (i.movieId === movieId ? { ...i, ratingSummary } : i)))
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4' },
  headerTitle: { fontSize: 26, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 30 },
  gridContent: { paddingHorizontal: spacing.md },
  // Same two-column layout as Watch Me.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', textAlign: 'center' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
});
