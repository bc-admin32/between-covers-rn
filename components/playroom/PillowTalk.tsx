import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../lib/theme';
import { parseLocalDate } from '../../lib/dateUtils';
import type { PollOption, Section } from '../../app/(tabs)/lounge/index';

// Pillow Talk: the Lounge tab's page in PlayRoom months. The Lounge screen
// keeps loading, the terms prompt, the suspended screen and poll voting, and
// hands this view the week's sections.

type Of<T extends Section['type']> = Extract<Section, { type: T }>;

export type PollState = {
  hasVoted: boolean;
  options: PollOption[];
  totalVotes: number;
  votedOptionId: string | null;
  selectedOption: string | null;
  submitting: boolean;
  onSelect: (optionId: string) => void;
  onVote: (pollId: string, optionId: string) => void;
};

function formatWeekRange(startDate: string, endDate: string): string {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { day: 'numeric' })}, ${end.getFullYear()}`;
}

// "😈 Unhinged & Unapologetic" → { emoji: "😈", title: "Unhinged & Unapologetic" }.
// The prompt has no emoji field; it's the start of the title. A first word
// with no letters or digits is taken as the emoji.
export function splitLeadingEmoji(raw: string): { emoji: string | null; title: string } {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(raw.trim());
  if (m && !/[A-Za-z0-9À-ɏ]/.test(m[1])) return { emoji: m[1], title: m[2] };
  return { emoji: null, title: raw.trim() };
}

function replies(n?: number): string {
  return typeof n === 'number' && n > 0 ? `💬 ${n} ${n === 1 ? 'reply' : 'replies'}` : '💬 No replies yet';
}

export default function PillowTalk({
  gate, week, hasRecentWeeks, primary, secondary, iris, poll, monthly, bookClub, pollState,
}: {
  gate: ReactNode;
  week: { startDate: string; endDate: string };
  hasRecentWeeks: boolean;
  primary?: Of<'PRIMARY_THREAD'>;
  secondary?: Of<'SECONDARY_THREAD'>;
  iris?: Of<'IRIS_THOUGHT'>;
  poll?: Of<'POLL'>;
  monthly?: Of<'MONTHLY_PROMPT'>;
  bookClub?: Of<'BOOK_CLUB'>;
  pollState: PollState;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openThread = (threadId: string) => router.push(`/lounge/thread?id=${encodeURIComponent(threadId)}` as any);
  const readConfessions = (promptId: string) =>
    router.push(`/(tabs)/lounge/monthly?promptId=${promptId}&title=${encodeURIComponent('Behind Closed Doors')}` as any);

  const prompt = monthly ? splitLeadingEmoji(monthly.title) : null;
  const discussions = [primary, secondary].filter((d): d is Of<'PRIMARY_THREAD'> | Of<'SECONDARY_THREAD'> => !!d);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {gate}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.weekLabel}>{formatWeekRange(week.startDate, week.endDate)}</Text>
          <Text style={styles.heading} accessibilityRole="header">Pillow Talk</Text>
          {hasRecentWeeks && (
            <TouchableOpacity style={styles.pastButton} onPress={() => router.push('/(tabs)/lounge/archive?window=30' as any)}>
              <Text style={styles.pastButtonText}>Past Discussions</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* THE CONFESSIONAL */}
        {monthly && prompt && (
          <View style={[styles.card, styles.confessional]}>
            <Text style={styles.eyebrow}>Pillow Talk presents</Text>
            <Text style={styles.confessionalTitle}>The Confessional</Text>
            <Text style={styles.confessionalTagline}>Some things are too good to keep to yourself.</Text>

            <View style={styles.promptBox}>
              {!!prompt.emoji && <Text style={styles.promptEmoji}>{prompt.emoji}</Text>}
              <Text style={styles.promptTitle} selectable>{prompt.title}</Text>
              <Text style={styles.promptBody} selectable>{monthly.body}</Text>
            </View>

            {monthly.userHasSubmitted ? (
              <>
                <Text style={styles.yoursLabel}>Your confession ✦</Text>
                {!!monthly.userSubmission && <Text style={styles.yoursText}>"{monthly.userSubmission}"</Text>}
                <TouchableOpacity style={styles.outlineButton} onPress={() => readConfessions(monthly.promptId)}>
                  <Text style={styles.outlineButtonText}>Read the Confessions</Text>
                </TouchableOpacity>
              </>
            ) : monthly.submissionsOpen ? (
              <>
                <Text style={styles.offPrompt}>Or forget the prompt. Tell us what's really on your mind.</Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.push(`/(tabs)/lounge/monthly/submit?promptId=${monthly.promptId}` as any)}
                >
                  <Text style={styles.primaryButtonText}>Spill Your Confession</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.outlineButton} onPress={() => readConfessions(monthly.promptId)}>
                  <Text style={styles.outlineButtonText}>Read the Confessions</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.closedText}>Confessions are closed for this month.</Text>
                <TouchableOpacity style={styles.outlineButton} onPress={() => readConfessions(monthly.promptId)}>
                  <Text style={styles.outlineButtonText}>Read the Confessions</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* IRIS HAS THOUGHTS */}
        {iris && (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            disabled={!iris.threadId}
            onPress={() => iris.threadId && router.push(
              `/lounge/iris-thoughts?id=${encodeURIComponent(iris.threadId)}&title=${encodeURIComponent(iris.title ?? '')}&prompt=${encodeURIComponent(iris.body ?? '')}` as any
            )}
          >
            <Text style={styles.eyebrow}>Iris Has Thoughts</Text>
            <Text style={styles.cardTitle}>{iris.title}</Text>
            <Text style={styles.cardBody} numberOfLines={3}>{iris.body}</Text>
            <Text style={styles.cardFoot}>{replies(iris.replyCount)}</Text>
          </TouchableOpacity>
        )}

        {/* THIS WEEK'S PILLOW TALK */}
        {discussions.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>This Week's Pillow Talk</Text>
            {discussions.map((d, i) => (
              <View key={d.threadId} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.eyebrow}>{`Discussion ${String(i + 1).padStart(2, '0')}`}</Text>
                  {d.isHot && <Text style={styles.hot}>🔥 Hot</Text>}
                </View>
                <Text style={styles.cardTitle}>{d.title}</Text>
                <Text style={styles.cardBody} numberOfLines={3}>{d.description}</Text>
                <View style={styles.cardFooterRow}>
                  <Text style={styles.cardFoot}>{replies(d.replyCount)}</Text>
                  <TouchableOpacity style={styles.smallButton} onPress={() => openThread(d.threadId)}>
                    <Text style={styles.primaryButtonText}>{d.ctaLabel?.trim() || 'Join the Conversation'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* WEEKLY POLL */}
        {poll && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.eyebrow}>Weekly Poll</Text>
              {poll.isHot && <Text style={styles.hot}>🔥 Hot</Text>}
            </View>
            <Text style={styles.cardTitle}>{poll.question}</Text>
            <View style={styles.pollOptions}>
              {pollState.options.map((option) => {
                const isSelected = pollState.votedOptionId === option.id;
                if (pollState.hasVoted) {
                  const count = option.voteCount ?? option.votes ?? 0;
                  const pct = pollState.totalVotes > 0 ? Math.round((count / pollState.totalVotes) * 100) : 0;
                  return (
                    <View key={option.id} style={styles.pollResult}>
                      <View style={styles.pollResultHeader}>
                        <Text style={[styles.pollLabel, isSelected && styles.pollLabelSelected]}>{option.label}</Text>
                        <Text style={[styles.pollLabel, isSelected && styles.pollLabelSelected]}>{pct}%</Text>
                      </View>
                      <View style={styles.pollBar}>
                        <View style={{ flex: pct, backgroundColor: isSelected ? '#B83255' : '#8C5A6E', borderRadius: 4 }} />
                        <View style={{ flex: 100 - pct }} />
                      </View>
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.pollOption, isSelected && styles.pollOptionSelected]}
                    onPress={() => pollState.onSelect(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <Text style={styles.pollLabel}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!pollState.hasVoted ? (
              <TouchableOpacity
                style={[styles.primaryButton, (!pollState.selectedOption || pollState.submitting) && styles.buttonDisabled]}
                disabled={!pollState.selectedOption || pollState.submitting}
                onPress={() => pollState.selectedOption && pollState.onVote(poll.pollId, pollState.selectedOption)}
              >
                <Text style={styles.primaryButtonText}>{pollState.submitting ? 'Casting…' : 'Cast My Vote'}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.cardFoot}>{pollState.totalVotes} votes cast ✦</Text>
            )}
          </View>
        )}

        {/* COMMUNITY READ — last */}
        {bookClub?.threadId && bookClub.book && (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(
              `/lounge/thread?id=${encodeURIComponent(bookClub.threadId)}&kind=book_club` +
              `&bookWorkId=${encodeURIComponent(bookClub.book.workId)}` +
              `&bookTitle=${encodeURIComponent(bookClub.book.title)}` +
              `&bookAuthor=${encodeURIComponent(bookClub.book.author)}` +
              `&bookCover=${encodeURIComponent(bookClub.book.coverUrl ?? '')}` as any
            )}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.eyebrow}>Community Read</Text>
              {!bookClub.isOpen && <Text style={styles.cardFoot}>Discussion closed</Text>}
            </View>
            <Text style={styles.cardTitle}>{bookClub.book.title}</Text>
            <Text style={styles.cardByline}>by {bookClub.book.author}</Text>
            {!!bookClub.body && (
              <Text style={styles.cardBody} numberOfLines={3}>
                {(bookClub.authorName ?? 'Iris') + ': '}{bookClub.body}
              </Text>
            )}
            <Text style={styles.cardFoot}>{replies(bookClub.replyCount)}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const ROSE = '#B83255';
const BLUSH = '#E8B4C3';
const CREAM = '#FDF0F4';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E0F17' },
  scrollContent: { paddingBottom: spacing.xl },
  header: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  weekLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: BLUSH, fontFamily: 'Nunito_700Bold' },
  heading: { fontSize: 46, lineHeight: 52, color: CREAM, fontFamily: 'Cormorant_700Bold_Italic', marginTop: spacing.sm },
  pastButton: { marginTop: spacing.md, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(232,180,195,0.5)' },
  pastButtonText: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: BLUSH, fontFamily: 'Nunito_700Bold' },
  sectionHeading: { fontSize: 26, color: CREAM, fontFamily: 'Cormorant_700Bold_Italic', marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.md, backgroundColor: '#2A1420', borderRadius: 20, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(232,180,195,0.25)' },
  confessional: { borderColor: 'rgba(184,50,85,0.7)', backgroundColor: '#331624' },
  eyebrow: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: BLUSH, fontFamily: 'Nunito_700Bold' },
  confessionalTitle: { fontSize: 34, lineHeight: 38, color: CREAM, fontFamily: 'Cormorant_700Bold_Italic', marginTop: 6 },
  confessionalTagline: { fontSize: 14, color: 'rgba(253,240,244,0.8)', fontFamily: 'Nunito_400Regular_Italic', marginTop: 4 },
  promptBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: 14, backgroundColor: 'rgba(253,240,244,0.06)' },
  promptEmoji: { fontSize: 30, marginBottom: 4 },
  promptTitle: { fontSize: 20, lineHeight: 25, color: CREAM, fontFamily: 'Nunito_700Bold' },
  promptBody: { fontSize: 15, lineHeight: 22, color: 'rgba(253,240,244,0.9)', fontFamily: 'Nunito_400Regular', marginTop: 6 },
  offPrompt: { fontSize: 14, lineHeight: 20, color: BLUSH, fontFamily: 'Nunito_400Regular_Italic', marginTop: spacing.md },
  closedText: { fontSize: 13, color: BLUSH, fontFamily: 'Nunito_600SemiBold', marginTop: spacing.md },
  yoursLabel: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: BLUSH, fontFamily: 'Nunito_700Bold', marginTop: spacing.md },
  yoursText: { fontSize: 15, lineHeight: 21, color: CREAM, fontFamily: 'Nunito_400Regular_Italic', marginTop: 4 },
  primaryButton: { marginTop: spacing.md, borderRadius: 999, backgroundColor: ROSE, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { fontSize: 14, color: '#fff', fontFamily: 'Nunito_700Bold' },
  outlineButton: { marginTop: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: BLUSH, paddingVertical: 11, alignItems: 'center' },
  outlineButtonText: { fontSize: 14, color: BLUSH, fontFamily: 'Nunito_700Bold' },
  smallButton: { borderRadius: 999, backgroundColor: ROSE, paddingHorizontal: 16, paddingVertical: 9 },
  buttonDisabled: { opacity: 0.5 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 22, lineHeight: 27, color: CREAM, fontFamily: 'Cormorant_700Bold_Italic', marginTop: 6 },
  cardByline: { fontSize: 13, color: BLUSH, fontFamily: 'Nunito_600SemiBold', marginTop: 2 },
  cardBody: { fontSize: 15, lineHeight: 22, color: 'rgba(253,240,244,0.85)', fontFamily: 'Nunito_400Regular', marginTop: spacing.sm },
  cardFoot: { fontSize: 12, color: BLUSH, fontFamily: 'Nunito_600SemiBold', marginTop: spacing.sm },
  hot: { fontSize: 11, color: '#FFB199', fontFamily: 'Nunito_700Bold' },
  pollOptions: { marginTop: spacing.md, gap: spacing.sm },
  pollOption: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,180,195,0.35)', paddingVertical: 12, paddingHorizontal: spacing.md },
  pollOptionSelected: { borderColor: ROSE, backgroundColor: 'rgba(184,50,85,0.2)' },
  pollLabel: { fontSize: 15, color: CREAM, fontFamily: 'Nunito_600SemiBold', flexShrink: 1 },
  pollLabelSelected: { color: '#FFB3C7', fontFamily: 'Nunito_700Bold' },
  pollResult: { gap: 6 },
  pollResultHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  pollBar: { flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: 'rgba(253,240,244,0.1)', overflow: 'hidden' },
});
