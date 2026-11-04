// Audio helpers for Iris voice mode: decode the recorder's PCM chunks, measure
// loudness, decide where a spoken turn starts and ends, and wrap the turn in a
// WAV header for POST /iris/voice. No React or native imports, so the turn
// logic can be tested on its own.

export const SAMPLE_RATE = 16000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000; // 16-bit mono

// Tuning. RMS values are on a 0–1 scale (1 = full-scale 16-bit).
const MIN_SPEECH_RMS = 0.02;       // quietest level that counts as talking
const NOISE_FLOOR_MULTIPLIER = 3;  // talking must be this much louder than the room
const BARGE_IN_MULTIPLIER = 3;     // interrupting Iris needs this much more than talking
const MIN_BARGE_IN_RMS = 0.08;
const SPEECH_START_MS = 150;       // loud this long before a turn starts
const BARGE_IN_MS = 200;           // loud this long before Iris is interrupted
const END_SILENCE_MS = 1000;       // quiet this long ends the turn
export const MAX_TURN_MS = 60_000;
const PREROLL_MS = 500;            // audio kept from just before speech / interrupt

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// RMS of little-endian 16-bit PCM, 0–1.
export function pcm16Rms(bytes: Uint8Array): number {
  const n = bytes.length >> 1;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let s = bytes[2 * i] | (bytes[2 * i + 1] << 8);
    if (s & 0x8000) s -= 0x10000;
    const f = s / 32768;
    sum += f * f;
  }
  return Math.sqrt(sum / n);
}

// RMS of float frames in -1..1 (expo-audio playback samples).
export function floatRms(frames: ArrayLike<number>): number {
  const n = frames.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += frames[i] * frames[i];
  return Math.sqrt(sum / n);
}

export function buildWav(chunks: Uint8Array[]): Uint8Array {
  const dataLen = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(44 + dataLen);
  const view = new DataView(out.buffer);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);              // fmt chunk size
  view.setUint16(20, 1, true);               // PCM
  view.setUint16(22, 1, true);               // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true);               // block align
  view.setUint16(34, 16, true);              // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataLen, true);
  let off = 44;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// listening: waiting for / recording the user's turn.
// paused:    a turn is being sent; mic audio is dropped.
// speaking:  Iris is playing; mic audio is only watched for an interrupt.
export type DetectorMode = 'listening' | 'paused' | 'speaking';

export type DetectorEvent =
  | { type: 'speechStart' }
  | { type: 'bargeIn' }
  | { type: 'turnEnd'; chunks: Uint8Array[] }
  | null;

export class TurnDetector {
  private mode: DetectorMode = 'paused';
  private preroll: Uint8Array[] = [];
  private prerollMs = 0;
  private turn: Uint8Array[] = [];
  private turnMs = 0;
  private speaking = false; // user has started talking in this turn
  private loudMs = 0;
  private silenceMs = 0;
  private noiseFloor = 0.004;
  private bargeInEnabled: boolean;

  constructor(bargeInEnabled: boolean) {
    this.bargeInEnabled = bargeInEnabled;
  }

  getMode(): DetectorMode { return this.mode; }

  // Every mode change drops buffered audio, so nothing recorded while Iris
  // was playing ends up in the next turn (except an interrupt's pre-roll).
  setMode(mode: DetectorMode): void {
    this.mode = mode;
    this.preroll = [];
    this.prerollMs = 0;
    this.turn = [];
    this.turnMs = 0;
    this.speaking = false;
    this.loudMs = 0;
    this.silenceMs = 0;
  }

  push(bytes: Uint8Array): DetectorEvent {
    if (this.mode === 'paused') return null;
    const ms = bytes.length / BYTES_PER_MS;
    const rms = pcm16Rms(bytes);
    const speechRms = Math.max(MIN_SPEECH_RMS, this.noiseFloor * NOISE_FLOOR_MULTIPLIER);

    if (this.mode === 'speaking') {
      this.addPreroll(bytes, ms);
      if (!this.bargeInEnabled) return null;
      const bargeRms = Math.max(MIN_BARGE_IN_RMS, speechRms * BARGE_IN_MULTIPLIER);
      this.loudMs = rms >= bargeRms ? this.loudMs + ms : 0;
      if (this.loudMs < BARGE_IN_MS) return null;
      // Keep the ~0.5s that triggered the interrupt as the start of the turn.
      const kept = this.preroll;
      const keptMs = this.prerollMs;
      this.setMode('listening');
      this.startTurn(kept, keptMs);
      return { type: 'bargeIn' };
    }

    // listening
    if (!this.speaking) {
      this.addPreroll(bytes, ms);
      if (rms >= speechRms) {
        this.loudMs += ms;
        if (this.loudMs >= SPEECH_START_MS) {
          this.startTurn(this.preroll, this.prerollMs);
          return { type: 'speechStart' };
        }
      } else {
        this.loudMs = 0;
        this.noiseFloor = Math.max(0.001, this.noiseFloor * 0.9 + rms * 0.1);
      }
      return null;
    }

    this.turn.push(bytes);
    this.turnMs += ms;
    this.silenceMs = rms < speechRms ? this.silenceMs + ms : 0;
    if (this.silenceMs >= END_SILENCE_MS || this.turnMs >= MAX_TURN_MS) {
      const chunks = this.turn;
      this.setMode('paused');
      return { type: 'turnEnd', chunks };
    }
    return null;
  }

  private startTurn(chunks: Uint8Array[], ms: number): void {
    this.turn = [...chunks];
    this.turnMs = ms;
    this.preroll = [];
    this.prerollMs = 0;
    this.speaking = true;
    this.silenceMs = 0;
    this.loudMs = 0;
  }

  private addPreroll(bytes: Uint8Array, ms: number): void {
    this.preroll.push(bytes);
    this.prerollMs += ms;
    while (this.preroll.length > 1 && this.prerollMs - this.preroll[0].length / BYTES_PER_MS >= PREROLL_MS) {
      this.prerollMs -= this.preroll.shift()!.length / BYTES_PER_MS;
    }
  }
}
