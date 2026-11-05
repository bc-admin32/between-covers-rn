import { View, StyleSheet } from 'react-native';
import IrisVoiceView from './IrisVoiceView';
import { useIrisVoiceLoop } from './useIrisVoiceLoop';

// Voice mode for the Iris chat screen. The screen loads this file only when
// the user switches to voice, so the audio libraries (expo-audio,
// @siteed/audio-studio) are never loaded for text chat. Mounting this starts
// the mic; unmounting it stops everything.

type Props = {
  paddingBottom: number;
  sessionId: string | null;
  from: string;
  openingMessage: string;
  onSessionId: (id: string) => void;
  onTurn: (turn: { transcript: string; reply: string }) => void;
  onTermsRequired: () => void;
  onBackground: () => void;
};

export default function IrisVoiceSession({ paddingBottom, ...loopOpts }: Props) {
  const voice = useIrisVoiceLoop({ ...loopOpts, active: true });

  return (
    <View style={[styles.body, { paddingBottom }]}>
      <IrisVoiceView
        phase={voice.phase}
        level={voice.level}
        replyText={voice.replyText}
        error={voice.error}
        onPressCircle={voice.interrupt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
});
