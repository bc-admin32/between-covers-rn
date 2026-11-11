import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import * as SecureStore from 'expo-secure-store';
import { apiGet } from '../../../../lib/api';
import { useGuest } from '../../../../lib/useGuest';
import { spacing, colors } from '../../../../lib/theme';
import { cozyMonthKey } from '../../../../lib/cozyLayout';
import { PR, prStyles, usePlayroom } from '../../../../lib/playroomPage';
import { useDarkStatusBarWhileFocused } from '../../../../lib/statusBarTone';
import { tileLabel } from '../../../../components/playroom/tiles';

// Same key Cozy home writes (cozy/index.tsx) — read here for first paint.
const CACHE_KEY = 'bc_cozy_cache_v2';

type FeaturedBook = { workId: string; title: string; author: string; coverUrl: string };

type AuthorSpotlight = {
  id: string;
  monthLabel: string;
  name: string;
  role: 'author' | 'narrator';
  headshotUrl: string;
  quoteShort: string;
  quoteFull: string;
  quoteSource: string | null;
  bioShort: string | null;
  bio: string;
  sitWithMe: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  websiteUrl: string | null;
  promo: { code?: string; label?: string; discount?: string; startDate?: string; endDate?: string } | null;
  featuredBooks: FeaturedBook[];
};

async function openLink(url: string) {
  // Linking.openURL hands off to the OS, which picks the installed app
  // (Spotify, YouTube, Instagram, …) when available and falls back to
  // Safari otherwise. WebBrowser.openBrowserAsync chokes on Spotify's
  // redirect chain and similar deep-linkable services.
  Linking.openURL(url).catch(() => {});
}

function formatEndDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

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

function SitWithMeDivider({ playroom }: { playroom: boolean }) {
  return (
    <View style={styles.swmDivider}>
      <View style={styles.swmDividerLine} />
      <Text style={[styles.swmDividerText, playroom && prStyles.eyebrow]}>Sit With Me</Text>
      <View style={styles.swmDividerLine} />
    </View>
  );
}

export default function AuthorDetailScreen() {
  const router = useRouter();
  const { requireAccount } = useGuest();
  const insets = useSafeAreaInsets();
  useDarkStatusBarWhileFocused();
  // PlayRoom months make this Beyond the Cover. month=previous → last month
  // (from the archive).
  const playroom = usePlayroom();
  const params = useLocalSearchParams<{ weekId?: string; month?: string }>();
  const monthKey = cozyMonthKey(params.month);
  const backLabel = playroom ? '← Back to The PlayRoom' : '← Back to Cozy';
  const socialIconColor = playroom ? PR.heading : '#0F2A48';

  const [spotlight, setSpotlight] = useState<AuthorSpotlight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      let haveData = false;
      try {
        // The cache only holds this month.
        const cached = monthKey === 'active' ? await SecureStore.getItemAsync(CACHE_KEY) : null;
        if (cached) {
          const parsed = JSON.parse(cached);
          const cachedSpotlight = parsed?.active?.sections?.authorSpotlight ?? null;
          if (cachedSpotlight) {
            setSpotlight(cachedSpotlight);
            haveData = true;
            setLoading(false);
          }
        }
        type MonthSpotlight = { sections?: { authorSpotlight?: AuthorSpotlight | null } };
        const response = await apiGet<{ active?: MonthSpotlight; previous?: MonthSpotlight }>('/cozy/home');
        const fresh = response?.[monthKey]?.sections?.authorSpotlight ?? null;
        if (fresh) {
          setSpotlight(fresh);
          haveData = true;
        } else if (!haveData) {
          setError(true);
        }
      } catch {
        if (!haveData) setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [monthKey]);

  if (loading && !spotlight) {
    return (
      <View style={[styles.container, playroom && prStyles.page, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !spotlight) {
    return (
      <View style={[styles.container, playroom && prStyles.page, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
        <Text style={[styles.errorText, playroom && prStyles.body]}>Spotlight not available</Text>
        <TouchableOpacity style={[styles.backButton, playroom && prStyles.roseOutline]} onPress={() => router.back()}>
          <Text style={[styles.backButtonText, playroom && prStyles.eyebrow]}>{backLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const typeLabel = spotlight.role === 'narrator' ? 'Narrator' : 'Author';
  const hasSocial = !!(spotlight.instagramUrl || spotlight.tiktokUrl || spotlight.websiteUrl);
  const hasPromo = !!spotlight.promo?.code;
  const hasBooks = spotlight.featuredBooks.length > 0;

  return (
    <View style={[styles.container, playroom && prStyles.page]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 + spacing.xl }}
      >
        {/* HERO */}
        <View style={[styles.hero, { paddingTop: insets.top }]}>
          <Image source={{ uri: spotlight.headshotUrl }} style={styles.heroImage} />
        </View>

        {/* HEADER */}
        <View style={styles.headerBlock}>
          <Text style={[styles.eyebrow, playroom && prStyles.eyebrow]}>{playroom ? tileLabel('talkDirtyToMe') : 'The Mind Behind the Magic'}</Text>
          <Text style={[styles.name, playroom && prStyles.heading]}>{spotlight.name}</Text>
          <Text style={[styles.typeLabel, playroom && prStyles.body]}>{typeLabel}</Text>
        </View>

        {/* SIT WITH ME */}
        {spotlight.sitWithMe && (
          <View style={styles.swmSection}>
            <SitWithMeDivider playroom={playroom} />
            <Text style={[styles.swmText, playroom && prStyles.body]}>"{spotlight.sitWithMe}"</Text>
          </View>
        )}

        {/* FULL BIO */}
        {spotlight.bio && (
          <View style={styles.bodySection}>
            <Text style={[styles.bioText, playroom && prStyles.body]}>{spotlight.bio}</Text>
          </View>
        )}

        {/* BOOKS */}
        {hasBooks && (
          <View style={styles.bodySection}>
            <Text style={[styles.sectionTitle, playroom && prStyles.eyebrow]}>{`Books by ${spotlight.name}`}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollRow}
            >
              {spotlight.featuredBooks.map((book) => (
                <TouchableOpacity
                  key={book.workId}
                  style={[styles.smallBookCard, playroom && prStyles.cardBorder]}
                  onPress={() => router.push(`/book?workId=${book.workId}` as any)}
                >
                  <View style={styles.smallBookCover}>
                    <Image source={{ uri: book.coverUrl }} style={styles.smallBookCoverImage} />
                  </View>
                  <Text style={[styles.smallBookTitle, playroom && prStyles.heading]} numberOfLines={2}>{book.title}</Text>
                  <Text style={[styles.smallBookAuthor, playroom && prStyles.body]} numberOfLines={1}>{book.author}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* CONNECT */}
        {hasSocial && (
          <View style={styles.bodySection}>
            <Text style={[styles.sectionTitle, styles.sectionTitleCentered, playroom && prStyles.eyebrow]}>Connect</Text>
            <View style={styles.socialRow}>
              {spotlight.instagramUrl && (
                <TouchableOpacity
                  style={[styles.socialButton, playroom && prStyles.cardBorder]}
                  onPress={() => openLink(spotlight.instagramUrl!)}
                >
                  <Ionicons name="logo-instagram" size={22} color={socialIconColor} />
                </TouchableOpacity>
              )}
              {spotlight.tiktokUrl && (
                <TouchableOpacity
                  style={[styles.socialButton, playroom && prStyles.cardBorder]}
                  onPress={() => openLink(spotlight.tiktokUrl!)}
                >
                  <FontAwesome5 name="tiktok" size={20} color={socialIconColor} />
                </TouchableOpacity>
              )}
              {spotlight.websiteUrl && (
                <TouchableOpacity
                  style={[styles.socialButton, playroom && prStyles.cardBorder]}
                  onPress={() => openLink(spotlight.websiteUrl!)}
                >
                  <Ionicons name="globe-outline" size={22} color={socialIconColor} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* PROMO */}
        {hasPromo && (
          <View style={styles.bodySection}>
            <Text style={[styles.sectionTitle, styles.sectionTitleCentered, playroom && prStyles.eyebrow]}>Special Offer</Text>
            {spotlight.promo!.label && (
              <Text style={[styles.promoHeadline, playroom && prStyles.body]}>{spotlight.promo!.label}</Text>
            )}
            <PromoCode code={spotlight.promo!.code!} />
            {spotlight.promo!.endDate && (
              <Text style={[styles.promoEndDate, playroom && prStyles.body]}>Through {formatEndDate(spotlight.promo!.endDate)}</Text>
            )}
          </View>
        )}

        {/* SUGGEST A SPOTLIGHT — community submission entry */}
        <View style={styles.bodySection}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.submitCard}
            onPress={() => { if (!requireAccount('submission', { source: 'submissions' })) router.push('/submissions/author' as never); }}
          >
            <Text style={styles.submitCardBody}>
              Know an author or narrator we should spotlight?
            </Text>
            <Text style={styles.submitCardCta}>Tell us →</Text>
          </TouchableOpacity>
        </View>

        {/* BACK */}
        <View style={styles.bodySection}>
          <TouchableOpacity style={[styles.backButton, playroom && prStyles.roseOutline]} onPress={() => router.back()}>
            <Text style={[styles.backButtonText, playroom && prStyles.eyebrow]}>{backLabel}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  hero: { width: '100%', backgroundColor: '#F0DCE2' },
  heroImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#F0DCE2' },
  headerBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, alignItems: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '300', letterSpacing: 2.2, textTransform: 'uppercase', color: '#b0a090', textAlign: 'center', marginBottom: 10 },
  name: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', textAlign: 'center', lineHeight: 38 },
  typeLabel: { fontSize: 13, fontStyle: 'italic', color: '#8a7c6e', marginTop: 6 },
  swmSection: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  swmDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  swmDividerLine: { flex: 1, height: 1, backgroundColor: '#e8e0d4' },
  swmDividerText: { marginHorizontal: 12, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: '#C4A882' },
  swmText: { fontSize: 17, fontStyle: 'italic', color: '#3d352e', textAlign: 'center', lineHeight: 26 },
  bodySection: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  bioText: { fontSize: 15, fontWeight: '300', color: '#3d352e', lineHeight: 26 },
  sectionTitle: { fontSize: 13, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: '#7a6e62', marginBottom: 14 },
  sectionTitleCentered: { textAlign: 'center' },
  scrollRow: { gap: 14, paddingBottom: 4 },
  smallBookCard: { width: 120, flexShrink: 0, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f0ede4' },
  smallBookCover: { width: '100%', height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E6EAF0' },
  smallBookCoverImage: { width: '100%', height: '100%' },
  smallBookTitle: { marginTop: 10, fontSize: 13, fontWeight: '400', color: '#0F2A48', lineHeight: 18 },
  smallBookAuthor: { fontSize: 11, color: '#6A5969', marginTop: 3, fontWeight: '300' },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  socialButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f0ede4', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  promoHeadline: { fontSize: 14, fontStyle: 'italic', color: '#3d352e', textAlign: 'center', marginBottom: 10 },
  promoEndDate: { fontSize: 11, color: '#9c8f7e', textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  promoContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fde8ed', borderRadius: 8, padding: 6 },
  promoText: { flex: 1 },
  promoLabel: { fontSize: 9, fontWeight: '700', color: '#B83255', letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 14 },
  promoCode: { fontSize: 12, fontWeight: '700', color: '#B83255' },
  promoCopyButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#B83255', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  promoCopyButtonActive: { backgroundColor: '#B83255' },
  promoCopyText: { fontSize: 10, fontWeight: '600', color: '#B83255' },
  promoCopyTextActive: { color: '#fff' },
  backButton: { alignSelf: 'center', borderWidth: 1, borderColor: '#ddd4c8', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, marginTop: spacing.md },
  backButtonText: { fontSize: 12, fontWeight: '400', color: '#9c8f7e', letterSpacing: 0.4 },
  errorText: { fontSize: 15, color: '#6A5969', textAlign: 'center', marginBottom: spacing.lg },
  // Community submission card — bottom of the author/narrator spotlight detail
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
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
