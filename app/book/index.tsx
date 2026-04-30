import { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import VerdictRating, { Verdict } from '../../components/rating/VerdictRating';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../lib/api';
import { spacing, radius, colors } from '../../lib/theme';

const RETAILER_LABELS: Record<string, string> = {
  bookshop: 'Bookshop',
  amazon: 'Amazon',
  audible: 'Audible',
};
const ALLOWED_RETAILERS = ['bookshop', 'amazon', 'audible'];

const VERDICT_DISPLAY: Record<string, { emoji: string; phrase: string; color: string }> = {
  trash:      { emoji: '🗑️', phrase: 'they say skip it',       color: '#E57373' },
  meh:        { emoji: '😐', phrase: "they say it's just meh", color: '#B0BEC5' },
  cute:       { emoji: '😊', phrase: "they say it's cute",     color: '#81C784' },
  obsessed:   { emoji: '😍', phrase: "they're obsessed",       color: '#F06292' },
  chefs_kiss: { emoji: '💋', phrase: "it's a Chef's Kiss",     color: '#B83255' },
};

const VERDICTS = ['trash', 'meh', 'cute', 'obsessed', 'chefs_kiss'] as const;
type Verdict = typeof VERDICTS[number];

type RatingSummary = {
  totalRatings: number;
  topVerdict: string;
  topPct: number;
  breakdown: Record<string, { count: number; pct: number }>;
};

type BookDetailResponse = {
  preferredRetailer: string | null;
  work: {
    workId: string;
    title: string;
    primaryAuthor: string;
    coverUrl: string | null;
    synopsis?: string | null;
    series?: string | null;
    retailers: Record<string, string>;
  };
  libraryItem: {
    status: 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FINISHED';
    rating: Verdict | null;
  } | null;
  ratingSummary: RatingSummary | null;
  userCommunityRating: string | null;
};

function computeScore(ratingSummary: RatingSummary | null): number | null {
  if (!ratingSummary || ratingSummary.totalRatings === 0) return null;
  const { breakdown, totalRatings } = ratingSummary;
  const weighted =
    (breakdown.trash?.count ?? 0) * 1 +
    (breakdown.meh?.count ?? 0) * 2 +
    (breakdown.cute?.count ?? 0) * 3 +
    (breakdown.obsessed?.count ?? 0) * 4 +
    (breakdown.chefs_kiss?.count ?? 0) * 5;
  return Math.round((weighted / totalRatings) * 10) / 10;
}

function scoreToVerdict(score: number): string {
  if (score < 1.5) return 'trash';
  if (score < 2.5) return 'meh';
  if (score < 3.5) return 'cute';
  if (score < 4.5) return 'obsessed';
  return 'chefs_kiss';
}

export default function BookDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { workId } = useLocalSearchParams<{ workId: string }>();

  const handleBack = () => router.back();

  const [data, setData] = useState<BookDetailResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [userCommunityRating, setUserCommunityRating] = useState<Verdict | null>(null);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGet<BookDetailResponse>(`/library/${workId}`);
        setData(res);
        setUserCommunityRating((res.userCommunityRating as Verdict) ?? null);
        setRatingSummary(res.ratingSummary ?? null);
      } catch {
        setData(null);
      } finally {
        setLoaded(true);
      }
    }
    if (workId) load();
    else setLoaded(true);
  }, [workId]);

  async function handleAddToLibrary(status: 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FINISHED') {
    if (!data?.work) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setAdding(true);
    try {
      await apiPost('/library/add', {
        workId: data.work.workId,
        title: data.work.title,
        primaryAuthor: data.work.primaryAuthor,
        coverUrl: data.work.coverUrl,
        status,
      });
      setSavedStatus(status);
      setData((prev) => prev ? { ...prev, libraryItem: { status, rating: null } } : prev);
    } catch {}
    setAdding(false);
  }

  async function updateStatus(status: 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FINISHED') {
    try {
      await apiPatch(`/library/${workId}`, { status });
      setData((prev) =>
        prev && prev.libraryItem ? { ...prev, libraryItem: { ...prev.libraryItem, status } } : prev
      );
    } catch {}
  }

  async function removeFromLibrary() {
    Alert.alert('Remove Book', 'Remove this book from your library?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await apiDelete(`/library/${workId}`);
            handleBack();
          } catch {
            Alert.alert('Something went wrong', 'Could not remove this book. Please try again.');
          }
        },
      },
    ]);
  }

  async function handleVerdictChange(value: Verdict) {
    if (savingRating) return;
    if (value === 'chefs_kiss') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (value === 'trash') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setUserCommunityRating(value);
    setSavingRating(true);
    try {
      const res = await apiPost<{ ratingSummary: RatingSummary | null }>('/library/rate', { workId, verdict: value });
      if (res.ratingSummary) setRatingSummary(res.ratingSummary);
    } catch {}
    setSavingRating(false);
  }

  async function handleRetailerClick(retailer: string, url: string) {
    try { await apiPatch('/profile', { preferredRetailer: retailer }); } catch {}
    // Backend builds the full retailer URL (including any affiliate tags
    // and deep links). Frontend opens whatever URL it receives.
    await WebBrowser.openBrowserAsync(url);
  }

  if (!loaded) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!workId || !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.unavailableHeader}>
          <TouchableOpacity style={styles.unavailableBack} onPress={() => handleBack()}>
            <CaretLeft size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
        </View>
        <View style={styles.unavailableBody}>
          <Text style={styles.unavailableTitle}>Book unavailable</Text>
          <Text style={styles.unavailableSubtitle}>
            We couldn't load the details for this book right now.
          </Text>
          {workId ? (
            <TouchableOpacity
              style={styles.unavailableRemove}
              onPress={() =>
                Alert.alert('Remove Book', 'Remove this book from your library?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove', style: 'destructive',
                    onPress: async () => {
                      try {
                        await apiDelete(`/library/${workId}`);
                        handleBack();
                      } catch {
                        Alert.alert('Something went wrong', 'Could not remove this book. Please try again.');
                      }
                    },
                  },
                ])
              }
            >
              <Text style={styles.unavailableRemoveText}>Remove from Library</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => handleBack()} style={styles.unavailableBackLink}>
            <Text style={styles.unavailableBackLinkText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { work, libraryItem } = data;
  const retailers = Object.entries(work.retailers).filter(([key, url]) => ALLOWED_RETAILERS.includes(key) && !!url);
  const score = computeScore(ratingSummary);
  const verdictKey = score ? scoreToVerdict(score) : null;
  const verdictInfo = verdictKey ? VERDICT_DISPLAY[verdictKey] : null;
  const totalRatings = ratingSummary?.totalRatings ?? 0;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HERO */}
        <View style={styles.hero}>
          {work.coverUrl && (
            <Image
              source={{ uri: work.coverUrl }}
              style={StyleSheet.absoluteFill}
              blurRadius={18}
            />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,42,72,0.3)' }]} />

          <TouchableOpacity
            style={[styles.backButton, { top: insets.top + 12 }]}
            onPress={() => handleBack()}
          >
            <CaretLeft size={20} color="#fff" weight="bold" />
          </TouchableOpacity>

          <View style={styles.coverContainer}>
            {work.coverUrl ? (
              <Image source={{ uri: work.coverUrl }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.noCover]}>
                <Text style={styles.noCoverText}>No cover</Text>
              </View>
            )}
          </View>
        </View>

        {/* CONTENT */}
        <View style={styles.content}>

          {/* TITLE */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>{work.title}</Text>
            {work.series && <Text style={styles.series}>{work.series}</Text>}
            <Text style={styles.author}>{work.primaryAuthor}</Text>
          </View>

          {/* LIBRARY STATUS */}
          {libraryItem ? (
            <View style={styles.statusSection}>
              <View style={styles.statusButtons}>
                {(['WANT_TO_READ', 'CURRENTLY_READING', 'FINISHED'] as const).map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[styles.statusButton, libraryItem.status === status && styles.statusButtonActive]}
                    onPress={() => updateStatus(status)}
                  >
                    <Text style={[styles.statusButtonText, libraryItem.status === status && styles.statusButtonTextActive]}>
                      {status === 'WANT_TO_READ' ? 'Wishlist' : status === 'CURRENTLY_READING' ? 'Reading' : 'Finished'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={removeFromLibrary} style={styles.removeButton}>
                <Text style={styles.removeText}>Remove from Library</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.addSection}>
              <Text style={styles.sectionLabel}>Add to Library</Text>
              <View style={styles.statusButtons}>
                {([
                  { value: 'WANT_TO_READ', label: 'Wishlist' },
                  { value: 'CURRENTLY_READING', label: 'Reading' },
                  { value: 'FINISHED', label: 'Finished' },
                ] as const).map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.statusButton, savedStatus === opt.value && styles.statusButtonActive]}
                    onPress={() => handleAddToLibrary(opt.value)}
                    disabled={adding}
                  >
                    <Text style={[styles.statusButtonText, savedStatus === opt.value && styles.statusButtonTextActive]}>
                      {savedStatus === opt.value ? '✓ ' : ''}{opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* SYNOPSIS */}
          {work.synopsis && (
            <>
              <Text style={styles.sectionLabel}>Synopsis</Text>
              <Text style={styles.synopsis}>{work.synopsis}</Text>
              <View style={styles.divider} />
            </>
          )}

          {/* COMMUNITY RATING */}
          <View style={styles.ratingSection}>
            <View style={styles.ratingCard}>
              {score && verdictInfo ? (
                <>
                  <Text style={styles.ratingText}>
                    The BC community gives this a{' '}
                    <Text style={[styles.ratingScore, { color: verdictInfo.color }]}>{score}</Text>
                    {' '}— {verdictInfo.phrase} {verdictInfo.emoji}
                  </Text>
                  <Text style={styles.ratingCount}>{totalRatings} {totalRatings === 1 ? 'reader' : 'readers'} rated this</Text>
                </>
              ) : (
                <Text style={styles.ratingEmpty}>Be the first to rate this ✨</Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>{userCommunityRating ? 'Your Verdict' : "What's the Verdict?"}</Text>
            <VerdictRating
              value={userCommunityRating}
              onChange={savingRating ? undefined : handleVerdictChange}
            />
          </View>

          <View style={styles.divider} />

          {/* PURCHASE */}
          {retailers.length > 0 && (
            <View style={styles.purchaseSection}>
              <Text style={styles.sectionLabel}>Purchase</Text>
              <View style={styles.retailerButtons}>
                {retailers.map(([key, url]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.retailerButton, key === (data.preferredRetailer ?? retailers[0][0]) && styles.retailerButtonActive]}
                    onPress={() => handleRetailerClick(key, url)}
                  >
                    <Text style={[styles.retailerText, key === (data.preferredRetailer ?? retailers[0][0]) && styles.retailerTextActive]}>
                      {RETAILER_LABELS[key] ?? key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: spacing.xl }} />
        </View>
      </ScrollView>

      {/* IRIS FAB */}
      <TouchableOpacity
        style={[styles.irisFab, { bottom: 100 + insets.bottom }]}
        onPress={() => router.push(`/iris/chat?from=library/details&bookTitle=${encodeURIComponent(work.title)}&author=${encodeURIComponent(work.primaryAuthor)}` as any)}
      >
        <Image
          source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png' }}
          style={styles.irisFabImage}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  hero: { height: 300, overflow: 'hidden', backgroundColor: '#0F2A48' },


    backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { color: '#fff', fontSize: 18, fontWeight: '600' },
  coverContainer: {
    position: 'absolute',
    bottom: -48,
    alignSelf: 'center',
    width: 130,
    height: 195,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#0F2A48',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 48,
    elevation: 10,
  },
  cover: { width: 130, height: 195 },
  noCover: { backgroundColor: '#D7E2E9', alignItems: 'center', justifyContent: 'center' },
  noCoverText: { fontSize: 12, color: '#A9C0D4', fontStyle: 'italic' },
  content: { backgroundColor: '#F0EDE4', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 64, paddingHorizontal: spacing.lg, marginTop: -1 },
  titleSection: { alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', textAlign: 'center', lineHeight: 34 },
  series: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: '#A9C0D4', marginTop: 4 },
  author: { fontSize: 12, fontWeight: '300', color: '#9c8f7e', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  statusSection: { marginBottom: spacing.lg },
  addSection: { marginBottom: spacing.lg },
  statusButtons: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  statusButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(15,42,72,0.07)' },
  statusButtonActive: { backgroundColor: '#B83255' },
  statusButtonText: { fontSize: 11, fontWeight: '700', color: '#0F2A48', letterSpacing: 0.5 },
  statusButtonTextActive: { color: '#fff' },
  removeButton: { alignItems: 'center', marginTop: 4 },
  removeText: { fontSize: 11, color: 'rgba(184,50,85,0.7)', textDecorationLine: 'underline' },
  sectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: '#A9C0D4', marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginVertical: spacing.lg },
  synopsis: { fontSize: 17, color: '#0F2A48', lineHeight: 30, marginBottom: spacing.md },
  ratingSection: { marginBottom: spacing.md },
  ratingCard: { backgroundColor: 'rgba(15,42,72,0.04)', borderWidth: 1, borderColor: 'rgba(15,42,72,0.07)', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  ratingText: { fontSize: 18, color: '#0F2A48', lineHeight: 26, fontStyle: 'italic' },
  ratingScore: { fontWeight: '600' },
  ratingCount: { fontSize: 11, color: '#A9C0D4', marginTop: 6 },
  ratingEmpty: { fontSize: 18, fontStyle: 'italic', color: '#A9C0D4' },
  verdictRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  verdictButton: { height: 48, borderRadius: radius.md, backgroundColor: 'rgba(15,42,72,0.05)', alignItems: 'center', justifyContent: 'center' },
  verdictButtonActive: { backgroundColor: 'rgba(184,50,85,0.15)', borderWidth: 1.5, borderColor: '#B83255' },
  verdictEmoji: { fontSize: 22 },
  purchaseSection: { marginBottom: spacing.md },
  retailerButtons: { flexDirection: 'row', gap: 12 },
  retailerButton: { flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: '#0F2A48', alignItems: 'center' },
  retailerButtonActive: { backgroundColor: '#0F2A48' },
  retailerText: { fontSize: 12, fontWeight: '700', color: '#0F2A48', letterSpacing: 0.5 },
  retailerTextActive: { color: '#fff' },
  notFound: { fontSize: 16, color: '#0F2A48', textAlign: 'center', marginTop: 40 },
  unavailableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(15,42,72,0.08)' },
  unavailableBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(15,42,72,0.07)', alignItems: 'center', justifyContent: 'center' },
  unavailableBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  unavailableTitle: { fontSize: 20, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', textAlign: 'center' },
  unavailableSubtitle: { fontSize: 14, color: '#9c8f7e', textAlign: 'center', lineHeight: 21 },
  unavailableRemove: { marginTop: spacing.sm },
  unavailableRemoveText: { fontSize: 13, color: 'rgba(184,50,85,0.8)', textDecorationLine: 'underline' },
  unavailableBackLink: { marginTop: spacing.sm },
  unavailableBackLinkText: { fontSize: 13, color: '#6B9AB8' },
  irisFab: {
    position: 'absolute',
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#0F2A48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  irisFabImage: { width: 48, height: 48, borderRadius: 24 },
});
