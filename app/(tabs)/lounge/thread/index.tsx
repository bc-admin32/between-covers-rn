import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiGet, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

const EMOJI_TRAY = ['❤️', '😂', '😭', '🔥', '👏', '✨', '😍', '💀', '🫶', '📚'];
const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar2.png';

type Reaction = { emoji: string; count: number; reactedByMe: boolean };
type ReplyTo = { replyId: string; displayName: string; bodySnippet: string | null };
type Reply = {
  replyId: string; sk: string; threadId: string; userId: string;
  displayName: string; avatarUrl: string | null; body: string | null;
  mediaUrl: string | null; gifUrl: string | null; replyTo: ReplyTo | null;
  reactions: Reaction[]; createdAt: string; editedAt: string | null;
  isOwn: boolean; canEdit: boolean;
};
type Thread = {
  threadId: string; type: 'THREAD' | 'IRIS_CHAT'; topicLabel: string | null;
  body: string | null; authorId: string; authorName: string;
  authorAvatar: string | null; weekId: string | null; replyCount: number;
  createdAt: string; expiresAt: string | null; isOwn: boolean; status?: string;
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

function Avatar({ url, name, size = 34, isIris = false }: { url: string | null; name: string; size?: number; isIris?: boolean }) {
  if (isIris) return <Image source={{ uri: IRIS_AVATAR }} style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#E8D5E5' }]} />;
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#B83255', alignItems: 'center', justifyContent: 'center' }}>
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

function ReplyCard({ reply, onReact, onReplyTo, onEdit }: {
  reply: Reply; onReact: (replyId: string, emoji: string) => void;
  onReplyTo: (reply: Reply) => void; onEdit: (reply: Reply) => void;
}) {
  const isIris = reply.userId === 'IRIS';
  const [showEmojiTray, setShowEmojiTray] = useState(false);

  return (
    <View style={styles.replyRow}>
      <Avatar url={reply.avatarUrl} name={reply.displayName} size={34} isIris={isIris} />
      <View style={styles.replyContent}>
        {reply.replyTo && (
          <View style={styles.replyToBar}>
            <View style={styles.replyToLine} />
            <Text style={styles.replyToText}>
              <Text style={styles.replyToName}>↩ @{reply.replyTo.displayName}</Text>
              {reply.replyTo.bodySnippet && ` ${reply.replyTo.bodySnippet}`}
            </Text>
          </View>
        )}
        <View style={[styles.bubble, isIris ? styles.irisBubble : styles.userBubble]}>
          <View style={styles.bubbleHeader}>
            <Text style={[styles.bubbleName, isIris && styles.irisBubbleName]}>
              {isIris ? 'Iris' : reply.displayName}
              {reply.isOwn && !isIris && <Text style={styles.youLabel}> · you</Text>}
            </Text>
            <Text style={styles.bubbleTime}>{timeAgo(reply.createdAt)}</Text>
            {reply.editedAt && <Text style={styles.editedLabel}> · edited</Text>}
          </View>
          {reply.body && <Text style={styles.bubbleBody}>{reply.body}</Text>}
          {reply.mediaUrl && <Image source={{ uri: reply.mediaUrl }} style={styles.bubbleMedia} resizeMode="cover" />}
        </View>

        <View style={styles.replyActions}>
          <TouchableOpacity onPress={() => onReplyTo(reply)}>
            <Text style={styles.replyActionText}>Reply</Text>
          </TouchableOpacity>
          <Text style={styles.replyActionDot}>·</Text>
          <TouchableOpacity onPress={() => setShowEmojiTray(!showEmojiTray)}>
            <Text style={styles.replyActionText}>React</Text>
          </TouchableOpacity>
          {reply.isOwn && !isIris && reply.canEdit && (
            <>
              <Text style={styles.replyActionDot}>·</Text>
              <TouchableOpacity onPress={() => onEdit(reply)}>
                <Text style={styles.replyActionText}>Edit</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {showEmojiTray && (
          <View style={styles.emojiTray}>
            {EMOJI_TRAY.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiButton}
                onPress={() => { onReact(reply.replyId, emoji); setShowEmojiTray(false); }}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ReactionBar replyId={reply.replyId} reactions={reply.reactions} onReact={onReact} />
      </View>
    </View>
  );
}

export default function LoungeThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = id ? (Array.isArray(id) ? id[0] : id) : null;

  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [nextKey, setNextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [editingReply, setEditingReply] = useState<Reply | null>(null);
  const [editText, setEditText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!threadId) { setError('No thread specified.'); setLoading(false); return; }
    apiGet<ThreadResponse>(`/lounge/thread/replies?threadId=${encodeURIComponent(threadId)}`)
      .then((res) => {
        setThread(res.thread);
        setReplies(res.replies.map((r) => ({ ...r, reactions: r.reactions ?? [] })));
        setNextKey(res.nextKey);
      })
      .catch(() => setError("Couldn't load this thread right now."))
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

  const handleReplyTo = useCallback((reply: Reply) => {
    Haptics.selectionAsync();
    setReplyingTo(reply);
  }, []);

  const handleEdit = useCallback((reply: Reply) => {
    setEditingReply(reply);
    setEditText(reply.body ?? '');
  }, []);

  const submitReply = async () => {
    if (submitting || !text.trim()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const replyToPayload = replyingTo ? {
        replyId: replyingTo.replyId,
        displayName: replyingTo.displayName,
        bodySnippet: replyingTo.body ? replyingTo.body.slice(0, 120) : null,
      } : null;

      const res = await apiPost<{ result: string; message: string; reply?: Reply }>(
        '/lounge/thread/reply',
        { threadId, content: text.trim(), replyTo: replyToPayload }
      );

      if (res.result === 'published' && res.reply) {
        setReplies((prev) => [...prev, { ...res.reply!, reactions: [], editedAt: null, canEdit: true, sk: res.reply!.sk ?? '' }]);
        setText('');
        setReplyingTo(null);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (res.result === 'rejected_minor') {
        setSubmitError("That reply didn't quite fit the vibe — give it another go! 💛");
      }
    } catch {
      setSubmitError('Something went wrong. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async () => {
    if (!editingReply || !editText.trim()) return;
    try {
      const res = await apiPost<{ result: string; reply?: { replyId: string; body: string; editedAt: string; canEdit: boolean } }>(
        '/lounge/thread/edit',
        { threadId, replyId: editingReply.replyId, sk: editingReply.sk, content: editText.trim() }
      );
      if (res.result === 'updated' && res.reply) {
        setReplies((prev) => prev.map((r) => r.replyId === editingReply.replyId ? { ...r, body: res.reply!.body, editedAt: res.reply!.editedAt, canEdit: res.reply!.canEdit } : r));
        setEditingReply(null);
        setEditText('');
      }
    } catch {}
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Pulling up the conversation…</Text>
      </View>
    );
  }

  if (error || !thread) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
        <Text style={styles.errorText}>{error ?? "This thread couldn't be found."}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isIrisChat = thread.type === 'IRIS_CHAT';
  const isClosed = thread.status === 'closed';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backText}>The Lounge</Text>
        </TouchableOpacity>

        <View style={[styles.threadCard, isIrisChat && styles.threadCardIris]}>
          <View style={styles.threadCardHeader}>
            <Text style={[styles.threadCardLabel, isIrisChat && styles.threadCardLabelIris]}>
              {isIrisChat ? 'Iris Has Thoughts' : thread.topicLabel ?? 'Discussion'}
            </Text>
            <Text style={styles.threadCardReplies}>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</Text>
          </View>
          <View style={styles.threadCardAuthor}>
            <Avatar url={thread.authorAvatar} name={thread.authorName} size={38} isIris={isIrisChat} />
            <View>
              <Text style={[styles.threadCardAuthorName, isIrisChat && styles.threadCardAuthorNameIris]}>
                {isIrisChat ? 'Iris' : thread.authorName}
              </Text>
              <Text style={styles.threadCardTime}>{timeAgo(thread.createdAt)}</Text>
            </View>
          </View>
          {thread.body && <Text style={styles.threadCardBody}>{thread.body}</Text>}
        </View>
      </View>

      {/* REPLIES */}
      <ScrollView ref={scrollRef} style={styles.replies} contentContainerStyle={styles.repliesContent} showsVerticalScrollIndicator={false}>
        {replies.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Be the first to spill…</Text>
            <Text style={styles.emptySubtitle}>No replies yet. The floor is yours.</Text>
          </View>
        ) : (
          replies.map((reply) => (
            editingReply?.replyId === reply.replyId ? (
              <View key={reply.replyId} style={styles.editContainer}>
                <TextInput
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  style={styles.editInput}
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={() => { setEditingReply(null); setEditText(''); }} style={styles.editCancelButton}>
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={submitEdit} style={styles.editSaveButton}>
                    <Text style={styles.editSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ReplyCard key={reply.replyId} reply={reply} onReact={handleReact} onReplyTo={handleReplyTo} onEdit={handleEdit} />
            )
          ))
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* COMPOSER */}
      {isClosed ? (
        <View style={[styles.closedBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.closedPill}>
            <Text style={styles.closedEmoji}>🔒</Text>
            <Text style={styles.closedText}>This conversation has closed</Text>
          </View>
          <Text style={styles.closedSubtext}>Thanks for being part of it ✦</Text>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {replyingTo && (
            <View style={styles.replyingToBar}>
              <Text style={styles.replyingToText}>↩ Replying to <Text style={styles.replyingToName}>@{replyingTo.displayName}</Text></Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Text style={styles.replyingToClose}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {showEmojiTray && (
            <View style={styles.composerEmojiTray}>
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
              placeholder={replyingTo ? `Reply to @${replyingTo.displayName}…` : 'Add to the conversation…'}
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
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, flexShrink: 0 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  backArrow: { fontSize: 20, color: '#6A5550' },
  backText: { fontSize: 13, color: '#6A5550' },
  threadCard: { backgroundColor: '#FDFAF6', borderRadius: 20, padding: spacing.lg, borderWidth: 1, borderColor: '#DDD5C4' },
  threadCardIris: { borderColor: '#E8D5E5' },
  threadCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  threadCardLabel: { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: '#B09A7E', fontWeight: '600' },
  threadCardLabelIris: { color: '#9B6B9B' },
  threadCardReplies: { fontSize: 11, color: '#C4A882' },
  threadCardAuthor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  threadCardAuthorName: { fontSize: 12, fontWeight: '600', color: '#B83255' },
  threadCardAuthorNameIris: { color: '#9B6B9B' },
  threadCardTime: { fontSize: 11, color: '#C4A882' },
  threadCardBody: { fontSize: 18, color: '#1A1A2E', fontStyle: 'italic', lineHeight: 26 },
  replies: { flex: 1 },
  repliesContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  emptyState: { paddingVertical: 64, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: 22, color: '#C4A882', fontStyle: 'italic' },
  emptySubtitle: { fontSize: 13, color: '#B09A7E' },
  replyRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  replyContent: { flex: 1 },
  replyToBar: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.xs },
  replyToLine: { width: 2, borderRadius: 1, backgroundColor: '#C4A882', opacity: 0.5, alignSelf: 'stretch', minHeight: 16 },
  replyToText: { fontSize: 11, color: '#B09A7E', flex: 1 },
  replyToName: { fontWeight: '600', color: '#C4A882' },
  bubble: { borderRadius: 16, borderTopLeftRadius: 4, padding: spacing.md, marginBottom: spacing.xs },
  userBubble: { backgroundColor: '#FDFAF6', borderWidth: 1, borderColor: '#EDE8DF' },
  irisBubble: { backgroundColor: '#FDFAF6', borderWidth: 1, borderColor: '#E8D5E5' },
  bubbleHeader: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginBottom: spacing.xs, flexWrap: 'wrap' },
  bubbleName: { fontSize: 12, fontWeight: '600', color: '#B83255' },
  irisBubbleName: { color: '#9B6B9B' },
  youLabel: { color: '#C4A882', fontWeight: '400' },
  bubbleTime: { fontSize: 11, color: '#C4A882' },
  editedLabel: { fontSize: 10, color: '#C4A882', fontStyle: 'italic' },
  bubbleBody: { fontSize: 14, color: '#3A2C28', lineHeight: 21 },
  bubbleMedia: { width: '100%', height: 200, borderRadius: 12, marginTop: spacing.sm },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.xs, marginBottom: spacing.xs },
  replyActionText: { fontSize: 11, color: '#B09A7E' },
  replyActionDot: { fontSize: 10, color: '#C4A882' },
  emojiTray: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.sm, backgroundColor: '#F5F0EB', borderRadius: radius.md, marginBottom: spacing.xs },
  emojiButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FDFAF6', alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 18 },
  reactionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  reactionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F5F0EB', borderWidth: 1, borderColor: 'transparent' },
  reactionButtonActive: { backgroundColor: 'rgba(184,50,85,0.1)', borderColor: 'rgba(184,50,85,0.35)' },
  reactionEmoji: { fontSize: 11 },
  reactionCount: { fontSize: 11, fontWeight: '600', color: '#6A5550' },
  reactionCountActive: { color: '#B83255' },
  editContainer: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  editInput: { backgroundColor: '#FDFAF6', borderRadius: radius.md, borderWidth: 1, borderColor: '#B83255', padding: spacing.md, fontSize: 14, color: '#3A2C28', minHeight: 80 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  editCancelButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F5F0EB' },
  editCancelText: { fontSize: 11, fontWeight: '600', color: '#6A5550' },
  editSaveButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#B83255' },
  editSaveText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  closedBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: 'center', gap: spacing.xs, borderTopWidth: 1, borderTopColor: 'rgba(196,168,130,0.3)', backgroundColor: '#F0EDE4' },
  closedPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(196,168,130,0.15)', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(196,168,130,0.3)' },
  closedEmoji: { fontSize: 16 },
  closedText: { fontSize: 13, color: '#B09A7E' },
  closedSubtext: { fontSize: 11, color: '#C4A882' },
  composer: { borderTopWidth: 1, borderTopColor: 'rgba(196,168,130,0.3)', backgroundColor: '#F0EDE4', paddingTop: spacing.sm },
  replyingToBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  replyingToText: { fontSize: 11, color: '#C4A882' },
  replyingToName: { fontWeight: '600', color: '#B83255' },
  replyingToClose: { fontSize: 12, color: '#B09A7E' },
  composerEmojiTray: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  submitError: { fontSize: 12, color: '#B83255', paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.sm },
  composerButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F0EB', alignItems: 'center', justifyContent: 'center' },
  composerButtonActive: { backgroundColor: 'rgba(184,50,85,0.1)' },
  composerButtonEmoji: { fontSize: 18 },
  composerInput: { flex: 1, backgroundColor: '#FDFAF6', borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: '#3A2C28', borderWidth: 1, borderColor: '#DDD5C4', maxHeight: 100 },
  sendButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#DDD5C4' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loadingText: { fontSize: 14, color: '#B09A7E', marginTop: spacing.sm },
  errorText: { fontSize: 14, color: '#6A5550', textAlign: 'center' },
  backLink: { marginTop: spacing.md },
  backLinkText: { fontSize: 14, color: '#B83255', textDecorationLine: 'underline' },
});