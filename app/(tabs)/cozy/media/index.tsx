import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { apiGet, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';
import { getPlatform } from '../../../../lib/platforms';
import VerdictRating, { Verdict } from '../../../../components/rating/VerdictRating';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

const openSpotify = async (url: string) => {
  const spotifyUri = url
    .replace('https://open.spotify.com/', 'spotify:')
    .replace('/playlist/', ':playlist:')
    .replace('/track/', ':track:')
    .replace('/album/', ':album:');
  const canOpen = await Linking.canOpenURL(spotifyUri);
  await Linking.openURL(canOpen ? spotifyUri : url);
};

type PlatformLink = { platformId: string; deepLink: string };

type VisualItem = {
  sk?: string;
  movieId?: string;
  title: string;
  status?: string;
  imageUrl?: string;
  category?: string;
  description?: string;
  platforms?: PlatformLink[];
  watchUrl?: string;
  deepLink?: string;
  ratingSummary?: RatingSummary | null;
};

type RatingBreakdown = { count: number; pct: number };

type RatingSummary = {
  totalRatings: number;
  topVerdict: string;
  topPct: number;
  breakdown: {
    trash: RatingBreakdown;
    meh: RatingBreakdown;
    cute: RatingBreakdown;
    obsessed: RatingBreakdown;
    chefs_kiss: RatingBreakdown;
  };
};

type MovieDetail = {
  movieId: string;
  title: string;
  year: string | null;
  type: string;
  imageUrl: string | null;
  synopsis: string | null;
  irisNote: string | null;
  trailerUrl: string | null;
  genres: string[];
  vibes: string[];
  platforms: PlatformLink[];
  status: string | null;
};

const VERDICTS = [
  { key: 'trash', emoji: '🗑️', label: 'Trash', color: '#E57373' },
  { key: 'meh', emoji: '😐', label: 'Meh', color: '#B0BEC5' },
  { key: 'cute', emoji: '😊', label: 'Cute', color: '#81C784' },
  { key: 'obsessed', emoji: '😍', label: 'Obsessed', color: '#F06292' },
  { key: 'chefs_kiss', emoji: '💋', label: "Chef's Kiss", color: '#B83255' },
];

const VERDICT_DISPLAY: Record<string, { emoji: string; label: string; color: string }> = {
  trash: { emoji: '🗑️', label: 'say skip it', color: '#E57373' },
  meh: { emoji: '😐', label: "say it's just meh", color: '#B0BEC5' },
  cute: { emoji: '😊', label: "say it's cute", color: '#81C784' },
  obsessed: { emoji: '😍', label: "say they're obsessed", color: '#F06292' },
  chefs_kiss: { emoji: '💋', label: "say Chef's Kiss", color: '#B83255' },
};

export { VisualItem, RatingSummary };

export function MovieDetailSheet({ item, visible, onClose, onRatingUpdate }: {
  item: VisualItem; visible: boolean; onClose: () => void;
  onRatingUpdate: (movieId: string, ratingSummary: RatingSummary | null) => void;
}) {
  const [detail, setDetail] = useState<MovieDetail | null>(null);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(item.ratingSummary ?? null);
  const [userRating, setUserRating] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    if (!visible || !item.movieId) return;
    setLoadingDetail(true);
    setDetail(null);
    apiGet(`/cozy/media/${item.movieId}`)
      .then((res: any) => {
        console.log('[VisualEscapes] platforms from API:', JSON.stringify(res.movie?.platforms));
        setDetail(res.movie);
        setRatingSummary(res.ratingSummary);
        setUserRating(res.userRating);
      })
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [visible, item.movieId]);

  useEffect(() => {
    if (!visible) { setDetail(null); }
  }, [visible]);

  async function handleVerdictSelect(verdictKey: string) {
    if (!item.movieId || savingRating) return;
    setSavingRating(true);
    try {
      const res: any = await apiPost(`/cozy/media/${item.movieId}/rate`, { verdict: verdictKey });
      setUserRating(verdictKey);
      setRatingSummary(res.ratingSummary);
      onRatingUpdate(item.movieId, res.ratingSummary);
    } catch {}
    finally { setSavingRating(false); }
  }

  const platforms = detail?.platforms ?? item.platforms ?? [];
  const synopsis = detail?.synopsis ?? item.description ?? null;
  const irisNote = detail?.irisNote ?? null;
  const genres = detail?.genres ?? [];
  const vibes = detail?.vibes ?? [];
  const year = detail?.year ?? null;
  const type = detail?.type ?? 'MOVIE';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
          {/* COVER + INFO */}
          <View style={styles.sheetHero}>
            <View style={styles.sheetCover}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.sheetCoverImage} />
              ) : (
                <View style={[styles.sheetCoverImage, styles.sheetCoverFallback]}>
                  <Text style={{ fontSize: 32 }}>🎬</Text>
                </View>
              )}
            </View>
            <View style={styles.sheetInfo}>
              <Text style={styles.sheetTitle}>{item.title}</Text>
              <View style={styles.sheetMeta}>
                {year && <Text style={styles.sheetYear}>{year}</Text>}
                <View style={styles.sheetTypeBadge}>
                  <Text style={styles.sheetTypeText}>{type === 'SHOW' ? 'TV Show' : 'Movie'}</Text>
                </View>
              </View>
              {genres.length > 0 && (
                <View style={styles.tagRow}>
                  {genres.map((g) => (
                    <View key={g} style={styles.genreTag}>
                      <Text style={styles.genreTagText}>{g}</Text>
                    </View>
                  ))}
                </View>
              )}
              {vibes.length > 0 && (
                <View style={styles.tagRow}>
                  {vibes.map((v) => (
                    <View key={v} style={styles.vibeTag}>
                      <Text style={styles.vibeTagText}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {loadingDetail && <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />}

          {/* SYNOPSIS */}
          {synopsis && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionLabel}>Synopsis</Text>
              <Text style={styles.sheetSynopsis}>{synopsis}</Text>
            </View>
          )}

          {/* IRIS NOTE */}
          {irisNote && (
            <View style={styles.irisNoteCard}>
              <Image source={{ uri: IRIS_AVATAR }} style={styles.irisNoteAvatar} />
              <View style={styles.irisNoteContent}>
                <Text style={styles.irisNoteLabel}>Iris Says</Text>
                <Text style={styles.irisNoteText}>"{irisNote}"</Text>
              </View>
            </View>
          )}

          {/* WHERE TO WATCH */}
          {platforms.length > 0 && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionLabel}>Where to Watch</Text>
              <View style={styles.platformRow}>
                {platforms.map((pl, i) => {
                  const platform = getPlatform(pl.platformId);
                  const url = pl.deepLink || platform?.baseUrl || '';
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.platformButton}
                      onPress={() => url && openSpotify(url)}
                      disabled={!url}
                    >
                      {platform?.logoUrl ? (
                        <Image source={{ uri: platform.logoUrl }} style={styles.platformLogo} resizeMode="contain" />
                      ) : (
                        <Text style={styles.platformName}>Watch</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.sheetDivider} />

          {/* COMMUNITY VERDICT */}
          <View style={styles.sheetSection}>
            <View style={styles.verdictHeader}>
              <Text style={styles.sheetSectionLabel}>Community Verdict</Text>
              {ratingSummary && (
                <Text style={styles.ratingCount}>{ratingSummary.totalRatings} {ratingSummary.totalRatings === 1 ? 'rating' : 'ratings'}</Text>
              )}
            </View>

            {ratingSummary && (
              <View style={styles.verdictBars}>
                {VERDICTS.map(({ key, emoji, label, color }) => {
                  const data = ratingSummary.breakdown[key as keyof typeof ratingSummary.breakdown];
                  const isTop = ratingSummary.topVerdict === key;
                  return (
                    <View key={key} style={styles.verdictRow}>
                      <Text style={styles.verdictEmoji}>{emoji}</Text>
                      <View style={styles.verdictBarContainer}>
                        <View style={styles.verdictBarLabels}>
                          <Text style={[styles.verdictLabel, isTop && styles.verdictLabelTop]}>{label}</Text>
                          <Text style={[styles.verdictPct, isTop && { color }]}>{data.pct}%</Text>
                        </View>
                        <View style={styles.verdictBarBg}>
                          <View style={[styles.verdictBarFill, { width: `${data.pct}%` as any, backgroundColor: isTop ? color : 'rgba(15,42,72,0.15)' }]} />
                        </View>
                      </View>
                      <Text style={styles.verdictCount}>{data.count}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {item.movieId && (
              <View style={styles.userVerdictSection}>
                <Text style={styles.sheetSectionLabel}>{userRating ? 'Your Verdict' : "What's Your Verdict?"}</Text>
                <VerdictRating
                  value={userRating as Verdict | null}
                  onChange={savingRating ? undefined : (v) => v && handleVerdictSelect(v)}
                />
              </View>
            )}
          </View>

          <View style={{ height: spacing.xl }} />
        </ScrollView>

        {/* Rendered after ScrollView so it sits on top in the hit-test order */}
        <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
          <Text style={styles.sheetCloseText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function CozyMediaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [watchItems, setWatchItems] = useState<VisualItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VisualItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet('/cozy/home?view=full');
        const raw: VisualItem[] = response?.active?.sections?.visual ?? [];
        setWatchItems(raw);
      } catch {} finally {
        setLoaded(true);
      }
    }
    load();
  }, []);

  const handleRatingUpdate = useCallback((movieId: string, ratingSummary: RatingSummary | null) => {
    setWatchItems((prev) => prev.map((item) => item.movieId === movieId ? { ...item, ratingSummary } : item));
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/cozy' as any)}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerLabel}>Watch & Unwind</Text>
            <Text style={styles.headerTitle}>Visual Escapes</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.irisButton} onPress={() => router.push('/iris/chat?from=cozy/media' as any)}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
        </TouchableOpacity>
      </View>

      {/* IRIS NOTE */}
      <View style={styles.irisNote}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={styles.irisNoteText}>Grab your blanket and your snacks — let's get cozy.</Text>
      </View>

      {/* COUNT */}
      <View style={styles.countRow}>
        <View style={styles.countLine} />
        {loaded && watchItems.length > 0 && (
          <Text style={styles.countText}>{watchItems.length} {watchItems.length === 1 ? 'Title' : 'Titles'}</Text>
        )}
        <View style={styles.countLine} />
      </View>

      {/* GRID */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : watchItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎬</Text>
            <Text style={styles.emptyTitle}>Coming soon</Text>
            <Text style={styles.emptyText}>Iris is still picking this month's watches. Check back soon.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {watchItems.map((item, i) => {
              const rating = item.ratingSummary;
              const verdict = rating ? VERDICT_DISPLAY[rating.topVerdict] : null;
              return (
                <TouchableOpacity
                  key={item.sk ?? `watch-${i}`}
                  style={styles.watchCard}
                  onPress={() => { setSelectedItem(item); setSheetOpen(true); }}
                >
                  <View style={styles.watchCover}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.watchCoverImage} />
                    ) : (
                      <View style={[styles.watchCoverImage, styles.watchCoverFallback]}>
                        <Text style={{ fontSize: 28 }}>🎬</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.watchInfo}>
                    <Text style={styles.watchTitle} numberOfLines={2}>{item.title}</Text>
                    {item.status && <Text style={styles.watchStatus}>{item.status}</Text>}
                    {verdict && rating && (
                      <View style={[styles.verdictBadge, { backgroundColor: `${verdict.color}18`, borderColor: `${verdict.color}40` }]}>
                        <Text style={styles.verdictBadgeEmoji}>{verdict.emoji}</Text>
                        <Text style={[styles.verdictBadgeText, { color: verdict.color }]}>{rating.topPct}% {verdict.label}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {selectedItem && (
        <MovieDetailSheet
          item={selectedItem}
          visible={sheetOpen}
          onClose={() => { setSheetOpen(false); setTimeout(() => setSelectedItem(null), 350); }}
          onRatingUpdate={handleRatingUpdate}
        />
      )}
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
  headerTitle: { fontSize: 26, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 30 },
  irisButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  irisAvatar: { width: 44, height: 44, borderRadius: 22 },
  irisNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteIcon: { fontSize: 14, marginTop: 1 },
  irisNoteText: { flex: 1, fontSize: 15, fontStyle: 'italic', color: '#6A5969', lineHeight: 22 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  countLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.1)' },
  countText: { fontSize: 11, fontWeight: '700', color: '#A9C0D4', letterSpacing: 0.8, textTransform: 'uppercase' },
  gridContent: { paddingHorizontal: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  watchCard: { width: '45%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#D7E2E9', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  watchCover: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#D7E2E9', overflow: 'hidden' },
  watchCoverImage: { width: '100%', height: '100%' },
  watchCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  watchInfo: { padding: spacing.sm },
  watchTitle: { fontSize: 15, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 20, marginBottom: 4 },
  watchStatus: { fontSize: 11, fontWeight: '300', color: '#A9C0D4', marginBottom: 6 },
  verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  verdictBadgeEmoji: { fontSize: 11 },
  verdictBadgeText: { fontSize: 10, fontWeight: '700', lineHeight: 14 },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,42,72,0.55)', zIndex: 40 },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#F1F4F8', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', zIndex: 50 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(15,42,72,0.15)', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  sheetClose: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,42,72,0.08)', alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 14, color: '#0F2A48', fontWeight: '600' },
  sheetContent: { paddingBottom: spacing.xl },
  sheetHero: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingTop: spacing.sm },
  sheetCover: { width: 110, borderRadius: 14, overflow: 'hidden', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 8 },
  sheetCoverImage: { width: 110, aspectRatio: 2 / 3 },
  sheetCoverFallback: { backgroundColor: '#D7E2E9', alignItems: 'center', justifyContent: 'center' },
  sheetInfo: { flex: 1, paddingTop: 4 },
  sheetTitle: { fontSize: 22, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 26, marginBottom: 6 },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  sheetYear: { fontSize: 12, color: '#6A7A8C' },
  sheetTypeBadge: { backgroundColor: 'rgba(169,192,212,0.15)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  sheetTypeText: { fontSize: 10, fontWeight: '700', color: '#A9C0D4', letterSpacing: 1, textTransform: 'uppercase' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  genreTag: { backgroundColor: 'rgba(15,42,72,0.07)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  genreTagText: { fontSize: 10, fontWeight: '700', color: '#0F2A48' },
  vibeTag: { backgroundColor: 'rgba(184,50,85,0.08)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  vibeTagText: { fontSize: 10, fontWeight: '700', color: '#B83255' },
  sheetSection: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  sheetSectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: 10 },
  sheetSynopsis: { fontSize: 16, fontStyle: 'italic', color: '#0F2A48', lineHeight: 26 },
  irisNoteCard: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.lg, marginBottom: spacing.lg, padding: spacing.md, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteAvatar: { width: 32, height: 32, borderRadius: 16 },
  irisNoteContent: { flex: 1 },
  irisNoteLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: 3 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  platformButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D7E2E9', borderRadius: 12, padding: 10, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  platformLogo: { height: 24, width: 80 },
  platformName: { fontSize: 12, fontWeight: '700', color: '#0F2A48' },
  sheetDivider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  verdictHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  ratingCount: { fontSize: 11, color: '#A9C0D4' },
  verdictBars: { gap: spacing.sm, marginBottom: spacing.lg },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verdictEmoji: { fontSize: 16, width: 24, textAlign: 'center' },
  verdictBarContainer: { flex: 1 },
  verdictBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  verdictLabel: { fontSize: 11, color: '#6A7A8C' },
  verdictLabelTop: { fontWeight: '700', color: '#0F2A48' },
  verdictPct: { fontSize: 11, fontWeight: '700', color: '#A9C0D4' },
  verdictBarBg: { height: 5, borderRadius: 3, backgroundColor: 'rgba(15,42,72,0.08)', overflow: 'hidden' },
  verdictBarFill: { height: 5, borderRadius: 3 },
  verdictCount: { fontSize: 11, color: '#A9C0D4', width: 20, textAlign: 'right' },
  userVerdictSection: { marginTop: spacing.md },
});