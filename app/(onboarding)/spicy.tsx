import { useState, useEffect } from 'react';
import { useEvent } from 'expo';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../lib/theme';

const REVEAL_AT_S = 22;

const SPICE_LEVELS = [
  { value: 'NONE', label: '🫖 Clean & cozy' },
  { value: 'LIGHT', label: '😇 Keep it cute' },
  { value: 'WARM', label: '🍹 A little kick' },
  { value: 'HOT', label: '🥂 We\'re day drinking' },
  { value: 'VERY_HOT', label: '🥵 Absolutely unhinged' },
];

export default function SpicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/Spicy.mp4',
    (p) => {
      p.loop = false;
      // Default is 0 (event disabled). Must be non-zero for timeUpdate to fire.
      p.timeUpdateEventInterval = 0.25;
      p.play();
    }
  );

  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: 0, bufferedPosition: 0 });

  useEffect(() => {
    if (currentTime >= REVEAL_AT_S) {
      setShowOptions(true);
    }
  }, [currentTime]);

  // Safety net: if the video fails to load entirely (network error),
  // reveal after a generous wall-clock fallback so the user can still
  // proceed. Only fires if currentTime never advances.
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setShowOptions(true);
    }, (REVEAL_AT_S + 15) * 1000);
    return () => clearTimeout(safetyTimer);
  }, []);

  const handleSelect = async (value: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiPost('/onboarding/submit', { step: 'L8Spi', value });
      if (res?.nextRoute) {
        router.replace(normalizeRoute(res.nextRoute) as any);
        return;
      }
    } catch {}
    setSubmitting(false);
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />

      {showOptions && (
        <View style={[styles.optionsContainer, { top: insets.top + spacing.lg }]}>
          <View style={styles.card}>
            <Text style={styles.cardHeader}>How spicy do you like your books?</Text>
            {SPICE_LEVELS.map((spice, i) => (
              <View key={spice.value}>
                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => handleSelect(spice.value)}
                  disabled={submitting}
                >
                  <Text style={styles.optionText}>{spice.label}</Text>
                </TouchableOpacity>
                {i < SPICE_LEVELS.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  video: { ...StyleSheet.absoluteFillObject },
  optionsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: 230,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  cardHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    fontSize: 11,
    fontWeight: '700',
    color: '#f43f5e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  optionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  divider: { height: 1, backgroundColor: '#f3f4f6' },
});