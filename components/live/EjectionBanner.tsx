import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../lib/theme';

// Surfaces a bc:ejection chat event to the room.
//  - 'interrupt' (IRIS_LIVE): prominent overlay, dimmed surround. Paired with
//    Iris falling silent for a beat — the next chime is the recovery prompt.
//  - 'banner' (DANCE_PARTY, AUTHOR_EVENT): passive top strip, no dim, no audio.
// Both auto-dismiss after 6s. Parent owns the active-ejection state and clears
// it from this component's onDismiss callback.

export type EjectionPresentationStyle = 'interrupt' | 'banner';

export type EjectionEvent = {
  message: string;
  presentationStyle: EjectionPresentationStyle;
  timestamp?: string;
  eventId?: string;
  roomId?: string;
  // Local-only key so a re-fired ejection with identical fields still
  // restarts the timer/animation when parent assigns a new id.
  localKey: string;
};

const VISIBLE_MS = 6_000;
const FADE_MS = 300;

type Props = {
  ejection: EjectionEvent | null;
  onDismiss: () => void;
};

export default function EjectionBanner({ ejection, onDismiss }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ejection) return;
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();

    const fadeAt = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
        easing: Easing.in(Easing.ease),
      }).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, VISIBLE_MS - FADE_MS);

    return () => clearTimeout(fadeAt);
  }, [ejection?.localKey]);

  if (!ejection) return null;

  if (ejection.presentationStyle === 'interrupt') {
    return (
      <Animated.View pointerEvents="none" style={[styles.interruptOverlay, { opacity }]}>
        <View style={styles.interruptCard}>
          <Text style={styles.interruptLabel}>✦ A moment from Iris</Text>
          <Text style={styles.interruptMessage}>{ejection.message}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.bannerStrip, { opacity }]}>
      <Text style={styles.bannerText}>{ejection.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── interrupt (IRIS_LIVE) ──
  interruptOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 42, 72, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 50,
  },
  interruptCard: {
    backgroundColor: 'rgba(253,250,246,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(245,163,188,0.4)',
    borderRadius: 18,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  interruptLabel: {
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#F5A3BC',
    fontWeight: '700',
  },
  interruptMessage: {
    fontSize: 18,
    color: '#FDFAF6',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 26,
  },

  // ── banner (DANCE_PARTY, AUTHOR_EVENT) ──
  bannerStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(184,50,85,0.92)',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    zIndex: 50,
  },
  bannerText: {
    fontSize: 13,
    color: '#FDFAF6',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
