import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { apiPost } from '../lib/api';

/**
 * QuickRatingModal — post-event rating prompt.
 *
 * TODO (host wiring): the lounge does not yet have a live-event view.
 * The home screen's live banner navigates to /(tabs)/lounge?eventId=...
 * but app/(tabs)/lounge/index.tsx ignores the eventId param. Until a
 * live-event view exists, this modal has no host. To wire it up:
 *   1. Build a live-event view (e.g. app/(tabs)/lounge/event/[eventId].tsx
 *      or extend lounge/index.tsx to handle the eventId query param).
 *   2. On view mount, capture an entry timestamp:
 *        const entryRef = useRef(Date.now());
 *   3. Poll /live (or use a real-time channel when added) and detect when
 *      the event status flips ACTIVE → ENDED.
 *   4. On status change to ENDED:
 *        const elapsed = Date.now() - entryRef.current;
 *        if (elapsed >= 2 * 60 * 1000) {
 *          const rated = await SecureStore.getItemAsync(`bc_rated_event_${eventId}`);
 *          if (rated !== 'true') setShowRating(true);
 *        }
 *   5. Render <QuickRatingModal visible={showRating} onClose={...}
 *               eventId={...} eventTitle={...} eventType={...} />
 *
 * The modal handles its own SecureStore write on send/skip/close so the
 * host doesn't re-prompt on the same event.
 */

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';
const MAX_COMMENT = 200;

type Props = {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  eventType: 'AUTHOR_EVENT' | 'DANCE_PARTY' | 'IRIS_LIVE';
};

export function QuickRatingModal({ visible, onClose, eventId, eventTitle, eventType }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markRated = async () => {
    try {
      await SecureStore.setItemAsync(`bc_rated_event_${eventId}`, 'true');
    } catch {}
  };

  const close = () => {
    setRating(0);
    setComment('');
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
    onClose();
  };

  const handleSkip = async () => {
    if (submitting) return;
    await markRated();
    close();
  };

  const handleSend = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/ratings', {
        eventId,
        eventType,
        rating,
        comment: comment.trim() || null,
      });
      await markRated();
      setSubmitted(true);
      setTimeout(() => close(), 1500);
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const tapStar = (n: number) => {
    setRating(rating === n ? 0 : n);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleSkip}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backdrop} onPress={handleSkip} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {submitted ? (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>Thanks for sharing ✦</Text>
            </View>
          ) : (
            <>
              <Image source={{ uri: IRIS_AVATAR }} style={styles.avatar} />
              <Text style={styles.header}>How was the {eventTitle}?</Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => tapStar(n)}
                    hitSlop={6}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={n <= rating ? 'star' : 'star-outline'}
                      size={36}
                      color={n <= rating ? '#B83255' : 'rgba(15,42,72,0.3)'}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={(t) => setComment(t.slice(0, MAX_COMMENT))}
                placeholder="Anything you want to share?"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                maxLength={MAX_COMMENT}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.sendBtn, (rating === 0 || submitting) && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={rating === 0 || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.sendBtnText}>Send</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkip} disabled={submitting} style={styles.skipBtn}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: '#FDFAF6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#DDD5C4',
    marginBottom: 4,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, borderColor: '#E8D5E5',
  },
  header: {
    fontSize: 17, color: '#1A1A2E',
    fontWeight: '700', textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    width: '100%',
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(15,42,72,0.12)',
    paddingHorizontal: 14,
    fontSize: 14, color: '#0F2A48',
  },
  error: { fontSize: 13, color: '#ef4444', textAlign: 'center' },
  actions: { width: '100%', gap: 8, marginTop: 4 },
  sendBtn: {
    width: '100%', height: 48,
    borderRadius: 12, backgroundColor: '#B83255',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D4C4C4' },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipBtnText: { fontSize: 13, color: '#6A5969' },
  successContainer: { paddingVertical: 32, alignItems: 'center' },
  successText: { fontSize: 17, color: '#1A1A2E', fontWeight: '600' },
});
