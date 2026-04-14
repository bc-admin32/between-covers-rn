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

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message ?? `API error ${res.status}`);
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