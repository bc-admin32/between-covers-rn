import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CaretLeft, HeartStraight } from '../icons';
import { IRIS_AVATAR } from '../../lib/irisAvatar';
import { monthNameFromLabel, useMonthTheme } from '../../lib/cozyLayout';
import { spacing } from '../../lib/theme';
import { WINE, CHAMPAGNE, ROSE_GOLD, CARD_BORDER, FONT_CAPS, FONT_SCRIPT, FONT_THEME, FONT_BODY } from './playroomStyle';

// The PlayRoom rooms' shared header (PlayRoom months only): a plum band with
// back and Iris, the brand line, the room name, the month and theme, and the
// room's intro, ending in the champagne divider with the small heart. It
// scrolls with the page; each room pins a plum strip behind the status bar
// (PlayRoomStatusStrip) so the light status-bar icons stay on plum.

// One intro per room, the same every month.
export const ROOM_INTROS = {
  betweenTheSheets: 'Every great affair begins with the right book.',
  watchMe: 'Some stories deserve your undivided attention.',
  aftercare: 'A little indulgence looks good on you.',
  talkDirtyToMe: 'Meet the minds behind your favorite obsessions.',
  keepMeGuessing: 'Some secrets are too good to keep.',
  newbies: 'New stories. New obsessions. Same late nights.',
} as const;

export function PlayRoomStatusStrip({ height }: { height: number }) {
  return <View style={{ height, backgroundColor: WINE }} />;
}

export default function RoomHeader({
  name,
  intro,
  monthKey = 'active',
  irisFrom,
  right,
  style,
}: {
  name: string;
  intro: string;
  // Which month's name and theme to show (last month's rooms say so).
  monthKey?: 'active' | 'previous';
  // Where Iris's chat was opened from, for her greeting (e.g. 'cozy/books').
  irisFrom: string;
  // An extra button left of Iris (Between the Sheets' catalog filter).
  right?: ReactNode;
  // Lets a page cancel its scroll padding so the band runs edge to edge.
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const month = useMonthTheme(monthKey);
  const themeLine = [monthNameFromLabel(month?.monthLabel), month?.themeTitle].filter(Boolean).join(' · ');

  return (
    <View style={[styles.band, style]}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.round}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/cozy' as any))}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <CaretLeft size={20} color={CHAMPAGNE} weight="bold" />
        </TouchableOpacity>
        <View style={styles.topRight}>
          {right}
          <TouchableOpacity
            style={styles.irisRing}
            hitSlop={4}
            onPress={() => router.push(`/iris/chat?from=${irisFrom}` as any)}
            accessibilityRole="button"
            accessibilityLabel="Chat with Iris"
          >
            <Image source={{ uri: IRIS_AVATAR }} style={styles.iris} contentFit="cover" cachePolicy="memory-disk" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.brand}>Between Covers · The PlayRoom</Text>
      <Text style={styles.name} accessibilityRole="header" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
        {name}
      </Text>
      {!!themeLine && <Text style={styles.theme}>{themeLine}</Text>}
      <Text style={styles.intro}>{intro}</Text>

      <View style={styles.divider} accessible={false}>
        <View style={styles.dividerLine} />
        <HeartStraight size={10} color={CHAMPAGNE} weight="regular" />
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

// Round header buttons (back, and the filter a room passes in `right`).
export const roomHeaderButton: ViewStyle = {
  width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  borderWidth: 1, borderColor: CARD_BORDER,
};

const styles = StyleSheet.create({
  band: { backgroundColor: WINE, alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.md, marginBottom: spacing.md },
  topRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: roomHeaderButton,
  irisRing: { width: 44, height: 44, borderRadius: 22, padding: 2, borderWidth: 1.5, borderColor: ROSE_GOLD },
  iris: { width: '100%', height: '100%', borderRadius: 20 },
  // Champagne on the plum is 13.9:1; rose gold 8.2:1.
  brand: { fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: ROSE_GOLD, fontFamily: FONT_CAPS, marginTop: 2 },
  // Great Vibes swashes reach past the glyph box; the padding stops Android clipping them.
  name: { fontSize: 40, lineHeight: 56, color: CHAMPAGNE, fontFamily: FONT_SCRIPT, textAlign: 'center', paddingHorizontal: 12 },
  theme: { fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: CHAMPAGNE, fontFamily: FONT_BODY, textAlign: 'center' },
  intro: { fontSize: 16, lineHeight: 22, color: CHAMPAGNE, fontFamily: FONT_THEME, textAlign: 'center', marginTop: 6, paddingHorizontal: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '60%', marginTop: spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: CHAMPAGNE, opacity: 0.8 },
});
