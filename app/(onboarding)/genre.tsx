import { useState, useEffect } from 'react';
import { apiPost } from '../../lib/api';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../lib/theme';


const GENRES = [
  { value: 'CONTEMPORARY_ROMANCE', label: '📘 Contemporary Romance', sub: 'real world · small town · billionaire · rom-com vibes' },
  { value: 'ROMANTIC_SUSPENSE', label: '🕵️ Romantic Suspense', sub: 'bodyguards · detectives · mysteries · thrillers' },
  { value: 'FANTASY_ROMANCE', label: '🧚 Fantasy Romance', sub: 'fae · kingdoms · quests · magic' },
  { value: 'PARANORMAL_ROMANCE', label: '🧛‍♂️ Paranormal Romance', sub: 'vampires · shifters · witches' },
  { value: 'HISTORICAL_ROMANCE', label: '👑 Historical Romance', sub: 'Regency · Victorian · medieval' },
  { value: 'DARK_ROMANCE', label: '🖤 Dark Romance', sub: 'mafia · morally gray · intense' },
  { value: 'SPICY_EROTIC_ROMANCE', label: '🔥 Spicy / Erotic Romance', sub: 'high heat · explicit romance' },
];

export default function GenreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/Genre.mp4',
    (p) => {
      p.loop = false;
      p.play();
    }
  );

  useEffect(() => {
    const timer = setTimeout(() => setShowOptions(true), 39000);
    return () => clearTimeout(timer);
  }, []);

  const handleSelect = async (value: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiPost('/onboarding/submit', { step: 'L5Gen', value: [value] });
      if (res?.nextRoute) {
        router.replace(res.nextRoute as any);
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
            <Text style={styles.cardHeader}>What's your go-to genre?</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {GENRES.map((genre, i) => (
                <View key={genre.value}>
                  <TouchableOpacity
                    style={styles.optionButton}
                    onPress={() => handleSelect(genre.value)}
                    disabled={submitting}
                  >
                    <Text style={styles.optionLabel}>{genre.label}</Text>
                    <Text style={styles.optionSub}>{genre.sub}</Text>
                  </TouchableOpacity>
                  {i < GENRES.length - 1 && <View style={styles.divider} />}
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
  container: { flex: 1, backgroundColor: '#000' },
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
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  optionSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  divider: { height: 1, backgroundColor: '#f3f4f6' },
});