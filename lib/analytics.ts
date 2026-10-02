import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { apiPost } from './api';

const STORAGE_KEY = 'bc_event_buffer_v1';
const SESSION_KEY = 'bc_session_id_v1';
// Device-scoped guest ID, created once and never cleared (not in signout's
// key lists) so the backend can link a guest's events to the account they
// later sign up or sign in with. SecureStore: on iOS it survives reinstall.
const GUEST_ID_KEY = 'bc_guest_id';
// signup_completed for a NEW account waits until onboarding finishes; its
// payload (method, attribution) is held here meanwhile, across restarts.
// Per-user: cleared by signOut (USER_DATA_KEYS).
export const PENDING_SIGNUP_KEY = 'bc_pending_signup';
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 20;
const MAX_BATCH_SIZE = 100;

type EventName =
  | 'app_open'
  | 'signup_started'
  | 'signup_completed'
  | 'onboarding_completed'
  | 'paywall_shown'
  | 'subscription_started'
  | 'iris_chat_sent'
  | 'cozy_section_viewed'
  | 'book_added_to_library'
  | 'retailer_cta_tapped'
  | 'book_tag_committed'
  | 'tag_modal_closed'
  | 'tag_modal_skipped'
  | 'tag_modal_auto_prompt_disabled'
  | 'age_gate_confirmed';

type AnalyticsEvent = {
  eventId: string;
  eventName: EventName;
  eventTimestamp: string;
  sessionId: string;
  platform: 'ios' | 'android' | 'amazon';
  properties?: Record<string, unknown>;
};

let buffer: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionId: string | null = null;
let guestId: string | null = null;
let initialized = false;
// Bumped by resetAnalyticsForSignOut(): a flush still in flight from the
// previous account must not put its failed batch back into the new buffer.
let bufferEpoch = 0;

const SIGNOUT_FLUSH_TIMEOUT_MS = 2_000;

function uuid(): string {
  // RFC4122 v4 — good enough, no native crypto dep needed
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function detectPlatform(): 'ios' | 'android' | 'amazon' {
  const buildPlatform = Constants.expoConfig?.extra?.analyticsPlatform;
  if (buildPlatform === 'ios' || buildPlatform === 'android' || buildPlatform === 'amazon') {
    return buildPlatform;
  }
  if (Platform.OS === 'ios') return 'ios';
  return 'android';
}

async function getSessionId(): Promise<string> {
  if (sessionId) return sessionId;
  let stored = await AsyncStorage.getItem(SESSION_KEY);
  if (!stored) {
    stored = uuid();
    await AsyncStorage.setItem(SESSION_KEY, stored);
  }
  sessionId = stored;
  return stored;
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
      if (Array.isArray(parsed)) buffer = parsed;
    }
  } catch {
    buffer = [];
  }
}

async function persistBuffer(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // Storage failure is non-fatal — events stay in memory.
  }
}

export async function initAnalytics(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await loadBuffer();
  await getSessionId();

  // Flush on app foreground/background transitions
  AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      flush().catch(() => {});
    } else if (state === 'active') {
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

// Hard sign-out: send what's buffered while the old token is still valid
// (best-effort, capped at SIGNOUT_FLUSH_TIMEOUT_MS), then start a fresh
// session ID and an empty buffer so nothing from this account is sent under
// the next one. Both live in AsyncStorage. bc_guest_id is deliberately kept.
export async function resetAnalyticsForSignOut(): Promise<void> {
  try {
    await Promise.race([
      flush().catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, SIGNOUT_FLUSH_TIMEOUT_MS)),
    ]);
  } catch {}
  bufferEpoch += 1;
  buffer = [];
  sessionId = null;
  await AsyncStorage.multiRemove([STORAGE_KEY, SESSION_KEY]).catch(() => {});
}

export async function track(
  eventName: EventName,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    const sid = await getSessionId();
    const evt: AnalyticsEvent = {
      eventId: uuid(),
      eventName,
      eventTimestamp: new Date().toISOString(),
      sessionId: sid,
      platform: detectPlatform(),
      properties,
    };
    buffer.push(evt);
    await persistBuffer();

    if (buffer.length >= MAX_BUFFER_SIZE) {
      flush().catch(() => {});
    }
  } catch {
    // Never throw from track() — analytics must not break the app
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const epoch = bufferEpoch;

  // Snapshot current buffer; clear it so new events queue up cleanly.
  // If the POST fails (5xx), put events back at the front.
  const toSend = buffer.slice(0, MAX_BATCH_SIZE);
  const remaining = buffer.slice(MAX_BATCH_SIZE);
  buffer = remaining;
  await persistBuffer();

  try {
    // guestId on every batch, guest or signed in; the backend copies it onto
    // each saved event.
    await apiPost('/events/batch', { events: toSend, guestId: await getGuestId() });
    // Success — events are gone for good. Buffer already cleared.
  } catch (err: any) {
    // Retain on transient failures (network, 5xx). Drop on 4xx (validation)
    // since retrying would just fail again.
    const status = err?.status || err?.response?.status;
    if (status && status >= 400 && status < 500) {
      // Validation error — drop these events, log it
      console.warn('[analytics] dropping batch on 4xx:', status, toSend.length);
    } else if (epoch === bufferEpoch) {
      // Network or 5xx — put back at the front for next flush
      buffer = [...toSend, ...buffer];
      await persistBuffer();
    }
  }
}
