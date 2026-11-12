import { useEffect, useState } from 'react';
import { apiGet, apiPost, hasSession } from './api';

// The member's Watch Me watchlist (GET/POST /cozy/watchlist), shared by the
// Watch Me cards, the movie sheet and the My Watchlist screen so a save in one
// shows in the others. Saved state is a set of movieIds held in memory:
// loaded from savedIds, then updated locally on each save/unsave.

export type WatchlistMovie = {
  movieId: string;
  title: string;
  year?: string | null;
  type?: string | null;
  imageUrl?: string | null;
  synopsis?: string | null;
  irisNote?: string | null;
  trailerUrl?: string | null;
  bcGenres?: string[] | null;
  spicy?: boolean | null;
  status?: string | null;
  releaseStatus?: string | null;
  releaseDate?: string | null;
  releaseDateType?: string | null;
  isActive?: boolean | null;
  savedAt?: string | null;
};

export type WatchlistResponse = { items?: WatchlistMovie[]; savedIds?: string[] };

let savedIds = new Set<string>();
const listeners = new Set<() => void>();
let loading: Promise<WatchlistResponse | null> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function setIds(ids: unknown) {
  savedIds = new Set(Array.isArray(ids) ? ids.filter((s): s is string => typeof s === 'string') : []);
  emit();
}

// Fetches the watchlist (members only; guests get null and no saved state).
// Concurrent calls share one request. Also refreshes the saved ids.
export function loadWatchlist(): Promise<WatchlistResponse | null> {
  if (loading) return loading;
  loading = hasSession()
    .then(async (signedIn) => {
      if (!signedIn) { setIds([]); return null; }
      const res = await apiGet<WatchlistResponse>('/cozy/watchlist');
      setIds(res?.savedIds);
      return res ?? null;
    })
    .catch(() => null)
    .finally(() => { loading = null; });
  return loading;
}

// Saves or unsaves right away, then confirms with the server; on failure the
// previous state comes back. Returns whether the server accepted it.
export async function setWatchlistSaved(movieId: string, saved: boolean): Promise<boolean> {
  const was = savedIds.has(movieId);
  const apply = (on: boolean) => {
    const next = new Set(savedIds);
    if (on) next.add(movieId); else next.delete(movieId);
    savedIds = next;
    emit();
  };
  apply(saved);
  try {
    await apiPost('/cozy/watchlist', { movieId, saved });
    return true;
  } catch {
    apply(was);
    return false;
  }
}

// The current saved movieIds; re-renders when they change.
export function useWatchlistIds(): ReadonlySet<string> {
  const [ids, setLocal] = useState<ReadonlySet<string>>(savedIds);
  useEffect(() => {
    const listener = () => setLocal(savedIds);
    listeners.add(listener);
    listener();
    return () => { listeners.delete(listener); };
  }, []);
  return ids;
}
