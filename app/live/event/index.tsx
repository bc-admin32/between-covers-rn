import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '../../../lib/api';
import { spacing, radius, colors } from '../../../lib/theme';

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
};

type ChatMessage = {
  id: string;
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
  const [profile, setProfile] = useState<{ displayName: string; photoUrl: string | null } | null>(null);
  const [gameBannerExpanded, setGameBannerExpanded] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!eventId) { setLoading(false); return; }
    const load = async () => {
      try {
        const [eventRes, profileRes] = await Promise.all([
          apiGet<{ event: LiveEvent }>(`/live/${eventId}`),
          apiGet<{ displayName: string; photoUrl: string | null }>('/profile'),
        ]);
        setEvent(eventRes.event);
        setProfile(profileRes);
        const rsvpRes = await apiGet<{ rsvpd: boolean }>(`/live/${eventId}/rsvp`);
        setRsvpd(rsvpRes.rsvpd);
      } catch {} finally {
        setLoading(false);
      }
    };
    load();
  }, [eventId]);

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
            sender: data.Sender?.UserId ?? 'Reader',
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
      } catch {}
    };
    return () => ws.close();
  }, [chatToken, event]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

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
    } catch {}
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
          <Text style={styles.backArrow}>←</Text>
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
            <Image source={{ uri: event.coverUrl }} style={styles.scheduledCover} resizeMode="cover" />
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
            <Text style={styles.joinChatButtonText}>Join the Chat →</Text>
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
              return (
                <View key={msg.id} style={styles.userChatRow}>
                  {msg.photoUrl ? (
                    <Image source={{ uri: msg.photoUrl }} style={styles.userChatAvatar} />
                  ) : (
                    <View style={[styles.userChatAvatar, styles.userChatAvatarFallback]}>
                      <Text style={styles.userChatAvatarText}>{msg.sender[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.userChatContent}>
                    <Text style={styles.userChatName}>{msg.sender}</Text>
                    <View style={styles.userChatBubble}>
                      <Text style={styles.userChatText}>{msg.message}</Text>
                    </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A2E' },
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
  userChatText: { fontSize: 13, color: 'rgba(253,250,246,0.85)' },
  chatComposer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: 'rgba(253,250,246,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});