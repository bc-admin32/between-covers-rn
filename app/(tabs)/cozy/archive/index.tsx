import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

type BookItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string;
  genres?: string[];
};

type VisualItem = {
  sk: string;
  imageUrl: string;
  deepLink?: string;
  affiliateLink?: string;
  title?: string;
  category?: string;
};

type CozyData = {
  weekId: string;
  theme: { title: string; tagline: string };
  sections: {
    spotlight?: { book: BookItem | null; alignment: any };
    books?: BookItem[];
    visual?: VisualItem[];
    enhancements?: VisualItem[];
  };
};

function Divider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerStar}>✦</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function CozyArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CozyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGet('/cozy/home');
        setData(res.previous ?? null);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const books = data?.sections?.books ?? [];
  const visual = data?.sections?.visual ?? [];
  const lifestyle = data?.sections?.enhancements ?? [];
  const spotlightBook = data?.sections?.spotlight?.book ?? null;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <CaretLeft size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Last Month</Text>
        </View>

        {!data ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No previous month available yet.</Text>
          </View>
        ) : (
          <>
            {/* IRIS CARD */}
            <View style={styles.irisCardOuter}>
              <View style={styles.irisCardInner}>
                <View style={styles.irisAvatarWrapper}>
                  <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
                </View>
                <View style={styles.irisText}>
                  <Text style={styles.irisCardTitle}>Last Month's Cozy Picks</Text>
                  <Text style={styles.irisCardBody}>A look back at everything from last month</Text>
                </View>
              </View>
            </View>

            {/* THEME */}
            <View style={styles.themeSection}>
              <Divider />
              <Text style={styles.themeLabel}>last month's theme</Text>
              <Text style={styles.themeTitle}>{data.theme.title}</Text>
              {data.theme.tagline && (
                <View style={styles.taglineRow}>
                  <View style={styles.taglineLine} />
                  <Text style={styles.tagline}>{data.theme.tagline}</Text>
                  <View style={styles.taglineLine} />
                </View>
              )}
              <Divider />
            </View>

            {/* SPOTLIGHT */}
            {spotlightBook && (
              <View style={styles.section}>
                <SectionHeader title="Spotlight" />
                <Text style={styles.spotlightSubtitle}>I saw this and thought of you.</Text>
                <TouchableOpacity
                  style={styles.spotlightCard}
                  onPress={() => router.push(`/book?workId=${spotlightBook.workId}` as any)}
                >
                  <Image source={{ uri: spotlightBook.coverUrl }} style={styles.spotlightCover} />
                  <View style={styles.spotlightInfo}>
                    {spotlightBook.genres && spotlightBook.genres.length > 0 && (
                      <View style={styles.genreRow}>
                        {spotlightBook.genres.slice(0, 2).map((g) => (
                          <View key={g} style={styles.genreTag}>
                            <Text style={styles.genreTagText}>{g}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <Text style={styles.spotlightTitle}>{spotlightBook.title}</Text>
                    <Text style={styles.spotlightAuthor}>{spotlightBook.primaryAuthor}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* IRIS PICKS */}
            {books.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Iris' Picks" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
                  {books.map((book, i) => (
                    <TouchableOpacity
                      key={book?.workId ?? i}
                      style={styles.smallBookCard}
                      onPress={() => router.push(`/book?workId=${book.workId}` as any)}
                    >
                      <View style={styles.smallBookCover}>
                        <Image source={{ uri: book.coverUrl }} style={styles.smallBookCoverImage} />
                      </View>
                      <Text style={styles.smallBookTitle} numberOfLines={2}>{book.title}</Text>
                      <Text style={styles.smallBookAuthor} numberOfLines={1}>{book.primaryAuthor}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* VISUAL ESCAPES */}
            {visual.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Visual Escapes" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
                  {visual.map((item, i) => (
                    <View key={item?.sk ?? i} style={styles.mediaCard}>
                      <View style={styles.mediaCover}>
                        <Image source={{ uri: item.imageUrl }} style={styles.mediaCoverImage} />
                      </View>
                      {item.category && <Text style={styles.mediaCategory}>{item.category}</Text>}
                      <Text style={styles.mediaTitle} numberOfLines={2}>{item.title}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* LIFESTYLE */}
            {lifestyle.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Cozy Lifestyle Picks" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
                  {lifestyle.map((item, i) => (
                    <View key={item?.sk ?? i} style={styles.mediaCard}>
                      <View style={styles.mediaCover}>
                        <Image source={{ uri: item.imageUrl }} style={styles.mediaCoverImage} />
                      </View>
                      {item.category && <Text style={styles.mediaCategory}>{item.category}</Text>}
                      <Text style={styles.mediaTitle} numberOfLines={2}>{item.title}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.lg },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F2A48', fontWeight: '600' },
  headerTitle: { fontSize: 24, fontStyle: 'italic', color: '#0F2A48', fontWeight: '400' },
  irisCardOuter: { backgroundColor: '#A9C0D4', borderRadius: 20, padding: 14, marginBottom: spacing.md, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  irisCardInner: { backgroundColor: '#fff', borderRadius: 16, padding: spacing.md, flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  irisAvatarWrapper: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: '#F1F4F8', flexShrink: 0 },
  irisAvatar: { width: 60, height: 60, borderRadius: 30 },
  irisText: { flex: 1 },
  irisCardTitle: { fontSize: 17, fontWeight: '500', color: '#0F2A48', fontStyle: 'italic', marginBottom: 4 },
  irisCardBody: { fontSize: 12, fontWeight: '300', color: '#6A5969', lineHeight: 18 },
  themeSection: { marginBottom: spacing.md },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e8e0d4' },
  dividerStar: { marginHorizontal: spacing.sm, color: '#C4A882', fontSize: 12 },
  themeLabel: { fontSize: 10, fontWeight: '300', letterSpacing: 2.2, textTransform: 'uppercase', color: '#b0a090', textAlign: 'center', marginBottom: 10 },
  themeTitle: { fontSize: 34, fontWeight: '300', fontStyle: 'italic', color: '#2a1f18', textAlign: 'center', marginBottom: 14, lineHeight: 38 },
  taglineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: spacing.md, paddingHorizontal: 12 },
  taglineLine: { flex: 1, maxWidth: 44, height: 1, backgroundColor: '#e0d8cc' },
  tagline: { fontSize: 15, fontWeight: '300', fontStyle: 'italic', color: '#8a7c6e', textAlign: 'center', lineHeight: 22 },
  section: { marginBottom: spacing.lg },
  sectionHeader: { fontSize: 15, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: '#7a6e62', marginBottom: 14 },
  spotlightSubtitle: { fontSize: 12, fontWeight: '300', fontStyle: 'italic', color: '#8a7c6e', marginBottom: 12 },
  spotlightCard: { width: '100%', backgroundColor: '#f0ede4', borderWidth: 1, borderColor: '#e0d8cc', borderRadius: 16, padding: 14, flexDirection: 'row', gap: 14 },
  spotlightCover: { width: 80, height: 110, borderRadius: 10, backgroundColor: '#E6EAF0' },
  spotlightInfo: { flex: 1, justifyContent: 'center', paddingVertical: 4 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  genreTag: { backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  genreTagText: { fontSize: 9, fontWeight: '700', color: '#6A5969', textTransform: 'uppercase', letterSpacing: 0.6 },
  spotlightTitle: { fontSize: 15, fontWeight: '500', color: '#0F2A48', lineHeight: 20, marginBottom: 4 },
  spotlightAuthor: { fontSize: 12, color: '#6A5969', fontWeight: '300' },
  scrollRow: { gap: 14, paddingBottom: 4 },
  smallBookCard: { width: 120, flexShrink: 0, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f0ede4' },
  smallBookCover: { width: '100%', height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E6EAF0' },
  smallBookCoverImage: { width: '100%', height: '100%' },
  smallBookTitle: { marginTop: 10, fontSize: 13, fontWeight: '400', color: '#0F2A48', lineHeight: 18 },
  smallBookAuthor: { fontSize: 11, color: '#6A5969', marginTop: 3, fontWeight: '300' },
  mediaCard: { width: 120, flexShrink: 0, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f0ede4' },
  mediaCover: { width: '100%', height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E6EAF0' },
  mediaCoverImage: { width: '100%', height: '100%' },
  mediaCategory: { marginTop: 8, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: '#9c8f7e' },
  mediaTitle: { marginTop: 3, fontSize: 13, fontWeight: '400', color: '#0F2A48', lineHeight: 18 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#6A5969', fontWeight: '300' },
});