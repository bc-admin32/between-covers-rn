import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { spacing, radius } from '../../lib/theme';

type Props = {
  open: boolean;
  onClose: () => void;
};

const RATINGS = [
  { color: '#B83255', emoji: '🗑️', title: 'Trash', text: "I can't believe I wasted my time. Don't even bother." },
  { color: '#6A5969', emoji: '😒', title: 'Meh', text: "It was fine… but nothing memorable." },
  { color: '#A9C0D4', emoji: '😊', title: 'Cute', text: "Enjoyable and charming. I'm glad I read it." },
  { color: '#0F2A48', emoji: '😍', title: 'Obsessed', text: "Fully invested. I need the story to keep going." },
  { color: '#D7E2E9', emoji: '💋', title: "Chef's Kiss", text: "Perfect in every way. I needed this yesterday." },
];

export default function RatingInfoSheet({ open, onClose }: Props) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>What do the ratings mean?</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {RATINGS.map((r, i) => (
  <View key={i}>
              <View style={styles.row}>
                <View style={[styles.emoji, { backgroundColor: r.color }]}>
                  <Text style={styles.emojiText}>{r.emoji}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  <Text style={styles.rowBody}>"{r.text}"</Text>
                </View>
              </View>
              {i < RATINGS.length - 1 && <View style={styles.rowDivider} />}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 40,
  },
  sheet: {
    position: 'absolute',
    bottom: '12%',
    left: 0,
    right: 0,
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#F0EDE4',
    borderRadius: radius.xl,
    zIndex: 50,
    maxHeight: '70%',
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, position: 'relative' },
  title: { fontSize: 16, fontWeight: '600', color: '#0F2A48', textAlign: 'center' },
  closeButton: { position: 'absolute', right: 0, top: 0 },
  closeText: { fontSize: 16, color: '#6A5969' },
  divider: { height: 1, backgroundColor: 'rgba(169,192,212,0.3)', marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, alignItems: 'flex-start' },
  emoji: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  emojiText: { fontSize: 15 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#5D4E37', marginBottom: 2 },
  rowBody: { fontSize: 12, fontStyle: 'italic', color: '#6A5969', lineHeight: 18 },
  rowDivider: { height: 1, backgroundColor: 'rgba(169,192,212,0.3)', marginVertical: 2 },
});