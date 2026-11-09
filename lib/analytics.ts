import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { apiPost, hasSession } from './api';
import {
  readPendingCrashReports, clearPendingCrashReports,
  readUnfinishedBreadcrumbs, clearUnfinishedBreadcrumbs,
} from './crashCapture';

const STORAGE_KEY = 'bc_event_buffer_v1';
// Sessions used to be stored here and kept until sign-out. They're now
// in memory only; the old key is removed on launch.
const OLD_SESSION_KEY = 'bc_session_id_v1';
// Device-scoped guest ID, created once and never cleared (not in signout's
// key lists) so the backend can link a guest's events to the account they
// later sign up or sign in with. SecureStore: on iOS it survives reinstall.
const GUEST_ID_KEY = 'bc_guest_id';
// Set at sign-out, cleared when the user is back in. A Face ID / Touch ID
// sign-out keeps the login token for quick re-entry, so "is a token stored?"
// can't tell; this flag makes events count as guest until then.
const SIGNED_OUT_KEY = 'bc_analytics_signed_out';
// signup_completed for a NEW account waits until onboarding finishes; its
// payload (method, attribution) is held here meanwhile, across restarts.
// Per-user: cleared by signOut (USER_DATA_KEYS).
export const PENDING_SIGNUP_KEY = 'bc_pending_signup';
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 20;
const MAX_BATCH_SIZE = 100;
// Back from the background after this long = a new session.
const SESSION_RESUME_TIMEOUT_MS = 30 * 60 * 1000;
// Screen visits shorter than this aren't sent.
const MIN_SCREEN_MS = 1000;
const SIGNOUT_FLUSH_TIMEOUT_MS = 2_000;
const SIGNIN_FLUSH_TIMEOUT_MS = 2_000;

type EventName =
  | 'app_open'
  | 'session_start'
  | 'screen_view'
  | 'signup_started'
  | 'signup_completed'
  | 'onboarding_completed'
  | 'paywall_shown'
  | 'subscription_started'
  | 'iris_chat_sent'
  | 'cozy_section_viewed'
  | 'book_added_to_library'
  | 'book_status_changed'
  | 'voice_turn_timing'
  | 'retailer_cta_tapped'
  | 'book_tag_committed'
  | 'tag_modal_closed'
  | 'tag_modal_skipped'
  | 'tag_modal_auto_prompt_disabled'
  | 'age_gate_confirmed'
  | 'client_error';

type SessionReason = 'cold_start' | 'resume' | 'sign_out';

type AnalyticsEvent = {
  eventId: string;
  eventName: EventName;
  eventTimestamp: string;
  sessionId: string;
  platform: 'ios' | 'android' | 'amazon';
  properties?: Record<string, unknown>;
};

// A queued event. `guest` is stored on the device only (stripped before
// sending): true = recorded signed out, so it's always sent without a token;
// false = recorded signed in. Missing on events queued by an older app
// version: those go with whoever is signed in when they're sent, as before.
type QueuedEvent = AnalyticsEvent & { guest?: boolean };

let buffer: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let guestId: string | null = null;
let initialized = false;
// Bumped by resetAnalyticsForSignOut(): a flush still in flight from the
// previous account must not put its failed batch back into the new buffer.
let bufferEpoch = 0;
// One flush at a time, so a batch is never sent twice and the sign-in send
// waits for any flush already running.
let flushChain: Promise<void> = Promise.resolve();

// New on every launch (cold start); replaced after a long background and at
// sign-out. In memory only.
let sessionId: string = uuid();
let backgroundAt: number | null = null;

// The screen being timed for screen_view. screenSince is null while the app
// is in the background.
let currentScreen: string | null = null;
let screenSince: number | null = null;

// Cached SIGNED_OUT_KEY; null until first read.
let signedOut: boolean | null = null;

function uuid(): string {
  // RFC4122 v4 — good enough, no native crypto dep needed
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Decided on the device, not from the build's config: an OTA update carries
// the config of the machine that published it, so a build-time value would be
// wrong for one of the two Android stores. Fire tablets run the Amazon build.
function detectPlatform(): 'ios' | 'android' | 'amazon' {
  if (Platform.OS === 'ios') return 'ios';
  return Device.manufacturer === 'Amazon' ? 'amazon' : 'android';
}

// Build label sent with every batch: the app version as the x-app-version
// header, the update channel and update ID as top-level body fields.
function appVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

function buildLabel(): { channel: string; updateId: string | null } {
  if (!Updates.isEnabled) return { channel: 'dev', updateId: null };
  return { channel: Updates.channel || 'dev', updateId: Updates.updateId ?? null };
}

// Reads (or on first launch creates) the device guest ID. Never throws; if
// SecureStore fails the ID lives in memory for this process only.
export async function getGuestId(): Promise<string> {
  if (guestId) return guestId;
  let stored = await SecureStore.getItemAsync(GUEST_ID_KEY).catch(() => null);
  if (!stored) {
    stored = uuid();
    await SecureStore.setItemAsync(GUEST_ID_KEY, stored).catch(() => {});
  }
  guestId = stored;
  return stored;
}

export async function setPendingSignup(props: Record<string, unknown>): Promise<void> {
  await SecureStore.setItemAsync(PENDING_SIGNUP_KEY, JSON.stringify(props)).catch(() => {});
}

// Returns and clears the held payload, so signup_completed fires at most once.
export async function takePendingSignup(): Promise<Record<string, unknown> | null> {
  const raw = await SecureStore.getItemAsync(PENDING_SIGNUP_KEY).catch(() => null);
  if (!raw) return null;
  await SecureStore.deleteItemAsync(PENDING_SIGNUP_KEY).catch(() => {});
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadBuffer(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Events tracked before init (already in memory) stay after the stored ones.
      if (Array.isArray(parsed)) buffer = [...parsed, ...buffer];
    }
  } catch {
    // Keep what's in memory.
  }
}

async function persistBuffer(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // Storage failure is non-fatal — events stay in memory.
  }
}

// ── Signed in or guest ──

// True when events should count as guest: signed out (including a Face ID /
// Touch ID sign-out that kept the token), or no token stored.
async function isGuestNow(): Promise<boolean> {
  if (signedOut === null) {
    signedOut = (await AsyncStorage.getItem(SIGNED_OUT_KEY).catch(() => null)) === '1';
  }
  return signedOut || !(await hasSession());
}

// Call when the user is back in: a new sign-in, or Face ID / Touch ID
// re-entry with the kept token.
export async function markSignedIn(): Promise<void> {
  signedOut = false;
  await AsyncStorage.removeItem(SIGNED_OUT_KEY).catch(() => {});
}

// ── Sessions ──

function startSession(reason: SessionReason, opts: { guest?: boolean } = {}): Promise<void> {
  sessionId = uuid();
  return record('session_start', { reason }, opts);
}

// ── Screen views ──
// screen_view { screen, durationMs } is sent when the user leaves a screen
// and when the app goes to the background. Visits under MIN_SCREEN_MS are
// skipped.

function endScreen(): Promise<void> {
  const screen = currentScreen;
  const since = screenSince;
  screenSince = null;
  if (!screen || since === null) return Promise.resolve();
  const durationMs = Date.now() - since;
  if (durationMs < MIN_SCREEN_MS) return Promise.resolve();
  return record('screen_view', { screen, durationMs });
}

function resumeScreen(): void {
  if (currentScreen && screenSince === null && AppState.currentState !== 'background') {
    screenSince = Date.now();
  }
}

// Called by the root layout with the route pattern (e.g. "/cozy",
// "/submissions/[type]") whenever it changes.
export function setScreen(screen: string): void {
  if (screen === currentScreen) return;
  endScreen();
  currentScreen = screen;
  screenSince = AppState.currentState === 'background' ? null : Date.now();
}

// ── Init ──

export async function initAnalytics(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // First event of every launch.
  startSession('cold_start');
  AsyncStorage.removeItem(OLD_SESSION_KEY).catch(() => {});
  await loadBuffer();

  AppState.addEventListener('change', (state) => {
    if (state === 'background') {
      backgroundAt = Date.now();
      // Record the current screen's time first, then send.
      endScreen().finally(() => { flush().catch(() => {}); });
    } else if (state === 'active') {
      const wasAwayMs = backgroundAt === null ? 0 : Date.now() - backgroundAt;
      backgroundAt = null;
      if (wasAwayMs >= SESSION_RESUME_TIMEOUT_MS) startSession('resume');
      resumeScreen();
      flush().catch(() => {});
    } else if (state === 'inactive') {
      flush().catch(() => {});
    }
  });

  // Periodic flush
  flushTimer = setInterval(() => {
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  // Flush whatever's in storage from a prior session
  if (buffer.length > 0) {
    flush().catch(() => {});
  }
}

// ── Sign-in / sign-out ──

// Call just before the sign-in token is saved: sends the queue as guest
// events while there's still no token (best-effort, short timeout). Guest
// events that miss it are still sent without a token later.
export async function sendQueuedAsGuest(): Promise<void> {
  try {
    await Promise.race([
      flush().catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, SIGNIN_FLUSH_TIMEOUT_MS)),
    ]);
  } catch {}
}

// Every sign-out, including a Face ID / Touch ID one that keeps the token:
// send what's buffered while the token is still valid (best-effort, capped at
// SIGNOUT_FLUSH_TIMEOUT_MS), drop the account's unsent events so nothing from
// this account goes out later, and start a new session. Events from here on
// count as guest until markSignedIn(). bc_guest_id is deliberately kept.
export async function resetAnalyticsForSignOut(): Promise<void> {
  try {
    await endScreen();
    await Promise.race([
      flush().catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, SIGNOUT_FLUSH_TIMEOUT_MS)),
    ]);
  } catch {}
  signedOut = true;
  await AsyncStorage.setItem(SIGNED_OUT_KEY, '1').catch(() => {});
  bufferEpoch += 1;
  buffer = buffer.filter((e) => e.guest === true);
  await persistBuffer();
  await startSession('sign_out', { guest: true });
  resumeScreen();
}

// ── Recording ──

async function record(
  eventName: EventName,
  properties: Record<string, unknown>,
  opts: { guest?: boolean } = {}
): Promise<void> {
  try {
    // Session and time are taken now, before any await.
    const evt: QueuedEvent = {
      eventId: uuid(),
      eventName,
      eventTimestamp: new Date().toISOString(),
      sessionId,
      platform: detectPlatform(),
      properties,
    };
    evt.guest = opts.guest ?? (await isGuestNow());
    buffer.push(evt);
    await persistBuffer();

    if (buffer.length >= MAX_BUFFER_SIZE) {
      flush().catch(() => {});
    }
  } catch {
    // Never throw from track() — analytics must not break the app
  }
}

export function track(
  eventName: EventName,
  properties: Record<string, unknown> = {}
): Promise<void> {
  return record(eventName, properties);
}

async function postBatch(events: AnalyticsEvent[], asGuest: boolean): Promise<void> {
  await apiPost(
    '/events/batch',
    { events, guestId: await getGuestId(), ...buildLabel() },
    { headers: { 'x-app-version': appVersion() }, asGuest }
  );
}

// Reports an error right away, in its own batch: if the backend rejects the
// event, only this report is lost, not the queued events. Resolves true once
// the backend has it; never throws.
export async function reportClientError(
  where: string,
  error: unknown,
  componentStack?: string | null,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[${where}]`, err);
    const evt: AnalyticsEvent = {
      eventId: uuid(),
      eventName: 'client_error',
      eventTimestamp: new Date().toISOString(),
      sessionId,
      platform: detectPlatform(),
      properties: {
        where,
        name: err.name,
        message: err.message.slice(0, 500),
        stack: (err.stack ?? '').slice(0, 2000),
        componentStack: (componentStack ?? '').slice(0, 2000),
        appVersion: appVersion(),
        os: Platform.OS,
        osVersion: String(Platform.Version),
        ...extra,
      },
    };
    await postBatch([evt], false);
    return true;
  } catch {
    return false;
  }
}

// Sends what lib/crashCapture saved during the previous launch: JS errors
// caught by the global handler, and a voice breadcrumb trail if voice mode
// never closed (a native crash leaves only that). Files are cleared only
// after the backend has them, so a crash here doesn't lose them.
export async function sendPendingCrashReports(): Promise<void> {
  try {
    const reports = readPendingCrashReports();
    if (reports.length) {
      let allSent = true;
      for (const r of reports) {
        const err = Object.assign(new Error(r.message), { name: r.name, stack: r.stack });
        const sent = await reportClientError('previous_launch', err, null, {
          isFatal: r.isFatal,
          cause: r.cause,
          breadcrumbs: r.breadcrumbs,
          crashedAt: r.at,
          crashAppVersion: r.appVersion,
          crashBuildNumber: r.buildNumber,
        });
        allSent = allSent && sent;
      }
      if (allSent) clearPendingCrashReports();
    }

    const trail = readUnfinishedBreadcrumbs();
    if (trail.length) {
      const sent = await reportClientError(
        'voice_unfinished',
        new Error(`Voice session did not close. Last step: ${trail[trail.length - 1]}`),
        null,
        { breadcrumbs: trail }
      );
      if (sent) clearUnfinishedBreadcrumbs();
    }
  } catch {
    // Best effort.
  }
}

// ── Sending ──

function flush(): Promise<void> {
  const run = flushChain.then(doFlush, doFlush);
  flushChain = run.catch(() => {});
  return run;
}

// Sends one group. 'sent' and 'dropped' are final; 'retry' puts it back.
async function sendGroup(events: QueuedEvent[], asGuest: boolean): Promise<'sent' | 'dropped' | 'retry'> {
  if (events.length === 0) return 'sent';
  const wire: AnalyticsEvent[] = events.map(({ guest: _guest, ...e }) => e);
  try {
    await postBatch(wire, asGuest);
    return 'sent';
  } catch (err: any) {
    // Retain on transient failures (network, 5xx). Drop on 4xx (validation)
    // since retrying would just fail again.
    const status = err?.status || err?.response?.status;
    if (status && status >= 400 && status < 500) {
      console.warn('[analytics] dropping batch on 4xx:', status, events.length);
      return 'dropped';
    }
    return 'retry';
  }
}

async function doFlush(): Promise<void> {
  if (buffer.length === 0) return;
  const epoch = bufferEpoch;

  // Snapshot current buffer; clear it so new events queue up cleanly.
  const toSend = buffer.slice(0, MAX_BATCH_SIZE);
  buffer = buffer.slice(MAX_BATCH_SIZE);
  await persistBuffer();

  // Guest events always go without a token. Signed-in events go with one;
  // signed out (or no token stored) they'd be saved as guest events, so
  // they're dropped. Events from an older app version (no mark) go as
  // whoever is signed in now.
  const signedIn = !(await isGuestNow());
  const guestEvents: QueuedEvent[] = [];
  const userEvents: QueuedEvent[] = [];
  for (const e of toSend) {
    const isGuest = e.guest ?? !signedIn;
    (isGuest ? guestEvents : userEvents).push(e);
  }
  if (userEvents.length && !signedIn) {
    console.warn('[analytics] dropping signed-in events with no session:', userEvents.length);
    userEvents.length = 0;
  }

  const [guestResult, userResult] = await Promise.all([
    sendGroup(guestEvents, true),
    sendGroup(userEvents, false),
  ]);

  const retry = [
    ...(guestResult === 'retry' ? guestEvents : []),
    ...(userResult === 'retry' ? userEvents : []),
  ];
  if (retry.length && epoch === bufferEpoch) {
    // Network or 5xx — put back at the front for next flush
    buffer = [...retry, ...buffer];
    await persistBuffer();
  }
}
