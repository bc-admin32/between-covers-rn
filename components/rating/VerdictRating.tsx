import { useRef, useState, useMemo, useEffect } from 'react';
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

type OverlayState = {
  type: 'kiss' | 'trash';
  originX: number;
  originY: number;
};

type ParticleSpec = {
  dx: number;
  dy: number;
  rotateEnd: number;
  delay: number;
  size: number;
};

function generateSpecs(count: number): ParticleSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const base = (i / count) * 2 * Math.PI;
    const angle = base + (Math.random() - 0.5) * (Math.PI / count) * 2;
    const distance = 65 + Math.random() * 110;
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 20, // slight upward bias
      rotateEnd: (Math.random() - 0.5) * 540,
      delay: Math.floor(Math.random() * 80),
      size: 13 + Math.floor(Math.random() * 8),
    };
  });
}

// ─── Kiss particle (💋 emoji) ────────────────────────────────────────────────

function KissParticle({
  originX, originY, spec,
}: { originX: number; originY: number; spec: ParticleSpec }) {
  const x       = useRef(new Animated.Value(0)).current;
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale   = useRef(new Animated.Value(0.2)).current;
  const rotate  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(spec.delay),
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1,        duration: 120, useNativeDriver: true, easing: Easing.out(Easing.back(1.5)) }),
        Animated.timing(x,       { toValue: spec.dx,  duration: 700, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(y,       { toValue: spec.dy,  duration: 700, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(rotate,  { toValue: 1,        duration: 700, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const rotateStr = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${spec.rotateEnd}deg`],
  });

  return (
    <Animated.View style={{
      position: 'absolute',
      left: originX - spec.size / 2,
      top:  originY - spec.size / 2,
      opacity,
      transform: [{ translateX: x }, { translateY: y }, { rotate: rotateStr }, { scale }],
    }}>
      <Text style={{ fontSize: spec.size, lineHeight: spec.size + 2 }}>💋</Text>
    </Animated.View>
  );
}

// ─── Trash particle (crumpled-paper circle) ──────────────────────────────────

function TrashParticle({
  originX, originY, spec,
}: { originX: number; originY: number; spec: ParticleSpec }) {
  const x       = useRef(new Animated.Value(0)).current;
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale   = useRef(new Animated.Value(0.2)).current;
  const rotate  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(spec.delay),
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1,       duration: 100, useNativeDriver: true }),
        Animated.timing(x,       { toValue: spec.dx, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(y,       { toValue: spec.dy, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(rotate,  { toValue: 1,       duration: 700, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const rotateStr = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${spec.rotateEnd}deg`],
  });

  const r = spec.size / 2;

  return (
    <Animated.View style={{
      position: 'absolute',
      left:         originX - r,
      top:          originY - r,
      width:        spec.size,
      height:       spec.size,
      borderRadius: r,
      backgroundColor: '#9ca3af',
      opacity,
      transform: [{ translateX: x }, { translateY: y }, { rotate: rotateStr }, { scale }],
    }} />
  );
}

// ─── Overlay modal ───────────────────────────────────────────────────────────

function ParticleOverlay({
  state, onDone,
}: { state: OverlayState; onDone: () => void }) {
  const isKiss = state.type === 'kiss';
  const specs  = useMemo(() => generateSpecs(isKiss ? 18 : 28), []);

  const trashShake = useRef(new Animated.Value(0)).current;
  const trashScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isKiss) {
      Animated.sequence([
        Animated.timing(trashScale, { toValue: 1.5, duration: 80, useNativeDriver: true }),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(trashShake, { toValue:  14, duration: 55, useNativeDriver: true }),
            Animated.timing(trashShake, { toValue: -14, duration: 55, useNativeDriver: true }),
            Animated.timing(trashShake, { toValue:  10, duration: 55, useNativeDriver: true }),
            Animated.timing(trashShake, { toValue: -10, duration: 55, useNativeDriver: true }),
            Animated.timing(trashShake, { toValue:   6, duration: 55, useNativeDriver: true }),
            Animated.timing(trashShake, { toValue:   0, duration: 55, useNativeDriver: true }),
          ]),
          Animated.timing(trashScale, { toValue: 1, duration: 330, useNativeDriver: true }),
        ]),
      ]).start();
    }

    const timer = setTimeout(onDone, 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {specs.map((spec, i) =>
          isKiss
            ? <KissParticle  key={i} originX={state.originX} originY={state.originY} spec={spec} />
            : <TrashParticle key={i} originX={state.originX} originY={state.originY} spec={spec} />
        )}

        {/* Shaking trash can overlaid at origin */}
        {!isKiss && (
          <Animated.View style={{
            position: 'absolute',
            left: state.originX - 22,
            top:  state.originY - 22,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ translateX: trashShake }, { scale: trashScale }],
          }}>
            <Text style={{ fontSize: 28 }}>🗑️</Text>
          </Animated.View>
        )}
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
  onDramatic: (type: 'kiss' | 'trash', x: number, y: number) => void;
}) {
  const scale   = useRef(new Animated.Value(1)).current;
  const viewRef = useRef<View>(null);

  const handlePress = () => {
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.3, duration: 100, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scale, { toValue: 1,   duration: 200, useNativeDriver: true, easing: Easing.elastic(1.5) }),
    ]).start();

    if (item.key === 'chefs_kiss' || item.key === 'trash') {
      viewRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
        onDramatic(
          item.key === 'chefs_kiss' ? 'kiss' : 'trash',
          pageX + width  / 2,
          pageY + height / 2,
        );
      });
    }

    onPress();
  };

  return (
    <View ref={viewRef} collapsable={false}>
      <TouchableOpacity disabled={!isInteractive} onPress={handlePress} activeOpacity={0.8}>
        <Animated.View style={[
          styles.button,
          { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2, transform: [{ scale }] },
          active ? { backgroundColor: item.bg, shadowOpacity: 0.25 } : styles.buttonInactive,
        ]}>
          <Text style={{ fontSize: emojiSize }}>{item.emoji}</Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
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
          onDramatic={(type, x, y) => setOverlay({ type, originX: x, originY: y })}
        />
      ))}
      {overlay && (
        <ParticleOverlay state={overlay} onDone={() => setOverlay(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
