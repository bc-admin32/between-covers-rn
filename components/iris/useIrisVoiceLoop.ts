import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useAudioRecorder, AudioStudioModule, type AudioDataEvent } from '@siteed/audio-studio';
import { apiPost, ApiError } from '../../lib/api';
import { markIrisVoiceTermsRequired } from '../../lib/irisVoiceTerms';
import { TurnDetector, SAMPLE_RATE, base64ToBytes, buildWav, floatRms } from '../../lib/irisVoiceAudio';

// Talking over Iris stops her. Fire tablets have had flaky echo
// cancellation; set this to false to make Fire tap-to-interrupt only.
const VOICE_INTERRUPT_ON_FIRE = true;
const IS_FIRE = Platform.OS === 'android' && Device.manufacturer === 'Amazon';
const VOICE_INTERRUPT_ENABLED = !IS_FIRE || VOICE_INTERRUPT_ON_FIRE;

const REQUEST_TIMEOUT_MS = 45_000;

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';
export type VoiceErrorKind = 'mic' | 'offline' | 'failed';

type VoiceResponse = {
  transcript?: string;
  reply?: string | null;
  sessionId?: string | null;
  softLimit?: boolean;
  audio?: string | null;
  audioFormat?: string;
  noSpeech?: boolean;
};

type Options = {
  active: boolean;
  sessionId: string | null;
  from: string;
  openingMessage: string;
  onSessionId: (id: string) => void;
  onTurn: (turn: { transcript: string; reply: string }) => void;
  onTermsRequired: () => void;
};

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Base64 of a byte array, encoded natively via a temp file (a ~2 MB turn is
// slow to encode in JS).
async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  const file = new File(Paths.cache, `iris-turn-${Date.now()}.wav`);
  try {
    file.write(bytes);
    return await file.base64();
  } finally {
    try { file.delete(); } catch {}
  }
}

// Record → send → play loop for Iris voice mode. The mic runs for as long as
// `active` is true; TurnDetector decides which audio belongs to the user's
// turn, so nothing captured while Iris plays is sent (except the ~0.5s that
// triggered a voice interrupt).
export function useIrisVoiceLoop(opts: Options) {
  const { active } = opts;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [phase, setPhaseState] = useState<VoicePhase>('idle');
  const [replyText, setReplyText] = useState<string | null>(null);
  const [error, setError] = useState<VoiceErrorKind | null>(null);
  const level = useRef(new Animated.Value(0)).current;

  const phaseRef = useRef<VoicePhase>('idle');
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const turnGenRef = useRef(0);
  const detectorRef = useRef(new TurnDetector(VOICE_INTERRUPT_ENABLED));
  const playbackRef = useRef<{
    player: AudioPlayer;
    file: File;
    subs: { remove: () => void }[];
    pulse: Animated.CompositeAnimation | null;
  } | null>(null);
  const smoothLevelRef = useRef(0);

  const { startRecording, stopRecording } = useAudioRecorder();

  const setPhase = useCallback((p: VoicePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const stopPlayback = useCallback(() => {
    const pb = playbackRef.current;
    playbackRef.current = null;
    if (!pb) return;
    pb.subs.forEach((s) => s.remove());
    pb.pulse?.stop();
    try { pb.player.pause(); } catch {}
    try { pb.player.remove(); } catch {}
    try { pb.file.delete(); } catch {}
    smoothLevelRef.current = 0;
    level.setValue(0);
  }, [level]);

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    detectorRef.current.setMode('listening');
    setPhase('listening');
  }, [setPhase]);

  const play = useCallback((audioB64: string) => {
    const file = new File(Paths.cache, `iris-reply-${Date.now()}.mp3`);
    file.write(audioB64, { encoding: 'base64' });

    // Watch the mic for an interrupt from the moment playback starts.
    detectorRef.current.setMode('speaking');
    const player = createAudioPlayer({ uri: file.uri }, { updateInterval: 100, keepAudioSessionActive: true });
    const subs: { remove: () => void }[] = [];
    let pulse: Animated.CompositeAnimation | null = null;

    if (player.isAudioSamplingSupported) {
      player.setAudioSamplingEnabled(true);
      subs.push(player.addListener('audioSampleUpdate', (sample) => {
        const frames = sample.channels[0]?.frames ?? [];
        const target = Math.min(1, floatRms(frames) * 4);
        smoothLevelRef.current = smoothLevelRef.current * 0.6 + target * 0.4;
        level.setValue(smoothLevelRef.current);
      }));
    } else {
      // No sample data on this device: a gentle steady pulse instead.
      pulse = Animated.loop(Animated.sequence([
        Animated.timing(level, { toValue: 0.6, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(level, { toValue: 0.25, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      pulse.start();
    }

    subs.push(player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && playbackRef.current?.player === player) {
        stopPlayback();
        listen();
      }
    }));

    playbackRef.current = { player, file, subs, pulse };
    player.play();
    setPhase('speaking');
  }, [level, listen, setPhase, stopPlayback]);

  const sendTurn = useCallback(async (chunks: Uint8Array[]) => {
    const gen = ++turnGenRef.current;
    setPhase('thinking');
    setReplyText(null);
    const { sessionId, from, openingMessage } = optsRef.current;

    try {
      const audio = await bytesToBase64(buildWav(chunks));
      const res = await withTimeout(apiPost<VoiceResponse>('/iris/voice', {
        audio,
        sessionId,
        // Same rule as text chat: the greeting goes only with the first turn.
        openingMessage: sessionId ? null : openingMessage,
        from: from || null,
      }), REQUEST_TIMEOUT_MS);

      // The turn is part of the conversation even if the user has since left
      // voice mode (which unmounts this hook), so hand the session id and the
      // bubbles to the chat screen either way.
      if (res.sessionId) optsRef.current.onSessionId(res.sessionId);
      if (!res.noSpeech && res.transcript && res.reply) {
        optsRef.current.onTurn({ transcript: res.transcript, reply: res.reply });
      }
      if (!mountedRef.current || gen !== turnGenRef.current || !activeRef.current) return;
      if (res.noSpeech) {
        listen();
        return;
      }

      setError(null);
      if (res.audio) {
        play(res.audio);
      } else {
        setReplyText(res.reply ?? null);
        listen();
      }
    } catch (err) {
      if (!mountedRef.current || gen !== turnGenRef.current) return;
      if (err instanceof ApiError && err.status === 403 && err.body?.error === 'VOICE_TERMS_REQUIRED') {
        markIrisVoiceTermsRequired();
        optsRef.current.onTermsRequired();
        return;
      }
      setError(err instanceof ApiError || err instanceof TimeoutError ? 'failed' : 'offline');
      listen();
    }
  }, [listen, play, setPhase]);

  const onAudioStream = useCallback(async (event: AudioDataEvent) => {
    if (!activeRef.current || typeof event.data !== 'string') return;
    const ev = detectorRef.current.push(base64ToBytes(event.data));
    if (!ev) return;
    if (ev.type === 'speechStart') {
      setError(null);
      setReplyText(null);
    } else if (ev.type === 'bargeIn') {
      stopPlayback();
      setReplyText(null);
      setPhase('listening');
    } else if (ev.type === 'turnEnd') {
      sendTurn(ev.chunks);
    }
  }, [sendTurn, setPhase, stopPlayback]);

  // Start the mic when voice mode turns on; stop everything when it turns off.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    activeRef.current = true;
    setError(null);
    setReplyText(null);

    (async () => {
      try {
        const perm = await AudioStudioModule.requestPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          setError('mic');
          setPhase('idle');
          return;
        }
        await startRecording({
          sampleRate: SAMPLE_RATE,
          channels: 1,
          encoding: 'pcm_16bit',
          interval: 100,
          enableProcessing: false, // level is computed in JS; see lib/irisVoiceAudio
          output: { primary: { enabled: false } }, // stream only, no file
          autoResumeAfterInterruption: true,
          ios: {
            audioSession: {
              category: 'PlayAndRecord',
              mode: 'VoiceChat', // turns on iOS echo cancellation
              categoryOptions: ['DefaultToSpeaker', 'AllowBluetooth'],
            },
          },
          android: { audioFocusStrategy: 'communication' },
          onAudioStream,
        });
        if (cancelled) {
          stopRecording().catch(() => {});
          return;
        }
        listen();
      } catch {
        if (!cancelled) {
          setError('failed');
          setPhase('idle');
        }
      }
    })();

    return () => {
      cancelled = true;
      activeRef.current = false;
      turnGenRef.current++; // drop playback for any request still in flight
      detectorRef.current.setMode('paused');
      stopPlayback();
      stopRecording().catch(() => {});
      setPhase('idle');
      setReplyText(null);
    };
    // onAudioStream is stable for the session; restart only on active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Tapping the circle stops Iris and goes straight back to listening.
  const interrupt = useCallback(() => {
    if (phaseRef.current !== 'speaking') return;
    stopPlayback();
    listen();
  }, [listen, stopPlayback]);

  return { phase, level, replyText, error, interrupt };
}
