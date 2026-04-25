import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { apiPost } from '../lib/api';

const MIN_CHARS = 10;
const MAX_CHARS = 1000;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function FeedbackModal({ visible, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = message.trim().length >= MIN_CHARS && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/feedback', { message: message.trim() });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Share Feedback</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {submitted ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              Got it — your words mean more than you know.{'\n\n'}~ Iris
            </Text>
            <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={(t) => setMessage(t.slice(0, MAX_CHARS))}
              placeholder="What's on your mind?"
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              autoFocus
            />
            <Text style={styles.charCount}>
              {message.length} / {MAX_CHARS}
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit</Text>
              )}
            </TouchableOpacity>

            {message.trim().length > 0 && message.trim().length < MIN_CHARS && (
              <Text style={styles.minHint}>
                {MIN_CHARS - message.trim().length} more character{MIN_CHARS - message.trim().length !== 1 ? 's' : ''} needed
              </Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F4F8',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15,42,72,0.15)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,42,72,0.08)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2A48',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#6b7280',
  },
  form: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,42,72,0.12)',
    padding: 16,
    fontSize: 15,
    color: '#0F2A48',
    lineHeight: 22,
    minHeight: 160,
  },
  charCount: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'right',
  },
  error: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
  },
  submitBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#D4C4C4',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  minHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  successContainer: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  successText: {
    fontSize: 18,
    color: '#0F2A48',
    textAlign: 'center',
    lineHeight: 28,
    fontStyle: 'italic',
  },
  doneBtn: {
    height: 52,
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#0F2A48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
