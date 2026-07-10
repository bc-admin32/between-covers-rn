import { View, Text, TouchableOpacity, Image, StyleSheet, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { prettifyEnum } from '../../lib/tagTaxonomy';

export type BookCardData = {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  genre?: string;
  spice?: number | null;
  spiceLevel?: string | null;
  tropes?: string[];
  primarySubgenre?: string | null;
  triggers?: string[];
};

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
  const triggers = book.triggers ?? [];

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

      {/* Genre — flat lists (e.g. Iris's Shelf) render it on the card; New
          Releases passes no primarySubgenre (genre lives in its section header),
          so this stays hidden there. */}
      {!!book.primarySubgenre && (
        <Text style={styles.genre} numberOfLines={1}>{prettifyEnum(book.primarySubgenre)}</Text>
      )}

      {hasSpice && (
        <Text style={styles.spice} numberOfLines={1}>
          {'🌶️'.repeat(book.spice as number)}
        </Text>
      )}

      {tropes.length > 0 && (
        <View style={styles.tropeRow}>
          {tropes.map((t) => (
            <View key={t} style={styles.tropePill}>
              <Text style={styles.tropePillText} numberOfLines={1}>{prettifyEnum(t)}</Text>
            </View>
          ))}
        </View>
      )}

      {triggers.length > 0 && (
        <View style={styles.cwRow}>
          {triggers.map((t) => (
            <View key={t} style={styles.cwPill}>
              <Text style={styles.cwPillText} numberOfLines={1}>{prettifyEnum(t)}</Text>
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
  genre: { marginTop: 4, fontSize: 9, fontWeight: '700', color: '#A9C0D4', textTransform: 'uppercase', letterSpacing: 0.8 },
  spice: { marginTop: 5, fontSize: 11, letterSpacing: 1 },
  tropeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tropePill: { backgroundColor: 'rgba(15,42,72,0.06)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, maxWidth: '100%' },
  tropePillText: { fontSize: 8, fontWeight: '700', color: '#6A5969', textTransform: 'uppercase', letterSpacing: 0.5 },
  cwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  cwPill: { backgroundColor: 'rgba(15,42,72,0.03)', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1, maxWidth: '100%' },
  cwPillText: { fontSize: 7, fontWeight: '500', color: '#A9A0A6', letterSpacing: 0.3 },
});
