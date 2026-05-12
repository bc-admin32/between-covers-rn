import { useState, useEffect } from 'react';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../lib/theme';



const LOCATIONS = [
  { value: 'SOFA', label: '🛋️ Curled up on the sofa with a blanket' },
  { value: 'FIREPLACE', label: '🔥 Reading by a cozy fireplace' },
  { value: 'BED', label: '🛏️ Snuggled in bed with soft lighting' },
  { value: 'OUTSIDE', label: '🌅 Relaxing outside on a warm summer evening' },
  { value: 'BEACH', label: '🏖️ Reading by the ocean on a sunny day' },
  { value: 'NOOK', label: '✨ Tucked into a cozy reading nook with fairy lights' },
  { value: 'CAFE', label: '☕ Sipping a latte at a cute local café' },
];

export default function LocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/Scene2.mp4',
    (p) => {
      p.loop = false;
      p.play();
    }
  );

  useEffect(() => {
    let wasPlaying = false;
    const sub = player.addListener('playingChange', ({ isPlaying }: { isPlaying: boolean }) => {
      if (wasPlaying && !isPlaying) setShowOptions(true);
      wasPlaying = isPlaying;
    });
    // Fallback in case the event never fires (e.g. load failure)
    const fallback = setTimeout(() => setShowOptions(true), 30000);
    return () => { sub.remove(); clearTimeout(fallback); };
  }, [player]);

  const handleSelect = async (value: string) => {
    if (submitting) return;
    setSubmitting(true);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const res = await apiPost('/onboarding/submit', {
        step: 'L4Loc',
        value,
        timeZone,
      });
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
            <Text style={styles.cardHeader}>Where do you feel most at peace?</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {LOCATIONS.map((loc, i) => (
                <View key={loc.value}>
                  <TouchableOpacity
                    style={styles.optionButton}
                    onPress={() => handleSelect(loc.value)}
                    disabled={submitting}
                  >
                    <Text style={styles.optionText}>{loc.label}</Text>
                  </TouchableOpacity>
                  {i < LOCATIONS.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </ScrollView>
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
    width: '100%',
    maxWidth: 350,
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