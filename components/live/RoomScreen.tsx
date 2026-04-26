import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image, TextInput,
  KeyboardAvoidingView, Platform, Modal, AppState,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiGet, apiPost } from '../../lib/api';
import { spacing, colors } from '../../lib/theme';
import type { LiveRoom, LiveEvent, RoomState, RoomJoinResponse } from '../../lib/types';

// RoomScreen — second modal layer, sits on top of LobbyModal.
// Joins a single room: chat over IVS WebSocket, optional Sketch the Scene
// video, sticky pinned bar for Iris commentary, game banner, composer.
// "Back to Lobby" closes this modal and reveals the lobby underneath.

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar2.png';

type ChatMessage = {
  id: string;
  sender: string;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [liveRoom, setLiveRoom] = useState<LiveRoom>(room);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Initial mount: fetch profile + join room
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const profileRes = await apiGet<{ displayName: string; photoUrl: string | null }>('/profile');
        const joinRes = await apiPost<RoomJoinResponse>(
          `/live/${eventId}/rooms/${roomId}/join`,
          { displayName: profileRes.displayName, photoUrl: profileRes.photoUrl }
        );
        if (cancelled) return;
        setChatToken(joinRes.token);
        setAttendanceSk(joinRes.attendanceSk);
        setIsPreEvent(joinRes.isPreEvent);
      } catch (err) {
        if (!cancelled) {
          setJoinError("Couldn't join the room. Try again?");
          console.warn('Room join failed:', err);
        }
      }
    }
    init();
    return () => {
      cancelled = true;
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
            sender: data.Sender?.UserId ?? 'Reader',
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
        }
      } catch {}
    };

    return () => ws.close();
  }, [chatToken]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // Polling for event/room state
  useEffect(() => {
    if (!chatToken) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await apiGet<{ event: LiveEvent }>(`/live/${eventId}`);
        if (cancelled) return;
        if (res.event.status === 'ENDED') {
          wsRef.current?.close();
          // Don't await leave — backend cleans dangling rows on event end
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
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatToken, eventId, roomId]);

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

  // Sketch the Scene video
  const isSketchTheScene = liveRoom.gameType === 'sketchTheScene';
  const currentQuestion = roomState?.currentQuestion as
    | { videoUrl?: string; artistName?: string }
    | null
    | undefined;
  const videoUrl = isSketchTheScene ? currentQuestion?.videoUrl ?? null : null;
  const artistName = isSketchTheScene ? currentQuestion?.artistName ?? null : null;

  const player = useVideoPlayer(videoUrl ?? '', (p) => {
    if (videoUrl) {
      p.loop = false;
      p.play();
    }
  });

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

  function handleBackToLobby() {
    wsRef.current?.close();
    setChatToken(null);
    if (attendanceSk) {
      // Fire-and-forget — analytics, not user-facing
      apiPost(`/live/${eventId}/rooms/leave`, { eventId, attendanceSk })
        .catch((err) => console.warn('Room leave write failed:', err));
    }
    onBackToLobby();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleBackToLobby}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { paddingTop: insets.top }]}
      >
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

        {chatToken && isSketchTheScene && (
          <>
            {artistName && (
              <View style={styles.artistBar}>
                <Text style={styles.artistLabel}>Now drawing:</Text>
                <Text style={styles.artistName}>{artistName}</Text>
              </View>
            )}

            {videoUrl ? (
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
          <ScrollView
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg) => (
              <ChatMessageRow key={msg.id} msg={msg} />
            ))}
            <View style={{ height: spacing.md }} />
          </ScrollView>
        )}

        {chatToken && (
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
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChatMessageRow({ msg }: { msg: ChatMessage }) {
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
        <View style={chatStyles.userBubble}>
          <Text style={chatStyles.userText}>{msg.message}</Text>
        </View>
      </View>
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
  video: { width: '100%', aspectRatio: 16 / 10, backgroundColor: '#000' },
  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholderText: { fontSize: 13, color: 'rgba(253,250,246,0.5)', fontStyle: 'italic' },
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
  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
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
  userText: { fontSize: 13, color: 'rgba(253,250,246,0.85)' },
});
