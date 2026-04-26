import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, TextInput,
  StyleSheet, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { apiGet, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

type PlayerState = 'live' | 'replay' | 'offline' | 'loading';

type EventStatus = {
  isLive: boolean;
  viewerCount: number;
  playbackUrl: string | null;
  replayUrl: string | null;
  playerState: PlayerState;
};

// TODO (v1.0.1): wire QuickRatingModal here once Cozy Events Lambdas expose
// ratingPrompt + eventType on /cozy/home (or /cozy/events/status), analogous
// to commit d858fce on /live/{eventId}. Frontend stays dumb until backend
// returns the prompt signal.
type BCEvent = {
  sk?: string;
  eventId?: string;
  category?: string;
  title: string;
  description?: string;
  eventDate?: string;
  eventLink?: string;
  buttonState?: 'coming_soon' | 'submit_questions' | 'join_event' | 'watch_replay' | 'custom';
  buttonCustomText?: string;
  imageUrl?: string;
  submissionsOpen?: boolean;
  submissionsCutoffTime?: string;
  votingOpen?: boolean;
  submissionType?: 'song' | 'question';
  recipientEmail?: string;
  maxSubmissions?: number;
};

type Submission = {
  submissionId: string;
  text: string;
  votes: number;
  submittedAt: string;
};

type ModalTab = 'submit' | 'vote';

function formatEventDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function LiveBadge({ viewerCount }: { viewerCount: number }) {
  return (
    <View style={styles.liveBadge}>
      <View style={styles.liveDot} />
      <Text style={styles.liveBadgeText}>
        Live{viewerCount > 0 ? ` · ${viewerCount} watching` : ''}
      </Text>
    </View>
  );
}

function SubmitTab({ event, onSuccess }: { event: BCEvent; onSuccess: () => void }) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSong = event.submissionType === 'song';

  async function handleSubmit() {
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/cozy/events/submit', {
        eventId: event.eventId,
        text: input.trim(),
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <View style={styles.submitSuccess}>
        <View style={styles.submitSuccessIcon}>
          <Text style={{ fontSize: 24 }}>✓</Text>
        </View>
        <Text style={styles.submitSuccessTitle}>
          {isSong ? 'Request received! 🎵' : 'Question submitted! ✦'}
        </Text>
        <Text style={styles.submitSuccessBody}>
          {isSong ? "The DJ has your request. See you on the dance floor!" : "We'll do our best to cover it during the event."}
        </Text>
        <TouchableOpacity style={styles.submitSuccessButton} onPress={onSuccess}>
          <Text style={styles.submitSuccessButtonText}>See what others submitted →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.submitTab}>
      <Text style={styles.submitHint}>
        {isSong
          ? "Drop your request below and we'll do our best to get it in the mix!"
          : "Ask away — we'll try to cover as many questions as we can during the event."}
      </Text>
      <TextInput
        value={input}
        onChangeText={(v) => { setInput(v); setError(null); }}
        placeholder={isSong ? "What song are you feeling tonight?" : "What would you like to ask?"}
        placeholderTextColor="#9c8f7e"
        multiline
        style={[styles.submitInput, error && styles.submitInputError]}
        maxLength={500}
      />
      {error && <Text style={styles.submitError}>{error}</Text>}
      <Text style={[styles.charCount, input.length > 450 && styles.charCountWarning]}>
        {input.length}/500
      </Text>
      <TouchableOpacity
        style={[styles.submitButton, (!input.trim() || submitting) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!input.trim() || submitting}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? 'Sending…' : isSong ? 'Send Request' : 'Submit Question'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function VoteTab({ event }: { event: BCEvent }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState<string | null>(null);

  const isSong = event.submissionType === 'song';

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGet(`/cozy/events/${event.eventId}/submissions`);
        setSubmissions(res.submissions ?? []);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, [event.sk]);

  async function handleVote(submissionId: string) {
    if (votedIds.has(submissionId) || voting) return;
    setVoting(submissionId);
    try {
      const res = await apiPost('/cozy/events/vote', { eventId: event.eventId, submissionId });
      setVotedIds((prev) => new Set([...prev, submissionId]));
      setSubmissions((prev) =>
        prev.map((s) => s.submissionId === submissionId ? { ...s, votes: res.votes } : s)
          .sort((a, b) => b.votes - a.votes)
      );
    } catch {
      setVotedIds((prev) => new Set([...prev, submissionId]));
    } finally {
      setVoting(null);
    }
  }

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />;

  if (submissions.length === 0) {
    return (
      <View style={styles.voteEmpty}>
        <Text style={styles.voteEmptyText}>
          No {isSong ? 'requests' : 'questions'} yet — switch to Submit to be the first!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.voteList}>
      {submissions.map((s, i) => {
        const hasVoted = votedIds.has(s.submissionId);
        return (
          <View key={s.submissionId} style={[styles.voteItem, i === 0 && styles.voteItemTop]}>
            {i === 0 && <Text style={styles.voteItemFire}>🔥</Text>}
            <Text style={styles.voteItemText}>{s.text}</Text>
            <TouchableOpacity
              style={[styles.voteButton, hasVoted && styles.voteButtonActive]}
              onPress={() => handleVote(s.submissionId)}
              disabled={hasVoted || !!voting}
            >
              <Text style={[styles.voteArrow, hasVoted && styles.voteArrowActive]}>↑</Text>
              <Text style={[styles.voteCount, hasVoted && styles.voteCountActive]}>{s.votes}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

function EventModal({ event, initialTab, onClose }: {
  event: BCEvent; initialTab: ModalTab; onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);
  const isSong = event.submissionType === 'song';
  const showSubmit = event.submissionsOpen === true;
  const showVote = event.votingOpen === true;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalEventTitle}>{event.title}</Text>
            <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {showSubmit && showVote && (
            <View style={styles.tabs}>
              {[
                { key: 'submit' as ModalTab, label: isSong ? '🎵 Request' : '✦ Submit' },
                { key: 'vote' as ModalTab, label: isSong ? '🔥 Vote' : '📊 Vote' },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {activeTab === 'submit' && showSubmit && (
              <SubmitTab event={event} onSuccess={() => setActiveTab('vote')} />
            )}
            {activeTab === 'vote' && showVote && (
              <VoteTab event={event} />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function CozyEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<EventStatus | null>(null);
  const [event, setEvent] = useState<BCEvent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [statusRes, homeRes] = await Promise.all([
          apiGet('/cozy/events/status'),
          apiGet('/cozy/home'),
        ]);
        setStatus(statusRes);
        const events: BCEvent[] = homeRes?.active?.sections?.events ?? [];
        setEvent(events[0] ?? null);
      } catch {} finally {
        setLoaded(true);
      }
    }
    load();

    const interval = setInterval(async () => {
      try {
        const statusRes = await apiGet('/cozy/events/status');
        setStatus(statusRes);
      } catch {}
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const playerState: PlayerState = !loaded ? 'loading' : (status?.playerState ?? 'offline');
  const isLive = playerState === 'live';
  const isReplay = playerState === 'replay';
  const buttonState = event?.buttonState ?? 'coming_soon';
  const showSubmitButton = event?.submissionsOpen === true;
  const showVoteButton = event?.votingOpen === true;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {modalTab && event && (
        <EventModal event={event} initialTab={modalTab} onClose={() => setModalTab(null)} />
      )}

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <CaretLeft size={20} color="#0F2A48" weight="bold" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerLabel}>Live & Upcoming</Text>
            <Text style={styles.headerTitle}>Cozy Events</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.irisButton} onPress={() => router.push('/iris/chat?from=cozy/events' as any)}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
        </TouchableOpacity>
      </View>

      {/* IRIS NOTE */}
      <View style={styles.irisNote}>
        <Text style={styles.irisNoteIcon}>✦</Text>
        <Text style={styles.irisNoteText}>Author events, dance parties, and special community moments.</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {/* LIVE/REPLAY BADGE */}
            {isLive && <View style={{ marginBottom: spacing.sm }}><LiveBadge viewerCount={status?.viewerCount ?? 0} /></View>}
            {isReplay && (
              <View style={styles.replayBadge}>
                <Text style={styles.replayBadgeText}>▶ Replay</Text>
              </View>
            )}

            {/* EVENT INFO */}
            {event ? (
              <View>
                {event.imageUrl && (
                  <Image source={{ uri: event.imageUrl }} style={styles.eventCover} resizeMode="cover" />
                )}
                <Text style={styles.eventTitle}>{event.title}</Text>
                {event.eventDate && (
                  <Text style={styles.eventDate}>{formatEventDate(event.eventDate)}</Text>
                )}
                {event.description && (
                  <Text style={styles.eventDescription}>{event.description}</Text>
                )}

                {/* ACTION BUTTONS */}
                <View style={styles.actionButtons}>
                  {buttonState !== 'coming_soon' && buttonState !== 'submit_questions' && !showSubmitButton && (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => event.eventLink && WebBrowser.openBrowserAsync(event.eventLink)}
                      disabled={!event.eventLink}
                    >
                      <Text style={styles.primaryButtonText}>
                        {buttonState === 'custom' ? (event.buttonCustomText || 'Learn More')
                          : buttonState === 'join_event' ? 'Join Event →'
                          : buttonState === 'watch_replay' ? 'Watch Replay →'
                          : 'Coming Soon'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showSubmitButton && (
                    <TouchableOpacity style={styles.primaryButton} onPress={() => setModalTab('submit')}>
                      <Text style={styles.primaryButtonText}>
                        {event.submissionType === 'song' ? '🎵 Request a Song' : '✦ Submit a Question'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showVoteButton && (
                    <TouchableOpacity style={styles.outlineButton} onPress={() => setModalTab('vote')}>
                      <Text style={styles.outlineButtonText}>
                        {event.submissionType === 'song' ? 'Vote on Requests' : 'Vote on Questions'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {buttonState === 'coming_soon' && !showSubmitButton && !showVoteButton && (
                    <View style={[styles.primaryButton, styles.primaryButtonDisabled]}>
                      <Text style={styles.primaryButtonTextDisabled}>Coming Soon</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Image source={{ uri: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c' }} style={styles.emptyImage} resizeMode="cover" />
                <Text style={styles.emptyTitle}>Between Covers Live</Text>
                <Text style={styles.emptySubtitle}>A Cozy Community Event</Text>
                <Text style={styles.emptyText}>Check back soon — Iris is always planning something good.</Text>
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
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#B83255', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  liveBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.6, textTransform: 'uppercase' },
  replayBadge: { backgroundColor: '#0F2A48', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: spacing.sm },
  replayBadgeText: { fontSize: 11, fontWeight: '700', color: '#A9C0D4', letterSpacing: 0.6, textTransform: 'uppercase' },
  eventCover: { width: '100%', height: 200, borderRadius: 18, marginBottom: spacing.lg },
  eventTitle: { fontSize: 26, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48', lineHeight: 32, marginBottom: 6 },
  eventDate: { fontSize: 13, fontWeight: '700', color: '#B83255', marginBottom: spacing.md },
  eventDescription: { fontSize: 14, lineHeight: 22, color: '#4A4A4A', fontWeight: '300', marginBottom: spacing.xl },
  actionButtons: { gap: spacing.sm },
  primaryButton: { paddingVertical: 15, borderRadius: 50, backgroundColor: '#B83255', alignItems: 'center' },
  primaryButtonDisabled: { backgroundColor: '#e0d8cc' },
  primaryButtonText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  primaryButtonTextDisabled: { fontSize: 14, fontWeight: '700', color: '#9c8f7e', letterSpacing: 0.2 },
  outlineButton: { paddingVertical: 15, borderRadius: 50, borderWidth: 1.5, borderColor: '#0F2A48', alignItems: 'center' },
  outlineButtonText: { fontSize: 14, fontWeight: '700', color: '#0F2A48', letterSpacing: 0.2 },
  emptyState: { alignItems: 'center', gap: spacing.sm },
  emptyImage: { width: '100%', height: 200, borderRadius: 18, marginBottom: spacing.md },
  emptyTitle: { fontSize: 26, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  emptySubtitle: { fontSize: 15, fontStyle: 'italic', color: '#6A5969' },
  emptyText: { fontSize: 14, color: '#4A4A4A', fontWeight: '300', textAlign: 'center', lineHeight: 22 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,42,72,0.4)', zIndex: 40 },
  modalContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50 },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.15, shadowRadius: 40, elevation: 10 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0d8cc', alignSelf: 'center', marginTop: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingTop: spacing.md },
  modalEventTitle: { flex: 1, fontSize: 13, fontStyle: 'italic', color: '#9c8f7e' },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 14, color: '#0F2A48', fontWeight: '600' },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: 'rgba(15,42,72,0.05)', borderRadius: 14, padding: 4, marginBottom: spacing.sm },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#9c8f7e', letterSpacing: 0.2 },
  tabTextActive: { color: '#0F2A48' },
  modalContent: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  submitTab: { paddingTop: spacing.xs },
  submitHint: { fontSize: 13, fontWeight: '300', color: '#6A5969', lineHeight: 20, marginBottom: spacing.md },
  submitInput: { borderRadius: 14, borderWidth: 1.5, borderColor: '#D7E2E9', padding: spacing.md, fontSize: 14, color: '#0F2A48', fontFamily: 'System', lineHeight: 22, minHeight: 120, textAlignVertical: 'top', backgroundColor: '#FAFBFC' },
  submitInputError: { borderColor: '#B83255' },
  submitError: { fontSize: 12, color: '#B83255', marginTop: 8 },
  charCount: { fontSize: 11, color: '#b0a090', fontWeight: '300', textAlign: 'right', marginVertical: 6 },
  charCountWarning: { color: '#B83255' },
  submitButton: { paddingVertical: 15, borderRadius: 50, backgroundColor: '#B83255', alignItems: 'center', marginTop: spacing.sm },
  submitButtonDisabled: { backgroundColor: '#e0d8cc' },
  submitButtonText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  submitSuccess: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  submitSuccessIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center', justifyContent: 'center' },
  submitSuccessTitle: { fontSize: 22, fontWeight: '600', fontStyle: 'italic', color: '#0F2A48' },
  submitSuccessBody: { fontSize: 13, color: '#6A5969', textAlign: 'center', lineHeight: 20, fontWeight: '300' },
  submitSuccessButton: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 50, backgroundColor: '#0F2A48' },
  submitSuccessButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  voteEmpty: { paddingVertical: 40, alignItems: 'center' },
  voteEmptyText: { fontSize: 13, color: '#9c8f7e', fontWeight: '300', textAlign: 'center', lineHeight: 20 },
  voteList: { gap: 10, paddingTop: spacing.sm },
  voteItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#f0ede4', borderRadius: 14, padding: spacing.md },
  voteItemTop: { backgroundColor: '#FFF8F0', borderColor: '#f0d4b0' },
  voteItemFire: { fontSize: 14, flexShrink: 0 },
  voteItemText: { flex: 1, fontSize: 14, color: '#0F2A48', fontWeight: '300', lineHeight: 20 },
  voteButton: { flexShrink: 0, backgroundColor: 'rgba(15,42,72,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 44 },
  voteButtonActive: { backgroundColor: '#0F2A48' },
  voteArrow: { fontSize: 14, fontWeight: '700', color: '#0F2A48' },
  voteArrowActive: { color: '#fff' },
  voteCount: { fontSize: 11, fontWeight: '700', color: '#0F2A48' },
  voteCountActive: { color: '#fff' },
});