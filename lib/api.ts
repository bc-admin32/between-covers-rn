import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://api.betweencovers.app';

// Valid JWT characters: base64url (A-Z a-z 0-9 - _ =) plus two dots.
const JWT_RE = /^[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+$/;

async function getToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync('bc_id_token');
  if (!raw) return null;

  // Trim any stray whitespace/newlines that SecureStore may have preserved —
  // even a single trailing \n makes AWS reject the Authorization header.
  const token = raw.trim();

  // A valid JWT is exactly three base64url segments separated by dots.
  // Discard and clear anything that doesn't match so we never forward a
  // malformed Authorization header to the API.
  if (!JWT_RE.test(token)) {
    await SecureStore.deleteItemAsync('bc_id_token').catch(() => {});
    return null;
  }

  return token;
}

// True when a well-formed id token is stored. Guest mode == !hasSession().
export async function hasSession(): Promise<boolean> {
  return (await getToken()) !== null;
}

// ── Guest mode ──────────────────────────────────────────────────────────
// With no token, these GETs are served by the public /guest mirror (same
// query params, same response shape plus isGuest: true, per-user fields
// defaulted).
const GUEST_REWRITE_EXACT = new Set([
  '/home/resolve',
  '/cozy/home',
  '/library/discover',
  '/live',
  '/lounge/resolve',
  '/lounge/thread/replies',
  '/lounge/archive',
  '/lounge/monthly/prompt',
  '/lounge/monthly/submissions',
  '/catalog/filter',
]);
const GUEST_REWRITE_PATTERNS = [
  /^\/cozy\/media\/[^/]+$/,
  /^\/cozy\/spotlight\/[^/]+$/,
  /^\/library\/(?!snapshot$|discover$)[^/]+$/,
];
// Routes that are already public — called as-is without a token.
const GUEST_OPEN = new Set([
  'GET /cozy/new-releases',
  'GET /cozy/off-shelf',
  'GET /live/active',
  'GET /taxonomy',
  'GET /legal',
  'POST /events/batch',
]);

function splitPath(path: string): [string, string] {
  const q = path.indexOf('?');
  return q >= 0 ? [path.slice(0, q), path.slice(q)] : [path, ''];
}

// Returns the path to call without a token, or null if the route needs an
// account. Guests must never reach an authenticated route — screens gate the
// UI (lib/useGuest), and this is the backstop so a missed gate fails locally
// instead of firing a 401.
function guestPath(method: string, path: string): string | null {
  const [pathname, query] = splitPath(path);
  if (method === 'GET') {
    if (GUEST_REWRITE_EXACT.has(pathname) || GUEST_REWRITE_PATTERNS.some((re) => re.test(pathname))) {
      return `/guest${pathname}${query}`;
    }
  }
  if (GUEST_OPEN.has(`${method} ${pathname}`)) return path;
  return null;
}

// Thrown for any non-2xx response. Callers that need to branch on the
// status or response body (e.g. live-event restriction screens that read
// body.reason on a 403) should catch ApiError and inspect those fields
// rather than parsing the message string.
export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };
  let url = path;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    const method = (options.method ?? 'GET').toUpperCase();
    const rewritten = guestPath(method, path);
    if (!rewritten) {
      if (__DEV__) console.warn(`[api] guest blocked: ${method} ${path}`);
      throw new ApiError(401, { guestBlocked: true }, `Guest blocked: ${method} ${path}`);
    }
    url = rewritten;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.message ?? body?.error ?? (body ? JSON.stringify(body) : null);
    throw new ApiError(res.status, body, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function apiGet<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}

export function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T = any>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}