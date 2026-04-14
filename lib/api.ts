import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://api.betweencovers.app';

async function getToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync('bc_id_token');
  // A valid JWT has exactly three dot-separated segments. If the stored value
  // is missing, truncated, or otherwise malformed, discard it and clear it
  // so we don't forward a bad Authorization header to the API.
  if (!raw) return null;
  if (raw.split('.').length !== 3) {
    await SecureStore.deleteItemAsync('bc_id_token').catch(() => {});
    return null;
  }
  return raw;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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