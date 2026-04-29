import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator, Image, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { MovieDetailSheet } from './media/index';
import { apiGet } from '../../../lib/api';
import { spacing, radius, colors } from '../../../lib/theme';

const CACHE_KEY = 'bc_cozy_cache';
const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

/* ─── TYPES ─── */

type BookItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string;
  genres?: string[];
};

type PlatformLink = { platformId: string; deepLink: string };

type VisualItem = {
  sk: string;
  imageUrl: string;
  deepLink?: string;
  affiliateLink?: string;
  spotifyLink?: string;
  platforms?: PlatformLink[];
  title?: string;
  category?: string;
  description?: string;
  promo?: { discountCode?: string; endDate?: string };
  movieId?: string;
};

type MindItem = {
  headshotUrl: string;
  name: string;
  type: 'author' | 'narrator';
  quote: string;
  bio: string;
  fullBio: string;
  sitWithMe?: string;
  featuredBooks?: Array<{ workId: string; title: string; author: string; coverUrl: string }>;
  instagramUrl?: string;
  tiktokUrl?: string;
  websiteUrl?: string;
  promo?: { code: string; discount?: string; endDate?: string; label?: string };
};

type CozyData = {
  weekId: string;
  theme: { title: string; tagline: string };
  sections: {
    spotlight?: { book: BookItem | null; alignment: any };
    books?: BookItem[];
    visual?: VisualItem[];
    enhancements?: VisualItem[];
    ENHANCEMENTS?: VisualItem[];
    LIFESTYLE?: VisualItem[];
    lifestyle?: VisualItem[];
    items?: VisualItem[];
    mind?: MindItem[];
  };
};

/* ─── HELPERS ─── */

function getDailyBookSlice(books: BookItem[]): BookItem[] {
  if (!books || books.length === 0) return [];
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const totalGroups = Math.ceil(books.length / 3);
  const groupIndex = dayOfYear % totalGroups;
  return books.slice(groupIndex * 3, groupIndex * 3 + 3);
}

function resolveLifestyleItems(sections: CozyData['sections']): VisualItem[] {
  const candidates = [
    sections?.LIFESTYLE,
    sections?.lifestyle,
    sections?.enhancements,
    sections?.ENHANCEMENTS,
    sections?.items,
  ].filter(Array.isArray) as VisualItem[][];
  return candidates.reduce<VisualItem[]>((best, cur) => (cur.length >= best.length ? cur : best), []);
}

function isPromoActive(endDate?: string): boolean {
  if (!endDate) return false;
  return new Date() <= new Date(endDate);
}

async function openLink(url: string) {
  const isSpotify = url.includes('spotify.com') || url.startsWith('spotify:');
  if (isSpotify) {
    const spotifyUri = url
      .replace('https://open.spotify.com/', 'spotify:')
      .replace('/playlist/', ':playlist:')
      .replace('/track/', ':track:')
      .replace('/album/', ':album:');
    const canOpen = await Linking.canOpenURL(spotifyUri);
    Linking.openURL(canOpen ? spotifyUri : url).catch(() => {});
    return;
  }
  const isHttp = url.startsWith('http://') || url.startsWith('https://');
  isHttp
    ? WebBrowser.openBrowserAsync(url).catch(() => {})
    : Linking.openURL(url).catch(() => {});
}

/* ─── PROMO CODE ─── */

function PromoCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.promoContainer}>
      <View style={styles.promoText}>
        <Text style={styles.promoLabel}>Use code</Text>
        <Text style={styles.promoCode} numberOfLines={1}>{code}</Text>
      </View>
      <TouchableOpacity
        style={[styles.promoCopyButton, copied && styles.promoCopyButtonActive]}
        onPress={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      >
        <Text style={[styles.promoCopyText, copied && styles.promoCopyTextActive]}>
          {copied ? 'Copied!' : 'Copy'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ─── RECIPE MODAL ─── */

function RecipeModal({ item, onClose }: { item: VisualItem; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.recipeSheet}>
        <View style={styles.sheetHandle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.recipeContent}>
          {item.imageUrl && (
            <View style={styles.recipeImage}>
              <Image source={{ uri: item.imageUrl }} style={styles.recipeImageImg} resizeMode="cover" />
            </View>
          )}
          <Text style={styles.recipeLabel}>🍽️ Recipe</Text>
          <Text style={styles.recipeTitle}>{item.title}</Text>
          <View style={styles.recipeDivider} />
          {item.description
            ? <Text style={styles.recipeBody}>{item.description}</Text>
            : <Text style={styles.recipeEmpty}>Recipe details coming soon.</Text>
          }
          {item.promo?.discountCode && isPromoActive(item.promo?.endDate) && (
            <View style={{ marginTop: spacing.lg }}>
              <PromoCode code={item.promo.discountCode} />
            </View>
          )}
          {item.affiliateLink && (
            <TouchableOpacity
              style={styles.shopButton}
              onPress={() => WebBrowser.openBrowserAsync(item.affiliateLink!)}
            >
              <Text style={styles.shopButtonText}>Shop Ingredients →</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
        <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
          <Text style={styles.sheetCloseText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/* ─── SHARED COMPONENTS ─── */

function Divider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerStar}>✦</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll}>
          <Text style={styles.viewAll}>View All →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SmallBookCard({ book, onPress }: { book: BookItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.smallBookCard} onPress={onPress}>
      <View style={styles.smallBookCover}>
        <Image source={{ uri: book.coverUrl }} style={styles.smallBookCoverImage} />
      </View>
      <Text style={styles.smallBookTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.smallBookAuthor} numberOfLines={1}>{book.primaryAuthor}</Text>
    </TouchableOpacity>
  );
}

// Unified card — same layout for both Visual Escapes and Cozy Lifestyle Picks.
// Category label + title only; no platform logos, no streaming badges.
function ItemCard({ item, onPress }: { item: VisualItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.itemCard} onPress={onPress}>
      <View style={styles.itemCover}>
        <Image source={{ uri: item.imageUrl }} style={styles.itemCoverImage} />
      </View>
      {item.category && (
        <Text style={styles.itemCategory}>{item.category}</Text>
      )}
      <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );
}

/* ─── MAIN SCREEN ─── */

export default function CozyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CozyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRecipe, setActiveRecipe] = useState<VisualItem | null>(null);
  const [activeMovie, setActiveMovie] = useState<VisualItem | null>(null);
  const [movieSheetOpen, setMovieSheetOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const cached = await SecureStore.getItemAsync(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setData(parsed?.active ?? null);
          setLoading(false);
        }
        const response = await apiGet('/cozy/home');
        setData(response?.active ?? null);
        await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(response));
      } catch {} finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Mirrors the web handleItemClick — category drives the action
  const handleItemClick = (item: VisualItem) => {
    const category = item.category?.toLowerCase();

    if (category === 'recipe') { setActiveRecipe(item); return; }
    if (category === 'event') { router.push('/(tabs)/cozy/events' as any); return; }

    if (category === 'view') {
      const url = item.deepLink || item.affiliateLink;
      if (url) openLink(url);
      return;
    }

    if (category === 'watch') {
      setActiveMovie(item);
      setMovieSheetOpen(true);
      return;
    }

    if (category === 'playlist') {
      const url = item.spotifyLink || item.platforms?.[0]?.deepLink || item.deepLink || item.affiliateLink;
      if (url) openLink(url);
      return;
    }

    // Default: open best available link
    const url = item.platforms?.[0]?.deepLink || item.deepLink || item.affiliateLink;
    if (url) openLink(url);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const spotlightBook = data?.sections?.spotlight?.book ?? null;
  const books = data?.sections?.books ?? [];
  const visual = data?.sections?.visual ?? [];
  const lifestyle = data?.sections ? resolveLifestyleItems(data.sections) : [];
  const displayBooks = getDailyBookSlice(books);
  const mind = data?.sections?.mind?.[0] ?? null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {activeRecipe && (
        <RecipeModal item={activeRecipe} onClose={() => setActiveRecipe(null)} />
      )}
      {activeMovie && (
        <MovieDetailSheet
          item={activeMovie}
          visible={movieSheetOpen}
          onClose={() => { setMovieSheetOpen(false); setTimeout(() => setActiveMovie(null), 350); }}
          onRatingUpdate={() => {}}
        />
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Between Covers</Text>
          <TouchableOpacity
            style={styles.archiveButton}
            onPress={() => router.push('/(tabs)/cozy/archive' as any)}
          >
            <Text style={styles.archiveButtonText}>← Last Month</Text>
          </TouchableOpacity>
        </View>

        {/* IRIS CARD */}
        <View style={styles.irisCardOuter}>
          <View style={styles.irisCardInner}>
            <TouchableOpacity
              style={styles.irisAvatarButton}
              onPress={() => router.push('/iris/chat?from=cozy' as any)}
            >
              <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
            </TouchableOpacity>
            <View style={styles.irisText}>
              <Text style={styles.irisCardTitle}>Iris's Cozy Picks</Text>
              <Text style={styles.irisCardBody}>
                A fresh collection every month — comfort reads and cozy essentials for your perfect reading nook
              </Text>
            </View>
          </View>
        </View>

        {/* THEME */}
        {data?.theme?.title && (
          <View style={styles.themeSection}>
            <Divider />
            <Text style={styles.themeLabel}>this month's theme</Text>
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
        )}

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

        {/* MIND BEHIND THE MAGIC */}
        {mind && data?.weekId && (
          <View style={styles.section}>
            <Divider />
            <SectionHeader title="The Mind Behind the Magic" />
            <Text style={styles.spotlightSubtitle}>
              The storyteller behind worlds you can't quite leave.
            </Text>
            <TouchableOpacity
              style={styles.mindCard}
              activeOpacity={0.85}
              onPress={() => router.push(`/(tabs)/cozy/author?weekId=${data.weekId}` as any)}
            >
              <View style={styles.mindHeader}>
                <Image source={{ uri: mind.headshotUrl }} style={styles.mindHeadshot} />
                <View style={styles.mindHeaderText}>
                  <Text style={styles.mindName}>
                    {mind.name}
                    <Text style={styles.mindType}>
                      {mind.type === 'narrator' ? ', Narrator' : ', Author'}
                    </Text>
                  </Text>
                </View>
              </View>
              {mind.quote && (
                <Text style={styles.mindQuote}>"{mind.quote}"</Text>
              )}
              {mind.bio && (
                <Text style={styles.mindBio}>{mind.bio}</Text>
              )}
              <View style={styles.mindCtaRow}>
                <Text style={styles.mindCtaText}>Explore their books →</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* IRIS PICKS */}
        {displayBooks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Iris' Picks"
              onViewAll={() => router.push('/(tabs)/cozy/books' as any)}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
              {displayBooks.map((book, i) => (
                <SmallBookCard
                  key={book?.workId ?? i}
                  book={book}
                  onPress={() => router.push(`/book?workId=${book.workId}` as any)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* VISUAL ESCAPES */}
        {visual.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Visual Escapes"
              onViewAll={() => router.push('/(tabs)/cozy/media' as any)}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
              {visual.map((item, i) => (
                <ItemCard
                  key={item?.sk ?? i}
                  item={item}
                  onPress={() => handleItemClick(item)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* COZY LIFESTYLE PICKS */}
        {lifestyle.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Cozy Lifestyle Picks"
              onViewAll={() => router.push('/(tabs)/cozy/items' as any)}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
              {lifestyle.map((item, i) => (
                <ItemCard
                  key={item?.sk ?? i}
                  item={item}
                  onPress={() => handleItemClick(item)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  headerTitle: { fontSize: 24, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48' },
  archiveButton: { borderWidth: 1, borderColor: '#ddd4c8', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 4 },
  archiveButtonText: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', letterSpacing: 0.2 },
  irisCardOuter: { backgroundColor: '#A9C0D4', borderRadius: 20, padding: 14, marginBottom: spacing.md, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  irisCardInner: { backgroundColor: '#fff', borderRadius: 16, padding: spacing.md, flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  irisAvatarButton: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: '#F1F4F8', flexShrink: 0 },
  irisAvatar: { width: 60, height: 60, borderRadius: 30 },
  irisText: { flex: 1 },
  irisCardTitle: { fontSize: 17, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', marginBottom: 4 },
  irisCardBody: { fontSize: 12, fontWeight: '300', color: '#6A5969', lineHeight: 18 },
  themeSection: { marginBottom: spacing.md },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e8e0d4' },
  dividerStar: { marginHorizontal: spacing.sm, color: '#C4A882', fontSize: 12 },
  themeLabel: { fontSize: 10, fontWeight: '300', letterSpacing: 2.2, textTransform: 'uppercase', color: '#b0a090', textAlign: 'center', marginBottom: 10 },
  themeTitle: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: '#2a1f18', textAlign: 'center', marginBottom: 14, lineHeight: 38 },
  taglineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: spacing.md, paddingHorizontal: 12 },
  taglineLine: { flex: 1, maxWidth: 44, height: 1, backgroundColor: '#e0d8cc' },
  tagline: { fontSize: 15, fontWeight: '300', fontStyle: 'italic', color: '#8a7c6e', textAlign: 'center', lineHeight: 22 },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: '#7a6e62' },
  viewAll: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', letterSpacing: 0.4 },
  spotlightSubtitle: { fontSize: 12, fontWeight: '300', fontStyle: 'italic', color: '#8a7c6e', marginBottom: 12 },
  spotlightCard: { width: '100%', backgroundColor: '#f0ede4', borderWidth: 1, borderColor: '#e0d8cc', borderRadius: 16, padding: 14, flexDirection: 'row', gap: 14, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
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
  // Unified item card — same layout for both Visual Escapes and Cozy Lifestyle Picks
  itemCard: { width: 120, flexShrink: 0, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f0ede4' },
  itemCover: { width: '100%', height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E6EAF0' },
  itemCoverImage: { width: '100%', height: '100%' },
  itemCategory: { marginTop: 8, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: '#9c8f7e' },
  itemTitle: { marginTop: 3, fontSize: 13, fontWeight: '400', color: '#0F2A48', lineHeight: 18 },
  // Recipe modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,42,72,0.5)', zIndex: 40 },
  recipeSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FDFAF6', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', zIndex: 50 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D7E2E9', alignSelf: 'center', marginTop: 12 },
  sheetClose: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 14, color: '#0F2A48', fontWeight: '600' },
  recipeContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  recipeImage: { marginHorizontal: -spacing.lg, marginBottom: spacing.md, aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: 16 },
  recipeImageImg: { width: '100%', height: '100%' },
  recipeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: 6 },
  recipeTitle: { fontSize: 26, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 32, marginBottom: spacing.md },
  recipeDivider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginBottom: spacing.lg },
  recipeBody: { fontSize: 14, fontWeight: '300', color: '#3d352e', lineHeight: 25 },
  recipeEmpty: { fontSize: 14, fontStyle: 'italic', color: '#9c8f7e' },
  shopButton: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: 999, backgroundColor: '#0F2A48', alignItems: 'center' },
  shopButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  // Mind / Author spotlight card
  mindCard: { width: '100%', backgroundColor: '#FDF5F7', borderWidth: 1, borderColor: '#F0DCE2', borderRadius: 16, padding: 16, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  mindHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  mindHeadshot: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0DCE2' },
  mindHeaderText: { flex: 1 },
  mindName: { fontSize: 18, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 22 },
  mindType: { fontSize: 14, fontFamily: 'Cormorant_700Bold_Italic', color: '#8a7c6e', fontWeight: '400' },
  mindQuote: { fontSize: 13, fontStyle: 'italic', color: '#8a7c6e', lineHeight: 20, marginBottom: 10 },
  mindBio: { fontSize: 12, fontWeight: '300', color: '#3d352e', lineHeight: 19, marginBottom: 14 },
  mindCtaRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  mindCtaText: { fontSize: 12, fontWeight: '700', color: '#B83255', letterSpacing: 0.4 },
  // Promo code
  promoContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fde8ed', borderRadius: 8, padding: 6, marginTop: 4 },
  promoText: { flex: 1 },
  promoLabel: { fontSize: 9, fontWeight: '700', color: '#B83255', letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 14 },
  promoCode: { fontSize: 12, fontWeight: '700', color: '#B83255' },
  promoCopyButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#B83255', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  promoCopyButtonActive: { backgroundColor: '#B83255' },
  promoCopyText: { fontSize: 10, fontWeight: '600', color: '#B83255' },
  promoCopyTextActive: { color: '#fff' },
});
