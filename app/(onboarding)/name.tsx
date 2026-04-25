import { useState } from 'react';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export default function NameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // TODO: upload final v2 video to S3 before launch; owner will provide HeyGen-produced files
  const player = useVideoPlayer(
    'https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/v2/Name.mp4',
    (p) => {
      p.loop = false;
      p.play();
    }
  );

  const handleSubmit = async () => {
    const value = name.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await apiPost('/onboarding/submit', { step: 'L3Nam', value });
      if (res?.nextRoute) {
        router.replace(normalizeRoute(res.nextRoute) as any);
        return;
      }
    } catch {}
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Spacer pushes input to the bottom; KAV lifts it above the keyboard */}
      <View style={styles.spacer} />

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.inputRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={handleSubmit}
            placeholder="What should we call you?"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!name.trim() || submitting}
            style={[styles.submitButton, (!name.trim() || submitting) && styles.submitDisabled]}
          >
            <Text style={styles.submitArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  spacer: { flex: 1 },
  inputContainer: {
    paddingHorizontal: 20,
    zIndex: 30,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: '#000',
    textAlign: 'center',
  },
  submitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  submitDisabled: { opacity: 0.5 },
  submitArrow: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});