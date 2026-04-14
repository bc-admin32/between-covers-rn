import * as SecureStore from 'expo-secure-store';

const COGNITO_DOMAIN = 'https://auth.betweencovers.app';
const CLIENT_ID = '4q0pjkqv3btdopk9n6q9ch776i';
const REDIRECT_URI = 'com.betweencovers.app://redirect';

const SECURE_STORE_KEYS = [
  'bc_id_token',
  'bc_access_token',
  'bc_biometric_enabled',
  'bc_profile_cache',
];

/**
 * Fully signs the user out:
 * 1. Hits the Cognito /logout endpoint to invalidate the server-side session
 *    so the same social provider doesn't auto-re-authenticate on next login.
 * 2. Wipes all local SecureStore tokens and cache so the login screen starts fresh.
 *
 * Call this before redirecting to /(auth)/login for both manual logout,
 * account deactivation, and account deletion.
 */
export async function signOut(): Promise<void> {
  // 1 — Invalidate the Cognito session server-side (fire and forget — don't
  //     block or surface an error if the network is unavailable).
  try {
    const logoutUrl =
      `${COGNITO_DOMAIN}/logout` +
      `?client_id=${CLIENT_ID}` +
      `&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
    await fetch(logoutUrl, { method: 'GET' });
  } catch {
    // Not fatal — tokens are cleared locally regardless.
  }

  // 2 — Wipe all local tokens and cached data.
  await Promise.all(
    SECURE_STORE_KEYS.map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => {})
    )
  );
}
