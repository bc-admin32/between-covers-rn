import { useRef, useState, useMemo, useEffect } from 'react';
import {
  View, TouchableOpacity, Text, Image, StyleSheet,
  Animated, Easing, Modal,
} from 'react-native';

const WIG_IMAGE = require('../../assets/wig.png');

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
  dx: number; dy: number; rotateEnd: number; delay: number; size: number; isWig?: boolean;
};

function generateSpecs(count: number, wigIndices?: number[]): ParticleSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const base = (i / count) * 2 * Math.PI;
    // Extra angle noise per particle for more chaotic spread
    const angle = base + (Math.random() - 0.5) * (Math.PI / count) * 3;
    const distance = 80 + Math.random() * 130;
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 25,
      rotateEnd: (Math.random() - 0.5) * 720,
      delay: Math.floor(Math.random() * 150),
      size: 14 + Math.floor(Math.random() * 10),
      isWig: wigIndices?.includes(i) ?? false,
    };
  });
}

// ─── Kiss particle ────────────────────────────────────────────────────────────

function KissParticle({ originX, originY, spec }: { originX: number; originY: number; spec: ParticleSpec }) {
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.2)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(spec.delay),
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1,       duration: 120, useNativeDriver: true, easing: Easing.out(Easing.back(1.5)) }),
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

  const rotateStr = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spec.rotateEnd}deg`] });

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

// ─── Trash particle ───────────────────────────────────────────────────────────

const TRASH_EMOJIS = ['👢', '🍅', '🥚', '🧻', '🚽', '💩', '🤡', '💔', '🥀'];

function TrashParticle({ originX, originY, spec, emoji }: {
  originX: number; originY: number; spec: ParticleSpec; emoji: string;
}) {
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
          Animated.delay(280),
          Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const rotateStr = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spec.rotateEnd}deg`] });

  if (spec.isWig) {
    const wigSize = spec.size * 1.8;
    return (
      <Animated.View style={{
        position: 'absolute',
        left: originX - wigSize / 2,
        top:  originY - wigSize / 2,
        opacity,
        transform: [{ translateX: x }, { translateY: y }, { rotate: rotateStr }, { scale }],
      }}>
        <Image source={WIG_IMAGE} style={{ width: wigSize, height: wigSize }} resizeMode="contain" />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{
      position: 'absolute',
      left: originX - spec.size / 2,
      top:  originY - spec.size / 2,
      opacity,
      transform: [{ translateX: x }, { translateY: y }, { rotate: rotateStr }, { scale }],
    }}>
      <Text style={{ fontSize: spec.size, lineHeight: spec.size + 2 }}>{emoji}</Text>
    </Animated.View>
  );
}

// ─── Overlay: burst + hero finale ────────────────────────────────────────────

// Indices in the 28-particle set that render as the wig image instead of emoji.
// Two wigs spread across the burst arc for visual variety.
const WIG_PARTICLE_INDICES = new Set([5, 19]);

function ParticleOverlay({ state, onDone }: { state: OverlayState; onDone: () => void }) {
  const isKiss = state.type === 'kiss';

  // Wig indices only relevant for trash; pass empty set for kiss to keep specs clean.
  const specs = useMemo(
    () => generateSpecs(isKiss ? 18 : 28, isKiss ? [] : [...WIG_PARTICLE_INDICES]),
    [],
  );

  // ── Kiss finale ─────────────────────────────────────────────────────────────
  const heroScale   = useRef(new Animated.Value(0)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroY       = useRef(new Animated.Value(20)).current;

  // ── Trash Phase 1: can shake ────────────────────────────────────────────────
  const trashShake = useRef(new Animated.Value(0)).current;
  const trashScale = useRef(new Animated.Value(1)).current;

  // ── Trash Phase 3: 🤬🫷 finale ──────────────────────────────────────────────
  const finaleScale   = useRef(new Animated.Value(0)).current;
  const finaleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isKiss) {
      // ── Kiss: burst → pause → 💋 pops in, holds, drifts up ─────────────────
      const heroTimer = setTimeout(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(heroScale,   { toValue: 1.2, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.back(1.8)) }),
            Animated.timing(heroOpacity, { toValue: 1,   duration: 150, useNativeDriver: true }),
          ]),
          Animated.timing(heroScale, { toValue: 1.0, duration: 100, useNativeDriver: true }),
          Animated.delay(700),
          Animated.parallel([
            Animated.timing(heroY,       { toValue: -30, duration: 500, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
            Animated.timing(heroOpacity, { toValue: 0,   duration: 500, useNativeDriver: true }),
          ]),
        ]).start();
      }, 900);

      const doneTimer = setTimeout(onDone, 2700);
      return () => { clearTimeout(heroTimer); clearTimeout(doneTimer); };

    } else {
      // ── Trash Phase 1: can shudders the moment the button is pressed ─────────
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

      // ── Trash Phase 3: after chaos (~700ms) + dramatic pause (~400ms) ────────
      // Particles are fully gone by ~660ms. We wait until ~1100ms for total
      // silence before the 🤬🫷 slam.
      const finaleTimer = setTimeout(() => {
        Animated.sequence([
          // Slam in: scale from 0 → 1.4 with a hard back-ease for impact
          Animated.parallel([
            Animated.timing(finaleScale,   { toValue: 1.4, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.back(2.2)) }),
            Animated.timing(finaleOpacity, { toValue: 1,   duration: 120, useNativeDriver: true }),
          ]),
          // Settle to natural size
          Animated.timing(finaleScale, { toValue: 1.0, duration: 100, useNativeDriver: true }),
          // Hold — let it sink in
          Animated.delay(800),
          // Fade out
          Animated.timing(finaleOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
        ]).start();
      }, 1100);

      // Total runtime: 1100ms pause + 180ms slam + 100ms settle + 800ms hold + 380ms fade ≈ 2580ms
      const doneTimer = setTimeout(onDone, 2700);
      return () => { clearTimeout(finaleTimer); clearTimeout(doneTimer); };
    }
  }, []);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">

        {/* ── Phase 1 particles ─────────────────────────────────────────────── */}
        {specs.map((spec, i) =>
          isKiss
            ? <KissParticle  key={i} originX={state.originX} originY={state.originY} spec={spec} />
            : <TrashParticle key={i} originX={state.originX} originY={state.originY} spec={spec}
                emoji={TRASH_EMOJIS[i % TRASH_EMOJIS.length]} />
        )}

        {/* ── Trash-can shake at button origin ──────────────────────────────── */}
        {!isKiss && (
          <Animated.View style={{
            position: 'absolute',
            left: state.originX - 22, top: state.originY - 22,
            width: 44, height: 44,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ translateX: trashShake }, { scale: trashScale }],
          }}>
            <Text style={{ fontSize: 28 }}>🗑️</Text>
          </Animated.View>
        )}

        {/* ── Kiss hero finale ──────────────────────────────────────────────── */}
        {isKiss && (
          <Animated.View style={[styles.heroContainer, {
            opacity: heroOpacity,
            transform: [{ scale: heroScale }, { translateY: heroY }],
          }]}>
            <Text style={styles.heroEmoji}>💋</Text>
          </Animated.View>
        )}

        {/* ── Trash hero finale: Phase 3 ────────────────────────────────────── */}
        {!isKiss && (
          <Animated.View style={[styles.heroContainer, {
            opacity: finaleOpacity,
            transform: [{ scale: finaleScale }],
          }]}>
            <Text style={styles.finaleEmoji}>😤</Text>
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
          pageX + width / 2,
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
  heroContainer: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 80,
  },
  finaleEmoji: {
    fontSize: 80,
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
