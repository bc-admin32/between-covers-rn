import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Pressable,
  StyleSheet, ActivityIndicator, Image, TextInput,
  KeyboardAvoidingView, Platform, Modal, AppState,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Notifications from 'expo-notifications';
import { apiGet, apiPost, ApiError } from '../../lib/api';
import { radius, spacing, colors } from '../../lib/theme';
import type { LiveRoom, LiveEvent, RoomState, RoomJoinResponse, VotePrompt, VoteGameType } from '../../lib/types';
import { VOTE_GAME_TYPES } from '../../lib/types';
import ReportMessageSheet, { type ReportTarget } from './ReportMessageSheet';
import LiveEventRestrictionScreen, { type LiveEventRestrictionReason } from './LiveEventRestrictionScreen';
import LiveEventTermsModal from './LiveEventTermsModal';
import EjectionBanner, { type EjectionEvent } from './EjectionBanner';
import WarningBanner, { type WarningEvent } from './WarningBanner';

// RoomScreen — second modal layer, sits on top of LobbyModal.
// Joins a single room: chat over IVS WebSocket, optional Sketch the Scene
// video, sticky pinned bar for Iris commentary, game banner, composer.
// "Back to Lobby" closes this modal and reveals the lobby underneath.

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar2.png';

// Poll cadence: normally every 30s (matches backend chime tick).
// During an active sketchTheScene game we poll faster so reveal transitions
// (sketchPhase: playing → revealing → advance) render in near-real-time
// instead of being missed in a 30s window.
const POLL_NORMAL_MS = 30_000;
const POLL_SKETCH_MS = 3_000;

type ChatMessage = {
  id: string;
  sender: string;
  // IVS Sender.UserId for the originating user. Iris/SYSTEM messages have
  // no userId. Used to populate ReportTarget and to skip the long-press
  // affordance on the current user's own messages.
  userId?: string;
  message: string;
  type: 'USER' | 'IRIS_CHIME' | 'IRIS_CLOSING' | 'SYSTEM';
  timestamp: Date;
  photoUrl?: string;
};

type RoomScreenProps = {
  eventId: string;
  roomId: string;
  room: LiveRoom;
  eventTitle: string;
  onBackToLobby: () => void;
};

export default function RoomScreen({
  eventId,
  roomId,
  room,
  onBackToLobby,
}: RoomScreenProps) {
  const insets = useSafeAreaInsets();
  const [chatToken, setChatToken] = useState<string | null>(null);
  const [attendanceSk, setAttendanceSk] = useState<string | null>(null);
  const [isPreEvent, setIsPreEvent] = useState(false);
  // From the room-join response: the room's live-broadcast HLS (.m3u8) URL and
  // whether the room streams video or is chat-only. Set once at join — the
  // /live poll that refreshes liveRoom does not carry these fields.
  const [ivsPlaybackUrl, setIvsPlaybackUrl] = useState<string | null>(null);
  const [outputMode, setOutputMode] = useState<'video' | 'text' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  // Structured voting (iris:prompt) — separate from chat/pinned. votePrompt
  // reflects the latest event as-is; myVoteChoiceIndex/voteClosed are local
  // per-round state reset whenever a new roundId arrives.
  const [votePrompt, setVotePrompt] = useState<VotePrompt | null>(null);
  const [myVoteChoiceIndex, setMyVoteChoiceIndex] = useState<number | null>(null);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteClosed, setVoteClosed] = useState(false);
  const [liveRoom, setLiveRoom] = useState<LiveRoom>(room);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [restriction, setRestriction] = useState<{ reason: LiveEventRestrictionReason; liftsAt: string | null } | null>(null);
  const [termsGateVisible, setTermsGateVisible] = useState(false);
  const [ejection, setEjection] = useState<EjectionEvent | null>(null);
  const [warning, setWarning] = useState<WarningEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const prevMessageCountRef = useRef(0);
  // Read inside ws.onmessage so the closure sees the current userId even
  // when /profile resolves after the WebSocket is established.
  const myUserIdRef = useRef<string | null>(null);
  // Tracks the last-seen votePrompt.roundId so ws.onmessage can detect a
  // new round and reset per-round vote state without an extra effect.
  const voteRoundIdRef = useRef<string | null>(null);

  // Initial mount: fetch profile + join room
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const profileRes = await apiGet<{
          userId?: string;
          displayName: string;
          photoUrl: string | null;
        }>('/profile');
        const joinRes = await apiPost<RoomJoinResponse>(
          `/live/${eventId}/rooms/${roomId}/join`,
          { displayName: profileRes.displayName, photoUrl: profileRes.photoUrl }
        );
        if (cancelled) return;
        if (profileRes.userId) {
          setMyUserId(profileRes.userId);
          myUserIdRef.current = profileRes.userId;
        }
        setChatToken(joinRes.token);
        setAttendanceSk(joinRes.attendanceSk);
        setIsPreEvent(joinRes.isPreEvent);
        setIvsPlaybackUrl(joinRes.room?.ivsPlaybackUrl ?? null);
        setOutputMode(joinRes.room?.outputMode ?? 'text');
      } catch (err) {
        if (cancelled) return;
        // Restriction branch — handle reason codes from /join. The four codes
        // come back as 403 with body.reason; TERMS_ACCEPTANCE_REQUIRED redirects
        // to the terms modal, the other three render the dedicated screen.
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
            return;
          }
        }
        setJoinError("Couldn't join the room. Try again?");
        console.warn('Room join failed:', err);
      }
    }
    init();
    return () => {
      cancelled = true;
      Notifications.setBadgeCountAsync(0).catch(() => {});
    };
  }, [eventId, roomId]);

  // WebSocket / chat connection
  useEffect(() => {
    if (!chatToken) return;
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

        if (data.Type === 'EVENT') {
          if (data.EventName === 'iris:pinned') {
            setPinnedMessage(data.Attributes?.message ?? null);
          }
          if (data.EventName === 'iris:chime' || data.EventName === 'iris:closing') {
            setMessages((prev) => [...prev, {
              id: Date.now().toString(),
              sender: 'Iris',
              message: data.Attributes?.message ?? '',
              type: data.EventName === 'iris:closing' ? 'IRIS_CLOSING' : 'IRIS_CHIME',
              timestamp: new Date(),
            }]);
          }
          if (data.EventName === 'iris:prompt') {
            const attrs = data.Attributes ?? {};
            const roundId = attrs.roundId ?? '';
            const phase: 'open' | 'closed' = attrs.phase === 'closed' ? 'closed' : 'open';
            let parsedOptions: string[] = [];
            try { parsedOptions = attrs.options ? JSON.parse(attrs.options) : []; } catch { parsedOptions = []; }
            let tally: number[] | null = null;
            try { tally = attrs.tally ? JSON.parse(attrs.tally) : null; } catch { tally = null; }
            const windowEndsAtNum = attrs.voteWindowEndsAt ? Number(attrs.voteWindowEndsAt) : NaN;

            // New round → clear last round's "did I vote" / rejection state.
            if (roundId !== voteRoundIdRef.current) {
              voteRoundIdRef.current = roundId;
              setMyVoteChoiceIndex(null);
              setVoteClosed(false);
            }

            setVotePrompt((prev) => {
              // Backend contract: "closed" events send an empty options
              // string (only tally is resent). Reuse the options captured
              // from this same round's "open" event so results can still
              // label each tally bucket instead of rendering blank.
              const options = parsedOptions.length > 0
                ? parsedOptions
                : (prev && prev.roundId === roundId ? prev.options : []);
              return {
                phase,
                gameType: attrs.gameType ?? '',
                roundId,
                seed: attrs.seed ?? '',
                options,
                voteWindowEndsAt: Number.isFinite(windowEndsAtNum) ? windowEndsAtNum : null,
                tally,
              };
            });
          }
          if (data.EventName === 'bc:ejection') {
            const attrs = data.Attributes ?? {};
            const style = attrs.presentationStyle === 'interrupt' ? 'interrupt' : 'banner';
            setEjection({
              message: attrs.message ?? '',
              presentationStyle: style,
              timestamp: attrs.timestamp,
              eventId: attrs.eventId,
              roomId: attrs.roomId,
              // Unique key forces EjectionBanner's effect to re-run / restart
              // the 6s timer even when a back-to-back ejection has identical
              // message text.
              localKey: `${attrs.timestamp ?? ''}-${Date.now()}-${Math.random()}`,
            });
          }
          if (data.EventName === 'bc:warning') {
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
        }
      } catch {}
    };

    return () => ws.close();
  }, [chatToken]);

  // Track new arrivals while the user is scrolled away from the bottom.
  // Must run BEFORE the auto-scroll effect below so the increment lands
  // before any state churn from the scroll-on-new-message path.
  useEffect(() => {
    const delta = messages.length - prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (delta > 0 && !isAtBottom) {
      setUnreadCount((prev) => prev + delta);
    }
  }, [messages.length, isAtBottom]);

  // Once the user is back at the bottom (auto-scroll or manual), clear the
  // unread badge so the pill disappears.
  useEffect(() => {
    if (isAtBottom) setUnreadCount(0);
  }, [isAtBottom]);

  // Auto-dismiss toast — success copy fades quickly, error sticks slightly
  // longer so it doesn't disappear before the user reads it.
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === 'success' ? 2200 : 3500;
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast]);

  // Auto-scroll on new messages — only if the user is already at the
  // visual bottom. Inverted FlatList: visual bottom = offset 0.
  // If the user has scrolled up to read history, leave them where they are.
  useEffect(() => {
    if (isAtBottom && listRef.current) {
      listRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [messages.length, isAtBottom]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.y;
    setIsAtBottom(offset < 50);
  };

  const handleJumpToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    // Clear immediately for instant feedback; the isAtBottom reset effect
    // will also fire once the scroll animation settles.
    setUnreadCount(0);
  }, []);

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);
  const unreadLabel = unreadCount === 1 ? 'message' : 'messages';

  // Inverted FlatList renders data[0] at the visual bottom. Messages
  // arrive oldest→newest in state; reverse for render so newest sits
  // at the bottom and history scrolls up. Memoized so reference is
  // stable across non-message renders.
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // ── Polling for event/room state ──
  // Cadence adapts: 3s during active sketchTheScene game (catches reveal
  // transitions in near-real-time), 30s otherwise.
  // Re-initialized whenever active game type changes.
  const isSketchActive =
    liveRoom.gameType === 'sketchTheScene' &&
    roomState?.activeGameType === 'sketchTheScene';

  useEffect(() => {
    if (!chatToken) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await apiGet<{ event: LiveEvent }>(`/live/${eventId}`);
        if (cancelled) return;
        if (res.event.status === 'ENDED') {
          wsRef.current?.close();
          onBackToLobby();
          return;
        }
        setIsPreEvent(res.event.status === 'SCHEDULED');
        const rs = res.event.roomStates?.[roomId] ?? null;
        setRoomState(rs);
        const myRoom = res.event.rooms?.find((r) => r.roomId === roomId);
        if (myRoom) setLiveRoom(myRoom);
      } catch {
        // silent — keep last known state
      }
    }
    poll();
    const intervalMs = isSketchActive ? POLL_SKETCH_MS : POLL_NORMAL_MS;
    const interval = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatToken, eventId, roomId, isSketchActive]);

  // App backgrounded — write leftAt for analytics (fire-and-forget)
  useEffect(() => {
    if (!attendanceSk) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        apiPost(`/live/${eventId}/rooms/leave`, { eventId, attendanceSk })
          .catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [attendanceSk, eventId]);

  // ── Sketch the Scene ──
  const isSketchTheScene = liveRoom.gameType === 'sketchTheScene';
  const currentQuestion = roomState?.currentQuestion as
    | { videoUrl?: string; artistName?: string; isIntro?: boolean }
    | null
    | undefined;
  // Live broadcast: gate on avatar STREAM HEALTH, not outputMode. outputMode
  // is a chime-routing flag the bot flips to "text" when /speak fails, which
  // is independent of whether the avatar video is streaming. Optimistic —
  // undefined/not-yet-polled health still shows the stream; only an explicit
  // false hides it. Falls back to the per-question Sketch the Scene clip.
  const avatarHealthy = roomState?.avatarHealthy;
  const liveVideoUrl = ivsPlaybackUrl && avatarHealthy !== false ? ivsPlaybackUrl : null;
  const videoUrl = liveVideoUrl ?? (isSketchTheScene ? currentQuestion?.videoUrl ?? null : null);
  const artistName = isSketchTheScene ? currentQuestion?.artistName ?? null : null;

  // Reveal phase state — surfaces revealedAnswer as overlay, pauses video
  const sketchPhase = roomState?.sketchPhase ?? null;
  const revealedAnswer = roomState?.revealedAnswer ?? null;
  const isRevealing = isSketchTheScene && sketchPhase === 'revealing' && !!revealedAnswer;

  // ── Structured voting (redFlag, moralDilemma, wouldYouRather, twoTruthsLie) ──
  // These games run on iris:prompt events instead of sketchTheScene's video
  // flow — showVoteBox is a sibling gate to videoUrl/isSketchTheScene below,
  // not a replacement for either.
  const isVoteGameType = !!liveRoom.gameType
    && VOTE_GAME_TYPES.includes(liveRoom.gameType as VoteGameType);
  const showVoteBox = isVoteGameType && !!votePrompt;

  const player = useVideoPlayer(videoUrl ?? '', (p) => {
    if (videoUrl) {
      p.loop = false;
      p.play();
    }
  });

  // Auto-play whenever videoUrl changes. useVideoPlayer's setup callback only
  // runs once at mount — by then videoUrl is still null (state hasn't polled
  // yet), so the setup-time play() never fires. This effect handles every
  // transition: intro → drawing 1 → drawing 2 → … . Explicit pause + seek to
  // zero clears any leftover playback state from the previous question so we
  // don't carry frame-stutter or stale currentTime across the source swap.
  useEffect(() => {
    if (!player || !videoUrl) return;
    try {
      player.loop = false;
      player.pause();
      player.currentTime = 0;
      player.play();
    } catch {}
  }, [player, videoUrl]);

  // Pause the video player when reveal is on screen. The video has already
  // finished playing per the backend state machine, but on slow networks it
  // can still be buffering/looping when reveal fires. Belt-and-suspenders.
  useEffect(() => {
    if (!player) return;
    if (isRevealing) {
      try { player.pause(); } catch {}
    }
  }, [isRevealing, player]);

  async function handleSend() {
    if (!input.trim() || sending || !wsRef.current) return;
    setSending(true);
    try {
      wsRef.current.send(JSON.stringify({
        Action: 'SEND_MESSAGE',
        Content: input.trim(),
      }));
      setInput('');
    } finally {
      setSending(false);
    }
  }

  // POST, not a chat message — a real HTTP call so the backend can gate on
  // window-open state server-side. The endpoint intentionally doesn't echo
  // the live tally back (preserves the reveal moment); we only track our
  // own choiceIndex locally.
  async function handleVote(choiceIndex: number) {
    if (!votePrompt || votePrompt.phase !== 'open' || voteSubmitting || voteClosed) return;
    setVoteSubmitting(true);
    try {
      await apiPost<{ accepted: boolean; choiceIndex: number }>(
        `/live/${eventId}/rooms/${roomId}/vote`,
        { choiceIndex }
      );
      setMyVoteChoiceIndex(choiceIndex);
    } catch (err) {
      // 403 = window already closed server-side (race with the closing
      // iris:prompt event) — show a closed state, not an error toast.
      if (err instanceof ApiError && err.status === 403) {
        setVoteClosed(true);
      } else {
        console.warn('Vote submit failed:', err);
      }
    } finally {
      setVoteSubmitting(false);
    }
  }

  function handleBackToLobby() {
    wsRef.current?.close();
    setChatToken(null);
    if (attendanceSk) {
      apiPost(`/live/${eventId}/rooms/leave`, { eventId, attendanceSk })
        .catch((err) => console.warn('Room leave write failed:', err));
    }
    onBackToLobby();
  }

  // Restriction short-circuit: when the join 403'd with a reason code, the
  // whole room UI is replaced by the dedicated restriction screen until the
  // user backs out. We render it inside the same outer Modal so the parent's
  // onBackToLobby contract stays intact.
  if (restriction) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={handleBackToLobby}>
        <LiveEventRestrictionScreen
          reason={restriction.reason}
          liftsAt={restriction.liftsAt}
          onBack={handleBackToLobby}
        />
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleBackToLobby}>
      {/* Fixed top elements stay outside the KeyboardAvoidingView so the */}
      {/* header, video, pinned bar, and game banner never move when the */}
      {/* keyboard opens — only the chat list compresses and the composer */}
      {/* rides up above the keyboard. */}
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackToLobby} style={styles.backButton}>
            <CaretLeft size={20} color="rgba(253,250,246,0.7)" weight="bold" />
            <Text style={styles.backText}>Back to Lobby</Text>
          </TouchableOpacity>

          <Text style={styles.roomName} numberOfLines={1}>
            {liveRoom.gameBanner?.label ?? `✦ ${liveRoom.name}`}
          </Text>

          <Text style={styles.attendees}>👥 {liveRoom.attendeeCount}</Text>
        </View>

        {joinError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{joinError}</Text>
            <TouchableOpacity onPress={handleBackToLobby} style={styles.errorButton}>
              <Text style={styles.errorButtonText}>Back to Lobby</Text>
            </TouchableOpacity>
          </View>
        )}

        {!chatToken && !joinError && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Stepping inside…</Text>
          </View>
        )}

        {chatToken && isPreEvent && (
          <View style={styles.preEventBanner}>
            <Text style={styles.preEventText}>
              Doors aren't open yet — chat with the room while you wait
            </Text>
          </View>
        )}

        {chatToken && (videoUrl || isSketchTheScene || showVoteBox) && (
          <>
            {artistName && (
              <View style={styles.artistBar}>
                <Text style={styles.artistLabel}>Now drawing:</Text>
                <Text style={styles.artistName}>{artistName}</Text>
              </View>
            )}

            {/* Video + Reveal overlay container. The video stays mounted; the */}
            {/* overlay sits on top during reveal phase. Structured-vote games */}
            {/* occupy this same space instead of video — showVoteBox takes */}
            {/* priority since a voting game never also has a videoUrl. */}
            <View style={styles.videoWrapper}>
              {showVoteBox && votePrompt ? (
                <VoteBox
                  votePrompt={votePrompt}
                  myVoteChoiceIndex={myVoteChoiceIndex}
                  voteSubmitting={voteSubmitting}
                  voteClosed={voteClosed}
                  onVote={handleVote}
                />
              ) : videoUrl ? (
                <VideoView
                  style={styles.video}
                  player={player}
                  allowsFullscreen={false}
                  nativeControls={false}
                />
              ) : (
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.videoPlaceholderText}>Waiting for the next round…</Text>
                </View>
              )}

              {isRevealing && (
                <View style={styles.revealOverlay} pointerEvents="none">
                  <View style={styles.revealCard}>
                    <Text style={styles.revealLabel}>✦ The answer was</Text>
                    <Text style={styles.revealAnswer}>{revealedAnswer}</Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {chatToken && pinnedMessage && (
          <View style={styles.pinnedBar}>
            <Text style={styles.pinnedLabel}>📌 IRIS PINNED</Text>
            <Text style={styles.pinnedMessage}>"{pinnedMessage}"</Text>
          </View>
        )}

        {chatToken && liveRoom.gameBanner && !isPreEvent && (
          <View style={styles.gameBanner}>
            <Text style={styles.gameBannerLabel}>
              {liveRoom.gameBanner.label}
              {roomState?.currentRound ? ` · Round ${roomState.currentRound}` : ''}
            </Text>
            <Text style={styles.gameBannerInstruction}>{liveRoom.gameBanner.instruction}</Text>
          </View>
        )}

        {chatToken && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.kavWrapper}
            keyboardVerticalOffset={0}
          >
            <View style={styles.chatRegion}>
              <FlatList
                ref={listRef}
                data={reversedMessages}
                inverted
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <ChatMessageRow
                    msg={item}
                    isSelf={!!myUserId && item.userId === myUserId}
                    onLongPress={() => {
                      // Block long-press on Iris/SYSTEM messages and on the
                      // current user's own messages — neither makes sense to
                      // report.
                      if (item.type !== 'USER') return;
                      if (!myUserId || !item.userId || item.userId === myUserId) return;
                      setReportTarget({
                        eventId,
                        roomId,
                        reportedUserId: item.userId,
                        messageId: item.id,
                        reportedMessageContent: item.message,
                        reportedDisplayName: item.sender,
                      });
                    }}
                  />
                )}
                style={styles.chatArea}
                contentContainerStyle={styles.chatContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews
                maxToRenderPerBatch={10}
                windowSize={10}
                initialNumToRender={20}
                onScroll={handleScroll}
                scrollEventThrottle={16}
              />
              {unreadCount > 0 && (
                <Pressable
                  onPress={handleJumpToLatest}
                  style={styles.unreadPill}
                  accessibilityRole="button"
                  accessibilityLabel={`${displayCount} new ${unreadLabel}. Tap to scroll to latest.`}
                >
                  <Text style={styles.unreadPillText}>
                    ↓ {displayCount} new {unreadLabel}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                placeholder={isPreEvent ? 'Say hi while we wait…' : 'Say something…'}
                placeholderTextColor="rgba(253,250,246,0.4)"
                style={styles.input}
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
          </KeyboardAvoidingView>
        )}

        {/* bc:ejection — absolute-positioned overlay/banner, lives above */}
        {/* chat so it covers the message list (interrupt) or rides the top */}
        {/* of the room view (banner). Component manages its own 6s fade. */}
        <EjectionBanner ejection={ejection} onDismiss={() => setEjection(null)} />

        {/* bc:warning — only mounted when the event was for the current */}
        {/* user (filter happens in the ws handler upstream). */}
        <WarningBanner warning={warning} onDismiss={() => setWarning(null)} />

        {toast && (
          <View style={[styles.toast, toast.kind === 'error' && styles.toastError]} pointerEvents="none">
            <Text style={styles.toastText}>{toast.text}</Text>
          </View>
        )}
      </View>

      <ReportMessageSheet
        visible={!!reportTarget}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onToast={(text, kind) => setToast({ text, kind })}
      />

      {/* Backend-driven gate: if /join returned 403 TERMS_ACCEPTANCE_REQUIRED, */}
      {/* the user hits this modal here. On accept, retry the join by */}
      {/* bouncing back to the lobby — RoomScreen unmounts cleanly. */}
      <LiveEventTermsModal
        visible={termsGateVisible}
        onAccept={() => {
          setTermsGateVisible(false);
          handleBackToLobby();
        }}
        onCancel={() => {
          setTermsGateVisible(false);
          handleBackToLobby();
        }}
      />
    </Modal>
  );
}

function ChatMessageRow({
  msg,
  isSelf,
  onLongPress,
}: {
  msg: ChatMessage;
  isSelf: boolean;
  onLongPress: () => void;
}) {
  const isIris = msg.type === 'IRIS_CHIME' || msg.type === 'IRIS_CLOSING';
  if (isIris) {
    return (
      <View style={chatStyles.irisRow}>
        <Image source={{ uri: IRIS_AVATAR }} style={chatStyles.irisAvatar} />
        <View style={chatStyles.irisContent}>
          <Text style={chatStyles.irisName}>Iris</Text>
          <View style={[chatStyles.irisBubble, msg.type === 'IRIS_CLOSING' && chatStyles.irisBubbleClosing]}>
            <Text style={[chatStyles.irisText, msg.type === 'IRIS_CLOSING' && chatStyles.irisTextClosing]}>
              {msg.message}
            </Text>
          </View>
        </View>
      </View>
    );
  }
  // Long-press affordance only renders for other users' messages — self gets
  // the same bubble but no Pressable wrapper. delayLongPress matches RN's
  // default for predictable feel across platforms.
  const reportable = msg.type === 'USER' && !isSelf;
  return (
    <View style={chatStyles.userRow}>
      {msg.photoUrl ? (
        <Image source={{ uri: msg.photoUrl }} style={chatStyles.userAvatar} />
      ) : (
        <View style={[chatStyles.userAvatar, chatStyles.userAvatarFallback]}>
          <Text style={chatStyles.userAvatarText}>{(msg.sender[0] ?? '?').toUpperCase()}</Text>
        </View>
      )}
      <View style={chatStyles.userContent}>
        <Text style={chatStyles.userName}>{msg.sender}</Text>
        <Pressable
          onLongPress={reportable ? onLongPress : undefined}
          delayLongPress={400}
          disabled={!reportable}
          style={({ pressed }) => [
            chatStyles.userBubble,
            pressed && reportable && chatStyles.userBubblePressed,
          ]}
          accessibilityRole={reportable ? 'button' : undefined}
          accessibilityHint={reportable ? 'Long-press to report this message' : undefined}
        >
          <Text style={chatStyles.userText}>{msg.message}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Structured-vote box — occupies the video slot for redFlag / moralDilemma /
// wouldYouRather / twoTruthsLie rounds. "open": tappable options + countdown;
// re-tapping changes the vote (backend allows this before the window
// closes). "closed": same options, now showing tally counts/bars — no
// interaction, and this view is transient (cleared once the next round's
// "open" event replaces votePrompt).
function VoteBox({
  votePrompt,
  myVoteChoiceIndex,
  voteSubmitting,
  voteClosed,
  onVote,
}: {
  votePrompt: VotePrompt;
  myVoteChoiceIndex: number | null;
  voteSubmitting: boolean;
  voteClosed: boolean;
  onVote: (choiceIndex: number) => void;
}) {
  const isOpen = votePrompt.phase === 'open';
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isOpen || !votePrompt.voteWindowEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen, votePrompt.voteWindowEndsAt]);

  const secondsLeft = isOpen && votePrompt.voteWindowEndsAt
    ? Math.max(0, Math.ceil((votePrompt.voteWindowEndsAt - now) / 1000))
    : null;

  const maxTally = votePrompt.tally && votePrompt.tally.length > 0
    ? Math.max(1, ...votePrompt.tally)
    : 1;

  return (
    <View style={voteStyles.container}>
      {votePrompt.seed ? <Text style={voteStyles.seed}>{votePrompt.seed}</Text> : null}

      {isOpen && secondsLeft !== null && (
        <Text style={voteStyles.countdown}>
          {secondsLeft > 0 ? `${secondsLeft}s left` : 'Closing…'}
        </Text>
      )}

      <View style={voteStyles.options}>
        {isOpen
          ? votePrompt.options.map((opt, i) => {
              const selected = myVoteChoiceIndex === i;
              return (
                <TouchableOpacity
                  key={`${votePrompt.roundId}-${i}`}
                  style={[
                    voteStyles.optionButton,
                    selected && voteStyles.optionButtonSelected,
                    voteClosed && voteStyles.optionButtonDisabled,
                  ]}
                  onPress={() => onVote(i)}
                  disabled={voteSubmitting || voteClosed}
                  accessibilityRole="button"
                >
                  <Text style={[voteStyles.optionText, selected && voteStyles.optionTextSelected]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })
          : votePrompt.options.map((opt, i) => {
              const count = votePrompt.tally?.[i] ?? 0;
              const pct = Math.round((count / maxTally) * 100);
              return (
                <View key={`${votePrompt.roundId}-${i}`} style={voteStyles.resultRow}>
                  <Text style={voteStyles.resultLabel}>{opt}</Text>
                  <View style={voteStyles.resultBarTrack}>
                    <View style={[voteStyles.resultBarFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={voteStyles.resultCount}>{count}</Text>
                </View>
              );
            })}
      </View>

      {voteClosed && isOpen && (
        <Text style={voteStyles.closedNote}>Voting closed</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F2A48' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: spacing.sm,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 12, color: 'rgba(253,250,246,0.7)' },
  roomName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FDFAF6',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  attendees: { fontSize: 11, color: '#F5A3BC', fontWeight: '600' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  errorText: { fontSize: 14, color: 'rgba(253,250,246,0.7)', textAlign: 'center' },
  errorButton: {
    backgroundColor: '#B83255',
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { fontSize: 13, color: 'rgba(253,250,246,0.6)', fontWeight: '300' },
  preEventBanner: {
    backgroundColor: 'rgba(184,50,85,0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,50,85,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  preEventText: { fontSize: 12, color: '#F5A3BC', fontStyle: 'italic' },
  artistBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  artistLabel: { fontSize: 12, color: 'rgba(253,250,246,0.6)', fontStyle: 'italic' },
  artistName: { fontSize: 12, color: '#FDFAF6', fontWeight: '600' },
  videoWrapper: { width: '100%', position: 'relative' },
  video: { width: '100%', aspectRatio: 16 / 10, backgroundColor: '#000' },
  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholderText: { fontSize: 13, color: 'rgba(253,250,246,0.5)', fontStyle: 'italic' },

  // ── Reveal overlay (Sketch the Scene) ──
  revealOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 42, 72, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  revealCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  revealLabel: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#F5A3BC',
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  revealAnswer: {
    fontSize: 28,
    color: '#FDFAF6',
    fontStyle: 'italic',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 36,
  },

  pinnedBar: {
    backgroundColor: 'rgba(253,250,246,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#B83255',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  pinnedLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#F5A3BC',
    marginBottom: 4,
  },
  pinnedMessage: { fontSize: 13, color: '#E8D5E5', fontStyle: 'italic', lineHeight: 18 },
  gameBanner: {
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(124,58,237,0.3)',
    padding: spacing.md,
  },
  gameBannerLabel: { fontSize: 13, color: '#C4A0F0', fontWeight: '700', marginBottom: 4 },
  gameBannerInstruction: { fontSize: 12, color: 'rgba(196,160,240,0.8)', lineHeight: 18 },
  kavWrapper: { flex: 1 },
  chatRegion: { flex: 1, position: 'relative' },
  chatArea: { flex: 1 },
  // Inverted FlatList flips contentContainer paddings visually:
  // paddingTop → visual bottom (gap above composer, matches old spacer),
  // paddingBottom → visual top (gap above first message in scroll history).
  chatContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: 'rgba(253,250,246,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  unreadPill: {
    position: 'absolute',
    bottom: spacing.sm + 4,
    alignSelf: 'center',
    backgroundColor: '#B83255',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  unreadPillText: {
    color: '#FDFAF6',
    fontSize: 13,
    fontWeight: '600',
  },
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
  toastText: {
    color: '#FDFAF6',
    fontSize: 13,
    fontWeight: '600',
  },
});

const chatStyles = StyleSheet.create({
  irisRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  irisAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(232,213,229,0.5)',
  },
  irisContent: { flex: 1 },
  irisName: { fontSize: 10, fontWeight: '600', color: '#C4A0F0', marginBottom: 4 },
  irisBubble: {
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  irisBubbleClosing: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(196,168,130,0.2)',
  },
  irisText: { fontSize: 15, color: '#E8D5E5', fontStyle: 'italic' },
  irisTextClosing: { color: '#FDFAF6', fontSize: 17, lineHeight: 26 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  userAvatar: { width: 28, height: 28, borderRadius: 14 },
  userAvatarFallback: {
    backgroundColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  userContent: { flex: 1 },
  userName: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(196,168,130,0.8)',
    marginBottom: 4,
  },
  userBubble: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    padding: spacing.sm,
  },
  userBubblePressed: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  userText: { fontSize: 13, color: 'rgba(253,250,246,0.85)' },
});

const voteStyles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 160,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  seed: {
    fontSize: 15,
    color: '#FDFAF6',
    fontStyle: 'italic',
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
  },
  countdown: {
    fontSize: 11,
    color: '#F5A3BC',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  options: { gap: spacing.sm },
  optionButton: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  optionButtonSelected: {
    backgroundColor: 'rgba(184,50,85,0.25)',
    borderColor: '#B83255',
  },
  optionButtonDisabled: { opacity: 0.5 },
  optionText: { fontSize: 14, color: 'rgba(253,250,246,0.9)', fontWeight: '600' },
  optionTextSelected: { color: '#FDFAF6' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultLabel: { fontSize: 13, color: 'rgba(253,250,246,0.9)', width: 48 },
  resultBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  resultBarFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#B83255',
  },
  resultCount: { fontSize: 12, color: 'rgba(253,250,246,0.7)', width: 28, textAlign: 'right' },
  closedNote: {
    fontSize: 11,
    color: 'rgba(253,250,246,0.5)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});