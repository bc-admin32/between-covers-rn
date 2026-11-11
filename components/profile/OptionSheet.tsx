import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from '../icons';
import { PF } from '../../lib/profileTheme';

export type SheetOption<T extends string> = { value: T; label: string };

// A small bottom-sheet menu for picking one option (e.g. Country). Tapping an
// option picks it and closes; tapping outside closes without a change.
export default function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly SheetOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacingBottom }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <TouchableOpacity
              key={o.value}
              style={styles.row}
              onPress={() => { onSelect(o.value); onClose(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.rowText, active && styles.rowTextActive]}>{o.label}</Text>
              {active && <Check size={18} color={PF.accent} weight="bold" />}
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

const spacingBottom = 12;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,42,72,0.4)' },
  sheet: { backgroundColor: PF.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: PF.inputBorder, alignSelf: 'center', marginTop: 12, marginBottom: 12 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: PF.label, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PF.border },
  rowText: { fontSize: 15, color: PF.text },
  rowTextActive: { color: PF.accent, fontWeight: '600' },
});
