import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { CaretLeft } from '../../../../components/icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import EventCard from '../../../../components/playroom/EventCard';
import { cozyMonthKey, setMonthThemes } from '../../../../lib/cozyLayout';
import { PR, prStyles, usePlayroom } from '../../../../lib/playroomPage';
import { useLightStatusBarWhileFocused } from '../../../../lib/statusBarTone';
import RoomHeader, { PlayRoomStatusStrip, ROOM_INTROS } from '../../../../components/playroom/RoomHeader';
import { tileLabel } from '../../../../components/playroom/tiles';
import { monthEvents, type CozyEvent } from '../../../../lib/cozyEvents';
import { apiGet } from '../../../../lib/api';
import { useGuest } from '../../../../lib/useGuest';
import { spacing, radius, colors } from '../../../../lib/theme';
import { parseLocalEndOfDay } from '../../../../lib/dateUtils';
import AffiliateDisclosure from '../../../../components/AffiliateDisclosure';
import { OptimizedImage } from '../../../../components/OptimizedImage';
import { IRIS_AVATAR } from '../../../../lib/irisAvatar';

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
  return new Date() <= parseLocalEndOfDay(endDate);
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
  const playroom = usePlayroom();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.modalOverlay, playroom && prStyles.overlay]} activeOpacity={1} onPress={onClose} />
      <View style={styles.recipeSheet}>
        <View style={styles.sheetHandle} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.recipeContent}>
          {item.imageUrl && (
            <View style={styles.recipeImage}>
              {/* Always a recipe here (RecipeModal), i.e. a real user upload
                  (recipe-submissions/) — unlike the generic grid below, no
                  category check needed. */}
              <OptimizedImage uri={item.imageUrl} style={styles.recipeImageImg} contentFit="cover" />
            </View>
          )}

          <Text style={[styles.recipeLabel, playroom && prStyles.eyebrow]}>🍽️ Recipe</Text>
          <Text style={[styles.recipeTitle, playroom && prStyles.heading]}>{item.title}</Text>
          <View style={styles.recipeDivider} />

          {item.description ? (
            <Text style={[styles.recipeBody, playroom && prStyles.body]}>{item.description}</Text>
          ) : (
            <Text style={[styles.recipeEmpty, playroom && prStyles.body]}>Recipe details coming soon.</Text>
          )}

          {item.promo?.discountCode && isPromoActive(item.promo?.endDate) && (
            <View style={{ marginTop: spacing.lg }}>
              <PromoCode code={item.promo.discountCode} />
            </View>
          )}

          {item.affiliateLink && (
            <TouchableOpacity
              style={[styles.shopButton, playroom && prStyles.roseFill]}
              onPress={() => Linking.openURL(item.affiliateLink!).catch(() => {})}
            >
              <Text style={[styles.shopButtonText, playroom && prStyles.onRose]}>Shop Ingredients →</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: spacing.xl }} />
        </ScrollView>

        {/* Rendered after ScrollView so it sits on top in the hit-test order */}
        <TouchableOpacity style={[styles.sheetClose, playroom && prStyles.softButton]} onPress={onClose}>
          <Text style={[styles.sheetCloseText, playroom && prStyles.heading]}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function CozyItemsScreen() {
  const router = useRouter();
  const { requireAccount } = useGuest();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LifestyleItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState<LifestyleItem | null>(null);
  // PlayRoom months make this Self Care: the month's events (and their
  // recordings) go above the extras. month=previous shows last month (from
  // the archive).
  const playroom = usePlayroom();
  const isAftercare = playroom;
  // PlayRoom: light status-bar icons over the plum strip and header. Classic
  // keeps the app's dark icons on the light page.
  useLightStatusBarWhileFocused(playroom);
  const params = useLocalSearchParams<{ month?: string }>();
  const monthKey = cozyMonthKey(params.month);
  const [events, setEvents] = useState<CozyEvent[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGet('/cozy/home?view=full');
        setMonthThemes(response);
        const month = response?.[monthKey];
        const candidates = [
          month?.sections?.LIFESTYLE,
          month?.sections?.lifestyle,
          month?.sections?.enhancements,
          month?.sections?.ENHANCEMENTS,
          month?.sections?.items,
        ].filter(Array.isArray);
        const data: LifestyleItem[] = candidates.reduce<LifestyleItem[]>(
          (best, cur) => (cur.length >= best.length ? cur : best), []
        );
        setItems(data);
        if (isAftercare) setEvents(monthEvents(month?.sections));
      } catch {} finally {
        setLoaded(true);
      }
    }
    load();
  }, [monthKey, isAftercare]);

  // With events above, the pick count moves down to sit over the extras.
  const countInScroll = isAftercare && events.length > 0;
  const countRow = (
    <View style={styles.countRow}>
      <View style={styles.countLine} />
      {loaded && items.length > 0 && (
        <Text style={[styles.countText, playroom && prStyles.eyebrow]}>{items.length} {items.length === 1 ? 'Pick' : 'Picks'}</Text>
      )}
      <View style={styles.countLine} />
    </View>
  );

  // PlayRoom (Self Care): playlists come first, full width, above this
  // month's events; everything else keeps the order it comes in.
  const playlists = playroom ? items.filter((it) => it.category === 'playlist') : [];
  const rest = playroom ? items.filter((it) => it.category !== 'playlist') : items;

  const renderItem = (item: LifestyleItem, i: number, wide = false) => {
  const showPromo = !!item.promo?.discountCode && isPromoActive(item.promo?.endDate);
  const actionLink = ctaLink(item);
  const isRecipe = item.category === 'recipe';

  return (
    <View key={item.sk ?? i} style={[styles.itemCard, playroom && prStyles.card, wide && styles.itemCardWide]}>
      <TouchableOpacity
        style={[styles.itemCoverWrapper, wide && styles.itemCoverWrapperWide]}
        onPress={isRecipe ? () => setActiveRecipe(item) : undefined}
      >
        {item.imageUrl ? (
          // Recipe items are community submissions (recipe-submissions/,
          // a real upload); product/playlist items are admin-curated
          // content with no optimized variant.
          isRecipe ? (
            <OptimizedImage uri={item.imageUrl} style={styles.itemCover} />
          ) : (
            <Image source={{ uri: item.imageUrl }} style={styles.itemCover} />
          )
        ) : (
          <View style={[styles.itemCover, styles.itemCoverFallback, playroom && prStyles.coverBg]}>
            <Text style={{ fontSize: 28 }}>
              {item.category === 'recipe' ? '🍽️' : item.category === 'playlist' ? '🎵' : '🛍️'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={[styles.itemInfo, wide && styles.itemInfoWide]}>
        <Text style={[styles.itemTitle, playroom && prStyles.heading]} numberOfLines={2}>{item.title}</Text>
        {item.description && (
          <Text style={[styles.itemDescription, playroom && prStyles.body]} numberOfLines={2}>{item.description}</Text>
        )}
        {showPromo && <PromoCode code={item.promo!.discountCode!} />}
        <TouchableOpacity
          style={[styles.ctaButton, playroom && prStyles.roseOutline, (!isRecipe && !actionLink) && styles.ctaButtonDisabled]}
          onPress={async () => {
            if (isRecipe) { setActiveRecipe(item); return; }
            if (!actionLink) return;
            // Universal Links handle Spotify (and most other apps)
            // directly from the https:// URL — no manual scheme
            // conversion needed. WebBrowser is the fallback for
            // the rare case Linking can't resolve a handler.
            try {
              await Linking.openURL(actionLink);
            } catch {
              try {
                await WebBrowser.openBrowserAsync(actionLink);
              } catch {
                // Both failed — silently give up.
              }
            }
          }}
          disabled={!isRecipe && !actionLink}
        >
          <Text style={[styles.ctaButtonText, playroom && prStyles.eyebrow]}>{ctaLabel(item.category)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  };

  return (
    <View style={[styles.container, playroom && prStyles.page, { paddingTop: playroom ? 0 : insets.top }]}>
      {/* PlayRoom: plum behind the status bar, pinned while the header scrolls away. */}
      {playroom && <PlayRoomStatusStrip height={insets.top} />}
      {activeRecipe && (
        <RecipeModal item={activeRecipe} onClose={() => setActiveRecipe(null)} />
      )}

      {/* Classic header and Iris note (the PlayRoom header's intro replaces the note). */}
      {!playroom && (
      <>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={[styles.backButton, playroom && prStyles.softButton]} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/cozy' as any)}>
            <CaretLeft size={20} color={playroom ? PR.heading : '#0F2A48'} weight="bold" />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerLabel, playroom && prStyles.eyebrow]}>The Little Things</Text>
            <Text style={[styles.headerTitle, playroom && prStyles.heading]}>{playroom ? tileLabel('aftercare') : 'Cozy Extras'}</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.irisButton, playroom && prStyles.cardBorder]} onPress={() => router.push('/iris/chat?from=cozy/items' as any)}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
        </TouchableOpacity>
      </View>

      {/* IRIS NOTE */}
      <View style={[styles.irisNote, playroom && prStyles.card]}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={[styles.irisNoteText, playroom && prStyles.body]}>
          {playroom
            ? "Recipes, playlists, drinks & extras inspired by this month's theme."
            : "Recipes, playlists, drinks & cozy extras inspired by this month's theme."}
        </Text>
      </View>

      </>
      )}

      {/* COUNT */}
      {!playroom && !countInScroll && countRow}

      {/* GRID */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
        {playroom && (
          <>
            <RoomHeader name={tileLabel('aftercare')} intro={ROOM_INTROS.aftercare} monthKey={monthKey} irisFrom="cozy/items" style={{ marginHorizontal: -spacing.md }} />
            {/* With events, the count sits above the extras further down. */}
            {loaded && playlists.length > 0 && (
              <View style={styles.playlistList}>{playlists.map((item, i) => renderItem(item, i, true))}</View>
            )}
            {!countInScroll && <View style={{ marginHorizontal: -spacing.md }}>{countRow}</View>}
          </>
        )}
        {/* AFTERCARE: the month's events and recordings, then the extras.
            EventCard brings its own side margin, so it cancels the grid's. */}
        {loaded && isAftercare && events.length > 0 && (
          <View style={{ marginHorizontal: -spacing.md }}>
            {events.map((e, i) => (
              <EventCard key={e.eventId ?? e.sk ?? `${e.title}-${i}`} event={e} canOpenEvent={monthKey === 'active'} />
            ))}
            {items.length > 0 && countRow}
          </View>
        )}
        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : rest.length === 0 && (countInScroll || playlists.length > 0) ? null : items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🛍️</Text>
            <Text style={[styles.emptyTitle, playroom && prStyles.heading]}>Coming soon</Text>
            <Text style={[styles.emptyText, playroom && prStyles.body]}>Iris is still pulling together this month's picks. Check back soon.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {rest.map((item, i) => renderItem(item, i))}
          </View>
        )}

        {/* SHARE A RECIPE — community submission entry */}
        {loaded && (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.submitCard}
            onPress={() => { if (!requireAccount('submission', { source: 'submissions' })) router.push('/submissions/recipe' as any); }}
          >
            <Text style={styles.submitCardBody}>
              Have a recipe that pairs perfectly with your favorite read?
            </Text>
            <Text style={styles.submitCardCta}>Share it →</Text>
          </TouchableOpacity>
        )}

        <AffiliateDisclosure />

        <View style={{ height: spacing.xl }} />
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
  headerTitle: { fontSize: 26, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 30 },
  irisButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#A9C0D4', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
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
  // A playlist across the row: cover on the left, details beside it.
  playlistList: { gap: 16, marginBottom: spacing.md },
  itemCardWide: { width: '100%', flexDirection: 'row' },
  itemCoverWrapperWide: { width: '38%' },
  itemInfoWide: { flex: 1, justifyContent: 'center' },
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
  recipeTitle: { fontSize: 26, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', lineHeight: 32, marginBottom: spacing.md },
  recipeDivider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginBottom: spacing.lg },
  recipeBody: { fontSize: 14, fontWeight: '300', color: '#3d352e', lineHeight: 25 },
  recipeEmpty: { fontSize: 14, fontStyle: 'italic', color: '#9c8f7e' },
  shopButton: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: 999, backgroundColor: '#0F2A48', alignItems: 'center' },
  shopButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  // Community submission card — bottom of Cozy Extras
  submitCard: {
    width: '100%',
    backgroundColor: '#FDF5F7',
    borderWidth: 1,
    borderColor: '#F0DCE2',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowColor: '#0F2A48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    marginTop: spacing.md,
  },
  submitCardBody: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#6A5969',
    lineHeight: 20,
    marginBottom: 10,
  },
  submitCardCta: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B83255',
    letterSpacing: 0.4,
    textAlign: 'right',
  },
});