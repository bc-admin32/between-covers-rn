import { useEffect, useState } from 'react';

// Per-month layout for the Cozy tab and the Lounge, set in the admin's Cozy
// month editor. /cozy/home (active and previous) and /lounge/resolve (active)
// return `layout` and `tiles`. Missing = classic with every tile on, so older
// months — and older app builds, which ignore these fields — stay classic.

export type CozyLayout = 'classic' | 'playroom';

export type TileKey =
  | 'betweenTheSheets' | 'watchMe' | 'aftercare'
  | 'talkDirtyToMe' | 'pillowTalk' | 'newbies';

export type PlayroomTiles = Record<TileKey, boolean>;

export const DEFAULT_TILES: PlayroomTiles = {
  betweenTheSheets: true, watchMe: true, aftercare: true,
  talkDirtyToMe: true, pillowTalk: true, newbies: true,
};

// Developer-only: EXPO_PUBLIC_FORCE_PLAYROOM=1 shows The PlayRoom and Pillow
// Talk whatever the month says. __DEV__ is false in store builds and OTA
// updates, so this can never reach users.
export const FORCE_PLAYROOM = __DEV__ && process.env.EXPO_PUBLIC_FORCE_PLAYROOM === '1';

export function resolveLayout(raw: unknown): CozyLayout {
  if (FORCE_PLAYROOM) return 'playroom';
  return raw === 'playroom' ? 'playroom' : 'classic';
}

// Starts from all-on and keeps only true/false values from the server.
export function resolveTiles(raw: unknown): PlayroomTiles {
  const tiles = { ...DEFAULT_TILES };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_TILES) as TileKey[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'boolean') tiles[key] = v;
    }
  }
  return tiles;
}

// ── The active Cozy month's layout, shared with the tab bar ─────────────────
// The tab bar shows a Keyhole icon in PlayRoom months. Whoever loads
// /cozy/home (the tab bar at launch, the Cozy screen on every load) reports
// the active month's layout here.

let activeLayout: CozyLayout = resolveLayout(undefined);
const listeners = new Set<(layout: CozyLayout) => void>();

export function setActiveCozyLayout(raw: unknown): void {
  const next = resolveLayout(raw);
  if (next === activeLayout) return;
  activeLayout = next;
  listeners.forEach((l) => l(next));
}

export function useActiveCozyLayout(): CozyLayout {
  const [layout, setLayout] = useState(activeLayout);
  useEffect(() => {
    setLayout(activeLayout);
    listeners.add(setLayout);
    return () => { listeners.delete(setLayout); };
  }, []);
  return layout;
}

// ── Link parameters for the Cozy pages a tile opens ─────────────────────────
// `month=previous` → last month (opened from the archive); otherwise this month.
// `title` → the tile's name, shown instead of the page's classic title.

export function cozyMonthKey(raw?: string | string[]): 'active' | 'previous' {
  return raw === 'previous' ? 'previous' : 'active';
}

export function titleParam(raw?: string | string[]): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw : undefined;
}

// "January" from "January 2027"; "" when unknown.
export function monthNameFromLabel(monthLabel?: string | null): string {
  return (monthLabel ?? '').trim().split(/\s+/)[0] ?? '';
}

export function newbiesLabel(monthLabel?: string | null): string {
  const name = monthNameFromLabel(monthLabel);
  return name ? `${name}'s Newbies` : "This Month's Newbies";
}
