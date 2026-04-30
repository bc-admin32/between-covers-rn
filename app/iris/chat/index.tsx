import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiPost } from '../../../lib/api';
import { track } from '../../../lib/analytics';
import { spacing, radius, colors } from '../../../lib/theme';

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar2.png';

const CONTEXT_GREETINGS: Record<string, string> = {
  home: "Hi! What are you in the mood for today — a new read, something to watch, or just a cozy chat?",
  cozy: "Hi! What are you in the mood for this month — a new read, something to watch, or just a cozy chat?",
  'cozy/books': "Hi! I see you've been browsing my picks. Is there a book you'd like to talk about, or are you looking for something specific this month?",
  'cozy/media': "Hello! Were you just looking through the Visual Escapes? I'd love to hear your thoughts — or help you find something to watch tonight.",
  'cozy/items': "Hey there! Browsing the lifestyle picks? If you're looking for a specific vibe or have questions about any of the items, I'm here.",
  'library/discover': "Hi! Looking for your next great read? Tell me what you've loved lately — a genre, a feeling, an author — and I'll help you find something perfect.",
};

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

export default function IrisChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string; bookTitle?: string; author?: string }>();

  const from = params.from ?? '';
  const bookTitle = params.bookTitle ?? '';
  const author = params.author ?? '';

  const bookGreeting = from === 'library/details' && bookTitle
    ? `Hi! Looks like you're reading ${bookTitle}${author ? ` by ${author}` : ''}. Would you like to talk about it, get similar recommendations, or is there something else I can help with?`
    : null;

  const openingMessage = bookGreeting ?? CONTEXT_GREETINGS[from] ?? DEFAULT_GREETING;

  const [messages, setMessages] = useState<Message[]>([
    { id: 'iris-0', role: 'iris', text: openingMessage },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, []);

  useEffect(() => {
    if (messages.length > 1 || sending) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

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
      </View>

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
              <View style={styles.irisBubble}>
                <Text style={styles.irisBubbleText}>{msg.text}</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F5F3' },
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
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  dateSeparator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  dateLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  dateLabel: { fontSize: 11, color: '#B09A7E', letterSpacing: 0.4 },
  irisMsgRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.sm },
  irisBubble: { maxWidth: '78%', backgroundColor: '#fff', borderRadius: 18, borderBottomRightRadius: 4, padding: spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  irisBubbleText: { fontSize: 15, color: '#1a1a1a', lineHeight: 22, fontWeight: '300' },
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