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
 * Signs the user out. Soft (biometric-aware) by default, hard if forced.
 *
 * Soft (no args, or { force: false }):
 *   If bc_biometric_enabled is 'true', returns immediately without invalidating
 *   the Cognito session or wiping SecureStore. This lets the user re-enter via
 *   Face ID / Touch ID without re-authenticating from scratch. Caller is still
 *   responsible for navigating to the login screen.
 *
 * Hard ({ force: true }):
 *   Always does the full sign-out — hits Cognito /logout to invalidate the
 *   server-side session, then wipes all SecureStore keys. Use this whenever
 *   stale tokens MUST be cleared to avoid a re-auth loop or to honor a backend
 *   account-state change: account deactivation, account deletion, and
 *   auth-resolve failure recovery (deactivated/suspended/not-found accounts).
 */
export async function signOut(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force) {
    const biometricEnabled = await SecureStore.getItemAsync('bc_biometric_enabled');
    if (biometricEnabled === 'true') {
      return;
    }
  }

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
