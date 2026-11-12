import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { prettifyEnum } from '../../lib/tagTaxonomy';
import BookCardMeta from './BookCardMeta';
import { prStyles, usePlayroom } from '../../lib/playroomPage';

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
  // Optional badge row under the cover (Between the Sheets). Screens that
  // don't pass it render exactly as before.
  badges?: BookCardBadge[];
};

export type BookCardBadge = {
  label: string;
  tone: 'library' | 'match' | 'boundary';
  accessibilityLabel?: string;
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
  // PlayRoom months: warm card and cover colors on the linen tile pages.
  const playroom = usePlayroom();
  const handlePress =
    onPress ?? (() => router.push(`/book?workId=${book.bookId}` as any));

  return (
    <TouchableOpacity style={[styles.card, playroom && prStyles.card, style]} onPress={handlePress} activeOpacity={0.85}>
      <View style={[styles.cover, playroom && prStyles.coverBg]}>
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={styles.coverImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Text style={styles.coverPlaceholderEmoji}>📖</Text>
          </View>
        )}
      </View>

      {!!book.badges?.length && (
        <View style={styles.badgeRow}>
          {book.badges.map((b) => (
            <View
              key={b.label}
              style={[styles.badge, styles[`badge_${b.tone}`]]}
              accessible
              accessibilityLabel={b.accessibilityLabel ?? b.label}
            >
              <Text style={[styles.badgeText, styles[`badgeText_${b.tone}`]]} numberOfLines={2}>{b.label}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.author} numberOfLines={1}>{book.author}</Text>

      {/* Genre — flat lists (e.g. Iris's Shelf) render it on the card; New
          Releases passes no primarySubgenre (genre lives in its section header),
          so this stays hidden there. */}
      {typeof book.primarySubgenre === 'string' && book.primarySubgenre.length > 0 && (
        <Text style={styles.genre} numberOfLines={1}>{prettifyEnum(book.primarySubgenre)}</Text>
      )}

      <BookCardMeta spice={book.spice} tropes={book.tropes} />
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  badge: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  badge_library: { backgroundColor: 'rgba(15,42,72,0.08)', borderColor: 'rgba(15,42,72,0.18)' },
  badgeText_library: { color: '#0F2A48' },
  badge_match: { backgroundColor: 'rgba(184,50,85,0.08)', borderColor: 'rgba(184,50,85,0.25)' },
  badgeText_match: { color: '#8E2441' },
  badge_boundary: { backgroundColor: 'rgba(196,122,20,0.10)', borderColor: 'rgba(196,122,20,0.35)' },
  badgeText_boundary: { color: '#7A4A06' },
});
