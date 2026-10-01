import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { useRouter } from 'expo-router';
import { apiPost, ApiError } from './api';
import { normalizeRoute } from './routes';

type Router = ReturnType<typeof useRouter>;

// Guest mode: no stored token. Guests browse read-only for GUEST_DAYS from
// first launch, then hit /(auth)/guest-paywall until they sign up.
export const GUEST_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Device-scoped — survive sign-out on purpose (the 18+ confirmation and the
// first-launch clock belong to the install, not to an account).
const AGE_CONFIRMED_KEY = 'bc_age_confirmed';
const FIRST_LAUNCH_KEY = 'bc_first_launch_at';

// Per-user — also listed in signout.ts USER_DATA_KEYS.
export const RETURN_TO_KEY = 'bc_guest_return_to';
export const PENDING_IRIS_KEY = 'bc_pending_iris_msg';

// AsyncStorage (not SecureStore): the list can outgrow SecureStore's 2KB
// value limit, and it holds nothing sensitive.
const GUEST_LIBRARY_KEY = 'bc_guest_library_v1';

// ── First-launch clock ─────────────────────────────────────────────────────

// Records firstLaunchAt on the first run of this build (fresh installs and
// existing installs alike). Never overwrites an existing value.
export async function ensureFirstLaunchAt(): Promise<string> {
  const existing = await SecureStore.getItemAsync(FIRST_LAUNCH_KEY).catch(() => null);
  if (existing && !Number.isNaN(Date.parse(existing))) return existing;
  const now = new Date().toISOString();
  await SecureStore.setItemAsync(FIRST_LAUNCH_KEY, now).catch(() => {});
  return now;
}

export async function getFirstLaunchAt(): Promise<string | null> {
  return SecureStore.getItemAsync(FIRST_LAUNCH_KEY).catch(() => null);
}

export async function isGuestExpired(): Promise<boolean> {
  const firstLaunchAt = await ensureFirstLaunchAt();
  return Date.now() >= Date.parse(firstLaunchAt) + GUEST_DAYS * DAY_MS;
}

// ── Age gate ───────────────────────────────────────────────────────────────

export async function isAgeConfirmed(): Promise<boolean> {
  return (await SecureStore.getItemAsync(AGE_CONFIRMED_KEY).catch(() => null)) === 'true';
}

export async function confirmAge(): Promise<void> {
  await SecureStore.setItemAsync(AGE_CONFIRMED_KEY, 'true');
}

// Where a user without a session enters the app: the 18+ gate until it's
// confirmed, then guest mode for GUEST_DAYS from first launch, then the
// sign-up-only guest paywall. Shared by launch (index.tsx), the age gate and
// "Continue as guest" on login so the rules can't drift.
export async function guestEntryRoute(): Promise<'/(auth)/age-gate' | '/(auth)/guest-paywall' | '/(tabs)/home'> {
  if (!(await isAgeConfirmed())) return '/(auth)/age-gate';
  if (await isGuestExpired()) return '/(auth)/guest-paywall';
  return '/(tabs)/home';
}

// ── Return-to after sign-up ────────────────────────────────────────────────

export async function setReturnTo(href: string): Promise<void> {
  await SecureStore.setItemAsync(RETURN_TO_KEY, href).catch(() => {});
}

// A guest backed out of sign-up ("Not now") or reached the guest paywall:
// forget the gated action so a later, unrelated sign-up doesn't jump back to
// it or auto-send an old Iris message.
export async function clearGuestIntent(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(RETURN_TO_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(PENDING_IRIS_KEY).catch(() => {}),
  ]);
}

async function takeReturnTo(): Promise<string | null> {
  const href = await SecureStore.getItemAsync(RETURN_TO_KEY).catch(() => null);
  if (href) await SecureStore.deleteItemAsync(RETURN_TO_KEY).catch(() => {});
  return href?.startsWith('/') ? href : null;
}

// Replaces router.replace(normalizeRoute(nextRoute)) at the points where an
// authenticated user enters the app (redirect.tsx, onboarding L9Com). When the
// destination is Home and a guest gate stored a return-to, land on Home and
// push the gated screen on top so Back still reaches Home. Any other
// destination (onboarding, paywall) leaves the return-to for the next landing.
export async function landAfterAuth(router: Router, nextRoute: string): Promise<void> {
  const target = normalizeRoute(nextRoute);

  // Drop the guest-mode lounge snapshot so the signed-in lounge refetches
  // per-user fields (hasVoted, loungeTermsAcceptedAt) instead of flashing
  // guest defaults.
  try {
    const { resetLoungeCache } = await import('../app/(tabs)/lounge/index');
    resetLoungeCache();
  } catch {}

  if (target.startsWith('/(tabs)/home')) {
    const returnTo = await takeReturnTo();
    router.replace(target as any);
    if (returnTo) setTimeout(() => router.push(returnTo as any), 0);
    return;
  }
  router.replace(target as any);
}

// ── Pending Iris message ───────────────────────────────────────────────────

export type PendingIrisMessage = { text: string; savedAt: string };

export async function setPendingIrisMessage(text: string): Promise<void> {
  const value: PendingIrisMessage = { text, savedAt: new Date().toISOString() };
  await SecureStore.setItemAsync(PENDING_IRIS_KEY, JSON.stringify(value)).catch(() => {});
}

export async function takePendingIrisMessage(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(PENDING_IRIS_KEY).catch(() => null);
  if (!raw) return null;
  await SecureStore.deleteItemAsync(PENDING_IRIS_KEY).catch(() => {});
  try {
    const parsed = JSON.parse(raw) as PendingIrisMessage;
    return parsed.text?.trim() ? parsed.text : null;
  } catch {
    return null;
  }
}

// ── Guest library ──────────────────────────────────────────────────────────

export type GuestBookStatus = 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FINISHED';

export type GuestBook = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string | null;
  status: GuestBookStatus;
  spice?: number | null;
  spiceLevel?: string | null;
  tropes?: string[];
  primarySubgenre?: string | null;
  triggers?: string[];
  savedAt: string;
};

export async function getGuestBooks(): Promise<GuestBook[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeGuestBooks(books: GuestBook[]): Promise<void> {
  if (books.length === 0) await AsyncStorage.removeItem(GUEST_LIBRARY_KEY);
  else await AsyncStorage.setItem(GUEST_LIBRARY_KEY, JSON.stringify(books));
}

export async function getGuestBook(workId: string): Promise<GuestBook | null> {
  return (await getGuestBooks()).find((b) => b.workId === workId) ?? null;
}

// Insert or replace by workId.
export async function saveGuestBook(book: Omit<GuestBook, 'savedAt'>): Promise<void> {
  const books = await getGuestBooks();
  const existing = books.find((b) => b.workId === book.workId);
  const next: GuestBook = { ...existing, ...book, savedAt: existing?.savedAt ?? new Date().toISOString() };
  await writeGuestBooks([...books.filter((b) => b.workId !== book.workId), next]);
}

export async function updateGuestBookStatus(workId: string, status: GuestBookStatus): Promise<void> {
  const books = await getGuestBooks();
  await writeGuestBooks(books.map((b) => (b.workId === workId ? { ...b, status } : b)));
}

export async function removeGuestBook(workId: string): Promise<void> {
  const books = await getGuestBooks();
  await writeGuestBooks(books.filter((b) => b.workId !== workId));
}

let flushing = false;

// Pushes guest saves to the signed-in account via the same /library/add call
// (and payload) book detail uses. Per book:
//   - any 2xx (including outcome "already_in_library"): done, remove locally.
//   - 409 (result "REFUSED", outcome "refused_bad_data"): the backend rejected
//     the book as bad data. Terminal — retrying can't succeed, so remove it.
//   - anything else (network, 5xx, 401…): keep it and retry next launch.
// No-op when empty.
export async function flushGuestLibrary(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const books = await getGuestBooks();
    for (const book of books) {
      try {
        await apiPost('/library/add', {
          workId: book.workId,
          title: book.title,
          primaryAuthor: book.primaryAuthor,
          coverUrl: book.coverUrl,
          status: book.status,
        });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) continue;
        if (__DEV__) {
          console.warn(`[guest] /library/add refused ${book.workId} (${err.body?.outcome ?? 'refused'}); dropping`);
        }
      }
      await removeGuestBook(book.workId);
    }
  } catch {
    // Storage read failed — retry next launch.
  } finally {
    flushing = false;
  }
}
