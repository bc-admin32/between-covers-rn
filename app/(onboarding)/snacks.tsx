import { useState, useEffect } from 'react';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../lib/theme';

const REVEAL_AT_S = 33;

const SNACKS = [
  { value: 'POPCORN', label: '🍿 Popcorn' },
  { value: 'CHOCOLATE', label: '🍫 Chocolate' },
  { value: 'CHIPS', label: '🥨 Pretzel / Chips' },
  { value: 'FRUIT', label: '🍇 Fruit' },
  { value: 'CANDY', label: '🍬 Candy' },
  { value: 'PASTRY', label: '🍪 Cookies / Pastry' },
  { value: 'NONE', label: '✨ No Snack' },
];

const MIN = 1;

export default function SnacksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string[]>([]);
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
    const interval = setInterval(() => {
      if (player.currentTime >= REVEAL_AT_S) {
        setShowOptions(true);
        clearInterval(interval);
      }
    }, 200);

    // Safety net: force reveal after the video would have ended even if
    // expo-video never advances currentTime (network/load failure).
    const safetyMs = (REVEAL_AT_S + 10) * 1000;
    const safetyTimer = setTimeout(() => {
      setShowOptions(true);
      clearInterval(interval);
    }, safetyMs);

    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimer);
    };
  }, [player]);

  const toggle = (value: string) => {
    if (submitting) return;
    setSelected((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      return [...prev, value];
    });
  };

  const handleSubmit = async () => {
    if (submitting || selected.length < MIN) return;
    setSubmitting(true);
    try {
      const res = await apiPost('/onboarding/submit', { step: 'L7Sna', value: selected });
      if (res?.nextRoute) {
        router.replace(normalizeRoute(res.nextRoute) as any);
        return;
      }
    } catch {}
    setSubmitting(false);
  };

  const canSubmit = selected.length >= MIN;

  const hintText =
    selected.length === 0
      ? 'Pick at least 1'
      : `${selected.length} selected`;

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
            <Text style={styles.cardHint}>{hintText}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
              {SNACKS.map((snack, i) => {
                const isSelected = selected.includes(snack.value);
                return (
                  <View key={snack.value}>
                    <TouchableOpacity
                      style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                      onPress={() => toggle(snack.value)}
                      disabled={submitting}
                    >
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {snack.label}
                      </Text>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                    {i < SNACKS.length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.divider} />
            <TouchableOpacity
              style={[styles.nextButton, !canSubmit && styles.nextButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              <Text style={[styles.nextButtonText, !canSubmit && styles.nextButtonTextDisabled]}>
                {submitting ? 'Saving…' : 'Next →'}
              </Text>
            </TouchableOpacity>
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
    width: 210,
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
    paddingBottom: 2,
    fontSize: 11,
    fontWeight: '700',
    color: '#f43f5e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardHint: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
  },
  list: {
    maxHeight: 280,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionButtonSelected: {
    backgroundColor: 'rgba(184,50,85,0.07)',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  optionTextSelected: {
    color: '#B83255',
    fontWeight: '700',
  },
  checkmark: {
    fontSize: 12,
    color: '#B83255',
    fontWeight: '700',
    marginLeft: 4,
  },
  divider: { height: 1, backgroundColor: '#f3f4f6' },
  nextButton: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#B83255',
  },
  nextButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  nextButtonTextDisabled: {
    color: '#9ca3af',
  },
});
