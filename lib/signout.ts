import * as SecureStore from 'expo-secure-store';

const COGNITO_DOMAIN = 'https://auth.betweencovers.app';
const CLIENT_ID = '4q0pjkqv3btdopk9n6q9ch776i';
const REDIRECT_URI = 'com.betweencovers.app://redirect';

// Auth tokens — kept on soft sign-out (biometric flow needs them)
const AUTH_KEYS = [
  'bc_id_token',
  'bc_access_token',
];

// Per-user data — MUST be cleared on every sign-out regardless of
// soft/hard. These hold cached profile data, home state, trial
// tracking, and other user-specific info that must not leak across
// accounts.
const USER_DATA_KEYS = [
  'bc_profile_cache',
  'bc_home_cache',
  'bc_home_bg',
  'bc_last_day6_video_shown',
  'bc_biometric_prompt_pending',
  'bc_biometric_prompt_dismissed',
  'bc_event_buffer_v1',
  'bc_session_id_v1',
];

// Biometric preference — only cleared on hard sign-out
const BIOMETRIC_KEYS = [
  'bc_biometric_enabled',
];

/**
 * Signs the user out. Soft (biometric-aware) by default, hard if forced.
 *
 * Soft (no args, or { force: false }):
 *   If bc_biometric_enabled is 'true', keeps auth tokens + biometric
 *   preference so Face ID / Touch ID re-entry works on the next launch.
 *   Per-user data is wiped EITHER WAY — that's the privacy-critical part.
 *
 * Hard ({ force: true }):
 *   Always does the full sign-out — hits Cognito /logout to invalidate the
 *   server-side session, then wipes auth tokens + biometric preference too.
 *   Use this whenever stale tokens MUST be cleared to avoid a re-auth loop
 *   or to honor a backend account-state change: account deactivation,
 *   account deletion, and auth-resolve failure recovery
 *   (deactivated/suspended/not-found accounts).
 */
export async function signOut(opts: { force?: boolean } = {}): Promise<void> {
  const isHard = opts.force === true;

  // Always wipe per-user data — biometric users included.
  // Without this, soft sign-out leaves the previous user's profile cache
  // available to the NEXT user that logs in on this device, causing brief
  // flashes of OTHER USERS' images, names, and preferences.
  await Promise.all(
    USER_DATA_KEYS.map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => {})
    )
  );

  // Reset module-level in-memory caches that survive React tree teardown.
  try {
    const { resetLoungeCache } = await import('../app/(tabs)/lounge/index');
    resetLoungeCache();
  } catch {
    // Dynamic import failure is non-fatal — the cache is rehydrated by the
    // next API fetch anyway. SecureStore-backed caches are already cleared
    // above, which is the actual privacy boundary.
  }

  // Soft sign-out: keep auth tokens + biometric preference, return.
  if (!isHard) {
    const biometricEnabled = await SecureStore.getItemAsync('bc_biometric_enabled');
    if (biometricEnabled === 'true') {
      return;
    }
  }

  // Hard sign-out path: invalidate Cognito session AND wipe everything.
  try {
    const logoutUrl =
      `${COGNITO_DOMAIN}/logout` +
      `?client_id=${CLIENT_ID}` +
      `&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
    await fetch(logoutUrl, { method: 'GET' });
  } catch {
    // Not fatal — tokens are cleared locally regardless.
  }

  await Promise.all(
    [...AUTH_KEYS, ...BIOMETRIC_KEYS].map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => {})
    )
  );
}
