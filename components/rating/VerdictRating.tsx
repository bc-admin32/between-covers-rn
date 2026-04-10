import { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';

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

export default function VerdictRating({ value = null, onChange, size = 'md' }: Props) {
  const isInteractive = typeof onChange === 'function';
  const buttonSize = size === 'md' ? 48 : 40;
  const emojiSize = size === 'md' ? 20 : 17;

  return (
    <View style={styles.row}>
      {VERDICTS.map(({ key, emoji, bg }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            disabled={!isInteractive}
            onPress={() => onChange?.(key)}
            style={[
              styles.button,
              { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
              active ? { backgroundColor: bg, shadowOpacity: 0.25 } : styles.buttonInactive,
            ]}
          >
            <Text style={{ fontSize: emojiSize }}>{emoji}</Text>
          </TouchableOpacity>
        );
      })}
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