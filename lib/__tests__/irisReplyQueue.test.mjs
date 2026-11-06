// Tests for lib/irisReplyQueue.ts against a fake player that behaves like
// expo-audio 1.1.x on Android:
//   - a status update right after creation (playing: false, 'idle'), sent
//     whether or not anyone is subscribed yet
//   - periodic updates (every updateInterval) only while playing
//   - duration known once playing
//   - at the end, TWO updates with didJustFinish: true / playing: false
//   - remove() would not stop the native player; release() does
// plus misbehaving players: one that never starts, one that never ends, one
// that falls back to 'idle' after starting.
//
// Run: npm run test:voice

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'irisReplyQueue.ts'), 'utf8');
const out = join(mkdtempSync(join(tmpdir(), 'iris-queue-')), 'irisReplyQueue.mjs');
writeFileSync(out, ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText);
const { ReplyQueue, CLIP_START_TIMEOUT_MS, CLIP_OVERRUN_MS } = await import(pathToFileURL(out).href);

const UPDATE_MS = 100;

// ── fake Android expo-audio player ──
function makeWorld() {
  const world = { created: 0, alive: 0, maxAlive: 0, released: 0, playOrder: [], log: [] };

  world.player = (behavior = 'normal', durationS = 0.25) => {
    world.created++;
    world.alive++;
    world.maxAlive = Math.max(world.maxAlive, world.alive);
    const listeners = new Set();
    let released = false;
    let ticker = null;
    let endTimer = null;
    let state = 'idle';
    const emit = (s) => {
      if (released) return;
      for (const l of [...listeners]) l(s);
    };
    // Creation update, sent before anyone has subscribed (lost, as on Android).
    setTimeout(() => emit({ playing: false, didJustFinish: false, playbackState: 'idle', duration: 0 }), 0);
    setTimeout(() => { state = 'ready'; }, 5);

    const p = {
      id: world.created - 1,
      play() {
        if (released) throw new Error('play after release');
        world.playOrder.push(p.id);
        if (behavior === 'never_start') return; // no event, ever
        setTimeout(() => {
          emit({ playing: true, didJustFinish: false, playbackState: 'ready', duration: durationS });
          ticker = setInterval(() => emit({ playing: true, didJustFinish: false, playbackState: 'ready', duration: durationS }), UPDATE_MS);
          if (behavior === 'never_end') return; // keeps "playing" forever
          if (behavior === 'fail_after_start') {
            endTimer = setTimeout(() => {
              clearInterval(ticker);
              emit({ playing: false, didJustFinish: false, playbackState: 'idle', duration: durationS });
            }, 60);
            return;
          }
          endTimer = setTimeout(() => {
            clearInterval(ticker);
            state = 'ended';
            const s = { playing: false, didJustFinish: true, playbackState: 'ended', duration: durationS };
            emit(s); // onIsPlayingChanged(false)
            emit(s); // onPlaybackStateChanged(ENDED)
          }, durationS * 1000);
        }, 30);
      },
      pause() { clearInterval(ticker); clearTimeout(endTimer); },
      release() {
        if (released) throw new Error('released twice');
        released = true;
        world.alive--;
        world.released++;
        clearInterval(ticker);
        clearTimeout(endTimer);
      },
      onStatus(l) { listeners.add(l); return () => listeners.delete(l); },
    };
    return p;
  };
  return world;
}

function makeQueue(world, { preloadNext = false, behaviors = [], throwOn = [] } = {}) {
  const events = { firstStarts: 0, playing: [], finished: [] };
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const queue = new ReplyQueue({
    createPlayer: (_audio, index) => {
      if (throwOn.includes(index)) throw new Error('write failed');
      return world.player(behaviors[index] ?? 'normal');
    },
    preloadNext,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h),
    defer: (fn) => setTimeout(fn, 0),
    now: () => Date.now(),
    log: (s) => world.log.push(s),
  }, {
    onFirstStart: () => { events.firstStarts++; },
    onClipPlaying: (i) => { events.playing.push(i); },
    onFinished: (summary) => { events.finished.push(summary); resolveDone(summary); },
  });
  return { queue, events, done };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeout = (p, ms) => Promise.race([p, sleep(ms).then(() => { throw new Error(`not finished within ${ms}ms`); })]);

test('Android: streamed clips play in order, one player at a time', async () => {
  const world = makeWorld();
  const { queue, events, done } = makeQueue(world);
  queue.add('s0');
  await sleep(50);
  queue.add('s1');           // arrives while s0 plays
  queue.add('s2');
  queue.end();
  const summary = await timeout(done, 3000);
  assert.deepEqual(world.playOrder, [0, 1, 2]);
  assert.deepEqual(events.playing, [0, 1, 2]);
  assert.equal(events.firstStarts, 1);
  assert.equal(events.finished.length, 1);
  assert.equal(summary.played, 3);
  assert.equal(summary.skipped, 0);
  assert.equal(world.maxAlive, 1, 'never more than one native player alive');
  assert.equal(world.released, 3);
  assert.equal(world.alive, 0);
});

test('Android: a clip that arrives after the previous one finished still plays', async () => {
  const world = makeWorld();
  const { queue, done } = makeQueue(world);
  queue.add('s0');
  await sleep(600);          // s0 (250ms) has finished; queue is waiting
  queue.add('s1');
  queue.end();
  const summary = await timeout(done, 3000);
  assert.equal(summary.played, 2);
  assert.deepEqual(world.playOrder, [0, 1]);
});

test('iOS: next clip is preloaded while the current one plays', async () => {
  const world = makeWorld();
  const { queue, done } = makeQueue(world, { preloadNext: true });
  queue.add('s0');
  queue.add('s1');
  queue.add('s2');
  queue.end();
  const summary = await timeout(done, 3000);
  assert.equal(summary.played, 3);
  assert.equal(world.maxAlive, 2);
  assert.equal(world.alive, 0);
});

test('a clip that never starts is skipped after the start timeout', async () => {
  const world = makeWorld();
  const { queue, events, done } = makeQueue(world, { behaviors: ['normal', 'never_start', 'normal'] });
  queue.add('s0'); queue.add('s1'); queue.add('s2'); queue.end();
  const summary = await timeout(done, CLIP_START_TIMEOUT_MS + 3000);
  assert.deepEqual(events.playing, [0, 2]);
  assert.equal(summary.played, 2);
  assert.equal(summary.outcomes.no_start, 1);
  assert.equal(world.alive, 0);
});

test('a clip that never ends is cut off after duration + overrun', async () => {
  const world = makeWorld();
  const { queue, done } = makeQueue(world, { behaviors: ['never_end', 'normal'] });
  const t0 = Date.now();
  queue.add('s0'); queue.add('s1'); queue.end();
  const summary = await timeout(done, 5000);
  assert.equal(summary.outcomes.overrun, 1);
  assert.equal(summary.outcomes.finished, 1);
  assert.ok(Date.now() - t0 >= 250 + CLIP_OVERRUN_MS, 'waited for duration + overrun');
});

test('a clip that falls back to idle after starting is skipped', async () => {
  const world = makeWorld();
  const { queue, done } = makeQueue(world, { behaviors: ['fail_after_start', 'normal'] });
  queue.add('s0'); queue.add('s1'); queue.end();
  const summary = await timeout(done, 3000);
  assert.equal(summary.outcomes.failed, 1);
  assert.equal(summary.outcomes.finished, 1);
});

test('a clip whose player cannot be created is skipped', async () => {
  const world = makeWorld();
  const { queue, done } = makeQueue(world, { throwOn: [1] });
  queue.add('s0'); queue.add('s1'); queue.add('s2'); queue.end();
  const summary = await timeout(done, 3000);
  assert.equal(summary.outcomes.load_failed, 1);
  assert.equal(summary.played, 2);
});

test('stop() mid-reply releases everything and never reports finished', async () => {
  const world = makeWorld();
  const { queue, events } = makeQueue(world, { preloadNext: true });
  queue.add('s0'); queue.add('s1'); queue.add('s2');
  await sleep(100);
  queue.stop();
  queue.add('s3');           // late sentence after an interrupt: ignored
  queue.end();
  await sleep(800);
  assert.equal(events.finished.length, 0);
  assert.equal(world.alive, 0);
  assert.deepEqual(world.playOrder, [0]);
});

test('end() with no clips finishes straight away', async () => {
  const world = makeWorld();
  const { queue, events, done } = makeQueue(world);
  queue.end();
  const summary = await timeout(done, 500);
  assert.equal(summary.clips, 0);
  assert.equal(events.firstStarts, 0);
});

test('every clip logs load, play and an outcome', async () => {
  const world = makeWorld();
  const { queue, done } = makeQueue(world);
  queue.add('s0'); queue.end();
  await timeout(done, 2000);
  assert.ok(world.log.some((l) => l === 'clip 0 load'));
  assert.ok(world.log.some((l) => l === 'clip 0 play'));
  assert.ok(world.log.some((l) => l.startsWith('clip 0 playing after')));
  assert.ok(world.log.some((l) => l === 'clip 0 finished'));
});
