import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

// Featured card for the month's Book of the Month — the one On Iris's Shelf
// pick the admin marks in the Cozy editor. /cozy/home returns it as
// sections.bookOfMonth. Shared by Cozy home and the full shelf screen, which
// both render it above their usual list and leave it out of that list.
export type BookOfMonth = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string | null;
};

export default function BookOfMonthCard({ book }: { book: BookOfMonth }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/book?workId=${book.workId}` as any)}
      accessibilityLabel={`Iris's Book of the Month: ${book.title} by ${book.primaryAuthor}`}
    >
      {book.coverUrl ? (
        <Image source={{ uri: book.coverUrl }} style={styles.cover} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderEmoji}>📖</Text>
        </View>
      )}
      <View style={styles.info}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>★ Iris's Book of the Month</Text>
        </View>
        <Text style={styles.title} numberOfLines={3}>{book.title}</Text>
        <Text style={styles.author} numberOfLines={1}>{book.primaryAuthor}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8B4C3',
    shadowColor: '#0F2A48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cover: { width: 80, height: 120, borderRadius: 10, backgroundColor: '#E6EAF0' },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderEmoji: { fontSize: 24 },
  info: { flex: 1, justifyContent: 'center', paddingVertical: 4 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#B83255',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginBottom: 8,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { fontSize: 15, fontWeight: '500', color: '#0F2A48', lineHeight: 20, marginBottom: 4 },
  author: { fontSize: 12, color: '#6A5969', fontWeight: '300' },
});
