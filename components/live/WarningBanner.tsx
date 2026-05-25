import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Warning, X } from 'phosphor-react-native';
import { spacing } from '../../lib/theme';

// Surfaces a bc:warning chat event to the target user only. The handler
// upstream is responsible for filtering by userId — by the time a value
// reaches this component, it's already been confirmed as for-current-user.
// Auto-dismisses after 10s; user can also tap the X to dismiss early.
// Amber palette — distinct from EjectionBanner's BC pink/red so the user
// reads "heads up" rather than "you're out".

export type WarningEvent = {
  message: string;
  warningCount?: string;
  timestamp?: string;
  // Local-only key so a re-fired warning with identical fields still
  // restarts the timer/animation when the parent assigns a new id.
  localKey: string;
};

const VISIBLE_MS = 10_000;
const SLIDE_MS = 280;
const SLIDE_FROM = -80;

type Props = {
  warning: WarningEvent | null;
  onDismiss: () => void;
};

export default function WarningBanner({ warning, onDismiss }: Props) {
  const translateY = useRef(new Animated.Value(SLIDE_FROM)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!warning) return;
    translateY.setValue(SLIDE_FROM);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_MS,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_MS,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
    ]).start();

    const hideAt = setTimeout(() => slideOut(), VISIBLE_MS - SLIDE_MS);
    return () => clearTimeout(hideAt);
  }, [warning?.localKey]);

  function slideOut() {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SLIDE_FROM,
        duration: SLIDE_MS,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_MS,
        useNativeDriver: true,
        easing: Easing.in(Easing.ease),
      }),
    ]).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }

  if (!warning) return null;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY }], opacity }]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`Warning: ${warning.message}`}
    >
      <Warning size={18} weight="fill" color="#7A4A00" />
      <Text style={styles.text} numberOfLines={4}>
        {warning.message}
      </Text>
      <TouchableOpacity
        onPress={slideOut}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss warning"
      >
        <X size={16} weight="bold" color="#7A4A00" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#FCE9B3',
    borderBottomWidth: 1,
    borderBottomColor: '#E2B86A',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    zIndex: 55,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#5A3700',
    fontWeight: '500',
  },
});
