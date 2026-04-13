import { useState, useEffect } from 'react';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../lib/theme';



const SNACKS = [
  { value: 'POPCORN', label: '🍿 Popcorn' },
  { value: 'CHOCOLATE', label: '🍫 Chocolate' },
  { value: 'CHIPS', label: '🥨 Pretzel / Chips' },
  { value: 'FRUIT', label: '🍇 Fruit' },
  { value: 'CANDY', label: '🍬 Candy' },
  { value: 'PASTRY', label: '🍪 Cookies / Pastry' },
  { value: 'NONE', label: '✨ No Snack' },
];

export default function SnacksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/Snacks.mp4',
    (p) => {
      p.loop = false;
      p.play();
    }
  );

  useEffect(() => {
    const timer = setTimeout(() => setShowOptions(true), 29000);
    return () => clearTimeout(timer);
  }, []);

  const handleSelect = async (value: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiPost('/onboarding/submit', { step: 'L7Sna', value });
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
            <Text style={styles.cardHeader}>What are we munching on?</Text>
            {SNACKS.map((snack, i) => (
              <View key={snack.value}>
                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => handleSelect(snack.value)}
                  disabled={submitting}
                >
                  <Text style={styles.optionText}>{snack.label}</Text>
                </TouchableOpacity>
                {i < SNACKS.length - 1 && <View style={styles.divider} />}
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
    width: 160,
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