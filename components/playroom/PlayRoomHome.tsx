import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, HeartStraight } from '../icons';
import { spacing } from '../../lib/theme';
import { track } from '../../lib/analytics';
import { resolveTiles, newbiesLabel, monthNameFromLabel, type TileKey } from '../../lib/cozyLayout';
import { monthEvents } from '../../lib/cozyEvents';
import EventCard from './EventCard';
import { PLAYROOM_TILES, TILE_IMAGE_BASE } from './tiles';
import {
  PLAYROOM_BACKGROUND_URL, IRIS_PLAYROOM_URL, IRIS_AVATAR_URL, WINE, CHAMPAGNE, ROSE_GOLD, GOLD,
  TILE_FILL, CARD_BORDER, FONT_SCRIPT, FONT_CAPS, FONT_THEME, FONT_TILE, FONT_BODY,
} from './playroomStyle';

// The PlayRoom: the Cozy tab's page in "playroom" months. It shows the month
// from /cozy/home (active, or previous for the archive). The tiles open the
// existing Cozy pages, titled with the tile's name.

type AnyItem = { category?: string };

export type PlayRoomMonth = {
  weekId?: string;
  monthLabel?: string;
  theme?: { title?: string; tagline?: string } | null;
  tiles?: unknown;
  sections?: {
    spotlight?: { book?: unknown } | null;
    bookOfMonth?: unknown;
    books?: unknown[];
    visual?: AnyItem[];
    events?: unknown[];
    enhancements?: unknown[];
    ENHANCEMENTS?: unknown[];
    LIFESTYLE?: unknown[];
    lifestyle?: unknown[];
    items?: unknown[];
    authorSpotlight?: unknown;
  } | null;
};

const TILE_GAP = 12;
const SIDE = spacing.md;
// Tile photo: 42% of the card's width, at the photos' 720 x 500 shape.
const PHOTO_SHARE = 0.42;
const PHOTO_RATIO = 720 / 500;

// Same lookup the classic Cozy page uses for Cozy Extras.
function lifestyleCount(s: NonNullable<PlayRoomMonth['sections']>): number {
  const lists = [s.LIFESTYLE, s.lifestyle, s.enhancements, s.ENHANCEMENTS, s.items].filter(Array.isArray) as unknown[][];
  return lists.reduce((best, cur) => Math.max(best, cur.length), 0);
}

// "2026-10" from "week-2026-10-01".
function monthFromWeekId(weekId?: string): string | null {
  const m = /(\d{4}-\d{2})-\d{2}$/.exec(weekId ?? '');
  return m ? m[1] : null;
}

// Set once the PlayRoom portrait of Iris fails to load, so later visits go
// straight to the avatar. Resets on the next app launch, which picks up a
// newly uploaded portrait.
let irisPortraitMissing = false;
// Tile photos that failed to load this launch (same idea, per tile).
const tilePhotosMissing = new Set<TileKey>();

export default function PlayRoomHome({ month, offShelfCount = 0, isArchive = false }: {
  month: PlayRoomMonth | null;
  // Books in Keep Me Guessing (Off The Shelf) — 0 when it's switched off.
  offShelfCount?: number;
  // Last month, opened from "← Last Month".
  isArchive?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = width - SIDE * 2;
  const photoWidth = Math.round(cardWidth * PHOTO_SHARE);
  const tileHeight = Math.round(photoWidth / PHOTO_RATIO);
  // Until the background is uploaded (or if it fails to load), the page is WINE.
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [irisPortraitFailed, setIrisPortraitFailed] = useState(irisPortraitMissing);
  const onIrisPortraitError = () => {
    irisPortraitMissing = true;
    setIrisPortraitFailed(true);
  };
  const [failedTilePhotos, setFailedTilePhotos] = useState<ReadonlySet<TileKey>>(() => new Set(tilePhotosMissing));
  const onTilePhotoError = (key: TileKey) => {
    tilePhotosMissing.add(key);
    setFailedTilePhotos(new Set(tilePhotosMissing));
  };

  const sections = month?.sections ?? {};
  const tiles = resolveTiles(month?.tiles);
  const monthKey = isArchive ? 'previous' : 'active';
  const events = monthEvents(sections);
  const monthName = monthNameFromLabel(month?.monthLabel);
  const label = (key: TileKey, fallback: string) => (key === 'newbies' ? newbiesLabel(month?.monthLabel) : fallback);

  // A switched-on tile with nothing behind it is hidden. Pillow Talk is this
  // week's Lounge and Keep Me Guessing isn't monthly, so last month leaves
  // them out.
  const hasContent: Record<TileKey, boolean> = {
    betweenTheSheets:
      !!sections.bookOfMonth || (sections.books?.length ?? 0) > 0 || !!sections.spotlight?.book
      || (!isArchive && offShelfCount > 0),
    watchMe: (sections.visual ?? []).some((v) => v?.category?.toLowerCase() !== 'event'),
    aftercare: lifestyleCount(sections) > 0 || events.length > 0,
    talkDirtyToMe: !!sections.authorSpotlight,
    pillowTalk: !isArchive,
    newbies: true,
  };

  const visibleTiles = PLAYROOM_TILES.filter((t) => tiles[t.key] && hasContent[t.key]);

  const openTile = (key: TileKey, tileLabel: string) => {
    track('playroom_tile_opened', { tile: key });
    const title = encodeURIComponent(tileLabel);
    switch (key) {
      case 'betweenTheSheets':
        router.push(`/(tabs)/cozy/books?playroom=1&month=${monthKey}&title=${title}` as any); return;
      case 'watchMe':
        router.push(`/(tabs)/cozy/media?month=${monthKey}&title=${title}` as any); return;
      case 'aftercare':
        router.push(`/(tabs)/cozy/items?playroom=1&month=${monthKey}&title=${title}` as any); return;
      case 'talkDirtyToMe':
        router.push(`/(tabs)/cozy/author?weekId=${encodeURIComponent(month?.weekId ?? '')}&month=${monthKey}&title=${title}` as any); return;
      case 'pillowTalk':
        router.navigate('/(tabs)/lounge' as any); return;
      case 'newbies': {
        const m = isArchive ? monthFromWeekId(month?.weekId) : null;
        router.push(`/(tabs)/cozy/new-releases?title=${title}${m ? `&month=${m}` : ''}` as any); return;
      }
    }
  };

  return (
    <View style={styles.container}>
      {!backgroundFailed && (
        <Image
          source={{ uri: PLAYROOM_BACKGROUND_URL }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={250}
          onError={() => setBackgroundFailed(true)}
          accessible={false}
        />
      )}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
      >

        {/* HEADER */}
        <View style={styles.header}>
          {isArchive ? (
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
              <CaretLeft size={20} color={CHAMPAGNE} weight="bold" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.archiveButton} onPress={() => router.push('/(tabs)/cozy/archive' as any)}>
              <Text style={styles.archiveButtonText}>← Last Month</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.brand}>Between Covers</Text>
          <View style={styles.divider} accessible={false}>
            <View style={styles.dividerLine} />
            <HeartStraight size={10} color={ROSE_GOLD} weight="regular" />
            <View style={styles.dividerLine} />
          </View>
          <Text style={styles.heading} accessibilityRole="header">The PlayRoom</Text>
          {isArchive && <Text style={styles.archiveLabel}>Last Month</Text>}
        </View>

        {!month ? (
          <Text style={styles.empty}>{isArchive ? 'No previous month available yet.' : 'Nothing here yet — check back soon.'}</Text>
        ) : (
          <>
            {/* IRIS + THEME BANNER */}
            {!!month.theme?.title && (
              <View style={styles.themeRow}>
                {!irisPortraitFailed ? (
                  // Kept in memory only (not on disk), so a replaced
                  // iris.png shows up on the next app launch.
                  <Image
                    source={{ uri: IRIS_PLAYROOM_URL }}
                    style={styles.irisPortrait}
                    contentFit="contain"
                    cachePolicy="memory"
                    onError={onIrisPortraitError}
                    accessibilityLabel="Iris"
                  />
                ) : (
                  <View style={styles.irisRing}>
                    <Image
                      source={{ uri: IRIS_AVATAR_URL }}
                      style={styles.irisImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      accessibilityLabel="Iris"
                    />
                  </View>
                )}
                {/* No frame: a thin gold line above and below the theme. */}
                <View style={styles.themeBlock}>
                  <View style={styles.themeLine} accessible={false} />
                  <View style={styles.themeText}>
                    {!!monthName && <Text style={styles.themeMonth}>{monthName}</Text>}
                    <Text style={styles.themeTitle}>{month.theme.title}</Text>
                    {!!month.theme.tagline && <Text style={styles.themeTagline}>{month.theme.tagline}</Text>}
                  </View>
                  <View style={styles.themeLine} accessible={false} />
                </View>
              </View>
            )}

            {/* EVENTS — this month only; last month's are on its Self Care page */}
            {!isArchive && events.map((e, i) => (
              <EventCard key={e.eventId ?? e.sk ?? `${e.title}-${i}`} event={e} variant="playroom" />
            ))}

            {/* TILES — one wide card per row: photo left, icon + title + description right */}
            <View style={styles.tileList}>
              {visibleTiles.map((t) => {
                const tileLabel = label(t.key, t.label);
                const TileIcon = t.icon;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tile, { height: tileHeight }]}
                    activeOpacity={0.85}
                    onPress={() => openTile(t.key, tileLabel)}
                    accessibilityRole="button"
                    accessibilityLabel={tileLabel}
                    accessibilityHint={t.description}
                  >
                    <View style={[styles.tilePhoto, { width: photoWidth, backgroundColor: t.placeholder }]}>
                      {!failedTilePhotos.has(t.key) && (
                        // Kept in memory only, so a replaced photo shows up
                        // on the next app launch.
                        <Image
                          source={{ uri: TILE_IMAGE_BASE + t.file }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          cachePolicy="memory"
                          transition={200}
                          onError={() => onTilePhotoError(t.key)}
                          accessible={false}
                        />
                      )}
                    </View>
                    <View style={styles.tileText}>
                      <TileIcon size={20} color={ROSE_GOLD} weight="light" />
                      <Text style={styles.tileTitle} numberOfLines={2}>{tileLabel}</Text>
                      <Text style={styles.tileDescription} numberOfLines={1}>{t.description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// Text over the background photo gets a soft shadow so it stays readable.
const shadow = { textShadowColor: 'rgba(20,4,10,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 } as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WINE },
  scrollContent: { paddingBottom: spacing.xl },

  header: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.md, paddingHorizontal: SIDE },
  backButton: { alignSelf: 'flex-start', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: 'rgba(58,10,26,0.5)' },
  archiveButton: { alignSelf: 'flex-end', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: 'rgba(58,10,26,0.4)' },
  archiveButtonText: { fontSize: 13, letterSpacing: 1, color: CHAMPAGNE, fontFamily: FONT_CAPS },
  brand: { ...shadow, fontSize: 13, letterSpacing: 5, textTransform: 'uppercase', color: ROSE_GOLD, fontFamily: FONT_CAPS, marginTop: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '70%', marginTop: 6 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: ROSE_GOLD, opacity: 0.8 },
  // Script swashes reach past the glyph box; the padding stops Android clipping them.
  heading: { ...shadow, fontSize: 56, lineHeight: 76, color: CHAMPAGNE, fontFamily: FONT_SCRIPT, textAlign: 'center', paddingHorizontal: 16 },
  archiveLabel: { ...shadow, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase', color: ROSE_GOLD, fontFamily: FONT_CAPS },

  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SIDE, marginBottom: spacing.lg },
  irisPortrait: { width: 120, height: 160 },
  irisRing: { width: 92, height: 92, borderRadius: 46, padding: 3, borderWidth: 1.5, borderColor: ROSE_GOLD },
  irisImage: { width: '100%', height: '100%', borderRadius: 43 },
  themeBlock: { flex: 1 },
  themeLine: { height: StyleSheet.hairlineWidth * 2, backgroundColor: GOLD, opacity: 0.9 },
  themeText: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  themeMonth: { ...shadow, fontSize: 12, letterSpacing: 5, textTransform: 'uppercase', color: CHAMPAGNE, fontFamily: FONT_BODY },
  themeTitle: { ...shadow, fontSize: 35, lineHeight: 41, color: CHAMPAGNE, fontFamily: FONT_THEME, textAlign: 'center', marginTop: 2 },
  themeTagline: { ...shadow, fontSize: 12, lineHeight: 17, letterSpacing: 1, textTransform: 'uppercase', color: CHAMPAGNE, fontFamily: FONT_BODY, textAlign: 'center', marginTop: 4 },

  tileList: { paddingHorizontal: SIDE, gap: TILE_GAP, marginTop: spacing.sm },
  tile: { flexDirection: 'row', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: TILE_FILL },
  tilePhoto: { height: '100%', overflow: 'hidden' },
  tileText: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, gap: 4 },
  tileTitle: { fontSize: 22, lineHeight: 25, color: CHAMPAGNE, fontFamily: FONT_TILE, textAlign: 'center' },
  tileDescription: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: CHAMPAGNE, fontFamily: FONT_BODY, textAlign: 'center', opacity: 0.9 },

  empty: { ...shadow, textAlign: 'center', color: CHAMPAGNE, fontFamily: 'Nunito_400Regular', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
