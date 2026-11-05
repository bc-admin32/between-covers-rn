import { useEffect, useRef } from 'react';
import {
  View, Text, Image, Pressable, Animated, Easing, StyleSheet, ScrollView, Linking, AccessibilityInfo,
} from 'react-native';
import { spacing } from '../../lib/theme';
import type { VoiceErrorKind, VoicePhase } from './useIrisVoiceLoop';

const CIRCLE = 168;

const A11Y_LABELS: Record<VoicePhase, string> = {
  idle: 'Iris voice chat',
  listening: 'Iris is listening',
  thinking: 'Iris is thinking',
  speaking: 'Iris is speaking. Double-tap to interrupt.',
};

const ERROR_TEXT: Record<VoiceErrorKind, string> = {
  mic: 'Iris needs microphone access for voice chat.',
  offline: 'No connection — check your internet and try again.',
  failed: 'Iris stepped away for a moment — try again?',
};

type Props = {
  avatarUri: string;
  phase: VoicePhase;
  level: Animated.Value; // 0–1, Iris's playback level
  replyText: string | null; // shown when a reply came back without audio
  error: VoiceErrorKind | null;
  onPressCircle: () => void;
};

// State is shown only by the circle: still while listening, a slow soft
// breathing glow while thinking, and a glow that follows Iris's voice while
// she speaks. No status words on screen; screen readers get labels instead.
export default function IrisVoiceView({ avatarUri, phase, level, replyText, error, onPressCircle }: Props) {
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== 'thinking') {
      breath.stopAnimation();
      breath.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase, breath]);

  // Announce only when a screen reader is on: the native announce call is a
  // suspect in the iOS 1.7.0 crash on mic tap, so most users never make it.
  const screenReaderOnRef = useRef(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => { if (mounted) screenReaderOnRef.current = on; })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
      screenReaderOnRef.current = on;
    });
    return () => { mounted = false; sub.remove(); };
  }, []);

  // Iris is speaking over the screen reader during playback, so only
  // announce the quiet states.
  useEffect(() => {
    if (!screenReaderOnRef.current) return;
    if (phase === 'listening' || phase === 'thinking') {
      AccessibilityInfo.announceForAccessibility(A11Y_LABELS[phase]);
    }
  }, [phase]);

  const speakingGlow = {
    opacity: level.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.8], extrapolate: 'clamp' }),
    transform: [{ scale: level.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.4], extrapolate: 'clamp' }) }],
  };
  const thinkingGlow = {
    opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.35] }),
    transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.14] }) }],
  };

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        {phase === 'speaking' && <Animated.View pointerEvents="none" style={[styles.glow, speakingGlow]} />}
        {phase === 'thinking' && <Animated.View pointerEvents="none" style={[styles.glow, thinkingGlow]} />}
        <Pressable
          onPress={onPressCircle}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel={A11Y_LABELS[phase]}
          accessibilityState={{ busy: phase === 'thinking' }}
        >
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        </Pressable>
      </View>

      <View style={styles.below}>
        {error ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{ERROR_TEXT[error]}</Text>
            {error === 'mic' && (
              <Text style={styles.settingsLink} onPress={() => Linking.openSettings()} suppressHighlighting>
                Open Settings
              </Text>
            )}
          </View>
        ) : replyText ? (
          <ScrollView style={styles.replyScroll} contentContainerStyle={styles.replyContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.replyText} selectable>{replyText}</Text>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  stage: { width: CIRCLE * 1.6, height: CIRCLE * 1.6, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
    backgroundColor: '#E7AEB7',
  },
  circle: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
    padding: 4, backgroundColor: 'rgba(169,192,212,0.5)',
    shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
  },
  avatar: { width: CIRCLE - 8, height: CIRCLE - 8, borderRadius: (CIRCLE - 8) / 2 },
  below: { minHeight: 120, maxHeight: 200, width: '100%', marginTop: spacing.lg, alignItems: 'center' },
  errorBox: { alignItems: 'center', gap: spacing.xs },
  errorText: { textAlign: 'center', fontSize: 13, color: '#B09A7E', fontStyle: 'italic' },
  settingsLink: { fontSize: 13, color: '#B83255', fontWeight: '600', textDecorationLine: 'underline' },
  replyScroll: { width: '100%' },
  replyContent: { paddingHorizontal: spacing.sm },
  replyText: { textAlign: 'center', fontSize: 15, color: '#1a1a1a', lineHeight: 22, fontWeight: '300' },
});
