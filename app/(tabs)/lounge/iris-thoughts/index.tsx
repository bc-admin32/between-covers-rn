import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image, KeyboardAvoidingView,
  Platform, TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiGet, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

const EMOJI_TRAY = ['❤️', '😂', '😭', '🔥', '👏', '✨', '😍', '💀', '🫶', '📚'];
const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar2.png';

type Reaction = { emoji: string; count: number; reactedByMe: boolean };
type Reply = {
  replyId: string; threadId: string; userId: string;
  displayName: string; avatarUrl: string | null; body: string | null;
  mediaUrl: string | null; reactions: Reaction[]; createdAt: string; isOwn: boolean;
};
type Thread = {
  threadId: string; topicLabel: string | null; body: string | null;
  authorId: string; authorName: string; authorAvatar: string | null;
  replyCount: number; createdAt: string;
};
type ThreadResponse = { thread: Thread; replies: Reply[]; count: number; nextKey: string | null };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ url, name, size = 30, isIris = false }: { url: string | null; name: string; size?: number; isIris?: boolean }) {
  if (isIris) return <Image source={{ uri: IRIS_AVATAR }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#E8D5E5' }} />;
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#6A5969', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.35, fontWeight: '600' }}>{getInitials(name)}</Text>
    </View>
  );
}

function ReactionBar({ replyId, reactions, onReact }: { replyId: string; reactions: Reaction[]; onReact: (replyId: string, emoji: string) => void }) {
  if (reactions.length === 0) return null;
  return (
    <View style={styles.reactionBar}>
      {reactions.map((r) => (
        <TouchableOpacity
          key={r.emoji}
          style={[styles.reactionButton, r.reactedByMe && styles.reactionButtonActive]}
          onPress={() => onReact(replyId, r.emoji)}
        >
          <Text style={styles.reactionEmoji}>{r.emoji}</Text>
          <Text style={[styles.reactionCount, r.reactedByMe && styles.reactionCountActive]}>{r.count}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MessageBubble({ reply, onReact }: { reply: Reply; onReact: (replyId: string, emoji: string) => void }) {
  const isIris = reply.userId === 'IRIS';

  if (isIris) {
    return (
      <View style={styles.irisBubbleRow}>
        <View style={styles.irisBubbleContent}>
          <View style={styles.irisBubble}>
            {reply.body && <Text style={styles.irisBubbleText}>{reply.body}</Text>}
            {reply.mediaUrl && <Image source={{ uri: reply.mediaUrl }} style={styles.bubbleMedia} resizeMode="cover" />}
          </View>
          <Text style={styles.irisBubbleTime}>Iris · {timeAgo(reply.createdAt)}</Text>
          <ReactionBar replyId={reply.replyId} reactions={reply.reactions} onReact={onReact} />
        </View>
        <Avatar url={null} name="Iris" size={30} isIris />
      </View>
    );
  }

  return (
    <View style={styles.userBubbleRow}>
      <Avatar url={reply.avatarUrl} name={reply.displayName} size={30} />
      <View style={styles.userBubbleContent}>
        <View style={[styles.userBubble, reply.isOwn && styles.userBubbleOwn]}>
          <Text style={styles.userBubbleName}>{reply.isOwn ? 'you' : reply.displayName}</Text>
          {reply.body && <Text style={styles.userBubbleText}>{reply.body}</Text>}
          {reply.mediaUrl && <Image source={{ uri: reply.mediaUrl }} style={styles.bubbleMedia} resizeMode="cover" />}
        </View>
        <Text style={styles.userBubbleTime}>{timeAgo(reply.createdAt)}</Text>
        <ReactionBar replyId={reply.replyId} reactions={reply.reactions} onReact={onReact} />
      </View>
    </View>
  );
}

export default function IrisThoughtsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [nextKey, setNextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);

  useEffect(() => {
    if (!threadId) { setLoading(false); return; }
    apiGet<ThreadResponse>(`/lounge/thread/replies?threadId=${encodeURIComponent(threadId)}`)
      .then((res) => {
        setThread(res.thread);
        setReplies(res.replies);
        setNextKey(res.nextKey);
      })
      .catch(() => setError("Couldn't load Iris's thoughts right now."))
      .finally(() => setLoading(false));
  }, [threadId]);

  const handleReact = useCallback(async (replyId: string, emoji: string) => {
    if (!threadId) return;
    setReplies((prev) => prev.map((r) => {
      if (r.replyId !== replyId) return r;
      const existing = r.reactions.find((rx) => rx.emoji === emoji);
      if (existing) {
        return { ...r, reactions: r.reactions.map((rx) => rx.emoji === emoji ? { ...rx, count: rx.reactedByMe ? rx.count - 1 : rx.count + 1, reactedByMe: !rx.reactedByMe } : rx).filter((rx) => rx.count > 0) };
      }
      return { ...r, reactions: [...r.reactions, { emoji, count: 1, reactedByMe: true }] };
    }));
    try { await apiPost('/lounge/thread/react', { threadId, replyId, emoji }); } catch {}
  }, [threadId]);

  const submitReply = async () => {
    if (submitting || !text.trim() || !threadId) return;
    setSubmitting(true);
    setSubmitError(null);
    setShowEmojiTray(false);
    try {
      const res = await apiPost<{ result: string; reply?: Reply }>(
        '/lounge/thread/reply',
        { threadId, content: text.trim() }
      );
      if (res.result === 'published' && res.reply) {
        setReplies((prev) => [...prev, res.reply!]);
        setText('');
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (res.result === 'rejected_minor') {
        setSubmitError("That didn't quite fit the vibe — give it another go! 💛");
      }
    } catch {
      setSubmitError('Something went wrong. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Getting Iris's thoughts…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Image source={{ uri: IRIS_AVATAR }} style={styles.headerAvatar} />
            <View>
              <Text style={styles.headerLabel}>Iris Has Thoughts</Text>
              <Text style={styles.headerTitle}>{thread?.topicLabel ?? "This week's mood"}</Text>
            </View>
          </View>
          {thread && (
            <Text style={styles.headerReplies}>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</Text>
          )}
        </View>

        {thread?.body && (
          <View style={styles.threadBody}>
            <Text style={styles.threadBodyText}>"{thread.body}"</Text>
            <Text style={styles.threadBodyAuthor}>— Iris</Text>
          </View>
        )}
      </View>

      {/* MESSAGES */}
      {!thread && !error ? (
        <View style={styles.emptyState}>
          <Image source={{ uri: IRIS_AVATAR }} style={styles.emptyAvatar} />
          <Text style={styles.emptyTitle}>Iris is gathering her thoughts…</Text>
          <Text style={styles.emptySubtitle}>Check back soon for this week's thought.</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false}>
          {replies.length === 0 ? (
            <View style={styles.emptyReplies}>
              <Text style={styles.emptyRepliesTitle}>Be the first to respond…</Text>
              <Text style={styles.emptyRepliesSubtitle}>What do you think?</Text>
            </View>
          ) : (
            replies.map((reply) => (
              <MessageBubble key={reply.replyId} reply={reply} onReact={handleReact} />
            ))
          )}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}

      {/* COMPOSER */}
      {thread && (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {showEmojiTray && (
            <View style={styles.emojiTray}>
              {EMOJI_TRAY.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiButton}
                  onPress={() => { setText((prev) => prev + emoji); setShowEmojiTray(false); }}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {submitError && <Text style={styles.submitError}>{submitError}</Text>}

          <View style={styles.composerRow}>
            <TouchableOpacity
              style={[styles.composerButton, showEmojiTray && styles.composerButtonActive]}
              onPress={() => setShowEmojiTray(!showEmojiTray)}
            >
              <Text style={styles.composerButtonEmoji}>😊</Text>
            </TouchableOpacity>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Share your thoughts…"
              placeholderTextColor="#C4B5A5"
              multiline
              style={styles.composerInput}
            />

            <TouchableOpacity
              style={[styles.sendButton, (!text.trim() || submitting) && styles.sendButtonDisabled]}
              onPress={submitReply}
              disabled={!text.trim() || submitting}
            >
              <Text style={styles.sendButtonText}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EDE9DF' },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, flexShrink: 0 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 20, color: '#6A5550' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#E8D5E5' },
  headerLabel: { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: '#9B6B9B', fontWeight: '600' },
  headerTitle: { fontSize: 16, color: '#1A1A2E', fontStyle: 'italic' },
  headerReplies: { fontSize: 11, color: '#C4A882' },
  threadBody: { backgroundColor: '#FDFAF6', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#E8D5E5' },
  threadBodyText: { fontSize: 18, color: '#1A1A2E', fontStyle: 'italic', lineHeight: 26 },
  threadBodyAuthor: { fontSize: 10, color: '#9B6B9B', fontWeight: '600', marginTop: spacing.xs },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  irisBubbleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: spacing.sm, marginBottom: spacing.md },
  irisBubbleContent: { maxWidth: '78%', alignItems: 'flex-end' },
  irisBubble: { backgroundColor: '#FDFAF6', borderRadius: 18, borderBottomRightRadius: 4, padding: spacing.md, borderWidth: 1, borderColor: '#E8D5E5' },
  irisBubbleText: { fontSize: 14, color: '#1A1A2E', lineHeight: 21 },
  irisBubbleTime: { fontSize: 10, color: '#C4A882', marginTop: spacing.xs },
  userBubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.md },
  userBubbleContent: { maxWidth: '78%' },
  userBubble: { backgroundColor: '#6A5969', borderRadius: 18, borderBottomLeftRadius: 4, padding: spacing.md },
  userBubbleOwn: { backgroundColor: '#B83255' },
  userBubbleName: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  userBubbleText: { fontSize: 14, color: '#fff', lineHeight: 21 },
  userBubbleTime: { fontSize: 10, color: '#C4A882', marginTop: spacing.xs },
  bubbleMedia: { width: '100%', height: 180, borderRadius: 12, marginTop: spacing.sm },
  reactionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  reactionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F5F0EB', borderWidth: 1, borderColor: 'transparent' },
  reactionButtonActive: { backgroundColor: 'rgba(184,50,85,0.1)', borderColor: 'rgba(184,50,85,0.35)' },
  reactionEmoji: { fontSize: 11 },
  reactionCount: { fontSize: 11, fontWeight: '600', color: '#6A5550' },
  reactionCountActive: { color: '#B83255' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#E8D5E5' },
  emptyTitle: { fontSize: 22, color: '#C4A882', fontStyle: 'italic', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#B09A7E', textAlign: 'center' },
  emptyReplies: { paddingVertical: 64, alignItems: 'center', gap: spacing.sm },
  emptyRepliesTitle: { fontSize: 20, color: '#C4A882', fontStyle: 'italic' },
  emptyRepliesSubtitle: { fontSize: 13, color: '#B09A7E' },
  errorText: { fontSize: 14, color: '#6A5550', textAlign: 'center' },
  backLinkText: { fontSize: 14, color: '#B83255', textDecorationLine: 'underline' },
  loadingText: { fontSize: 14, color: '#B09A7E', marginTop: spacing.sm },
  composer: { borderTopWidth: 1, borderTopColor: 'rgba(196,168,130,0.3)', backgroundColor: '#EDE9DF', paddingTop: spacing.sm },
  emojiTray: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  emojiButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F0EB', alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 18 },
  submitError: { fontSize: 12, color: '#B83255', paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.sm },
  composerButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F0EB', alignItems: 'center', justifyContent: 'center' },
  composerButtonActive: { backgroundColor: 'rgba(184,50,85,0.1)' },
  composerButtonEmoji: { fontSize: 18 },
  composerInput: { flex: 1, backgroundColor: '#FDFAF6', borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: '#3A2C28', borderWidth: 1, borderColor: '#DDD5C4', maxHeight: 100 },
  sendButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#DDD5C4' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});