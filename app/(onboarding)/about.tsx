import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing } from '../../lib/theme';

const REVEAL_AT_S = 38;

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showButton, setShowButton] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pressed, setPressed] = useState(false);

  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/About.mp4',
    (p) => {
      p.loop = false;
      p.play();
    }
  );

  useEffect(() => {
    const interval = setInterval(() => {
      if (player.currentTime >= REVEAL_AT_S) {
        setShowButton(true);
        clearInterval(interval);
      }
    }, 200);

    // Safety net: force reveal after the video would have ended even if
    // expo-video never advances currentTime (network/load failure).
    const safetyMs = (REVEAL_AT_S + 10) * 1000;
    const safetyTimer = setTimeout(() => {
      setShowButton(true);
      clearInterval(interval);
    }, safetyMs);

    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimer);
    };
  }, [player]);

  const handleStart = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiPost('/onboarding/submit', { step: 'L9Com', value: 'ACK' });
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

      {showButton && (
        <View style={[styles.buttonContainer, { bottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[styles.button, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}
            onPress={handleStart}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            disabled={submitting}
          >
            <Text style={[styles.buttonText, pressed && styles.buttonTextPressed]}>
              {submitting ? 'Entering…' : 'Start Exploring'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  video: { ...StyleSheet.absoluteFillObject },
  buttonContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 30,
  },
  button: {
    width: '100%',
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    backgroundColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonPressed: { backgroundColor: '#fff' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontSize: 24,
    color: '#fff',
    letterSpacing: 0.5,
    fontFamily: 'DancingScript_700Bold',
  },
  buttonTextPressed: { color: '#B83255' },
});