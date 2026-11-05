import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform } from 'react-native';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useAudioRecorder, AudioStudioModule, type AudioDataEvent } from '@siteed/audio-studio';
import { apiPost, ApiError } from '../../lib/api';
import { markIrisVoiceTermsRequired } from '../../lib/irisVoiceTerms';
import {
  TurnDetector, SAMPLE_RATE, base64ToBytes, buildWav, floatRms, pcm16Rms,
  DEFAULT_SPEECH_TUNING, IOS_SPEECH_TUNING,
} from '../../lib/irisVoiceAudio';
import { breadcrumb, currentTrail, endBreadcrumbs } from '../../lib/crashCapture';
import { reportClientError } from '../../lib/analytics';

// Talking over Iris stops her. Off on Fire: its echo cancellation lets her
// own voice through the mic, which interrupted her mid-sentence. Fire users
// tap the circle to interrupt instead.
const VOICE_INTERRUPT_ON_FIRE = false;
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
  // The app went to the background while voice mode was on (not counting the
  // mic permission dialog).
  onBackground: () => void;
};

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// ── Session diagnostics ──
// Counted for every voice session. If the session closes without a single
// turn, they're sent as a client_error ('voice_no_turns') so we can see where
// the record → detect path stalled: start, chunks, levels or turn detection.

const MIN_REPORT_SESSION_MS = 3000;
// Upper bounds of the level histogram buckets; the last bucket is "≥ 0.05".
const RMS_BUCKET_LIMITS = [0.002, 0.005, 0.01, 0.02, 0.05];

type VoiceStats = {
  startedAt: number;
  permission: 'unknown' | 'granted' | 'denied';
  startRecording: 'not_called' | 'pending' | 'resolved' | 'failed';
  startError: string | null;
  firstChunkAt: number | null;
  lastChunkAt: number | null;
  chunks: number;
  nonStringChunks: number;
  nonStringType: string | null;
  bytes: number;
  minChunkBytes: number;
  maxChunkBytes: number;
  peakRms: number;
  // Chunks where every sample is exactly 0: the system is blocking the mic,
  // rather than a processing chain squashing it to a faint noise floor.
  zeroChunks: number;
  rmsHistogram: number[];
  speechStarts: number;
  bargeIns: number;
  turnEnds: number;
  turnsSent: number;
  repliesReceived: number;
  sendFailures: number;
  lastSendError: string | null;
};

function newStats(): VoiceStats {
  return {
    startedAt: Date.now(),
    permission: 'unknown',
    startRecording: 'not_called',
    startError: null,
    firstChunkAt: null,
    lastChunkAt: null,
    chunks: 0,
    nonStringChunks: 0,
    nonStringType: null,
    bytes: 0,
    minChunkBytes: 0,
    maxChunkBytes: 0,
    peakRms: 0,
    zeroChunks: 0,
    rmsHistogram: new Array(RMS_BUCKET_LIMITS.length + 1).fill(0),
    speechStarts: 0,
    bargeIns: 0,
    turnEnds: 0,
    turnsSent: 0,
    repliesReceived: 0,
    sendFailures: 0,
    lastSendError: null,
  };
}

function recordChunk(s: VoiceStats, bytes: Uint8Array): number {
  const now = Date.now();
  const rms = pcm16Rms(bytes);
  if (s.firstChunkAt === null) s.firstChunkAt = now;
  s.lastChunkAt = now;
  s.chunks++;
  s.bytes += bytes.length;
  s.minChunkBytes = s.chunks === 1 ? bytes.length : Math.min(s.minChunkBytes, bytes.length);
  s.maxChunkBytes = Math.max(s.maxChunkBytes, bytes.length);
  s.peakRms = Math.max(s.peakRms, rms);
  if (bytes.every((b) => b === 0)) s.zeroChunks++;
  const bucket = RMS_BUCKET_LIMITS.findIndex((limit) => rms < limit);
  s.rmsHistogram[bucket === -1 ? RMS_BUCKET_LIMITS.length : bucket]++;
  return rms;
}

function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

function summarizeStats(s: VoiceStats) {
  const chunkSpanMs = s.firstChunkAt !== null && s.lastChunkAt !== null ? s.lastChunkAt - s.firstChunkAt : 0;
  return {
    sessionMs: Date.now() - s.startedAt,
    permission: s.permission,
    startRecording: s.startRecording,
    startError: s.startError,
    firstChunkAfterMs: s.firstChunkAt === null ? null : s.firstChunkAt - s.startedAt,
    chunks: s.chunks,
    nonStringChunks: s.nonStringChunks,
    nonStringType: s.nonStringType,
    bytes: s.bytes,
    minChunkBytes: s.minChunkBytes,
    maxChunkBytes: s.maxChunkBytes,
    // 16 kHz mono 16-bit is 32,000 bytes/s. ~96,000 means 48 kHz arrived;
    // ~64,000 means float32 or stereo.
    bytesPerSecond: chunkSpanMs > 0 ? Math.round((s.bytes * 1000) / chunkSpanMs) : null,
    peakRms: Number(s.peakRms.toFixed(5)),
    zeroChunks: s.zeroChunks,
    rmsHistogram: Object.fromEntries(
      s.rmsHistogram.map((n, i) => [i < RMS_BUCKET_LIMITS.length ? `<${RMS_BUCKET_LIMITS[i]}` : `>=${RMS_BUCKET_LIMITS[i - 1]}`, n])
    ),
    speechStarts: s.speechStarts,
    bargeIns: s.bargeIns,
    turnEnds: s.turnEnds,
    turnsSent: s.turnsSent,
    repliesReceived: s.repliesReceived,
    sendFailures: s.sendFailures,
    lastSendError: s.lastSendError,
  };
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
  const detectorRef = useRef(new TurnDetector(
    VOICE_INTERRUPT_ENABLED,
    Platform.OS === 'ios' ? IOS_SPEECH_TUNING : DEFAULT_SPEECH_TUNING,
  ));
  const statsRef = useRef<VoiceStats>(newStats());
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
    breadcrumb('voice: stopPlayback');
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
    breadcrumb('voice: listening');
    detectorRef.current.setMode('listening');
    setPhase('listening');
  }, [setPhase]);

  const play = useCallback((audioB64: string) => {
    const file = new File(Paths.cache, `iris-reply-${Date.now()}.mp3`);
    file.write(audioB64, { encoding: 'base64' });

    // Watch the mic for an interrupt from the moment playback starts.
    detectorRef.current.setMode('speaking');
    breadcrumb('voice: createAudioPlayer');
    const player = createAudioPlayer({ uri: file.uri }, { updateInterval: 100, keepAudioSessionActive: true });
    const subs: { remove: () => void }[] = [];
    let pulse: Animated.CompositeAnimation | null = null;

    if (player.isAudioSamplingSupported) {
      breadcrumb('voice: setAudioSamplingEnabled');
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
        breadcrumb('voice: playback finished');
        stopPlayback();
        listen();
      }
    }));

    playbackRef.current = { player, file, subs, pulse };
    breadcrumb('voice: play');
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
      statsRef.current.turnsSent++;
      breadcrumb('voice: sending turn');
      const res = await withTimeout(apiPost<VoiceResponse>('/iris/voice', {
        audio,
        sessionId,
        // Same rule as text chat: the greeting goes only with the first turn.
        openingMessage: sessionId ? null : openingMessage,
        from: from || null,
      }), REQUEST_TIMEOUT_MS);

      statsRef.current.repliesReceived++;
      breadcrumb(`voice: reply received (audio: ${res.audio ? 'yes' : 'no'}, noSpeech: ${!!res.noSpeech})`);
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
      statsRef.current.sendFailures++;
      statsRef.current.lastSendError = errorText(err);
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
    const stats = statsRef.current;
    if (typeof event.data !== 'string') {
      // Only base64 PCM is handled; count anything else so a format change
      // shows up in the diagnostics instead of as silence.
      stats.nonStringChunks++;
      stats.nonStringType = event.data?.constructor?.name ?? typeof event.data;
      return;
    }
    if (!activeRef.current) return;
    const bytes = base64ToBytes(event.data);
    const rms = recordChunk(stats, bytes);
    if (stats.chunks === 1) {
      breadcrumb(`voice: first chunk (${bytes.length} bytes, rms ${rms.toFixed(4)})`);
    } else if (stats.chunks % 100 === 0) {
      const d = detectorRef.current.getDiagnostics();
      breadcrumb(
        `voice: ${stats.chunks} chunks, peak ${stats.peakRms.toFixed(4)}, ` +
        `threshold ${d.speechThreshold.toFixed(4)}, floor ${d.noiseFloor.toFixed(4)}, mode ${d.mode}`
      );
    }
    const ev = detectorRef.current.push(bytes);
    if (!ev) return;
    breadcrumb(`voice: ${ev.type}`);
    if (ev.type === 'speechStart') stats.speechStarts++;
    else if (ev.type === 'bargeIn') stats.bargeIns++;
    else if (ev.type === 'turnEnd') stats.turnEnds++;
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
    statsRef.current = newStats();
    const stats = statsRef.current;
    setError(null);
    setReplyText(null);

    // Leaving the app leaves voice mode, except for the mic permission dialog:
    // on Android it pauses the app, which React Native reports as
    // 'background' (Android has no 'inactive'). iOS reports its permission
    // alert as 'inactive', which is ignored here anyway.
    let permissionPending = false;
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      if (permissionPending) {
        breadcrumb('voice: background ignored (permission dialog)');
        return;
      }
      breadcrumb('voice: app went to background');
      optsRef.current.onBackground();
    });

    (async () => {
      try {
        breadcrumb('voice: requestPermissionsAsync');
        permissionPending = true;
        let perm: Awaited<ReturnType<typeof AudioStudioModule.requestPermissionsAsync>>;
        try {
          perm = await AudioStudioModule.requestPermissionsAsync();
        } finally {
          permissionPending = false;
        }
        stats.permission = perm.granted ? 'granted' : 'denied';
        breadcrumb(`voice: permission granted=${perm.granted}`);
        if (cancelled) return;
        if (!perm.granted) {
          setError('mic');
          setPhase('idle');
          return;
        }
        breadcrumb('voice: startRecording');
        stats.startRecording = 'pending';
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
        stats.startRecording = 'resolved';
        breadcrumb('voice: startRecording resolved');
        if (cancelled) {
          stopRecording().catch(() => {});
          return;
        }
        listen();
      } catch (e) {
        if (stats.startRecording === 'pending') {
          stats.startRecording = 'failed';
          stats.startError = errorText(e);
        }
        breadcrumb(`voice: start failed: ${e instanceof Error ? e.message : String(e)}`);
        if (!cancelled) {
          setError('failed');
          setPhase('idle');
        }
      }
    })();

    return () => {
      appStateSub.remove();
      // A session that heard no complete turn: report where it stalled.
      // Read the detector before it's paused below.
      const summary = summarizeStats(stats);
      if (stats.turnEnds === 0 && summary.sessionMs >= MIN_REPORT_SESSION_MS) {
        reportClientError(
          'voice_no_turns',
          new Error(
            `Voice session ended with no turns (start: ${stats.startRecording}, chunks: ${stats.chunks}, ` +
            `peak: ${stats.peakRms.toFixed(4)}, speechStarts: ${stats.speechStarts})`
          ),
          null,
          {
            ...summary,
            detector: detectorRef.current.getDiagnostics(),
            phaseAtEnd: phaseRef.current,
            device: { manufacturer: Device.manufacturer, model: Device.modelName },
          }
        );
      }
      cancelled = true;
      activeRef.current = false;
      turnGenRef.current++; // drop playback for any request still in flight
      detectorRef.current.setMode('paused');
      stopPlayback();
      // The trail is dropped only once the mic has stopped, so a crash while
      // stopping is still reported.
      const trail = currentTrail();
      breadcrumb('voice: stopRecording');
      stopRecording().catch(() => {}).finally(() => endBreadcrumbs(trail));
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
