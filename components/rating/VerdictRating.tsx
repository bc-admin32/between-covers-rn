import { useRef, useState, useEffect } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  Animated, Easing, Modal,
} from 'react-native';

export type Verdict = 'trash' | 'meh' | 'cute' | 'obsessed' | 'chefs_kiss';

const VERDICTS: { key: Verdict; emoji: string; bg: string }[] = [
  { key: 'trash',      emoji: '🗑️', bg: '#B83255' },
  { key: 'meh',        emoji: '😒', bg: '#6A5969' },
  { key: 'cute',       emoji: '😊', bg: '#A9C0D4' },
  { key: 'obsessed',   emoji: '😍', bg: '#0F2A48' },
  { key: 'chefs_kiss', emoji: '💋', bg: '#D7E2E9' },
];

type Props = {
  value?: Verdict | null;
  onChange?: (verdict: Verdict) => void;
  size?: 'sm' | 'md';
};

type OverlayState = { type: 'kiss' | 'trash' };

// ─── Single-emoji overlay ────────────────────────────────────────────────────

function EmojiOverlay({ state, onDone }: { state: OverlayState; onDone: () => void }) {
  const scale   = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const shake   = useRef(new Animated.Value(0)).current;
  const isKiss  = state.type === 'kiss';

  useEffect(() => {
    if (isKiss) {
      // Pop in → hold → drift up → fade out
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.2, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.back(1.8)) }),
          Animated.timing(opacity, { toValue: 1,   duration: 120, useNativeDriver: true }),
        ]),
        Animated.timing(scale, { toValue: 1.0, duration: 100, useNativeDriver: true }),
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(translateY, { toValue: -40, duration: 400, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
          Animated.timing(opacity,    { toValue: 0,   duration: 400, useNativeDriver: true }),
        ]),
      ]).start(onDone);
    } else {
      // Pop in → shake → hold → fade out
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.3, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.back(1.5)) }),
          Animated.timing(opacity, { toValue: 1,   duration: 100, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(shake, { toValue:  10, duration: 60, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
          Animated.timing(shake, { toValue:   6, duration: 60, useNativeDriver: true }),
          Animated.timing(shake, { toValue:  -6, duration: 60, useNativeDriver: true }),
          Animated.timing(shake, { toValue:   0, duration: 60, useNativeDriver: true }),
        ]),
        Animated.timing(scale, { toValue: 1.0, duration: 80, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(onDone);
    }
  }, []);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlayContainer} pointerEvents="none">
        <Animated.Text style={[
          styles.overlayEmoji,
          { opacity, transform: [{ scale }, { translateY }, { translateX: shake }] },
        ]}>
          {isKiss ? '💋' : '🗑️'}
        </Animated.Text>
      </View>
    </Modal>
  );
}

// ─── Individual verdict button ───────────────────────────────────────────────

function VerdictButton({
  item, active, isInteractive, buttonSize, emojiSize, onPress, onDramatic,
}: {
  item: typeof VERDICTS[number];
  active: boolean;
  isInteractive: boolean;
  buttonSize: number;
  emojiSize: number;
  onPress: () => void;
  onDramatic: (type: 'kiss' | 'trash') => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.3, duration: 100, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scale, { toValue: 1,   duration: 200, useNativeDriver: true, easing: Easing.elastic(1.5) }),
    ]).start();

    if (item.key === 'chefs_kiss' || item.key === 'trash') {
      onDramatic(item.key === 'chefs_kiss' ? 'kiss' : 'trash');
    }

    onPress();
  };

  return (
    <TouchableOpacity disabled={!isInteractive} onPress={handlePress} activeOpacity={0.8}>
      <Animated.View style={[
        styles.button,
        { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2, transform: [{ scale }] },
        active ? { backgroundColor: item.bg, shadowOpacity: 0.25 } : styles.buttonInactive,
      ]}>
        <Text style={{ fontSize: emojiSize }}>{item.emoji}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Public component ────────────────────────────────────────────────────────

export default function VerdictRating({ value = null, onChange, size = 'md' }: Props) {
  const isInteractive = typeof onChange === 'function';
  const buttonSize    = size === 'md' ? 48 : 40;
  const emojiSize     = size === 'md' ? 20 : 17;
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  return (
    <View style={styles.row}>
      {VERDICTS.map((item) => (
        <VerdictButton
          key={item.key}
          item={item}
          active={value === item.key}
          isInteractive={isInteractive}
          buttonSize={buttonSize}
          emojiSize={emojiSize}
          onPress={() => onChange?.(item.key)}
          onDramatic={(type) => setOverlay({ type })}
        />
      ))}
      {overlay && (
        <EmojiOverlay state={overlay} onDone={() => setOverlay(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayEmoji: {
    fontSize: 72,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonInactive: {
    backgroundColor: '#F5F3F1',
    borderWidth: 1,
    borderColor: '#EAE6E0',
  },
});
