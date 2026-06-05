import { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RatingInfoSheet from './RatingInfoSheet';

// Self-contained ⓘ trigger for the ratings legend. Owns its own open/close
// state and renders RatingInfoSheet, so detail screens just drop it next to
// their "Verdict" heading — no per-screen modal wiring.
export default function RatingInfoButton() {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setInfoOpen(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="What do the ratings mean?"
        style={styles.button}
      >
        <Ionicons name="information-circle-outline" size={16} color="#0F2A48" />
      </TouchableOpacity>

      <RatingInfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
