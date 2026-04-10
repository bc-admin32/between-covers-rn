import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
// import * as Clipboard from 'expo-clipboard';
import { apiGet } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

type LifestyleItem = {
  sk?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  category?: 'product' | 'recipe' | 'playlist' | string;
  affiliateLink?: string;
  spotifyLink?: string;
  promo?: { discountCode?: string; startDate?: string; endDate?: string };
};

function isPromoActive(endDate?: string): boolean {
  if (!endDate) return false;
  return new Date() <= new Date(endDate);
}

function ctaLabel(category?: string): string {
  switch (category) {
    case 'recipe': return 'View Recipe →';
    case 'playlist': return 'Listen Now →';
    default: return 'Shop Now →';
  }
}

function ctaLink(item: LifestyleItem): string | undefined {
  if (item.category === 'playlist') return item.spotifyLink || item.affiliateLink;
  if (item.category === 'recipe') return undefined;
  return item.affiliateLink;
}

function PromoCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}

  return (
    <View style={styles.promoContainer}>
      <View style={styles.promoText}>
        <Text style={styles.promoLabel}>Use code</Text>
        <Text style={styles.promoCode} numberOfLines={1}>{code}</Text>
      </View>
      <TouchableOpacity
        style={[styles.promoCopyButton, copied && styles.promoCopyButtonActive]}
        onPress={handleCopy}
      >
        <Text style={[styles.promoCopyText, copied && styles.promoCopyTextActive]}>
          {copied ? 'Copied!' : 'Copy'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function RecipeModal({ item, onClose }: { item: LifestyleItem; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.recipeSheet}>
        <View style={styles.sheetHandle} />
        <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
          <Text style={styles.sheetCloseText}>✕</Text>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.recipeContent}>
          {item.imageUrl && (
            <View style={styles.recipeImage}>
              <Image source={{ uri: item.imageUrl }} style={styles.recipeImageImg} resizeMode="cover" />
            </View>
          )}

          <Text style={styles.recipeLabel}>🍽️ Recipe</Text>
          <Text style={styles.recipeTitle}>{item.title}</Text>
          <View style={styles.recipeDivider} />

          {item.description ? (
            <Text style={styles.recipeBody}>{item.description}</Text>
          ) : (
            <Text style={styles.recipeEmpty}>Recipe details coming soon.</Text>
          )}

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
      </View>
    </Modal>
  );
}

export default function CozyItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LifestyleItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState<LifestyleItem | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet('/cozy/home?view=full');
        const candidates = [
          response?.active?.sections?.LIFESTYLE,
          response?.active?.sections?.lifestyle,
          response?.active?.sections?.enhancements,
          response?.active?.sections?.ENHANCEMENTS,
          response?.active?.sections?.items,
        ].filter(Array.isArray);
        const data: LifestyleItem[] = candidates.reduce<LifestyleItem[]>(
          (best, cur) => (cur.length >= best.length ? cur : best), []
        );
        setItems(data);
      } catch {} finally {
        setLoaded(true);
      }
    }
    load();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {activeRecipe && (
        <RecipeModal item={activeRecipe} onClose={() => setActiveRecipe(null)} />
      )}

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerLabel}>The Little Things</Text>
            <Text style={styles.headerTitle}>Cozy Lifestyle Picks</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.irisButton} onPress={() => router.push('/iris/chat?from=cozy/items' as any)}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
        </TouchableOpacity>
      </View>

      {/* IRIS NOTE */}
      <View style={styles.irisNote}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={styles.irisNoteText}>Small comforts to make your reading time even cozier.</Text>
      </View>

      {/* COUNT */}
      <View style={styles.countRow}>
        <View style={styles.countLine} />
        {loaded && items.length > 0 && (
          <Text style={styles.countText}>{items.length} {items.length === 1 ? 'Pick' : 'Picks'}</Text>
        )}
        <View style={styles.countLine} />
      </View>

      {/* GRID */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🛍️</Text>
            <Text style={styles.emptyTitle}>Coming soon</Text>
            <Text style={styles.emptyText}>Iris is still pulling together this month's picks. Check back soon.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {items.map((item, i) => {
              const showPromo = !!item.promo?.discountCode && isPromoActive(item.promo?.endDate);
              const actionLink = ctaLink(item);
              const isRecipe = item.category === 'recipe';

              return (
                <View key={item.sk ?? i} style={styles.itemCard}>
                  <TouchableOpacity
                    style={styles.itemCoverWrapper}
                    onPress={isRecipe ? () => setActiveRecipe(item) : undefined}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.itemCover} />
                    ) : (
                      <View style={[styles.itemCover, styles.itemCoverFallback]}>
                        <Text style={{ fontSize: 28 }}>
                          {item.category === 'recipe' ? '🍽️' : item.category === 'playlist' ? '🎵' : '🛍️'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                    {item.description && (
                      <Text style={styles.itemDescription} numberOfLines={2}>{item.description}</Text>
                    )}
                    {showPromo && <PromoCode code={item.promo!.discountCode!} />}
                    <TouchableOpacity
                      style={[styles.ctaButton, (!isRecipe && !actionLink) && styles.ctaButtonDisabled]}
                      onPress={() => {
                        if (isRecipe) { setActiveRecipe(item); return; }
                        if (actionLink) WebBrowser.openBrowserAsync(actionLink);
                      }}
                      disabled={!isRecipe && !actionLink}
                    >
                      <Text style={styles.ctaButtonText}>{ctaLabel(item.category)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F2A48', fontWeight: '600' },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4' },
  headerTitle: { fontSize: 26, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 30 },
  irisButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  irisAvatar: { width: 44, height: 44, borderRadius: 22 },
  irisNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: '#D7E2E9' },
  irisNoteIcon: { fontSize: 14, marginTop: 1 },
  irisNoteText: { flex: 1, fontSize: 15, fontStyle: 'italic', color: '#6A5969', lineHeight: 22 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  countLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.1)' },
  countText: { fontSize: 11, fontWeight: '700', color: '#A9C0D4', letterSpacing: 0.8, textTransform: 'uppercase' },
  gridContent: { paddingHorizontal: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  itemCard: { width: '47%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#f0ede4', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  itemCoverWrapper: { width: '100%', aspectRatio: 1 },
  itemCover: { width: '100%', height: '100%' },
  itemCoverFallback: { backgroundColor: '#E6EAF0', alignItems: 'center', justifyContent: 'center' },
  itemInfo: { padding: spacing.sm, gap: 4 },
  itemTitle: { fontSize: 15, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 20 },
  itemDescription: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', lineHeight: 16 },
  promoContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fde8ed', borderRadius: 8, padding: 6, marginTop: 4 },
  promoText: { flex: 1 },
  promoLabel: { fontSize: 9, fontWeight: '700', color: '#B83255', letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 14 },
  promoCode: { fontSize: 12, fontWeight: '700', color: '#B83255' },
  promoCopyButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#B83255', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  promoCopyButtonActive: { backgroundColor: '#B83255' },
  promoCopyText: { fontSize: 10, fontWeight: '600', color: '#B83255' },
  promoCopyTextActive: { color: '#fff' },
  ctaButton: { marginTop: 4, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#0F2A48', alignItems: 'center' },
  ctaButtonDisabled: { opacity: 0.4 },
  ctaButtonText: { fontSize: 11, fontWeight: '700', color: '#0F2A48', letterSpacing: 0.3, textTransform: 'uppercase' },
  emptyState: { alignItems: 'center', paddingTop: 64, gap: spacing.sm },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptyText: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xl },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,42,72,0.5)', zIndex: 40 },
  recipeSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FDFAF6', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', zIndex: 50 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D7E2E9', alignSelf: 'center', marginTop: 12 },
  sheetClose: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 14, color: '#0F2A48', fontWeight: '600' },
  recipeContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  recipeImage: { marginHorizontal: -spacing.lg, marginBottom: spacing.md, aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: 16 },
  recipeImageImg: { width: '100%', height: '100%' },
  recipeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: 6 },
  recipeTitle: { fontSize: 26, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 32, marginBottom: spacing.md },
  recipeDivider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginBottom: spacing.lg },
  recipeBody: { fontSize: 14, fontWeight: '300', color: '#3d352e', lineHeight: 25 },
  recipeEmpty: { fontSize: 14, fontStyle: 'italic', color: '#9c8f7e' },
  shopButton: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: 999, backgroundColor: '#0F2A48', alignItems: 'center' },
  shopButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});