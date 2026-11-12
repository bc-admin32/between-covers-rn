import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { BookmarksSimple, CaretLeft } from '../../../../components/icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { cozyMonthKey, setMonthThemes } from '../../../../lib/cozyLayout';
import { PR, prStyles, usePlayroom } from '../../../../lib/playroomPage';
import { useLightStatusBarWhileFocused } from '../../../../lib/statusBarTone';
import RoomHeader, { PlayRoomStatusStrip, ROOM_INTROS, roomHeaderButton } from '../../../../components/playroom/RoomHeader';
import { tileLabel } from '../../../../components/playroom/tiles';
import { CHAMPAGNE } from '../../../../components/playroom/playroomStyle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { apiGet, apiPost, hasSession } from '../../../../lib/api';
import { parseLocalDate } from '../../../../lib/dateUtils';
import { useGuest } from '../../../../lib/useGuest';
import { spacing, radius, colors } from '../../../../lib/theme';
import { getPlatform } from '../../../../lib/platforms';
import VerdictRating, { Verdict } from '../../../../components/rating/VerdictRating';
import RatingInfoButton from '../../../../components/rating/RatingInfoButton';
import { IRIS_AVATAR } from '../../../../lib/irisAvatar';
import { ratingSummaryLine, type RatingSummary } from '../../../../lib/ratingSummary';
import { prettifyEnum } from '../../../../lib/tagTaxonomy';
import { loadWatchlist } from '../../../../lib/watchlist';
import WatchlistButton from '../../../../components/cozy/WatchlistButton';

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
  // BC genres (cozyHome); bcGenres[0] is the title's display category.
  bcGenres?: string[] | null;
  // Coming Soon (GET /cozy/coming-soon) and movie detail.
  releaseStatus?: string | null;
  releaseDate?: string | null;
  releaseDateType?: string | null;
  // Lifestyle/recipe fields used by the Cozy home consumer; optional so
  // movie/watch items that never set them are unaffected.
  affiliateLink?: string;
  spotifyLink?: string;
  promo?: { discountCode?: string; endDate?: string };
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
  // TMDB genre names: never shown to members (bcGenres is shown instead).
  genres: string[];
  // BC genres; GET /cozy/media/{movieId} adds these with item 7.
  bcGenres?: string[] | null;
  vibes: string[];
  platforms: PlatformLink[];
  status: string | null;
  tmdbId?: number | null;
  spicy?: boolean | null;
  releaseStatus?: string | null;
  releaseDate?: string | null;
  releaseDateType?: string | null;
};

// Streaming services for the viewer's country (GET /cozy/media/{movieId},
// next to `movie`), from TMDB/JustWatch, in TMDB display order.
type StreamingService = { providerId: string | number; name: string; logoUrl?: string | null; kind?: 'subscription' | 'free' | 'ads' | string };
// services: [] = none in their country (hide the line); null = title not
// linked to TMDB (keep the curated platforms).
type Streaming = { services: StreamingService[] | null; link: string | null };

function readStreaming(res: any): Streaming {
  const raw = res?.streamingServices;
  const services = Array.isArray(raw)
    ? raw.filter((s: any): s is StreamingService => !!s && typeof s.name === 'string' && s.name.length > 0)
    : null;
  const link = typeof res?.streamingLink === 'string' && res.streamingLink ? res.streamingLink : null;
  return { services, link };
}

const KIND_LABEL: Record<string, string> = { free: 'Free', ads: 'With ads' };

// The reader's monthly movie pick (cozyHome sections.moviePick), stable for
// the month; null when the month has no Watch Me titles. irisLine is shown as
// written and hidden while absent/null. matchedGenres and score aren't shown.
type MoviePick = { movie: VisualItem; irisLine: string | null };

function readMoviePick(raw: any): MoviePick | null {
  const movie = raw?.movie;
  if (!movie || typeof movie.movieId !== 'string' || typeof movie.title !== 'string') return null;
  const irisLine = typeof raw.irisLine === 'string' && raw.irisLine.trim() ? raw.irisLine.trim() : null;
  return { movie, irisLine };
}

const VERDICT_DISPLAY: Record<string, { emoji: string; label: string; color: string }> = {
  trash: { emoji: '🗑️', label: 'say skip it', color: '#E57373' },
  meh: { emoji: '😐', label: "say it's just meh", color: '#B0BEC5' },
  cute: { emoji: '😊', label: "say it's cute", color: '#81C784' },
  obsessed: { emoji: '😍', label: "say they're obsessed", color: '#F06292' },
  chefs_kiss: { emoji: '💋', label: "say Chef's Kiss", color: '#B83255' },
};

export type { VisualItem, RatingSummary };

// BC genres, cleaned. Keys like ROM_COM read "Rom Com"; labels pass through.
export function bcGenreLabels(bcGenres: unknown): string[] {
  if (!Array.isArray(bcGenres)) return [];
  return bcGenres
    .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
    .map((g) => (/^[A-Z0-9_]+$/.test(g) ? prettifyEnum(g) : g.trim()));
}

// A title's display category: its first BC genre, or nothing.
export function displayCategory(bcGenres: unknown): string | null {
  return bcGenreLabels(bcGenres)[0] ?? null;
}

// Coming Soon cards show the release date where streaming would be:
// "Dec 12, 2026", or "Date TBA"; plus a small label for the kind of release.
const RELEASE_TYPE_LABEL: Record<string, string> = {
  digital: 'Digital release',
  first_air: 'Series premiere',
  next_episode: 'New season',
};

export function releaseLine(item: VisualItem): { when: string; kind: string | null } {
  const iso = item.releaseDate;
  const valid = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const when = valid
    ? parseLocalDate(iso!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Date TBA';
  const kind = item.releaseDateType ? RELEASE_TYPE_LABEL[item.releaseDateType] ?? null : null;
  return { when, kind };
}

// One poster card in the Watch Me grid (also used by My Watchlist).
// `upcoming` (Coming Soon) shows the release date instead of the streaming line.
export function WatchCard({ item, onPress, upcoming = false }: { item: VisualItem; onPress: () => void; upcoming?: boolean }) {
  const playroom = usePlayroom();
  const rating = item.ratingSummary;
  const verdict = rating ? VERDICT_DISPLAY[rating.topVerdict] : null;
  const category = displayCategory(item.bcGenres);
  const release = upcoming ? releaseLine(item) : null;
  return (
    <TouchableOpacity style={[styles.watchCard, playroom && prStyles.card]} onPress={onPress}>
      <View style={[styles.watchCover, playroom && prStyles.coverBg]}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.watchCoverImage} />
        ) : (
          <View style={[styles.watchCoverImage, styles.watchCoverFallback]}>
            <Text style={{ fontSize: 28 }}>🎬</Text>
          </View>
        )}
        {!!item.movieId && <WatchlistButton movieId={item.movieId} title={item.title} />}
      </View>
      <View style={styles.watchInfo}>
        {!!category && <Text style={[styles.watchCategory, playroom && prStyles.eyebrow]} numberOfLines={1}>{category}</Text>}
        <Text style={[styles.watchTitle, playroom && prStyles.heading]} numberOfLines={2}>{item.title}</Text>
        {release ? (
          <>
            <Text style={[styles.watchRelease, playroom && prStyles.heading]}>{release.when}</Text>
            {!!release.kind && <Text style={[styles.watchStatus, playroom && prStyles.body]}>{release.kind}</Text>}
          </>
        ) : (
          item.status && <Text style={[styles.watchStatus, playroom && prStyles.body]}>{item.status}</Text>
        )}
        {verdict && rating && (
          <View style={[styles.verdictBadge, { backgroundColor: `${verdict.color}18`, borderColor: `${verdict.color}40` }]}>
            <Text style={styles.verdictBadgeEmoji}>{verdict.emoji}</Text>
            <Text style={[styles.verdictBadgeText, { color: verdict.color }]}>{rating.topPct}% {verdict.label}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function MovieDetailSheet({ item, visible, onClose, onRatingUpdate }: {
  item: VisualItem; visible: boolean; onClose: () => void;
  onRatingUpdate: (movieId: string, ratingSummary: RatingSummary | null) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<MovieDetail | null>(null);
  // null until the detail answers (or if it fails): then the curated platforms show.
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(item.ratingSummary ?? null);
  const [userRating, setUserRating] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const { isGuest, requireAccount } = useGuest();
  const playroom = usePlayroom();

  useEffect(() => {
    if (!visible || !item.movieId) return;
    setLoadingDetail(true);
    setDetail(null);
    setStreaming(null);
    apiGet(`/cozy/media/${item.movieId}`)
      .then((res: any) => {
        setDetail(res.movie);
        setStreaming(readStreaming(res));
        setRatingSummary(res.ratingSummary ?? null);
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
    // Close the sheet first — a native Modal would otherwise cover sign-in.
    if (isGuest) { onClose(); requireAccount('rate', { source: 'cozy_rate' }); return; }
    setSavingRating(true);
    try {
      const res: any = await apiPost(`/cozy/media/${item.movieId}/rate`, { verdict: verdictKey });
      setUserRating(verdictKey);
      setRatingSummary(res.ratingSummary ?? null);
      onRatingUpdate(item.movieId, res.ratingSummary ?? null);
    } catch {}
    finally { setSavingRating(false); }
  }

  const platforms = detail?.platforms ?? item.platforms ?? [];
  const ratingLine = ratingSummaryLine(ratingSummary);
  // Unreleased (Coming Soon) titles can't be rated. The detail decides once
  // it loads (null = rateable); until then the card's own status does.
  const comingSoon = (detail ? detail.releaseStatus : item.releaseStatus) === 'COMING_SOON';
  const synopsis = detail?.synopsis ?? item.description ?? null;
  const irisNote = detail?.irisNote ?? null;
  // BC genres only (never TMDB names): the detail's once it has them, else
  // the Watch Me item's; none → the tag row is hidden.
  const genres = bcGenreLabels(detail?.bcGenres ?? item.bcGenres);
  const vibes = detail?.vibes ?? [];
  const year = detail?.year ?? null;
  const type = detail?.type ?? 'MOVIE';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.sheetOverlay, playroom && prStyles.overlay]} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, playroom && prStyles.page]}>
        <View style={styles.sheetHandle} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
          {/* COVER + INFO */}
          <View style={styles.sheetHero}>
            <View style={styles.sheetCover}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.sheetCoverImage} />
              ) : (
                <View style={[styles.sheetCoverImage, styles.sheetCoverFallback, playroom && prStyles.coverBg]}>
                  <Text style={{ fontSize: 32 }}>🎬</Text>
                </View>
              )}
            </View>
            <View style={styles.sheetInfo}>
              <Text style={[styles.sheetTitle, playroom && prStyles.heading]}>{item.title}</Text>
              <View style={styles.sheetMeta}>
                {year && <Text style={[styles.sheetYear, playroom && prStyles.body]}>{year}</Text>}
                <View style={styles.sheetTypeBadge}>
                  <Text style={[styles.sheetTypeText, playroom && prStyles.eyebrow]}>{type === 'SHOW' ? 'TV Show' : 'Movie'}</Text>
                </View>
              </View>
              {!!item.movieId && (
                <WatchlistButton movieId={item.movieId} title={item.title} variant="pill" beforeGate={onClose} style={{ marginBottom: 8 }} />
              )}
              {genres.length > 0 && (
                <View style={styles.tagRow}>
                  {genres.map((g) => (
                    <View key={g} style={styles.genreTag}>
                      <Text style={[styles.genreTagText, playroom && prStyles.heading]}>{g}</Text>
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
              <Text style={[styles.sheetSectionLabel, playroom && prStyles.eyebrow]}>Synopsis</Text>
              <Text style={[styles.sheetSynopsis, playroom && prStyles.body]}>{synopsis}</Text>
            </View>
          )}

          {/* IRIS NOTE */}
          {irisNote && (
            <View style={[styles.irisNoteCard, playroom && prStyles.card]}>
              {/* Iris's picture opens a chat with her (the sheet closes first). */}
              <TouchableOpacity onPress={() => { onClose(); router.push('/iris/chat?from=cozy/media' as any); }} accessibilityRole="button" accessibilityLabel="Chat with Iris">
                <Image source={{ uri: IRIS_AVATAR }} style={styles.irisNoteAvatar} />
              </TouchableOpacity>
              <View style={styles.irisNoteContent}>
                <Text style={[styles.irisNoteLabel, playroom && prStyles.eyebrow]}>Iris Says</Text>
                <Text style={[styles.irisNoteText, playroom && prStyles.body]}>"{irisNote}"</Text>
              </View>
            </View>
          )}

          {/* WHERE TO WATCH (TMDB/JustWatch, viewer's country). Hidden when there
              are none in their country; tapping opens the JustWatch page. */}
          {!!streaming?.services && streaming.services.length > 0 && (
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetSectionLabel, playroom && prStyles.eyebrow]}>Where to Watch</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!streaming.link}
                onPress={() => streaming.link && Linking.openURL(streaming.link)}
                accessibilityRole={streaming.link ? 'link' : undefined}
                accessibilityLabel={`Streaming on ${streaming.services.map((s) => s.name).join(', ')}${streaming.link ? '. Opens JustWatch' : ''}`}
              >
                <View style={styles.platformRow}>
                  {streaming.services.map((s) => (
                    <View key={`${s.providerId}-${s.kind ?? ''}`} style={styles.serviceItem}>
                      <View style={[styles.serviceLogoWrap, playroom && prStyles.card]}>
                        {s.logoUrl ? (
                          <Image source={{ uri: s.logoUrl }} style={styles.serviceLogo} contentFit="cover" />
                        ) : (
                          <Text style={[styles.platformName, playroom && prStyles.heading]} numberOfLines={2}>{s.name}</Text>
                        )}
                      </View>
                      {!!s.kind && !!KIND_LABEL[s.kind] && (
                        <Text style={[styles.serviceKind, playroom && prStyles.body]}>{KIND_LABEL[s.kind]}</Text>
                      )}
                    </View>
                  ))}
                </View>
                <Text style={[styles.justWatch, playroom && prStyles.body]}>Streaming data from JustWatch</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* WHERE TO WATCH (curated): titles not linked to TMDB, or no answer yet. */}
          {!loadingDetail && !streaming?.services && platforms.length > 0 && (
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetSectionLabel, playroom && prStyles.eyebrow]}>Where to Watch</Text>
              <View style={styles.platformRow}>
                {platforms.map((pl, i) => {
                  const platform = getPlatform(pl.platformId);
                  const url = pl.deepLink || platform?.baseUrl || '';
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.platformButton, playroom && prStyles.card]}
                      onPress={() => url && openSpotify(url)}
                      disabled={!url}
                    >
                      {platform?.logoUrl ? (
                        <Image source={{ uri: platform.logoUrl }} style={styles.platformLogo} contentFit="contain" />
                      ) : (
                        <Text style={[styles.platformName, playroom && prStyles.heading]}>Watch</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Community verdict and rating: hidden for Coming Soon titles. */}
          {!comingSoon && (
          <>
          <View style={styles.sheetDivider} />

          {/* COMMUNITY VERDICT: "😍 72% Obsessed · 14 ratings", or the prompt
              (no heading) until the first rating. */}
          <View style={styles.sheetSection}>
            {ratingLine ? (
              <>
                <Text style={[styles.sheetSectionLabel, playroom && prStyles.eyebrow]}>Community Verdict</Text>
                <Text style={[styles.ratingLine, playroom && prStyles.heading]}>{ratingLine}</Text>
              </>
            ) : (
              <Text style={[styles.ratingEmpty, playroom && prStyles.body]}>Be the first to rate this ✨</Text>
            )}

            {item.movieId && (
              <View style={styles.userVerdictSection}>
                <View style={styles.verdictHeadingRow}>
                  <Text style={[styles.sheetSectionLabel, playroom && prStyles.eyebrow, { marginBottom: 0 }]}>{userRating ? 'Your Verdict' : "What's Your Verdict?"}</Text>
                  <RatingInfoButton />
                </View>
                <VerdictRating
                  value={userRating as Verdict | null}
                  onChange={savingRating ? undefined : (v) => v && handleVerdictSelect(v)}
                />
              </View>
            )}
          </View>
          </>
          )}

          <View style={{ height: spacing.xl }} />
        </ScrollView>

        {/* Rendered after ScrollView so it sits on top in the hit-test order */}
        <TouchableOpacity style={[styles.sheetClose, playroom && prStyles.softButton]} onPress={onClose}>
          <Text style={[styles.sheetCloseText, playroom && prStyles.heading]}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function CozyMediaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [watchItems, setWatchItems] = useState<VisualItem[]>([]);
  const [moviePick, setMoviePick] = useState<MoviePick | null>(null);
  // Coming Soon: members only, not tied to a month (hidden on last month's page).
  const [comingSoon, setComingSoon] = useState<VisualItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VisualItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // PlayRoom months make this Watch Me. month=previous → last month (archive).
  const playroom = usePlayroom();
  const params = useLocalSearchParams<{ month?: string }>();
  // PlayRoom: light status-bar icons over the plum strip and header. Classic
  // keeps the app's dark icons on the light page.
  useLightStatusBarWhileFocused(playroom);
  const monthKey = cozyMonthKey(params.month);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet('/cozy/home?view=full');
        setMonthThemes(response);
        const raw: VisualItem[] = response?.[monthKey]?.sections?.visual ?? [];
        setWatchItems(raw);
        setMoviePick(readMoviePick(response?.[monthKey]?.sections?.moviePick));
      } catch {} finally {
        setLoaded(true);
      }
    }
    load();
  }, [monthKey]);

  // Saved state for the cards' bookmarks (members only).
  const { isGuest } = useGuest();
  useEffect(() => { loadWatchlist(); }, []);
  useEffect(() => {
    if (monthKey === 'previous') { setComingSoon([]); return; }
    let cancelled = false;
    hasSession()
      .then((signedIn) => (signedIn ? apiGet<{ items?: VisualItem[] }>('/cozy/coming-soon') : null))
      .then((res) => {
        if (cancelled || !res) return;
        setComingSoon((res.items ?? []).filter((m) => !!m && typeof m.movieId === 'string' && typeof m.title === 'string'));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [monthKey]);
  const openWatchlist = () => router.push('/(tabs)/cozy/watchlist' as any);

  const handleRatingUpdate = useCallback((movieId: string, ratingSummary: RatingSummary | null) => {
    setWatchItems((prev) => prev.map((item) => item.movieId === movieId ? { ...item, ratingSummary } : item));
    setMoviePick((prev) => (prev && prev.movie.movieId === movieId ? { ...prev, movie: { ...prev.movie, ratingSummary } } : prev));
  }, []);

  const countRow = (
    <View style={styles.countRow}>
      <View style={styles.countLine} />
      {loaded && watchItems.length > 0 && (
        <Text style={[styles.countText, playroom && prStyles.eyebrow]}>{watchItems.length} {watchItems.length === 1 ? 'Title' : 'Titles'}</Text>
      )}
      <View style={styles.countLine} />
    </View>
  );

  return (
    <View style={[styles.container, playroom && prStyles.page, { paddingTop: playroom ? 0 : insets.top }]}>
      {/* PlayRoom: plum behind the status bar, pinned while the header scrolls away. */}
      {playroom && <PlayRoomStatusStrip height={insets.top} />}
      {/* Classic header and Iris note (the PlayRoom header's intro replaces the note). */}
      {!playroom && (
      <>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={[styles.backButton, playroom && prStyles.softButton]} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/cozy' as any)}>
            <CaretLeft size={20} color={playroom ? PR.heading : '#0F2A48'} weight="bold" />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerLabel, playroom && prStyles.eyebrow]}>Watch & Unwind</Text>
            <Text style={[styles.headerTitle, playroom && prStyles.heading]}>{playroom ? tileLabel('watchMe') : 'Visual Escapes'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {isGuest === false && (
            <TouchableOpacity style={[styles.backButton, playroom && prStyles.softButton]} onPress={openWatchlist} accessibilityRole="button" accessibilityLabel="My Watchlist">
              <BookmarksSimple size={20} color={playroom ? PR.heading : '#0F2A48'} weight="bold" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.irisButton, playroom && prStyles.cardBorder]} onPress={() => router.push('/iris/chat?from=cozy/media' as any)}>
            <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
          </TouchableOpacity>
        </View>
      </View>

      {/* IRIS NOTE */}
      <View style={[styles.irisNote, playroom && prStyles.card]}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={[styles.irisNoteText, playroom && prStyles.body]}>Grab your blanket and your snacks — let's get cozy.</Text>
      </View>

      </>
      )}

      {/* COUNT */}
      {!playroom && countRow}

      {/* GRID */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
        {playroom && (
          <>
            <RoomHeader
              name={tileLabel('watchMe')}
              intro={ROOM_INTROS.watchMe}
              monthKey={monthKey}
              irisFrom="cozy/media"
              style={{ marginHorizontal: -spacing.md }}
              right={isGuest === false ? (
                <TouchableOpacity style={roomHeaderButton} onPress={openWatchlist} accessibilityRole="button" accessibilityLabel="My Watchlist">
                  <BookmarksSimple size={20} color={CHAMPAGNE} weight="bold" />
                </TouchableOpacity>
              ) : undefined}
            />
            <View style={{ marginHorizontal: -spacing.md }}>{countRow}</View>
          </>
        )}
        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
          {/* PlayRoom, this month only: the reader's pick, before the grid
              (it stays in the grid too), mirroring Between the Sheets. */}
          {playroom && monthKey === 'active' && moviePick && (
            <View style={styles.pickSection}>
              <Text style={[styles.pickHeading, prStyles.heading]}>I Saw This Movie and Thought of You</Text>
              {!!moviePick.irisLine && (
                <>
                  <Text style={[styles.pickLabel, prStyles.eyebrow]}>Iris's Pick for You</Text>
                  <Text style={[styles.pickLine, prStyles.body]}>{moviePick.irisLine}</Text>
                </>
              )}
              <View style={styles.grid}>
                <WatchCard
                  item={moviePick.movie}
                  onPress={() => { setSelectedItem(moviePick.movie); setSheetOpen(true); }}
                />
              </View>
            </View>
          )}
          {watchItems.length > 0 && (
          <View style={styles.grid}>
            {watchItems.map((item, i) => (
              <WatchCard
                key={item.sk ?? `watch-${i}`}
                item={item}
                onPress={() => { setSelectedItem(item); setSheetOpen(true); }}
              />
            ))}
          </View>
          )}
          {/* COMING SOON: soonest first, date-TBA last (API order); nothing when empty. */}
          {comingSoon.length > 0 && (
            <View style={styles.comingSoonSection}>
              <Text style={[styles.pickHeading, playroom && prStyles.heading]}>Coming Soon</Text>
              <View style={styles.grid}>
                {comingSoon.map((item) => (
                  <WatchCard
                    key={`soon-${item.movieId}`}
                    item={item}
                    upcoming
                    onPress={() => { setSelectedItem(item); setSheetOpen(true); }}
                  />
                ))}
              </View>
            </View>
          )}
          </>
        )}
        <View style={{ height: spacing.xl }} />
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  gridContent: { paddingHorizontal: spacing.md },
  // Two 48% cards pushed to the edges, so left and right margins match.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  watchCard: { width: '48%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#D7E2E9', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  watchCover: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#D7E2E9', overflow: 'hidden' },
  watchCoverImage: { width: '100%', height: '100%' },
  watchCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  watchInfo: { padding: spacing.sm },
  watchCategory: { fontSize: 9, fontWeight: '700', color: '#A9C0D4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  watchTitle: { fontSize: 15, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 20, marginBottom: 4 },
  watchStatus: { fontSize: 11, fontWeight: '300', color: '#A9C0D4', marginBottom: 6 },
  watchRelease: { fontSize: 12, fontWeight: '700', color: '#0F2A48', marginBottom: 2 },
  comingSoonSection: { marginTop: spacing.xl },
  verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  verdictBadgeEmoji: { fontSize: 11 },
  verdictBadgeText: { fontSize: 10, fontWeight: '700', lineHeight: 14 },
  pickSection: { marginBottom: spacing.lg },
  pickHeading: { fontSize: 22, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', marginBottom: 12, paddingHorizontal: spacing.xs },
  pickLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: 4, paddingHorizontal: spacing.xs },
  pickLine: { fontSize: 14, fontStyle: 'italic', color: '#6A5969', lineHeight: 20, marginBottom: 12, paddingHorizontal: spacing.xs },
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
  sheetTitle: { fontSize: 22, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 26, marginBottom: 6 },
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
  verdictHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 10 },
  sheetSynopsis: { fontSize: 16, fontStyle: 'italic', color: '#0F2A48', lineHeight: 26 },
  irisNoteCard: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.lg, marginBottom: spacing.lg, padding: spacing.md, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteAvatar: { width: 32, height: 32, borderRadius: 16 },
  irisNoteContent: { flex: 1 },
  irisNoteLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: 3 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  platformButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D7E2E9', borderRadius: 12, padding: 10, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  platformLogo: { height: 24, width: 80 },
  platformName: { fontSize: 12, fontWeight: '700', color: '#0F2A48' },
  serviceItem: { alignItems: 'center', gap: 4, width: 52 },
  serviceLogoWrap: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: '#D7E2E9', alignItems: 'center', justifyContent: 'center' },
  serviceLogo: { width: 48, height: 48 },
  serviceKind: { fontSize: 9, fontWeight: '700', color: '#6A7A8C', textAlign: 'center' },
  justWatch: { fontSize: 10, color: '#6A7A8C', marginTop: 10 },
  sheetDivider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  ratingLine: { fontSize: 18, fontStyle: 'italic', color: '#0F2A48', lineHeight: 26 },
  ratingEmpty: { fontSize: 18, fontStyle: 'italic', color: '#A9C0D4' },
  userVerdictSection: { marginTop: spacing.md },
});