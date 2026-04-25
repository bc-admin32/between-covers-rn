import { useState } from 'react';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hasStarted, setHasStarted] = useState(false);
  const [locked, setLocked] = useState(false);

  // TODO: upload final v2 video to S3 before launch; owner will provide HeyGen-produced files
  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/v2/Welcome.mp4',
    (p) => { p.loop = false; }
  );

  const handlePlay = () => {
    setHasStarted(true);
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

      <View style={[styles.buttonContainer, { bottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.continueButton, locked && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={locked}
        >
          <Text style={styles.continueText}>
            {locked ? 'Entering…' : 'Step Inside'}
          </Text>
        </TouchableOpacity>
      </View>
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