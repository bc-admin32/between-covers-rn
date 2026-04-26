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
import { apiPost } from '../lib/api';

// QuickRatingModal — post-event rating prompt.
// Mounted conditionally by the host (`{showRatingModal && <QuickRatingModal ... />}`).
// Backend drives whether to show via /live/{eventId}.ratingPrompt.show; this
// component does no local dedup. The only ways to dismiss are Submit (after
// picking ≥1 star) or "Maybe later" (when onSkip is provided). Backdrop taps,
// swipe-down, and Android back are all no-ops by design.

const IRIS_AVATAR = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';
const MAX_COMMENT = 200;

type Props = {
  eventId: string;
  eventType: 'AUTHOR_EVENT' | 'DANCE_PARTY' | 'IRIS_LIVE';
  eventTitle?: string;
  onClose: () => void;
  onSkip?: () => void;
};

export default function QuickRatingModal({ eventId, eventType, eventTitle, onClose, onSkip }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setSubmitted(true);
      setTimeout(() => onClose(), 1500);
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const tapStar = (n: number) => {
    setRating(rating === n ? 0 : n);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => {}}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {submitted ? (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>Thanks for sharing ✦</Text>
            </View>
          ) : (
            <>
              <Image source={{ uri: IRIS_AVATAR }} style={styles.avatar} />
              <Text style={styles.header}>How was the {eventTitle ?? 'event'}?</Text>

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
                {onSkip && (
                  <TouchableOpacity
                    onPress={onSkip}
                    style={styles.maybeLaterBtn}
                  >
                    <Text style={styles.maybeLaterText}>Maybe later</Text>
                  </TouchableOpacity>
                )}
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
  maybeLaterBtn: { paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  maybeLaterText: { fontSize: 13, color: 'rgba(196,168,130,0.6)' },
  successContainer: { paddingVertical: 32, alignItems: 'center' },
  successText: { fontSize: 17, color: '#1A1A2E', fontWeight: '600' },
});
