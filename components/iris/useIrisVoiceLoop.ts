import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform } from 'react-native';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useAudioRecorder, AudioStudioModule, type AudioDataEvent } from '@siteed/audio-studio';
import { apiPost, apiPostStream, ApiError } from '../../lib/api';
import {
  IRIS_VOICE_STREAM_URL, STREAM_STALL_MS, readVoiceStream, type VoiceStreamLine,
} from '../../lib/irisVoiceStream';
import { markIrisVoiceTermsRequired } from '../../lib/irisVoiceTerms';
import {
  TurnDetector, SAMPLE_RATE, base64ToBytes, buildWav, floatRms, pcm16Rms,
  DEFAULT_SPEECH_TUNING, IOS_SPEECH_TUNING, PAUSE_BUCKET_LIMITS_MS, type TurnInfo,
} from '../../lib/irisVoiceAudio';
import { breadcrumb, currentTrail, endBreadcrumbs } from '../../lib/crashCapture';
import { reportClientError, track } from '../../lib/analytics';

// Talking over Iris stops her. Off on Fire: its echo cancellation lets her
// own voice through the mic, which interrupted her mid-sentence. Fire users
// tap the circle to interrupt instead.
const VOICE_INTERRUPT_ON_FIRE = false;
const IS_FIRE = Platform.OS === 'android' && Device.manufacturer === 'Amazon';
const VOICE_INTERRUPT_ENABLED = !IS_FIRE || VOICE_INTERRUPT_ON_FIRE;
// The glow follows Iris's voice via audio sampling, which on Android attaches
// a Visualizer to every clip. Fire gets the steady pulse instead.
const STEADY_PULSE = IS_FIRE;

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

// ── Per-turn timing ──
// One voice_turn_timing event per turn: how long each client step took from
// the moment the user stopped talking to Iris's audio starting, plus the
// turn's mid-turn pauses (to judge a shorter END_SILENCE_MS).

type TurnOutcome = 'played' | 'text' | 'no_speech' | 'error' | 'interrupted' | 'abandoned';

type TurnTiming = {
  info: TurnInfo;
  turnEndAt: number;         // detector ended the turn (after the silence wait)
  sentAt: number | null;     // WAV built and base64-encoded; request starting
  replyAt: number | null;    // response received
  uploadBytes: number;       // base64 audio in the request
  replyAudioBytes: number;   // base64 audio in the response
  streamed: boolean;         // reply came over the sentence stream
  fellBack: boolean;         // the stream failed to open; /iris/voice was used
  sent: boolean;
};

function newTurnTiming(info: TurnInfo): TurnTiming {
  return {
    info, turnEndAt: Date.now(), sentAt: null, replyAt: null,
    uploadBytes: 0, replyAudioBytes: 0, streamed: false, fellBack: false, sent: false,
  };
}

const ms = (from: number | null, to: number | null) => (from !== null && to !== null ? to - from : null);

function sendTurnTiming(t: TurnTiming, outcome: TurnOutcome): void {
  if (t.sent) return;
  t.sent = true;
  const now = Date.now();
  const { info } = t;
  track('voice_turn_timing', {
    outcome,
    platform: Platform.OS,
    fire: IS_FIRE,
    streamed: t.streamed,
    fellBack: t.fellBack,
    // Client steps, in ms
    silenceWaitMs: info.silenceWaitMs,                  // user stopped talking → turn ended
    encodeMs: ms(t.turnEndAt, t.sentAt),                // WAV + base64
    requestMs: ms(t.sentAt, t.replyAt),                 // upload + server + download (stream: to first sentence)
    replyToPlayingMs: outcome === 'played' ? ms(t.replyAt, now) : null, // file write + player start
    totalMs: info.silenceWaitMs + (now - t.turnEndAt),  // user stopped talking → this outcome
    // Sizes
    turnMs: info.turnMs,
    trimmedMs: info.trimmedMs,
    endedBy: info.endedBy,
    uploadBytes: t.uploadBytes,
    replyAudioBytes: t.replyAudioBytes,
    // Mid-turn pauses the user carried on after, by length (ms)
    pauses: Object.fromEntries(info.pauses.map((n, i) => [
      i === 0 ? `<${PAUSE_BUCKET_LIMITS_MS[0]}` : `${PAUSE_BUCKET_LIMITS_MS[i - 1]}-${PAUSE_BUCKET_LIMITS_MS[i]}`, n,
    ])),
    longestPauseMs: info.longestPauseMs,
  });
}

// ── Reply playback ──
// Iris's reply plays as a queue of MP3 clips: one clip from /iris/voice, one
// per sentence from the stream. The next clip is loaded while the current
// one plays, so sentences follow with only a short gap.

type Clip = { player: AudioPlayer; file: File; subs: { remove: () => void }[] };

type Reply = {
  pending: string[];          // base64 MP3 clips not loaded yet
  current: Clip | null;       // playing
  next: Clip | null;          // loaded, starts when `current` finishes
  done: boolean;              // no more clips coming
  started: boolean;           // the first clip has started
  stopped: boolean;           // interrupted or replaced; ignore late clips
  pulse: Animated.CompositeAnimation | null;
  timing: TurnTiming | null;  // sent once the first clip is heard
};

let clipCounter = 0;

function releaseClip(clip: Clip): void {
  clip.subs.forEach((s) => s.remove());
  try { clip.player.pause(); } catch {}
  try { clip.player.remove(); } catch {}
  try { clip.file.delete(); } catch {}
}

function isTermsError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.body?.error === 'VOICE_TERMS_REQUIRED';
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
  const replyRef = useRef<Reply | null>(null);
  const smoothLevelRef = useRef(0);

  const { startRecording, stopRecording } = useAudioRecorder();

  const setPhase = useCallback((p: VoicePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // Stops Iris's reply and drops anything still queued (tap, barge-in,
  // leaving voice mode, or a new reply replacing it).
  const stopPlayback = useCallback(() => {
    const rp = replyRef.current;
    replyRef.current = null;
    if (!rp) return;
    rp.stopped = true;
    breadcrumb('voice: stopPlayback');
    // Stopped before any audio was heard.
    if (rp.timing) sendTurnTiming(rp.timing, 'interrupted');
    rp.timing = null;
    if (rp.current) releaseClip(rp.current);
    if (rp.next) releaseClip(rp.next);
    rp.current = null;
    rp.next = null;
    rp.pending = [];
    rp.pulse?.stop();
    smoothLevelRef.current = 0;
    level.setValue(0);
  }, [level]);

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    breadcrumb('voice: listening');
    detectorRef.current.setMode('listening');
    setPhase('listening');
  }, [setPhase]);

  // Moves the queue along: starts the next clip when nothing is playing,
  // loads the one after it, and goes back to listening once the last clip
  // has played. Assigned every render so it sees the current callbacks.
  const pumpRef = useRef<(rp: Reply) => void>(() => {});

  const loadClip = (rp: Reply, audioB64: string): Clip => {
    const file = new File(Paths.cache, `iris-reply-${Date.now()}-${clipCounter++}.mp3`);
    file.write(audioB64, { encoding: 'base64' });
    breadcrumb('voice: createAudioPlayer');
    const player = createAudioPlayer({ uri: file.uri }, { updateInterval: 100, keepAudioSessionActive: true });
    const clip: Clip = { player, file, subs: [] };

    if (!STEADY_PULSE && player.isAudioSamplingSupported) {
      player.setAudioSamplingEnabled(true);
      clip.subs.push(player.addListener('audioSampleUpdate', (sample) => {
        if (rp.current !== clip) return;
        const frames = sample.channels[0]?.frames ?? [];
        const target = Math.min(1, floatRms(frames) * 4);
        smoothLevelRef.current = smoothLevelRef.current * 0.6 + target * 0.4;
        level.setValue(smoothLevelRef.current);
      }));
    }

    clip.subs.push(player.addListener('playbackStatusUpdate', (status) => {
      if (rp.stopped || rp.current !== clip) return;
      if (status.playing && rp.timing) {
        sendTurnTiming(rp.timing, 'played');
        rp.timing = null;
      }
      if (status.didJustFinish) {
        releaseClip(clip);
        rp.current = null;
        pumpRef.current(rp);
      }
    }));
    return clip;
  };

  pumpRef.current = (rp: Reply) => {
    if (rp.stopped || replyRef.current !== rp) return;
    if (!rp.current) {
      let clip = rp.next;
      rp.next = null;
      if (!clip && rp.pending.length) clip = loadClip(rp, rp.pending.shift()!);
      if (!clip) {
        if (!rp.done) return; // waiting for the next sentence
        breadcrumb('voice: playback finished');
        // A reply whose audio never reported playing.
        if (rp.timing) sendTurnTiming(rp.timing, 'error');
        rp.timing = null;
        replyRef.current = null;
        rp.pulse?.stop();
        smoothLevelRef.current = 0;
        level.setValue(0);
        listen();
        return;
      }
      rp.current = clip;
      if (!rp.started) {
        rp.started = true;
        // Watch the mic for an interrupt from the moment Iris starts talking,
        // and keep watching between sentences.
        detectorRef.current.setMode('speaking');
        setPhase('speaking');
        if (STEADY_PULSE || !clip.player.isAudioSamplingSupported) {
          rp.pulse = Animated.loop(Animated.sequence([
            Animated.timing(level, { toValue: 0.6, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(level, { toValue: 0.25, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]));
          rp.pulse.start();
        }
      }
      breadcrumb('voice: play');
      clip.player.play();
    }
    if (!rp.next && rp.pending.length) rp.next = loadClip(rp, rp.pending.shift()!);
  };

  const startReply = useCallback((timing: TurnTiming): Reply => {
    stopPlayback();
    const rp: Reply = {
      pending: [], current: null, next: null, done: false, started: false, stopped: false, pulse: null, timing,
    };
    replyRef.current = rp;
    return rp;
  }, [stopPlayback]);

  const addClip = (rp: Reply, audioB64: string) => {
    if (rp.stopped) return;
    rp.pending.push(audioB64);
    pumpRef.current(rp);
  };

  const endReply = (rp: Reply) => {
    if (rp.stopped) return;
    rp.done = true;
    pumpRef.current(rp);
  };

  // Reads one streamed reply: plays sentences as they arrive and hands the
  // finished turn to the chat screen. Throws (to sendTurn's error handling)
  // if the stream fails before any audio played.
  const readStream = async (
    body: ReadableStream<Uint8Array>,
    timing: TurnTiming,
    isCurrent: () => boolean,
  ) => {
    let transcript: string | null = null;
    let rp: Reply | null = null;
    let finished = false;

    const firstReply = () => {
      if (timing.replyAt !== null) return;
      timing.replyAt = Date.now();
      statsRef.current.repliesReceived++;
    };

    const onLine = (line: VoiceStreamLine) => {
      switch (line.type) {
        case 'transcript':
          transcript = line.text;
          if (line.sessionId) optsRef.current.onSessionId(line.sessionId);
          return;
        case 'sentence': {
          if (!line.audio) return;
          firstReply();
          timing.replyAudioBytes += line.audio.length;
          if (!isCurrent()) return;
          if (!rp) {
            setError(null);
            rp = startReply(timing);
          }
          addClip(rp, line.audio);
          return;
        }
        case 'done': {
          finished = true;
          firstReply();
          breadcrumb(`voice: stream done (audio: ${rp ? 'yes' : 'no'})`);
          // The turn is part of the conversation even if the user has since
          // left voice mode, so hand it to the chat screen either way.
          if (line.sessionId) optsRef.current.onSessionId(line.sessionId);
          if (transcript && line.reply) optsRef.current.onTurn({ transcript, reply: line.reply });
          if (rp) {
            endReply(rp);
          } else if (!isCurrent()) {
            sendTurnTiming(timing, 'abandoned');
          } else {
            sendTurnTiming(timing, 'text');
            setError(null);
            setReplyText(line.reply ?? null);
            listen();
          }
          return;
        }
        case 'no_speech':
          finished = true;
          firstReply();
          sendTurnTiming(timing, 'no_speech');
          if (isCurrent()) listen();
          return;
        case 'error':
          finished = true;
          throw new ApiError(line.status, { error: line.error }, `Stream error ${line.status}: ${line.error}`);
      }
    };

    try {
      await readVoiceStream(body, onLine);
      if (!finished) throw new Error('Stream ended without a done line');
    } catch (err) {
      const playing: Reply | null = rp;
      if (playing && (playing as Reply).started) {
        // Audio is already playing: finish what arrived, then listen.
        statsRef.current.sendFailures++;
        statsRef.current.lastSendError = errorText(err);
        breadcrumb(`voice: stream failed mid-reply: ${errorText(err)}`);
        endReply(playing);
        return;
      }
      if (playing) stopPlayback();
      throw err;
    }
  };

  const sendTurn = useCallback(async (chunks: Uint8Array[], info: TurnInfo) => {
    const gen = ++turnGenRef.current;
    const timing = newTurnTiming(info);
    const isCurrent = () => mountedRef.current && gen === turnGenRef.current && activeRef.current;
    setPhase('thinking');
    setReplyText(null);
    const { sessionId, from, openingMessage } = optsRef.current;

    try {
      const audio = await bytesToBase64(buildWav(chunks));
      timing.sentAt = Date.now();
      timing.uploadBytes = audio.length;
      statsRef.current.turnsSent++;
      const body = {
        audio,
        sessionId,
        // Same rule as text chat: the greeting goes only with the first turn.
        openingMessage: sessionId ? null : openingMessage,
        from: from || null,
      };

      // Streamed reply. If the stream can't be opened, fall back to the
      // one-shot request below (except for the voice-terms error, which
      // means the same thing on both paths).
      if (IRIS_VOICE_STREAM_URL) {
        let stream: ReadableStream<Uint8Array> | null = null;
        try {
          breadcrumb('voice: opening stream');
          const res = await withTimeout(
            apiPostStream(IRIS_VOICE_STREAM_URL, { ...body, sampleRate: SAMPLE_RATE }),
            STREAM_STALL_MS,
          );
          if (!res.body) throw new Error('Stream response has no body');
          stream = res.body as ReadableStream<Uint8Array>;
        } catch (err) {
          if (isTermsError(err)) throw err;
          breadcrumb(`voice: stream failed to open (${errorText(err)}); using /iris/voice`);
          timing.fellBack = true;
        }
        if (stream) {
          timing.streamed = true;
          await readStream(stream, timing, isCurrent);
          return;
        }
      }

      breadcrumb('voice: sending turn');
      const res = await withTimeout(apiPost<VoiceResponse>('/iris/voice', body), REQUEST_TIMEOUT_MS);

      timing.replyAt = Date.now();
      timing.replyAudioBytes = res.audio?.length ?? 0;
      statsRef.current.repliesReceived++;
      breadcrumb(`voice: reply received (audio: ${res.audio ? 'yes' : 'no'}, noSpeech: ${!!res.noSpeech})`);
      // The turn is part of the conversation even if the user has since left
      // voice mode (which unmounts this hook), so hand the session id and the
      // bubbles to the chat screen either way.
      if (res.sessionId) optsRef.current.onSessionId(res.sessionId);
      if (!res.noSpeech && res.transcript && res.reply) {
        optsRef.current.onTurn({ transcript: res.transcript, reply: res.reply });
      }
      if (!isCurrent()) {
        sendTurnTiming(timing, 'abandoned');
        return;
      }
      if (res.noSpeech) {
        sendTurnTiming(timing, 'no_speech');
        listen();
        return;
      }

      setError(null);
      if (res.audio) {
        const rp = startReply(timing);
        addClip(rp, res.audio);
        endReply(rp);
      } else {
        sendTurnTiming(timing, 'text');
        setReplyText(res.reply ?? null);
        listen();
      }
    } catch (err) {
      statsRef.current.sendFailures++;
      statsRef.current.lastSendError = errorText(err);
      sendTurnTiming(timing, 'error');
      if (!mountedRef.current || gen !== turnGenRef.current) return;
      if (isTermsError(err)) {
        markIrisVoiceTermsRequired();
        optsRef.current.onTermsRequired();
        return;
      }
      setError(err instanceof ApiError || err instanceof TimeoutError ? 'failed' : 'offline');
      listen();
    }
  // readStream, addClip and endReply only use refs and stable callbacks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen, setPhase, startReply, stopPlayback]);

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
      sendTurn(ev.chunks, ev.info);
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
