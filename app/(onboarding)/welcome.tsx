import { useEffect, useRef, useState } from 'react';
import { useEventListener } from 'expo';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The CTA stays hidden until 15s of the video have actually played (so
// buffering doesn't count), then fades in. Nobody gets stuck: it shows
// right away if the player errors, 30s after the play tap if playback
// stalls, and 15s after the screen opens if play is never tapped.
const REVEAL_AT_S = 15;
const NO_PLAY_FALLBACK_MS = 15_000;
const STALL_FALLBACK_MS = (REVEAL_AT_S + 15) * 1000;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hasStarted, setHasStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const noPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/Welcome.mp4',
    (p) => {
      p.loop = false;
      // Default is 0 (event disabled). Must be non-zero for timeUpdate to fire.
      p.timeUpdateEventInterval = 0.25;
    }
  );

  const reveal = () => setShowButton(true);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime >= REVEAL_AT_S) reveal();
  });
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') reveal();
  });

  // Play never tapped: show the button 15s after the screen opens.
  useEffect(() => {
    noPlayTimer.current = setTimeout(reveal, NO_PLAY_FALLBACK_MS);
    return () => {
      if (noPlayTimer.current) clearTimeout(noPlayTimer.current);
      if (stallTimer.current) clearTimeout(stallTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!showButton) return;
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [showButton, fade]);

  const handlePlay = () => {
    setHasStarted(true);
    // From here the video-time rule applies, with a stall safety net.
    if (noPlayTimer.current) clearTimeout(noPlayTimer.current);
    stallTimer.current = setTimeout(reveal, STALL_FALLBACK_MS);
    player.play();
  };

  const handleContinue = async () => {
    if (locked) return;
    setLocked(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await apiPost('/onboarding/submit', { step: 'L1Wel' });
      if (res?.nextRoute) {
        router.replace(normalizeRoute(res.nextRoute) as any);
        return;
      }
    } catch {}
    setLocked(false);
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />

      {!hasStarted && (
        <TouchableOpacity style={styles.playOverlay} onPress={handlePlay}>
          <View style={styles.playButton}>
            <View style={styles.playTriangle} />
          </View>
        </TouchableOpacity>
      )}

      {showButton && (
      <Animated.View style={[styles.buttonContainer, { bottom: insets.bottom + 8, opacity: fade }]}>
        <TouchableOpacity
          style={[styles.continueButton, locked && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={locked}
        >
          <Text style={styles.continueText}>
            {locked ? 'Entering…' : "Let's Begin"}
          </Text>
        </TouchableOpacity>
      </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  video: { flex: 1 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(240,237,228,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 18,
    borderBottomWidth: 18,
    borderLeftWidth: 30,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#B83255',
    marginLeft: 6,
  },
  buttonContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 50,
  },
  continueButton: {
    width: '100%',
    maxWidth: 320,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B83255',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  continueText: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'DancingScript_700Bold',
  },
});