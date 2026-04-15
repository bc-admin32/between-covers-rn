import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image, Modal, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiGet, apiPost } from '../../../lib/api';
import { spacing, radius, colors } from '../../../lib/theme';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar2.png';
type PollOption = { id: string; label: string; votes?: number; voteCount?: number };
type Section =
  | { type: 'PRIMARY_THREAD'; sk: string; threadId: string; title: string; description: string; ctaLabel: string; isHot: boolean }
  | { type: 'SECONDARY_THREAD'; sk: string; threadId: string; title: string; description: string; ctaLabel: string; isHot: boolean }
  | { type: 'IRIS_THOUGHT'; sk: string; title: string; body: string; ctaLabel: string; isHot: boolean; threadId?: string | null }
  | { type: 'POLL'; sk: string; pollId: string; question: string; options: PollOption[]; totalVotes: number; hasVoted: boolean; selectedOptionId: string | null; isHot: boolean }
  | { type: 'MONTHLY_PROMPT'; promptId: string; title: string; body: string; submissionsOpen: boolean; closesAt: string | null; submissionCount: number; userHasSubmitted: boolean; userSubmission: string | null; isHot: boolean; anonymous?: boolean };

type LoungeData = {
  active: { weekId: string; startDate: string; endDate: string; sections: Section[] } | null;
  archivePreview: { weekId: string; startDate: string; endDate: string }[];
  legalAcceptedAt?: string | null;
};

// Module-level in-memory cache — no size limit, survives tab switches.
let loungeCache: LoungeData | null = null;

function formatWeekRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { day: 'numeric' })}, ${end.getFullYear()}`;
}

function formatMonth(startDate: string): string {
  return new Date(startDate).toLocaleDateString('en-US', { month: 'long' });
}

function Divider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerStar}>✦</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export default function LoungeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<LoungeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [pollResult, setPollResult] = useState<{ options: PollOption[]; totalVotes: number; selectedOptionId: string } | null>(null);
  const [eulaModal, setEulaModal] = useState(false);
  const [eulaAccepting, setEulaAccepting] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Show cached data immediately so the screen is never blank.
      if (loungeCache) {
        setData(loungeCache);
        const cachedPoll = loungeCache.active?.sections.find((s) => s.type === 'POLL') as Extract<Section, { type: 'POLL' }> | undefined;
        if (cachedPoll?.hasVoted && cachedPoll.selectedOptionId) setSelectedOption(cachedPoll.selectedOptionId);
        setLoading(false);
      }
      try {
        const res = await apiGet<LoungeData>('/lounge/resolve');
        loungeCache = res;
        setData(res);
        if (!res.legalAcceptedAt) setEulaModal(true);
        const poll = res.active?.sections.find((s) => s.type === 'POLL') as Extract<Section, { type: 'POLL' }> | undefined;
        if (poll?.hasVoted && poll.selectedOptionId) setSelectedOption(poll.selectedOptionId);
      } catch {
        if (!loungeCache) setError("Couldn't load the lounge right now.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleEulaAccept = async () => {
    setEulaAccepting(true);
    try {
      await apiPost('/legal/accept');
      setData((prev) => prev ? { ...prev, legalAcceptedAt: new Date().toISOString() } : prev);
      setEulaModal(false);
    } catch {
      // keep modal open on failure
    } finally {
      setEulaAccepting(false);
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    if (pollSubmitting) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedOption(optionId);
    setPollSubmitting(true);
    try {
      const res = await apiPost('/lounge/poll/vote', { pollId, optionId });
      setPollResult(res);
    } catch {} finally {
      setPollSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !data?.active) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
        <Text style={styles.errorText}>{error ?? "Nothing's brewing this week — check back soon."}</Text>
      </View>
    );
  }

  const { active } = data;
  const primary = active.sections.find((s) => s.type === 'PRIMARY_THREAD') as Extract<Section, { type: 'PRIMARY_THREAD' }> | undefined;
  const secondary = active.sections.find((s) => s.type === 'SECONDARY_THREAD') as Extract<Section, { type: 'SECONDARY_THREAD' }> | undefined;
  const iris = active.sections.find((s) => s.type === 'IRIS_THOUGHT') as Extract<Section, { type: 'IRIS_THOUGHT' }> | undefined;
  const poll = active.sections.find((s) => s.type === 'POLL') as Extract<Section, { type: 'POLL' }> | undefined;
  const monthly = active.sections.find((s) => s.type === 'MONTHLY_PROMPT') as Extract<Section, { type: 'MONTHLY_PROMPT' }> | undefined;

  const hasVoted = poll?.hasVoted || !!pollResult;
  const pollOptions = pollResult?.options ?? poll?.options ?? [];
  const pollTotal = pollResult?.totalVotes ?? poll?.totalVotes ?? 0;
  const votedOptionId = pollResult?.selectedOptionId ?? poll?.selectedOptionId ?? selectedOption;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* EULA gate — shown once until user accepts community terms */}
      <Modal visible={eulaModal} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.eulaOverlay}>
          <View style={styles.eulaSheet}>
            <View style={styles.eulaHandle} />
            <Text style={styles.eulaTitle}>Before You Jump In ✦</Text>
            <Text style={styles.eulaBody}>
              The Lounge is a space for our community to connect over the books and stories we love.
              {'\n\n'}
              By participating you agree to our{' '}
              <Text style={styles.eulaLink}>Community Guidelines</Text>
              {' '}— keep it kind, keep it real, and keep it Between Covers.
              {'\n\n'}
              We reserve the right to remove content or suspend accounts that violate these guidelines.
            </Text>
            <TouchableOpacity
              style={[styles.eulaAcceptBtn, eulaAccepting && styles.eulaAcceptBtnDisabled]}
              onPress={handleEulaAccept}
              disabled={eulaAccepting}
            >
              <Text style={styles.eulaAcceptBtnText}>{eulaAccepting ? 'Saving…' : 'I Agree — Let\'s Go'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.weekLabel}>{formatWeekRange(active.startDate, active.endDate)}</Text>
          <Text style={styles.title}>The Lounge</Text>
          <Text style={styles.subtitle}>Come sit with us.</Text>
          <TouchableOpacity
            style={styles.archiveButton}
            onPress={() => router.push('/(tabs)/lounge/archive' as any)}
          >
            <Text style={styles.archiveButtonText}>View Past Discussions</Text>
          </TouchableOpacity>
        </View>

        <Divider />

        {/* PRIMARY THREAD */}
        {primary && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>This Week's Rant</Text>
              {primary.isHot && <View style={styles.hotBadge}><Text style={styles.hotBadgeText}>🔥 Hot</Text></View>}
            </View>
            <Text style={styles.cardTitle}>{primary.title}</Text>
            <Text style={styles.cardDescription}>{primary.description}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterNote}>💬 Chiming in</Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push(`/lounge/thread?id=${encodeURIComponent(primary.threadId)}` as any)}
              >
                <Text style={styles.primaryButtonText}>Spill Your Thoughts</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SECONDARY THREAD */}
        {secondary && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>What We're Reading</Text>
              {secondary.isHot && <View style={styles.hotBadge}><Text style={styles.hotBadgeText}>🔥 Hot</Text></View>}
            </View>
            <Text style={styles.cardTitle}>{secondary.title}</Text>
            <Text style={styles.cardDescription}>{secondary.description}</Text>
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => router.push(`/lounge/thread?id=${encodeURIComponent(secondary.threadId)}` as any)}
            >
              <Text style={styles.outlineButtonText}>Add Yours to the Mix</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* IRIS THOUGHT */}
        {iris && (
          <View style={[styles.card, styles.irisCard]}>
            <View style={styles.irisHeader}>
              <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
              <View style={styles.irisHeaderText}>
                <Text style={styles.irisLabel}>Iris Has Thoughts</Text>
                <Text style={styles.irisTitle}>{iris.title}</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>{iris.body}</Text>
            <View style={styles.irisCardFooter}>
              <Text style={styles.cardFooterNote}>What do you think?</Text>
              <TouchableOpacity
                style={styles.irisCtaButton}
                onPress={() => iris?.threadId && router.push(
                  `/lounge/iris-thoughts?id=${encodeURIComponent(iris.threadId)}&title=${encodeURIComponent(iris.title ?? '')}&prompt=${encodeURIComponent(iris.body ?? '')}` as any
                )}
              >
                <Text style={styles.primaryButtonText}>{iris.ctaLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* POLL */}
        {poll && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>Weekly Poll</Text>
              {poll.isHot && <View style={styles.hotBadge}><Text style={styles.hotBadgeText}>🔥 Hot</Text></View>}
            </View>
            <Text style={styles.cardTitle}>{poll.question}</Text>
            <View style={styles.pollOptions}>
              {pollOptions.map((option) => {
                const isSelected = votedOptionId === option.id;
                const count = (option as any).voteCount ?? option.votes ?? 0;
                const pct = hasVoted && pollTotal > 0 ? Math.round((count / pollTotal) * 100) : null;

                if (hasVoted) {
                  return (
                    <View key={option.id} style={styles.pollResultRow}>
                      <View style={styles.pollResultHeader}>
                        <View style={styles.pollResultLeft}>
                          {isSelected && <View style={styles.pollResultDot} />}
                          <Text style={[styles.pollResultLabel, isSelected && styles.pollResultLabelSelected]}>
                            {option.label}
                          </Text>
                        </View>
                        <Text style={[styles.pollResultPct, isSelected && styles.pollResultPctSelected]}>
                          {pct}%
                        </Text>
                      </View>
                      <View style={styles.pollBar}>
                        <View style={[styles.pollBarFill, { width: `${pct}%` as any, backgroundColor: isSelected ? '#B83255' : '#C4A882' }]} />
                      </View>
                    </View>
                  );
                }

                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.pollOption, isSelected && styles.pollOptionSelected]}
                    onPress={() => setSelectedOption(option.id)}
                  >
                    <View style={[styles.pollRadio, isSelected && styles.pollRadioSelected]}>
                      {isSelected && <View style={styles.pollRadioDot} />}
                    </View>
                    <Text style={styles.pollOptionText}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!hasVoted ? (
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: spacing.md }, (!selectedOption || pollSubmitting) && styles.primaryButtonDisabled]}
                onPress={() => selectedOption && handleVote(poll.pollId, selectedOption)}
                disabled={!selectedOption || pollSubmitting}
              >
                <Text style={styles.primaryButtonText}>{pollSubmitting ? 'Casting…' : 'Cast My Vote'}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.pollVoteCount}>{pollTotal} votes cast ✦</Text>
            )}
          </View>
        )}

        {/* MONTHLY PROMPT */}
        {monthly && (
          <>
            <Divider />
            <View style={[styles.card, styles.monthlyCard]}>
              <Text style={styles.monthlyLabel}>{formatMonth(active.startDate)} Prompt</Text>
              {monthly.isHot && (
                <View style={styles.monthlyHotBadge}>
                  <Text style={styles.monthlyHotBadgeText}>🔥 Hot</Text>
                </View>
              )}
              <Text style={styles.monthlyTitle}>{monthly.title}</Text>
              <Text style={styles.monthlyBody}>{monthly.body}</Text>
              <Text style={styles.monthlyCount}>{monthly.submissionCount} confessions so far ✦</Text>
              <View style={styles.monthlyDivider} />

              {monthly.userHasSubmitted ? (
                <View>
                  <Text style={styles.monthlyYoursLabel}>Your confession ✦</Text>
                  <View style={styles.monthlySubmission}>
                    <Text style={styles.monthlySubmissionText}>"{monthly.userSubmission}"</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.monthlyOutlineButton}
                    onPress={() => router.push(`/(tabs)/lounge/monthly?promptId=${monthly.promptId}` as any)}
                  >
                    <Text style={styles.monthlyOutlineButtonText}>Read Everyone's</Text>
                  </TouchableOpacity>
                </View>
              ) : monthly.submissionsOpen ? (
                <View style={styles.monthlyButtonRow}>
                  <TouchableOpacity
                    style={styles.monthlyPrimaryButton}
                    onPress={() => router.push(`/(tabs)/lounge/monthly/submit?promptId=${monthly.promptId}` as any)}
                  >
                    <Text style={styles.monthlyPrimaryButtonText}>Drop My Confession</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.monthlyOutlineButton}
                    onPress={() => router.push(`/(tabs)/lounge/monthly?promptId=${monthly.promptId}` as any)}
                  >
                    <Text style={styles.monthlyOutlineButtonText}>Read Them All</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.monthlyButtonRow}>
                  <Text style={styles.monthlyClosedText}>Submissions closed</Text>
                  <TouchableOpacity
                    style={styles.monthlyOutlineButton}
                    onPress={() => router.push(`/(tabs)/lounge/monthly?promptId=${monthly.promptId}` as any)}
                  >
                    <Text style={styles.monthlyOutlineButtonText}>Read Them All</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  scrollContent: { paddingBottom: spacing.xl },
  header: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  weekLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C4A882', fontFamily: 'Nunito_700Bold', marginBottom: spacing.sm },
  title: { fontSize: 52, color: '#1A1A2E', fontFamily: 'Nunito_800ExtraBold_Italic', lineHeight: 56 },
  subtitle: { fontSize: 17, color: '#6A5550', fontFamily: 'Nunito_400Regular_Italic', marginTop: spacing.sm },
  archiveButton: { marginTop: spacing.lg, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1, borderColor: '#C4A882' },
  archiveButtonText: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600', color: '#B09A7E' },
  divider: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 28, marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#C4A882', opacity: 0.5 },
  dividerStar: { marginHorizontal: spacing.sm, color: '#C4A882', fontSize: 12 },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: '#FDFAF6', borderRadius: 20, padding: spacing.lg, borderWidth: 1, borderColor: '#DDD5C4' },
  irisCard: { backgroundColor: '#FDFAF6', borderColor: '#E8D5E5' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  cardLabel: { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: '#B09A7E', fontFamily: 'Nunito_700Bold' },
  hotBadge: { backgroundColor: '#FFE5E5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  hotBadgeText: { fontSize: 10, fontWeight: '700', color: '#B83255' },
  cardTitle: { fontSize: 23, color: '#1A1A2E', fontFamily: 'Nunito_700Bold_Italic', lineHeight: 28, marginBottom: spacing.sm },
  cardDescription: { fontSize: 13, color: '#6A5550', lineHeight: 20, marginBottom: spacing.md },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  irisCardFooter: { flexDirection: 'column', gap: spacing.sm, marginTop: spacing.xs },
  irisCtaButton: { backgroundColor: '#B83255', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, alignSelf: 'flex-start' },
  cardFooterNote: { fontSize: 11, color: '#B09A7E' },
  primaryButton: { backgroundColor: '#B83255', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  primaryButtonDisabled: { backgroundColor: '#D4B5BF' },
  primaryButtonText: { fontSize: 12, fontWeight: '600', color: '#fff', letterSpacing: 0.5 },
  outlineButton: { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: '#B83255', alignItems: 'center' },
  outlineButtonText: { fontSize: 12, fontWeight: '600', color: '#B83255', letterSpacing: 0.5 },
  irisHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  irisAvatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#E8D5E5' },
  irisHeaderText: { flex: 1 },
  irisLabel: { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: '#9B6B9B', fontFamily: 'Nunito_700Bold' },
  irisTitle: { fontSize: 19, color: '#1A1A2E', fontFamily: 'Nunito_700Bold_Italic', lineHeight: 24 },
  pollOptions: { gap: spacing.sm, marginBottom: spacing.sm },
  pollOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: '#DDD5C4', backgroundColor: '#fff' },
  pollOptionSelected: { borderColor: '#B83255', backgroundColor: 'rgba(184,50,85,0.06)' },
  pollRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  pollRadioSelected: { backgroundColor: '#B83255', borderColor: '#B83255' },
  pollRadioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  pollOptionText: { fontSize: 13, color: '#3A2C28', flex: 1, flexShrink: 1 },
  pollResultRow: { marginBottom: spacing.sm },
  pollResultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pollResultLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pollResultDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#B83255' },
  pollResultLabel: { fontSize: 13, color: '#3A2C28', flex: 1, flexShrink: 1 },
  pollResultLabelSelected: { color: '#B83255', fontWeight: '700' },
  pollResultPct: { fontSize: 12, fontWeight: '600', color: '#B09A7E' },
  pollResultPctSelected: { color: '#B83255' },
  pollBar: { height: 8, borderRadius: 4, backgroundColor: '#F0EDE4', overflow: 'hidden' },
  pollBarFill: { height: 8, borderRadius: 4 },
  pollVoteCount: { textAlign: 'center', fontSize: 11, color: '#B09A7E', marginTop: spacing.md },
  monthlyCard: { backgroundColor: '#1A1A2E', borderColor: '#C4A882' },
  monthlyLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'Nunito_700Bold', color: '#C4A882', marginBottom: spacing.sm },
  monthlyHotBadge: { backgroundColor: 'rgba(184,50,85,0.25)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: spacing.sm },
  monthlyHotBadgeText: { fontSize: 10, fontWeight: '700', color: '#F5A3BC' },
  monthlyTitle: { fontSize: 28, color: '#FDFAF6', fontFamily: 'Nunito_700Bold_Italic', lineHeight: 34, marginBottom: spacing.sm },
  monthlyBody: { fontSize: 13, color: 'rgba(253,250,246,0.6)', lineHeight: 20, marginBottom: spacing.sm },
  monthlyCount: { fontSize: 11, color: 'rgba(196,168,130,0.8)', marginBottom: spacing.md },
  monthlyDivider: { height: 0.5, backgroundColor: 'rgba(196,168,130,0.3)', marginBottom: spacing.md },
  monthlyYoursLabel: { fontSize: 11, color: 'rgba(196,168,130,0.8)', marginBottom: spacing.sm },
  monthlySubmission: { backgroundColor: 'rgba(253,250,246,0.07)', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 0.5, borderColor: 'rgba(196,168,130,0.2)' },
  monthlySubmissionText: { fontSize: 13, fontStyle: 'italic', color: 'rgba(253,250,246,0.75)', lineHeight: 20 },
  monthlyButtonRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  monthlyPrimaryButton: { backgroundColor: '#B83255', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  monthlyPrimaryButtonText: { fontSize: 12, fontWeight: '600', color: '#fff', letterSpacing: 0.5 },
  monthlyOutlineButton: { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(196,168,130,0.5)' },
  monthlyOutlineButtonText: { fontSize: 12, fontWeight: '600', color: '#C4A882', letterSpacing: 0.5 },
  monthlyClosedText: { fontSize: 11, color: 'rgba(196,168,130,0.6)', alignSelf: 'center' },
  errorText: { fontSize: 14, color: '#6A5550', textAlign: 'center' },
  eulaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  eulaSheet: {
    backgroundColor: '#FDFAF6', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.lg, paddingBottom: 48,
  },
  eulaHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD5C4',
    alignSelf: 'center', marginBottom: spacing.lg,
  },
  eulaTitle: { fontSize: 22, color: '#1A1A2E', fontFamily: 'Nunito_700Bold_Italic', marginBottom: spacing.md },
  eulaBody: { fontSize: 14, color: '#6A5550', fontFamily: 'Nunito_400Regular', lineHeight: 22, marginBottom: spacing.lg },
  eulaLink: { color: '#B83255', fontFamily: 'Nunito_600SemiBold' },
  eulaAcceptBtn: {
    backgroundColor: '#B83255', borderRadius: 999, paddingVertical: 14,
    alignItems: 'center',
  },
  eulaAcceptBtnDisabled: { backgroundColor: '#DDD5C4' },
  eulaAcceptBtnText: { fontSize: 15, color: '#fff', fontFamily: 'Nunito_700Bold' },
});