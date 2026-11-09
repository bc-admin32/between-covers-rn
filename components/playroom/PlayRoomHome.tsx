import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft } from '../icons';
import { spacing } from '../../lib/theme';
import { track } from '../../lib/analytics';
import { resolveTiles, newbiesLabel, type TileKey } from '../../lib/cozyLayout';
import { monthEvents } from '../../lib/cozyEvents';
import EventCard from './EventCard';
import { PLAYROOM_TILES } from './tiles';

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
  const tileWidth = Math.floor((width - SIDE * 2 - TILE_GAP) / 2);

  const sections = month?.sections ?? {};
  const tiles = resolveTiles(month?.tiles);
  const monthKey = isArchive ? 'previous' : 'active';
  const events = monthEvents(sections);
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          {isArchive ? (
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
              <CaretLeft size={20} color="#FDF0F4" weight="bold" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.archiveButton} onPress={() => router.push('/(tabs)/cozy/archive' as any)}>
              <Text style={styles.archiveButtonText}>← Last Month</Text>
            </TouchableOpacity>
          )}
          {isArchive && !!month?.monthLabel && <Text style={styles.eyebrow}>{month.monthLabel}</Text>}
          <Text style={styles.heading} accessibilityRole="header">The PlayRoom</Text>
        </View>

        {!month ? (
          <Text style={styles.empty}>{isArchive ? 'No previous month available yet.' : 'Nothing here yet — check back soon.'}</Text>
        ) : (
          <>
            {/* THEME */}
            {!!month.theme?.title && (
              <View style={styles.theme}>
                <Text style={styles.themeLabel}>{isArchive ? "last month's theme" : "this month's theme"}</Text>
                <Text style={styles.themeTitle}>{month.theme.title}</Text>
                {!!month.theme.tagline && <Text style={styles.tagline}>{month.theme.tagline}</Text>}
              </View>
            )}

            {/* EVENTS — this month only; last month's are on its Aftercare page */}
            {!isArchive && events.map((e, i) => (
              <EventCard key={e.eventId ?? e.sk ?? `${e.title}-${i}`} event={e} />
            ))}

            {/* TILES — three rows of two */}
            <View style={styles.grid}>
              {visibleTiles.map((t) => {
                const tileLabel = label(t.key, t.label);
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tile, { width: tileWidth, height: tileWidth, backgroundColor: t.placeholder }]}
                    activeOpacity={0.85}
                    onPress={() => openTile(t.key, tileLabel)}
                    accessibilityRole="button"
                    accessibilityLabel={tileLabel}
                  >
                    {t.image && <Image source={t.image} style={StyleSheet.absoluteFill} contentFit="cover" />}
                    <View style={styles.tileLabelBand}>
                      <Text style={styles.tileLabel} numberOfLines={2}>{tileLabel}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E0F17' },
  scrollContent: { paddingBottom: spacing.xl },
  header: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.md, paddingHorizontal: SIDE },
  backButton: { alignSelf: 'flex-start', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(253,240,244,0.12)' },
  archiveButton: { alignSelf: 'flex-end', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(232,180,195,0.5)' },
  archiveButtonText: { fontSize: 12, color: '#E8B4C3', fontFamily: 'Nunito_700Bold' },
  eyebrow: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#E8B4C3', fontFamily: 'Nunito_700Bold', marginTop: spacing.sm },
  heading: { fontSize: 46, lineHeight: 52, color: '#FDF0F4', fontFamily: 'Cormorant_700Bold_Italic', marginTop: spacing.sm, textAlign: 'center' },
  theme: { alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  themeLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#E8B4C3', fontFamily: 'Nunito_700Bold' },
  themeTitle: { fontSize: 30, lineHeight: 34, color: '#FDF0F4', fontFamily: 'Cormorant_700Bold_Italic', textAlign: 'center', marginTop: 6 },
  tagline: { fontSize: 15, lineHeight: 21, color: 'rgba(253,240,244,0.8)', fontFamily: 'Nunito_400Regular_Italic', textAlign: 'center', marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: SIDE, rowGap: TILE_GAP, marginTop: spacing.sm },
  tile: { borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
  tileLabelBand: { backgroundColor: 'rgba(20,8,14,0.55)', paddingHorizontal: 12, paddingVertical: 10 },
  tileLabel: { fontSize: 18, lineHeight: 21, color: '#FDF0F4', fontFamily: 'Cormorant_700Bold_Italic' },
  empty: { textAlign: 'center', color: 'rgba(253,240,244,0.8)', fontFamily: 'Nunito_400Regular', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
