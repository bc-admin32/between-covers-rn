// Streamed Iris voice replies (Phase A). The voice Lambda's Function URL takes
// the same body as POST /iris/voice and answers with newline-delimited JSON:
//
//   {"type":"transcript","text":"...","sessionId":"..."}   sessionId optional
//   {"type":"sentence","seq":0,"text":"...","audio":"<base64 mp3>"}  repeats
//   {"type":"done","reply":"...","sessionId":"...","softLimit":false}
//   {"type":"no_speech"}
//   {"type":"error","status":403,"error":"VOICE_TERMS_REQUIRED"}
//
// No React Native imports, so the reader can be tested on its own.

// Empty = streaming off: every turn uses POST /iris/voice as before.
export const IRIS_VOICE_STREAM_URL = '';

// No new line for this long = the stream failed.
export const STREAM_STALL_MS = 15_000;

export type VoiceStreamLine =
  | { type: 'transcript'; text: string; sessionId?: string | null }
  | { type: 'sentence'; seq: number; text: string; audio: string }
  | { type: 'done'; reply: string | null; sessionId: string | null; softLimit?: boolean }
  | { type: 'no_speech' }
  | { type: 'error'; status: number; error: string };

export class StreamStallError extends Error {
  constructor() {
    super(`No data for ${STREAM_STALL_MS / 1000}s`);
    this.name = 'StreamStallError';
  }
}

// Calls onLine for each JSON line as it arrives. Resolves when the body ends;
// rejects with StreamStallError after `stallMs` without a complete new line
// (and cancels the body). Lines that aren't valid JSON are skipped.
export async function readVoiceStream(
  body: ReadableStream<Uint8Array>,
  onLine: (line: VoiceStreamLine) => void,
  stallMs: number = STREAM_STALL_MS,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const emitLines = () => {
    let nl = buffered.indexOf('\n');
    let any = false;
    while (nl !== -1) {
      const raw = buffered.slice(0, nl).trim();
      buffered = buffered.slice(nl + 1);
      if (raw) {
        any = true;
        let parsed: VoiceStreamLine | null = null;
        try { parsed = JSON.parse(raw); } catch { /* skip a malformed line */ }
        if (parsed && typeof parsed === 'object' && typeof (parsed as any).type === 'string') onLine(parsed);
      }
      nl = buffered.indexOf('\n');
    }
    return any;
  };

  let stallDeadline = Date.now() + stallMs;
  try {
    for (;;) {
      const remaining = stallDeadline - Date.now();
      if (remaining <= 0) throw new StreamStallError();
      const result = await Promise.race([
        reader.read(),
        new Promise<'stall'>((resolve) => { timer = setTimeout(() => resolve('stall'), remaining); }),
      ]);
      clearTimeout(timer);
      if (result === 'stall') throw new StreamStallError();
      if (result.done) break;
      buffered += decoder.decode(result.value, { stream: true });
      if (emitLines()) stallDeadline = Date.now() + stallMs;
    }
    buffered += decoder.decode();
    if (buffered.trim()) {
      buffered += '\n';
      emitLines();
    }
  } catch (err) {
    reader.cancel(String(err)).catch(() => {});
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
