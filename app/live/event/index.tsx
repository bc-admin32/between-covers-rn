import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { OptimizedImage } from '../../../components/OptimizedImage';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { apiGet, apiPost, ApiError } from '../../../lib/api';
import { spacing, radius, colors } from '../../../lib/theme';
import QuickRatingModal from '../../../components/QuickRatingModal';
import type { LiveRoom } from '../../../lib/types';
import ReportMessageSheet, { type ReportTarget } from '../../../components/live/ReportMessageSheet';
import LiveEventRestrictionScreen, { type LiveEventRestrictionReason } from '../../../components/live/LiveEventRestrictionScreen';
import LiveEventTermsModal, { shouldShowLiveEventTermsGate } from '../../../components/live/LiveEventTermsModal';
import EjectionBanner, { type EjectionEvent } from '../../../components/live/EjectionBanner';
import WarningBanner, { type WarningEvent } from '../../../components/live/WarningBanner';

// Single-room legacy flow has no rooms[], so report writes target a
// synthetic "main" room — the backend treats it as the event's own chat.
const SINGLE_ROOM_ID = 'main';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar2.png';

type GameState = {
  activeGameType: string | null;
  currentRound: number;
  irisMode: string;
  gameBanner?: { label: string; instruction: string } | null;
};

type LiveEvent = {
  eventId: string;
  title: string;
  description: string | null;
  eventType: 'AUTHOR_EVENT' | 'DANCE_PARTY' | 'IRIS_LIVE';
  liveType?: 'gameNight' | 'giveaway' | 'justVibing';
  hostName: string;
  coverUrl: string | null;
  scheduledAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  rsvpCount: number;
  bookTitle?: string | null;
  closingMessage?: string | null;
  gameState?: GameState | null;
  rooms?: LiveRoom[];
  ratingsEnabled?: boolean;
  ratingPrompt?: {
    show: boolean;
  };
};

type ChatMessage = {
  id: string;
  // IVS Sender.UserId — required to identify the reported user when the
  // current user long-presses someone else's message.
  userId?: string;
  sender: string;
  message: string;
  type: 'USER' | 'IRIS_CHIME' | 'IRIS_CLOSING' | 'SYSTEM';
  timestamp: Date;
  photoUrl?: string;
};

export default function LiveEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpd, setRsvpd] = useState(false);
  const [chatToken, setChatToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState<{
    userId?: string;
    displayName: string;
    photoUrl: string | null;
    liveEventTermsAcceptedAt?: string | null;
    liveEventTermsVersion?: string | null;
  } | null>(null);
  const [gameBannerExpanded, setGameBannerExpanded] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [restriction, setRestriction] = useState<{ reason: LiveEventRestrictionReason; liftsAt: string | null } | null>(null);
  const [termsGateVisible, setTermsGateVisible] = useState(false);
  const [ejection, setEjection] = useState<EjectionEvent | null>(null);
  const [warning, setWarning] = useState<WarningEvent | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Read inside ws.onmessage so the closure sees the current userId even
  // when profile loads/updates after the WebSocket is established.
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!eventId) { setLoading(false); return; }
    const load = async () => {
      try {
        const [eventRes, profileRes] = await Promise.all([
          apiGet<{ event: LiveEvent }>(`/live/${eventId}`),
          apiGet<{
            userId?: string;
            displayName: string;
            photoUrl: string | null;
            liveEventTermsAcceptedAt?: string | null;
            liveEventTermsVersion?: string | null;
          }>('/profile'),
        ]);

        // Defensive: multi-room IRIS_LIVE events should only enter via the home banner → LobbyModal.
        // If we somehow landed here (deep link, stale notification), bounce back to home.
        if (eventRes.event.rooms && eventRes.event.rooms.length > 0) {
          router.replace('/' as any);
          return;
        }

        setEvent(eventRes.event);
        setProfile(profileRes);
        const rsvpRes = await apiGet<{ rsvpd: boolean }>(`/live/${eventId}/rsvp`);
        setRsvpd(rsvpRes.rsvpd);
      } catch {} finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
    };
  }, [eventId]);

  // Deep-link safety: if the user landed here without going through the home
  // banner (the entry point that normally gates terms), enforce the same
  // acceptance check here once the profile loads.
  useEffect(() => {
    if (!profile) return;
    if (shouldShowLiveEventTermsGate(profile)) setTermsGateVisible(true);
  }, [profile]);

  useEffect(() => {
    if (profile?.userId) myUserIdRef.current = profile.userId;
  }, [profile?.userId]);

  // Auto-dismiss toast — success copy fades quickly, error sticks slightly
  // longer so it doesn't disappear before the user reads it.
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === 'success' ? 2200 : 3500;
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!event || event.status !== 'ACTIVE' || event.liveType !== 'gameNight') return;
    const interval = setInterval(async () => {
      try {
        const res = await apiGet<{ event: LiveEvent }>(`/live/${eventId}`);
        setEvent((prev) => prev ? { ...prev, gameState: res.event.gameState } : prev);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [event?.status, event?.liveType]);

  useEffect(() => {
    if (!chatToken || !event || event.status !== 'ACTIVE') return;
    const ws = new WebSocket('wss://edge.ivschat.us-east-1.amazonaws.com', chatToken);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.Type === 'MESSAGE') {
          setMessages((prev) => [...prev, {
            id: data.Id ?? Date.now().toString(),
            userId: data.Sender?.UserId,
            sender: data.Sender?.Attributes?.displayName ?? data.Sender?.UserId ?? 'Reader',
            message: data.Content,
            type: 'USER',
            timestamp: new Date(data.SendTime ?? Date.now()),
            photoUrl: data.Sender?.Attributes?.photoUrl,
          }]);
        }
        if (data.Type === 'EVENT' && (data.EventName === 'iris:chime' || data.EventName === 'iris:closing')) {
          setMessages((prev) => [...prev, {
            id: Date.now().toString(),
            sender: 'Iris',
            message: data.Attributes?.message ?? '',
            type: data.EventName === 'iris:closing' ? 'IRIS_CLOSING' : 'IRIS_CHIME',
            timestamp: new Date(),
          }]);
        }
        if (data.Type === 'EVENT' && data.EventName === 'bc:ejection') {
          const attrs = data.Attributes ?? {};
          const style = attrs.presentationStyle === 'interrupt' ? 'interrupt' : 'banner';
          setEjection({
            message: attrs.message ?? '',
            presentationStyle: style,
            timestamp: attrs.timestamp,
            eventId: attrs.eventId,
            roomId: attrs.roomId,
            localKey: `${attrs.timestamp ?? ''}-${Date.now()}-${Math.random()}`,
          });
        }
        if (data.Type === 'EVENT' && data.EventName === 'bc:warning') {
          // Broadcast to every participant — only the targeted user should
          // see the banner; everyone else returns silently with no log.
          const attrs = data.Attributes ?? {};
          if (!myUserIdRef.current || attrs.userId !== myUserIdRef.current) return;
          console.log('[liveEvent] bc:warning received for current user, count:', attrs.warningCount);
          setWarning({
            message: attrs.message ?? '',
            warningCount: attrs.warningCount,
            timestamp: attrs.timestamp,
            localKey: `${attrs.timestamp ?? ''}-${Date.now()}-${Math.random()}`,
          });
        }
      } catch {}
    };
    return () => ws.close();
  }, [chatToken, event]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  useEffect(() => {
    if (event?.ratingPrompt?.show === true) {
      setShowRatingModal(true);
    }
  }, [event?.ratingPrompt?.show]);

  const handleRSVP = async () => {
    if (!eventId) return;
    try {
      await apiPost(`/live/${eventId}/rsvp`, { displayName: profile?.displayName, photoUrl: profile?.photoUrl });
      setRsvpd(true);
      setEvent((prev) => prev ? { ...prev, rsvpCount: prev.rsvpCount + 1 } : prev);
    } catch {}
  };

  const handleJoinChat = async () => {
    if (!eventId) return;
    try {
      const res = await apiPost<{ token: string }>(`/live/${eventId}/chat-token`, { displayName: profile?.displayName, photoUrl: profile?.photoUrl });
      setChatToken(res.token);
    } catch (err) {
      // Same restriction-code branching as /join in the multi-room flow.
      // The four reason codes are documented contract; anything else falls
      // through silently to match the original swallow behaviour.
      if (err instanceof ApiError && err.status === 403 && err.body?.reason) {
        const reason = err.body.reason as string;
        if (reason === 'TERMS_ACCEPTANCE_REQUIRED') {
          setTermsGateVisible(true);
          return;
        }
        if (
          reason === 'LIVE_EVENTS_BANNED'
          || reason === 'LIVE_EVENTS_SUSPENDED'
          || reason === 'LOUNGE_SUSPENDED'
        ) {
          setRestriction({ reason, liftsAt: err.body?.liftsAt ?? null });
        }
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || sending || !wsRef.current) return;
    setSending(true);
    try {
      wsRef.current.send(JSON.stringify({ Action: 'SEND_MESSAGE', Content: input.trim() }));
      setInput('');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading event…</Text>
      </View>
    );
  }

  if (!eventId || !event) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
        <Text style={styles.errorText}>Event not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 403 reason from chat-token replaces the whole screen with the dedicated
  // restriction view — the user can still back out via router.back().
  if (restriction) {
    return (
      <LiveEventRestrictionScreen
        reason={restriction.reason}
        liftsAt={restriction.liftsAt}
        onBack={() => router.back()}
      />
    );
  }

  const isActive = event.status === 'ACTIVE';
  const isEnded = event.status === 'ENDED';
  const isScheduled = event.status === 'SCHEDULED';
  const inChat = !!chatToken;
  const isGameNight = event.liveType === 'gameNight';
  const gameState = event.gameState;
  const showGameBanner = isGameNight && gameState?.activeGameType && gameState.irisMode !== 'justVibing' && gameState.irisMode !== 'signOff' && gameState.gameBanner;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <CaretLeft size={20} color="rgba(253,250,246,0.7)" weight="bold" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.eventInfo}>
          <View style={styles.eventInfoLeft}>
            {isActive && (
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live Now</Text>
              </View>
            )}
            {isEnded && <Text style={styles.endedText}>Ended</Text>}
            <Text style={styles.eventTitle}>{event.title}</Text>
            {event.bookTitle && <Text style={styles.bookTitle}>📖 {event.bookTitle}</Text>}
          </View>
          <View style={styles.rsvpBadge}>
            <Text style={styles.rsvpBadgeText}>{event.rsvpCount} joined</Text>
          </View>
        </View>
      </View>

      {/* GAME BANNER */}
      {showGameBanner && inChat && (
        <TouchableOpacity
          style={styles.gameBanner}
          onPress={() => setGameBannerExpanded(!gameBannerExpanded)}
        >
          <Text style={styles.gameBannerTitle}>
            {gameState!.gameBanner!.label} · Round {gameState!.currentRound}
          </Text>
          <Text style={styles.gameBannerChevron}>{gameBannerExpanded ? '▲' : '▼'}</Text>
          {gameBannerExpanded && (
            <Text style={styles.gameBannerInstruction}>{gameState!.gameBanner!.instruction}</Text>
          )}
        </TouchableOpacity>
      )}

      {/* SCHEDULED */}
      {isScheduled && (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scheduledContent} showsVerticalScrollIndicator={false}>
          {event.coverUrl && (
            <Image source={{ uri: event.coverUrl }} style={styles.scheduledCover} contentFit="cover" />
          )}
          {event.description && (
            <Text style={styles.scheduledDescription}>{event.description}</Text>
          )}
          {!rsvpd ? (
            <TouchableOpacity style={styles.rsvpButton} onPress={handleRSVP}>
              <Text style={styles.rsvpButtonText}>Save My Spot ✦</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.rsvpdText}>You're on the list ✦</Text>
          )}
        </ScrollView>
      )}

      {/* ENDED */}
      {isEnded && event.closingMessage && (
        <View style={styles.closingCard}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.closingAvatar} />
          <Text style={styles.closingName}>Iris</Text>
          <Text style={styles.closingMessage}>"{event.closingMessage}"</Text>
        </View>
      )}

      {/* ACTIVE - JOIN CHAT */}
      {isActive && !inChat && (
        <View style={styles.joinChatContainer}>
          <Text style={styles.joinChatText}>Jump into the conversation</Text>
          <TouchableOpacity style={styles.joinChatButton} onPress={handleJoinChat}>
            <Text style={styles.joinChatButtonText}>Join Live →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ACTIVE - CHAT */}
      {isActive && inChat && (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg) => {
              const isIris = msg.type === 'IRIS_CHIME' || msg.type === 'IRIS_CLOSING';
              if (isIris) {
                return (
                  <View key={msg.id} style={styles.irisChatRow}>
                    <Image source={{ uri: IRIS_AVATAR }} style={styles.irisChatAvatar} />
                    <View style={styles.irisChatContent}>
                      <Text style={styles.irisChatName}>Iris</Text>
                      <View style={styles.irisChatBubble}>
                        <Text style={styles.irisChatText}>{msg.message}</Text>
                      </View>
                    </View>
                  </View>
                );
              }
              // Long-press affordance only fires for other users' messages —
              // self gets the same bubble but no long-press handler.
              const reportable = msg.type === 'USER'
                && !!profile?.userId
                && !!msg.userId
                && msg.userId !== profile.userId;
              return (
                <View key={msg.id} style={styles.userChatRow}>
                  {msg.photoUrl ? (
                    <OptimizedImage uri={msg.photoUrl} style={styles.userChatAvatar} />
                  ) : (
                    <View style={[styles.userChatAvatar, styles.userChatAvatarFallback]}>
                      <Text style={styles.userChatAvatarText}>{msg.sender[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.userChatContent}>
                    <Text style={styles.userChatName}>{msg.sender}</Text>
                    <Pressable
                      onLongPress={
                        reportable
                          ? () => setReportTarget({
                              eventId: eventId!,
                              roomId: SINGLE_ROOM_ID,
                              reportedUserId: msg.userId!,
                              messageId: msg.id,
                              reportedMessageContent: msg.message,
                              reportedDisplayName: msg.sender,
                            })
                          : undefined
                      }
                      delayLongPress={400}
                      disabled={!reportable}
                      style={({ pressed }) => [
                        styles.userChatBubble,
                        pressed && reportable && styles.userChatBubblePressed,
                      ]}
                      accessibilityRole={reportable ? 'button' : undefined}
                      accessibilityHint={reportable ? 'Long-press to report this message' : undefined}
                    >
                      <Text style={styles.userChatText}>{msg.message}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <View style={{ height: spacing.md }} />
          </ScrollView>

          <View style={[styles.chatComposer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              placeholder="Say something…"
              placeholderTextColor="rgba(253,250,246,0.4)"
              style={styles.chatInput}
              maxLength={500}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.sendButtonText}>→</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {showRatingModal && event && (
        <QuickRatingModal
          eventId={event.eventId}
          eventType={event.eventType}
          eventTitle={event.title}
          onClose={() => setShowRatingModal(false)}
          onSkip={() => setShowRatingModal(false)}
        />
      )}

      {/* bc:ejection overlay — owned by this screen so the timer resets */}
      {/* when a new ejection lands while one is still visible. */}
      <EjectionBanner ejection={ejection} onDismiss={() => setEjection(null)} />

      {/* bc:warning banner — only mounted when the event was for the */}
      {/* current user (filter happens in the ws handler upstream). */}
      <WarningBanner warning={warning} onDismiss={() => setWarning(null)} />

      {toast && (
        <View style={[styles.toast, toast.kind === 'error' && styles.toastError]} pointerEvents="none">
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}

      <ReportMessageSheet
        visible={!!reportTarget}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onToast={(text, kind) => setToast({ text, kind })}
      />

      {/* Backend-driven and deep-link gate. On cancel we bounce out so the */}
      {/* user can't sit on a chat they haven't agreed to participate in. */}
      <LiveEventTermsModal
        visible={termsGateVisible}
        onAccept={() => {
          setTermsGateVisible(false);
          // Refresh profile so the next gate check sees the new acceptance.
          apiGet<{
            userId?: string;
            displayName: string;
            photoUrl: string | null;
            liveEventTermsAcceptedAt?: string | null;
            liveEventTermsVersion?: string | null;
          }>('/profile').then(setProfile).catch(() => {});
        }}
        onCancel={() => {
          setTermsGateVisible(false);
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  loadingText: { fontSize: 14, color: '#B09A7E', marginTop: spacing.sm },
  errorText: { fontSize: 14, color: 'rgba(253,250,246,0.6)', textAlign: 'center' },
  backLink: { marginTop: spacing.md },
  backLinkText: { fontSize: 14, color: '#C4A882', textDecorationLine: 'underline' },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, flexShrink: 0 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  backArrow: { fontSize: 18, color: 'rgba(253,250,246,0.6)' },
  backText: { fontSize: 12, color: 'rgba(253,250,246,0.6)' },
  eventInfo: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  eventInfoLeft: { flex: 1 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#B83255' },
  liveText: { fontSize: 10, fontWeight: '700', color: '#B83255', letterSpacing: 1.5, textTransform: 'uppercase' },
  endedText: { fontSize: 10, fontWeight: '600', color: '#C4A882', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: spacing.xs },
  eventTitle: { fontSize: 22, color: '#FDFAF6', fontStyle: 'italic', fontWeight: '600', lineHeight: 28 },
  bookTitle: { fontSize: 11, color: '#C4A882', marginTop: 4 },
  rsvpBadge: { backgroundColor: 'rgba(184,50,85,0.2)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  rsvpBadgeText: { fontSize: 11, fontWeight: '600', color: '#F5A3BC' },
  gameBanner: { backgroundColor: 'rgba(124,58,237,0.15)', borderBottomWidth: 1, borderBottomColor: 'rgba(124,58,237,0.3)', padding: spacing.md, flexShrink: 0 },
  gameBannerTitle: { fontSize: 13, color: '#C4A0F0', fontWeight: '700', marginBottom: 4 },
  gameBannerChevron: { position: 'absolute', top: spacing.md, right: spacing.md, fontSize: 10, color: '#C4A0F0' },
  gameBannerInstruction: { fontSize: 12, color: 'rgba(196,160,240,0.8)', lineHeight: 18 },
  scrollArea: { flex: 1 },
  scheduledContent: { padding: spacing.lg },
  scheduledCover: { width: '100%', height: 144, borderRadius: 14, marginBottom: spacing.md },
  scheduledDescription: { fontSize: 13, color: 'rgba(253,250,246,0.6)', lineHeight: 20, marginBottom: spacing.xl },
  rsvpButton: { backgroundColor: '#B83255', borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  rsvpButtonText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  rsvpdText: { textAlign: 'center', fontSize: 12, color: '#C4A882' },
  closingCard: { margin: spacing.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(196,168,130,0.2)', alignItems: 'flex-start' },
  closingAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(232,213,229,0.5)', marginBottom: spacing.xs },
  closingName: { fontSize: 11, fontWeight: '600', color: '#C4A882', marginBottom: spacing.sm },
  closingMessage: { fontSize: 18, color: '#FDFAF6', fontStyle: 'italic', lineHeight: 28 },
  joinChatContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  joinChatText: { fontSize: 13, color: 'rgba(253,250,246,0.6)' },
  joinChatButton: { backgroundColor: '#B83255', borderRadius: 999, paddingHorizontal: 32, paddingVertical: 12 },
  joinChatButtonText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  irisChatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  irisChatAvatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(232,213,229,0.5)' },
  irisChatContent: { flex: 1 },
  irisChatName: { fontSize: 10, fontWeight: '600', color: '#C4A0F0', marginBottom: 4 },
  irisChatBubble: { backgroundColor: 'rgba(124,58,237,0.2)', borderRadius: 14, borderTopLeftRadius: 4, padding: spacing.sm, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)' },
  irisChatText: { fontSize: 15, color: '#E8D5E5', fontStyle: 'italic' },
  userChatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  userChatAvatar: { width: 28, height: 28, borderRadius: 14 },
  userChatAvatarFallback: { backgroundColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  userChatAvatarText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  userChatContent: { flex: 1 },
  userChatName: { fontSize: 10, fontWeight: '600', color: 'rgba(196,168,130,0.8)', marginBottom: 4 },
  userChatBubble: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, borderTopLeftRadius: 4, padding: spacing.sm },
  userChatBubblePressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  userChatText: { fontSize: 13, color: 'rgba(253,250,246,0.85)' },
  toast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,42,72,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(245,163,188,0.4)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 60,
  },
  toastError: {
    backgroundColor: 'rgba(184,50,85,0.95)',
    borderColor: 'rgba(245,163,188,0.6)',
  },
  toastText: { color: '#FDFAF6', fontSize: 13, fontWeight: '600' },
  chatComposer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: 'rgba(253,250,246,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});