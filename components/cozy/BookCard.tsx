import { View, Text, TouchableOpacity, Image, StyleSheet, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';

export type BookCardData = {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  genre?: string;
  spice?: number | null;
  tropes?: string[];
};

// Tropes arrive as enum keys (FAKE_DATING, GRUMPY_SUNSHINE). Prettify for the
// pill label: lowercase, split on "_", title-case. Good enough for v1 — a
// couple (GRUMPY_SUNSHINE → "Grumpy Sunshine") drop the taxonomy's slash, fine.
function prettifyTrope(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function BookCard({
  book,
  onPress,
  style,
}: {
  book: BookCardData;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const router = useRouter();
  const handlePress =
    onPress ?? (() => router.push(`/book?workId=${book.bookId}` as any));

  const hasSpice = typeof book.spice === 'number' && book.spice > 0;
  const tropes = (book.tropes ?? []).slice(0, 2);

  return (
    <TouchableOpacity style={[styles.card, style]} onPress={handlePress} activeOpacity={0.85}>
      <View style={styles.cover}>
        {book.coverUrl ? (
          <Image source={{ uri: book.coverUrl }} style={styles.coverImage} />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Text style={styles.coverPlaceholderEmoji}>📖</Text>
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.author} numberOfLines={1}>{book.author}</Text>

      {hasSpice && (
        <Text style={styles.spice} numberOfLines={1}>
          {'🌶️'.repeat(book.spice as number)}
        </Text>
      )}

      {tropes.length > 0 && (
        <View style={styles.tropeRow}>
          {tropes.map((t) => (
            <View key={t} style={styles.tropePill}>
              <Text style={styles.tropePillText} numberOfLines={1}>{prettifyTrope(t)}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 140,
    flexShrink: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f0ede4',
    shadowColor: '#0F2A48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E6EAF0',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderEmoji: { fontSize: 30, opacity: 0.5 },
  title: { marginTop: 10, fontSize: 13, fontWeight: '400', color: '#0F2A48', lineHeight: 18 },
  author: { fontSize: 11, color: '#6A5969', marginTop: 3, fontWeight: '300' },
  spice: { marginTop: 5, fontSize: 11, letterSpacing: 1 },
  tropeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tropePill: { backgroundColor: 'rgba(15,42,72,0.06)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, maxWidth: '100%' },
  tropePillText: { fontSize: 8, fontWeight: '700', color: '#6A5969', textTransform: 'uppercase', letterSpacing: 0.5 },
});
