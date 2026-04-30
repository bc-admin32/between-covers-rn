import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import { apiPost } from './api';

const STORAGE_KEY = 'bc_event_buffer_v1';
const SESSION_KEY = 'bc_session_id_v1';
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
  | 'book_added_to_library';

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
let initialized = false;

function uuid(): string {
  // RFC4122 v4 — good enough, no native crypto dep needed
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function detectPlatform(): 'ios' | 'android' | 'amazon' {
  if (Platform.OS === 'ios') return 'ios';
  // Amazon Fire tablets report Platform.OS as 'android' but have a Fire-specific
  // manufacturer. expo-application doesn't expose this directly; we use
  // Application.applicationName as a hint, but the real detection happens
  // in the IAP shim. For analytics, a runtime constant set by the app shell
  // is more reliable.
  // TODO: replace with a real Fire detection once iap-shim lands.
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

  // Snapshot current buffer; clear it so new events queue up cleanly.
  // If the POST fails (5xx), put events back at the front.
  const toSend = buffer.slice(0, MAX_BATCH_SIZE);
  const remaining = buffer.slice(MAX_BATCH_SIZE);
  buffer = remaining;
  await persistBuffer();

  try {
    await apiPost('/events/batch', { events: toSend });
    // Success — events are gone for good. Buffer already cleared.
  } catch (err: any) {
    // Retain on transient failures (network, 5xx). Drop on 4xx (validation)
    // since retrying would just fail again.
    const status = err?.status || err?.response?.status;
    if (status && status >= 400 && status < 500) {
      // Validation error — drop these events, log it
      console.warn('[analytics] dropping batch on 4xx:', status, toSend.length);
    } else {
      // Network or 5xx — put back at the front for next flush
      buffer = [...toSend, ...buffer];
      await persistBuffer();
    }
  }
}
