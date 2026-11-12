import { TouchableOpacity, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { BookmarkSimple } from '../icons';
import { setWatchlistSaved, useWatchlistIds } from '../../lib/watchlist';
import { useGuest } from '../../lib/useGuest';

// Save / unsave a title to the member's watchlist. `overlay` is the round
// button on a card's cover; `pill` is the labeled button in the movie sheet.
// Guests are sent to sign up instead (members only). `beforeGate` runs first,
// so a sheet can close before the sign-in screen opens over it.
export default function WatchlistButton({
  movieId,
  title,
  variant = 'overlay',
  beforeGate,
  style,
}: {
  movieId: string;
  title: string;
  variant?: 'overlay' | 'pill';
  beforeGate?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const ids = useWatchlistIds();
  const { isGuest, requireAccount } = useGuest();
  const saved = ids.has(movieId);

  const onPress = () => {
    if (isGuest) {
      beforeGate?.();
      requireAccount('library', { source: 'library' });
      return;
    }
    setWatchlistSaved(movieId, !saved);
  };

  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityState: { selected: saved },
    accessibilityLabel: saved ? `Remove ${title} from your watchlist` : `Save ${title} to your watchlist`,
  };

  if (variant === 'pill') {
    return (
      <TouchableOpacity style={[styles.pill, saved && styles.pillSaved, style]} onPress={onPress} {...a11y}>
        <BookmarkSimple size={16} color={saved ? '#FFFFFF' : '#0F2A48'} weight={saved ? 'fill' : 'bold'} />
        <Text style={[styles.pillText, saved && styles.pillTextSaved]}>{saved ? 'On your watchlist' : 'Save to watchlist'}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.overlay, style]}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      {...a11y}
    >
      <BookmarkSimple size={18} color="#FFFFFF" weight={saved ? 'fill' : 'bold'} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Dark glass circle so the white icon reads on any poster.
  overlay: {
    position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,10,20,0.45)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.6)',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(15,42,72,0.25)', backgroundColor: '#FFFFFF',
  },
  pillSaved: { backgroundColor: '#B83255', borderColor: '#B83255' },
  pillText: { fontSize: 12, fontWeight: '700', color: '#0F2A48' },
  pillTextSaved: { color: '#FFFFFF' },
});
