import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Image, Pressable, Alert,
} from 'react-native';
import { CaretLeft, Copy, Check, Microphone, ChatCircleText } from '../../../components/icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiPost } from '../../../lib/api';
import { setPendingIrisMessage, takePendingIrisMessage } from '../../../lib/guest';
import { useGuest } from '../../../lib/useGuest';
import { track, reportClientError } from '../../../lib/analytics';
import { startBreadcrumbs, breadcrumb, importWithoutFatal } from '../../../lib/crashCapture';
import { spacing, radius, colors } from '../../../lib/theme';
import { needsIrisVoiceTerms } from '../../../lib/irisVoiceTerms';
import IrisVoiceTermsModal from '../../../components/iris/IrisVoiceTermsModal';
import { IRIS_AVATAR } from '../../../lib/irisAvatar';
import { usePlayroom } from '../../../lib/playroomPage';

// Loaded on first switch to voice, so text chat never loads the audio libraries.
// If loading throws, VoiceErrorBoundary gets the real error and drops back to
// text chat instead of the app crashing (see importWithoutFatal).
const IrisVoiceSession = lazy(() =>
  importWithoutFatal(() => import('../../../components/iris/IrisVoiceSession'))
);

const CONTEXT_GREETINGS: Record<string, string> = {
  home: "Hi! What are you in the mood for today — a new read, something to watch, or just a cozy chat?",
  cozy: "Hi! What are you in the mood for this month — a new read, something to watch, or just a cozy chat?",
  'cozy/books': "Hi! I see you've been browsing my picks. Is there a book you'd like to talk about, or are you looking for something specific this month?",
  'cozy/media': "Hello! Were you just looking through the Visual Escapes? I'd love to hear your thoughts — or help you find something to watch tonight.",
  'cozy/items': "Hey there! Browsing the lifestyle picks? If you're looking for a specific vibe or have questions about any of the items, I'm here.",
  'library/discover': "Hi! Looking for your next great read? Tell me what you've loved lately — a genre, a feeling, an author — and I'll help you find something perfect.",
};

// From Watch Me in PlayRoom months (the same page as Visual Escapes).
const WATCH_ME_GREETING = "Hello! Were you just looking through Watch Me? I'd love to hear your thoughts — or help you find something to watch tonight.";

const DEFAULT_GREETING = "Hi! I'm here to help you find your next great read, talk through this month's theme, or just have a cozy conversation. What's on your mind?";

type Message = {
  id: string;
  role: 'iris' | 'user';
  text: string;
};

function TypingIndicator() {
  return (
    <View style={styles.irisMsgRow}>
      <View style={styles.typingBubble}>
        <Text style={styles.typingDots}>• • •</Text>
      </View>
      <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
    </View>
  );
}

// A voice-mode error sends the user back to text chat instead of taking down
// the whole screen, and reports what happened.
class VoiceErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    breadcrumb(`voice: error boundary: ${error.message}`);
    reportClientError('iris_voice', error, info.componentStack);
    Alert.alert('Voice chat', "Voice chat isn't working right now. You can keep chatting with Iris by text.");
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// expo-router shows this in place of the screen when the chat screen throws
// while rendering. It reports the error so we can see it without a device log.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const router = useRouter();
  useEffect(() => {
    reportClientError('iris_chat', error);
  }, [error]);

  return (
    <View style={styles.crashBody}>
      <Text style={styles.crashTitle}>Iris stepped away for a moment</Text>
      <Text style={styles.crashText}>Something went wrong opening the chat.</Text>
      <TouchableOpacity style={styles.crashButton} onPress={() => { retry(); }}>
        <Text style={styles.crashButtonText}>Try again</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.crashLink}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function IrisChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string; bookTitle?: string; author?: string }>();
  const playroom = usePlayroom();

  const from = params.from ?? '';
  const bookTitle = params.bookTitle ?? '';
  const author = params.author ?? '';

  const bookGreeting = from === 'library/details' && bookTitle
    ? `Hi! Looks like you're reading ${bookTitle}${author ? ` by ${author}` : ''}. Would you like to talk about it, get similar recommendations, or is there something else I can help with?`
    : null;

  const contextGreeting = playroom && from === 'cozy/media' ? WATCH_ME_GREETING : CONTEXT_GREETINGS[from];
  const openingMessage = bookGreeting ?? contextGreeting ?? DEFAULT_GREETING;

  const [messages, setMessages] = useState<Message[]>([
    { id: 'iris-0', role: 'iris', text: openingMessage },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { isGuest, requireAccount } = useGuest();
  const pendingCheckedRef = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Voice mode ──
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [voiceTermsVisible, setVoiceTermsVisible] = useState(false);
  const [checkingVoice, setCheckingVoice] = useState(false);
  const reopenVoiceTermsRef = useRef(false);
  // Weekly voice cap hit: voice stays off until the chat is opened again.
  // Screen state only; nothing is saved on the device.
  const [voiceLocked, setVoiceLocked] = useState(false);

  // Back in text mode the message list remounts; jump to the newest bubbles.
  useEffect(() => {
    if (mode === 'text') setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, [mode]);

  // The terms sheet closes before a legal document opens (a native Modal would
  // cover the pushed route); reopen it when the user comes back.
  useFocusEffect(
    useCallback(() => {
      if (reopenVoiceTermsRef.current) {
        reopenVoiceTermsRef.current = false;
        setVoiceTermsVisible(true);
      }
    }, [])
  );

  // The one gate for voice mode, whatever screen the chat was opened from.
  async function handleToggleMode() {
    if (mode === 'voice') {
      setMode('text');
      return;
    }
    if (voiceLocked) {
      Alert.alert('Voice chat', 'Iris can’t chat out loud right now, but she’s still here for you. Keep the conversation going over text! 💬');
      return;
    }
    if (isGuest === null || checkingVoice) return;
    if (isGuest) {
      // No mic permission request for guests.
      Alert.alert('Voice chat', 'Please sign in to use voice chat with Iris.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign In', onPress: () => requireAccount('iris', { source: 'iris_voice' }) },
      ]);
      return;
    }
    setCheckingVoice(true);
    try {
      if (await needsIrisVoiceTerms()) setVoiceTermsVisible(true);
      else {
        startBreadcrumbs('voice: toggle on');
        setMode('voice');
      }
    } catch {
      // Couldn't read the profile: show the sheet; accepting works either way.
      setVoiceTermsVisible(true);
    } finally {
      setCheckingVoice(false);
    }
  }

  function openVoiceTermsDocument(doc: 'terms-of-use' | 'privacy-policy') {
    setVoiceTermsVisible(false);
    reopenVoiceTermsRef.current = true;
    // Let the sheet finish closing first (same reason as the Lounge sheet).
    setTimeout(() => router.push(`/legal/document?doc=${doc}` as any), 300);
  }

  const handleCopy = useCallback(async (id: string, text: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedId(id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(null), 1500);
  }, []);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, []);

  useEffect(() => {
    if (messages.length > 1 || sending) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, sending]);

  // A message a guest typed before signing up: send it as soon as we're back
  // here signed in (landAfterAuth returns the user to this screen).
  useEffect(() => {
    if (isGuest !== false || pendingCheckedRef.current) return;
    pendingCheckedRef.current = true;
    takePendingIrisMessage().then((text) => {
      if (text) sendMessage(text);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    // Guests can type; sending needs an account. Keep the message (in the
    // input and in storage) and send it automatically after sign-up.
    if (isGuest === true) {
      await setPendingIrisMessage(text);
      requireAccount('iris', { source: 'iris_send' });
      return;
    }

    await sendMessage(text);
  }

  async function sendMessage(text: string) {
    track('iris_chat_sent', {
      chars: text.length,
      hasBookContext: !!bookTitle,
    });

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await apiPost<{ reply: string; sessionId: string; softLimit?: boolean }>(
        '/iris/chat',
        {
          message: text,
          sessionId,
          from: from || null,
          openingMessage: sessionId ? null : openingMessage,
        }
      );

      if (res.sessionId && !sessionId) setSessionId(res.sessionId);

      setMessages((prev) => [
        ...prev,
        { id: `iris-${Date.now()}`, role: 'iris', text: res.reply },
      ]);
    } catch {
      setError("Iris stepped away for a moment — try again?");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <CaretLeft size={20} color="#0F2A48" weight="bold" />
        </TouchableOpacity>

        <View style={styles.irisHeaderAvatar}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.irisHeaderAvatarImage} />
        </View>

        <View style={styles.irisHeaderInfo}>
          <Text style={styles.irisHeaderLabel}>Your Reading Companion</Text>
          <Text style={styles.irisHeaderName}>Iris</Text>
        </View>

        <View style={styles.onlineIndicator}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>online</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.modeToggle,
            mode === 'voice' && styles.modeToggleVoice,
            mode === 'text' && voiceLocked && styles.modeToggleLocked,
          ]}
          onPress={handleToggleMode}
          disabled={sending || checkingVoice}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={
            mode === 'voice'
              ? 'Switch to text chat'
              : voiceLocked
              ? 'Voice chat unavailable'
              : 'Switch to voice chat'
          }
        >
          {mode === 'voice' ? (
            <ChatCircleText size={18} color="#fff" weight="bold" />
          ) : (
            <Microphone size={18} color="#0F2A48" weight="bold" />
          )}
        </TouchableOpacity>
      </View>

      <IrisVoiceTermsModal
        visible={voiceTermsVisible}
        onAccept={() => {
          setVoiceTermsVisible(false);
          startBreadcrumbs('voice: terms accepted');
          setMode('voice');
        }}
        onCancel={() => setVoiceTermsVisible(false)}
        onOpenDocument={openVoiceTermsDocument}
      />

      {mode === 'voice' ? (
        <VoiceErrorBoundary onError={() => setMode('text')}>
          <Suspense fallback={<View style={styles.voiceBody} />}>
            <IrisVoiceSession
              paddingBottom={Math.max(insets.bottom, spacing.md)}
              sessionId={sessionId}
              from={from}
              openingMessage={openingMessage}
              onSessionId={(id) => setSessionId((prev) => prev ?? id)}
              onTurn={({ transcript, reply }) => {
                const t = Date.now();
                setMessages((prev) => [
                  ...prev,
                  { id: `user-${t}`, role: 'user', text: transcript },
                  { id: `iris-${t}`, role: 'iris', text: reply },
                ]);
              }}
              onTermsRequired={() => {
                setMode('text');
                setVoiceTermsVisible(true);
              }}
              // The mic only runs in the foreground: leaving the app leaves
              // voice mode. The voice session decides what counts as leaving
              // (Android's permission dialog doesn't).
              onBackground={() => setMode('text')}
              onVoiceLimitReached={() => {
                setVoiceLocked(true);
                setMode('text');
              }}
            />
          </Suspense>
        </VoiceErrorBoundary>
      ) : (<>
      {/* MESSAGES */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
      >
        <View style={styles.dateSeparator}>
          <View style={styles.dateLine} />
          <Text style={styles.dateLabel}>Today</Text>
          <View style={styles.dateLine} />
        </View>

        {messages.map((msg) => (
          msg.role === 'iris' ? (
            <View key={msg.id} style={styles.irisMsgRow}>
              <View style={styles.irisBubbleCol}>
                <Pressable
                  style={styles.irisBubble}
                  onLongPress={() => handleCopy(msg.id, msg.text)}
                  delayLongPress={300}
                >
                  <Text style={styles.irisBubbleText}>{msg.text}</Text>
                </Pressable>
                <TouchableOpacity
                  style={styles.copyAffordance}
                  onPress={() => handleCopy(msg.id, msg.text)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Iris's message"
                >
                  {copiedId === msg.id ? (
                    <Check size={13} color="#9B6B9B" weight="bold" />
                  ) : (
                    <Copy size={13} color="#B09A7E" weight="regular" />
                  )}
                  <Text style={[styles.copyAffordanceText, copiedId === msg.id && styles.copyAffordanceTextDone]}>
                    {copiedId === msg.id ? 'Copied' : 'Copy'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Image source={{ uri: IRIS_AVATAR }} style={styles.irisAvatar} />
            </View>
          ) : (
            <View key={msg.id} style={styles.userMsgRow}>
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{msg.text}</Text>
              </View>
            </View>
          )
        ))}

        {sending && <TypingIndicator />}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={{ height: spacing.md }} />
      </ScrollView>

      {/* INPUT */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          placeholder="Ask Iris anything…"
          placeholderTextColor="#B09A7E"
          style={styles.input}
          returnKeyType="send"
          editable={!sending}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendButtonText}>→</Text>
        </TouchableOpacity>
      </View>
      </>)}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F5F3' },
  crashBody: { flex: 1, backgroundColor: '#F7F5F3', alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  crashTitle: { fontSize: 20, fontWeight: '600', color: '#0F2A48', fontStyle: 'italic', textAlign: 'center' },
  crashText: { fontSize: 15, color: '#0F2A48', textAlign: 'center' },
  crashButton: { backgroundColor: '#B83255', borderRadius: radius.full, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.lg },
  crashButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  crashLink: { color: '#B83255', fontSize: 15 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(15,42,72,0.08)',
    backgroundColor: '#F7F5F3',
  },
  backButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F2A48', fontWeight: '600' },
  irisHeaderAvatar: { width: 38, height: 38, borderRadius: 19, padding: 2, backgroundColor: 'rgba(169,192,212,0.5)' },
  irisHeaderAvatarImage: { width: 34, height: 34, borderRadius: 17 },
  irisHeaderInfo: { flex: 1 },
  irisHeaderLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#A9C0D4' },
  irisHeaderName: { fontSize: 20, fontWeight: '600', color: '#0F2A48', fontStyle: 'italic' },
  onlineIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4CAF50' },
  onlineText: { fontSize: 11, color: '#B09A7E' },
  modeToggle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,42,72,0.06)', alignItems: 'center', justifyContent: 'center', marginLeft: spacing.xs },
  modeToggleVoice: { backgroundColor: '#B83255' },
  modeToggleLocked: { opacity: 0.4 },
  voiceBody: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  dateSeparator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  dateLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  dateLabel: { fontSize: 11, color: '#B09A7E', letterSpacing: 0.4 },
  irisMsgRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.sm },
  irisBubbleCol: { maxWidth: '78%', alignItems: 'flex-end', gap: 4 },
  irisBubble: { backgroundColor: '#fff', borderRadius: 18, borderBottomRightRadius: 4, padding: spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  irisBubbleText: { fontSize: 15, color: '#1a1a1a', lineHeight: 22, fontWeight: '300' },
  copyAffordance: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 2 },
  copyAffordanceText: { fontSize: 11, color: '#B09A7E', fontWeight: '500' },
  copyAffordanceTextDone: { color: '#9B6B9B' },
  irisAvatar: { width: 28, height: 28, borderRadius: 14, marginBottom: spacing.xs },
  userMsgRow: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: spacing.sm },
  userBubble: { maxWidth: '78%', backgroundColor: '#6A5969', borderRadius: 18, borderBottomLeftRadius: 4, padding: spacing.md },
  userBubbleText: { fontSize: 15, color: '#fff', lineHeight: 22, fontWeight: '300' },
  typingBubble: { backgroundColor: '#fff', borderRadius: 18, borderBottomRightRadius: 4, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  typingDots: { fontSize: 16, color: '#C4A882', letterSpacing: 4 },
  errorText: { textAlign: 'center', fontSize: 12, color: '#B09A7E', fontStyle: 'italic', marginTop: spacing.sm },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(15,42,72,0.06)', backgroundColor: '#F7F5F3' },
  input: { flex: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D7E2E9', fontSize: 14, color: '#0F2A48', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#e0d8cc' },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});