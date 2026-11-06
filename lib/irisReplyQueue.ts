// Plays Iris's reply as a queue of short MP3 clips (one per streamed sentence,
// or a single clip from /iris/voice). No React Native imports: the player,
// timers and logging are passed in, so the queue can be tested on its own
// (lib/__tests__/irisReplyQueue.test.mjs).
//
// Android: one player at a time. The next clip's player is created only when
// the current one has finished, started on the next tick (not inside the
// finished player's status callback), and the old player is released. With a
// second, preloaded player, Android devices played the first sentence and
// then never started the next one.
// iOS: the next clip is preloaded while the current one plays.
//
// Every clip has safety timers, so a reply always ends:
//   - not playing CLIP_START_TIMEOUT_MS after play() → skipped ('no_start')
//   - still going CLIP_OVERRUN_MS past its duration → treated as finished
//     ('overrun'); CLIP_MAX_MS if the duration is never reported
//   - reports 'idle' (Android) / 'failed' (iOS) after it had started playing
//     → skipped ('failed')

export const CLIP_START_TIMEOUT_MS = 2_000;
export const CLIP_OVERRUN_MS = 1_500;
export const CLIP_MAX_MS = 30_000;

export type QueuePlayerStatus = {
  playing: boolean;
  didJustFinish: boolean;
  duration?: number;       // seconds; 0 or missing until known
  playbackState?: string;  // expo-audio: 'idle' | 'buffering' | 'ready' | 'ended' | …
};

export interface QueuePlayer {
  play(): void;
  pause(): void;
  // Frees the native player. Called once, after the clip is done or skipped.
  release(): void;
  // Subscribes to status updates; returns an unsubscribe function.
  onStatus(listener: (status: QueuePlayerStatus) => void): () => void;
  // True while this clip is the one playing (e.g. to drive the glow).
  setActive?(active: boolean): void;
}

export type ClipOutcome = 'finished' | 'overrun' | 'no_start' | 'failed' | 'load_failed';

export type ReplyQueueSummary = {
  clips: number;                              // clips added
  played: number;                             // finished or overrun
  skipped: number;                            // no_start, failed or load_failed
  outcomes: Partial<Record<ClipOutcome, number>>;
};

export type ReplyQueueDeps = {
  createPlayer: (audioB64: string, index: number) => QueuePlayer;
  preloadNext: boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  defer: (fn: () => void) => void;            // run on the next tick
  now: () => number;
  log: (step: string) => void;
};

export type ReplyQueueEvents = {
  onFirstStart: () => void;                   // the first clip is about to play
  onClipPlaying: (index: number) => void;     // a clip reported playing
  onFinished: (summary: ReplyQueueSummary) => void; // all clips done; not called after stop()
};

type Entry = {
  index: number;
  player: QueuePlayer;
  unsubscribe: (() => void) | null;
  playRequestedAt: number | null;
  startedAt: number | null;
  timer: unknown;
  timerUntil: number | null;
  done: boolean;
};

export class ReplyQueue {
  private pending: { audio: string; index: number }[] = [];
  private current: Entry | null = null;
  private next: Entry | null = null;
  private ended = false;
  private stopped = false;
  private finished = false;
  private advanceScheduled = false;
  private added = 0;
  private outcomes: Partial<Record<ClipOutcome, number>> = {};
  private anyStarted = false;
  // Last time a clip did something (status update, start, finish). Lets a
  // watchdog tell a long reply from a stuck one.
  lastActivityAt: number;

  constructor(private deps: ReplyQueueDeps, private events: ReplyQueueEvents) {
    this.lastActivityAt = deps.now();
  }

  // A clip has been handed to a player (Iris has started talking).
  get started(): boolean {
    return this.anyStarted;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  get summary(): ReplyQueueSummary {
    const o = this.outcomes;
    const played = (o.finished ?? 0) + (o.overrun ?? 0);
    const skipped = (o.no_start ?? 0) + (o.failed ?? 0) + (o.load_failed ?? 0);
    return { clips: this.added, played, skipped, outcomes: { ...o } };
  }

  // For diagnostics.
  debugState(): Record<string, unknown> {
    return {
      pending: this.pending.length,
      current: this.current ? {
        index: this.current.index,
        playRequestedAgoMs: this.current.playRequestedAt === null ? null : this.deps.now() - this.current.playRequestedAt,
        started: this.current.startedAt !== null,
      } : null,
      next: this.next?.index ?? null,
      ended: this.ended,
      stopped: this.stopped,
      finished: this.finished,
      ...this.summary,
    };
  }

  add(audioB64: string): void {
    if (this.stopped || this.finished || this.ended) return;
    const index = this.added++;
    this.pending.push({ audio: audioB64, index });
    this.touch();
    if (!this.current && !this.advanceScheduled) {
      this.advance();
    } else {
      this.maybePreload();
    }
  }

  // No more clips are coming.
  end(): void {
    if (this.stopped || this.finished || this.ended) return;
    this.ended = true;
    if (!this.current && !this.advanceScheduled) this.advance();
  }

  // Interrupted: stop and release everything. onFinished is not called.
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.pending = [];
    if (this.current) this.dispose(this.current, true);
    if (this.next) this.dispose(this.next, false);
    this.current = null;
    this.next = null;
    this.deps.log('clips stopped');
  }

  // ── internals ──

  private touch(): void {
    this.lastActivityAt = this.deps.now();
  }

  private load(item: { audio: string; index: number }): Entry | null {
    this.deps.log(`clip ${item.index} load`);
    try {
      const player = this.deps.createPlayer(item.audio, item.index);
      return {
        index: item.index, player, unsubscribe: null,
        playRequestedAt: null, startedAt: null, timer: null, timerUntil: null, done: false,
      };
    } catch (err) {
      this.deps.log(`clip ${item.index} skipped: load_failed (${err instanceof Error ? err.message : String(err)})`);
      this.count('load_failed');
      return null;
    }
  }

  // Starts the next clip if nothing is playing, or ends the reply.
  private advance(): void {
    this.advanceScheduled = false;
    if (this.stopped || this.finished || this.current) return;

    let entry = this.next;
    this.next = null;
    while (!entry && this.pending.length) entry = this.load(this.pending.shift()!);

    if (!entry) {
      if (this.ended) {
        this.finished = true;
        this.deps.log(`clips done (${this.summary.played} played, ${this.summary.skipped} skipped)`);
        this.events.onFinished(this.summary);
      }
      return; // otherwise waiting for the next clip to arrive
    }

    this.start(entry);
    this.maybePreload();
  }

  private scheduleAdvance(): void {
    if (this.advanceScheduled || this.stopped || this.finished) return;
    this.advanceScheduled = true;
    this.deps.defer(() => this.advance());
  }

  private maybePreload(): void {
    if (!this.deps.preloadNext || !this.current || this.next || !this.pending.length) return;
    let entry: Entry | null = null;
    while (!entry && this.pending.length) entry = this.load(this.pending.shift()!);
    this.next = entry;
  }

  private start(entry: Entry): void {
    this.current = entry;
    entry.unsubscribe = entry.player.onStatus((status) => this.onStatus(entry, status));
    if (!this.anyStarted) {
      this.anyStarted = true;
      this.events.onFirstStart();
    }
    entry.player.setActive?.(true);
    entry.playRequestedAt = this.deps.now();
    this.armTimer(entry, CLIP_START_TIMEOUT_MS, 'no_start');
    this.deps.log(`clip ${entry.index} play`);
    this.touch();
    try {
      entry.player.play();
    } catch (err) {
      this.deps.log(`clip ${entry.index} play threw: ${err instanceof Error ? err.message : String(err)}`);
      this.finishClip(entry, 'failed');
    }
  }

  private onStatus(entry: Entry, status: QueuePlayerStatus): void {
    if (entry.done || this.stopped || this.current !== entry) return;
    this.touch();

    if (status.didJustFinish) {
      this.finishClip(entry, 'finished');
      return;
    }

    if (status.playing && entry.startedAt === null) {
      entry.startedAt = this.deps.now();
      const durationMs = (status.duration ?? 0) * 1000;
      this.deps.log(
        `clip ${entry.index} playing after ${entry.startedAt - (entry.playRequestedAt ?? entry.startedAt)}ms` +
        (durationMs > 0 ? ` (duration ${(durationMs / 1000).toFixed(1)}s)` : ''),
      );
      this.armEndTimer(entry, durationMs);
      this.events.onClipPlaying(entry.index);
      return;
    }

    if (entry.startedAt !== null) {
      // Duration often arrives after playback starts: tighten the end timer.
      const durationMs = (status.duration ?? 0) * 1000;
      if (durationMs > 0) {
        const until = entry.startedAt + durationMs + CLIP_OVERRUN_MS;
        if (entry.timerUntil === null || until < entry.timerUntil) this.armEndTimer(entry, durationMs);
      }
      // Fell back to idle (Android) or failed (iOS) after it had started.
      if ((status.playbackState === 'idle' || status.playbackState === 'failed') && !status.playing) {
        this.finishClip(entry, 'failed');
      }
    }
  }

  private armEndTimer(entry: Entry, durationMs: number): void {
    const started = entry.startedAt ?? this.deps.now();
    const until = durationMs > 0 ? started + durationMs + CLIP_OVERRUN_MS : started + CLIP_MAX_MS;
    this.armTimer(entry, Math.max(0, until - this.deps.now()), 'overrun');
    entry.timerUntil = until;
  }

  private armTimer(entry: Entry, ms: number, outcome: ClipOutcome): void {
    if (entry.timer !== null) this.deps.clearTimer(entry.timer);
    entry.timerUntil = this.deps.now() + ms;
    entry.timer = this.deps.setTimer(() => {
      entry.timer = null;
      if (entry.done || this.stopped || this.current !== entry) return;
      this.finishClip(entry, outcome);
    }, ms);
  }

  private finishClip(entry: Entry, outcome: ClipOutcome): void {
    if (entry.done) return;
    this.deps.log(`clip ${entry.index} ${outcome === 'finished' ? 'finished' : `ended: ${outcome}`}`);
    this.count(outcome);
    this.dispose(entry, outcome !== 'finished');
    if (this.current === entry) this.current = null;
    this.touch();
    // Start the next clip on the next tick, outside the player's callback.
    this.scheduleAdvance();
  }

  private dispose(entry: Entry, pause: boolean): void {
    if (entry.done) return;
    entry.done = true;
    if (entry.timer !== null) this.deps.clearTimer(entry.timer);
    entry.timer = null;
    entry.unsubscribe?.();
    entry.unsubscribe = null;
    try { entry.player.setActive?.(false); } catch {}
    if (pause) {
      try { entry.player.pause(); } catch {}
    }
    try { entry.player.release(); } catch {}
  }

  private count(outcome: ClipOutcome): void {
    this.outcomes[outcome] = (this.outcomes[outcome] ?? 0) + 1;
  }
}
