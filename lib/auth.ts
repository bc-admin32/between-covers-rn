import * as SecureStore from 'expo-secure-store';

// Cognito session refresh. All sign-in paths (Google, Amazon, Apple) go through
// the hosted UI + authorization_code exchange in (auth)/redirect.tsx, which
// stores the refresh token here. ID/access tokens live 1 day; the refresh
// token 180 days (Cognito app client: no secret, ALLOW_REFRESH_TOKEN_AUTH,
// revocation enabled).

const COGNITO_DOMAIN = 'https://auth.betweencovers.app';
const CLIENT_ID = '4q0pjkqv3btdopk9n6q9ch776i';

export const ID_TOKEN_KEY = 'bc_id_token';
export const ACCESS_TOKEN_KEY = 'bc_access_token';
export const REFRESH_TOKEN_KEY = 'bc_refresh_token';

// Refresh proactively when the id token expires within this window.
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const JWT_RE = /^[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+$/;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// base64url → binary string. Only used to read the (ASCII) exp claim, so no
// UTF-8 decoding. Self-contained: atob isn't guaranteed to be typed here.
function decodeBase64Url(input: string): string {
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('invalid base64');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

// Expiry (epoch ms) from a JWT's exp claim, or null if unreadable.
function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// True when the token expires within `ms`. An unreadable exp counts as not
// expiring — the backend stays the authority on validity.
export function tokenExpiresWithin(token: string, ms: number): boolean {
  const exp = tokenExpiry(token);
  return exp !== null && exp - Date.now() <= ms;
}

// refreshed   — new id/access tokens saved.
// rejected    — Cognito refused the refresh token (invalid_grant: expired,
//               revoked, or from a deleted user). The session is over.
// no-refresh-token — nothing to refresh with (signed in before this build).
// failed      — network error or Cognito 5xx/429. Try again later.
export type RefreshResult = 'refreshed' | 'rejected' | 'no-refresh-token' | 'failed';

let inflight: Promise<RefreshResult> | null = null;

// Bumped by a hard sign-out so a refresh already in flight can't write tokens
// back after they've been wiped.
let authEpoch = 0;
export function invalidatePendingRefresh() {
  authEpoch += 1;
}

async function doRefresh(): Promise<RefreshResult> {
  const epoch = authEpoch;
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY).catch(() => null);
  if (!refreshToken) return 'no-refresh-token';

  let res: Response;
  try {
    res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch {
    return 'failed';
  }

  // Cognito answers a bad/expired/revoked refresh token with 400 invalid_grant.
  if (res.status === 400 || res.status === 401) return 'rejected';
  if (!res.ok) return 'failed';

  const data = await res.json().catch(() => null);
  const idToken: string | undefined = data?.id_token;
  const accessToken: string | undefined = data?.access_token;
  if (!idToken || !accessToken || !JWT_RE.test(idToken)) return 'failed';

  if (epoch !== authEpoch) return 'rejected';
  await SecureStore.setItemAsync(ID_TOKEN_KEY, idToken);
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  // Only returned when refresh-token rotation is enabled on the client.
  if (typeof data.refresh_token === 'string') {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refresh_token).catch(() => {});
  }
  return 'refreshed';
}

// Single-flight: concurrent callers share one /oauth2/token request.
export function refreshSession(): Promise<RefreshResult> {
  if (!inflight) {
    inflight = doRefresh().finally(() => { inflight = null; });
  }
  return inflight;
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
}

// Stores the refresh token from the authorization_code exchange. Best-effort:
// if it can't be saved the session still works, it just won't refresh.
export async function saveRefreshToken(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token).catch((e) => {
    console.warn('[auth] could not store refresh token:', e);
  });
}

export async function readIdToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(ID_TOKEN_KEY).catch(() => null);
  const token = raw?.trim() ?? null;
  return token && JWT_RE.test(token) ? token : null;
}

// Returns `token`, or a refreshed one if it expires within REFRESH_MARGIN_MS.
// Never throws and never signs out: if the refresh can't happen the original
// token is returned and the backend decides. A rejected refresh token is
// dropped so it isn't retried on every call.
export async function ensureFresh(token: string): Promise<string> {
  if (!tokenExpiresWithin(token, REFRESH_MARGIN_MS)) return token;
  const result = await refreshSession();
  if (result === 'refreshed') return (await readIdToken()) ?? token;
  if (result === 'rejected') await clearRefreshToken();
  return token;
}

// For direct fetch() callers outside lib/api.ts: the stored id token,
// refreshed first if it's about to expire. Null when signed out.
export async function getFreshIdToken(): Promise<string | null> {
  const token = await readIdToken();
  return token ? ensureFresh(token) : null;
}

// Hard sign-out: revoke the refresh token at Cognito so it can't be reused.
// Best-effort — tokens are wiped locally regardless.
export async function revokeRefreshToken(): Promise<void> {
  const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY).catch(() => null);
  if (!token) return;
  try {
    await fetch(`${COGNITO_DOMAIN}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, client_id: CLIENT_ID }).toString(),
    });
  } catch {}
}
