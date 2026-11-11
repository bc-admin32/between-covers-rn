import { useEffect, useState, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiGet } from './api';

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

// ── The live month's layout: the one switch every screen reads ──────────────
// Cozy home, the archive, the Lounge, the tab icon, the tile pages and the
// Confessions title all render from useActiveCozyLayout(). Every fetch of the
// live month reports here (/cozy/home and /lounge/resolve `active.layout`), so
// whichever screen refreshed last switches all of them together. The value is
// saved, so the next launch starts from it.

const LAYOUT_KEY = 'bc_live_layout';
// The Cozy screen's saved /cozy/home payload: the fallback on the first launch
// after this update, before LAYOUT_KEY exists.
const COZY_CACHE_KEY = 'bc_cozy_cache_v2';

let activeLayout: CozyLayout = resolveLayout(undefined);
let savedLayout: CozyLayout | null = null;
// Set once the server has answered this launch; saved copies never override it.
let haveServerValue = false;
const listeners = new Set<(layout: CozyLayout) => void>();

function apply(next: CozyLayout): void {
  if (next === activeLayout) return;
  activeLayout = next;
  listeners.forEach((l) => l(next));
}

// True when a live-month payload actually carries a `layout` field. Callers
// only report a layout when it does: a response that leaves the field out
// (an older endpoint or mirror) keeps the current value instead of flipping
// every screen to Classic.
export function hasLayoutField(active: unknown): active is { layout: unknown } {
  return !!active && typeof active === 'object' && 'layout' in active;
}

// The server's value, from any fetch of the live month.
export function setActiveCozyLayout(raw: unknown): void {
  haveServerValue = true;
  const next = resolveLayout(raw);
  if (next !== savedLayout) {
    savedLayout = next;
    SecureStore.setItemAsync(LAYOUT_KEY, next).catch(() => {});
  }
  apply(next);
}

// A saved copy (at launch): used only until the server answers.
export function setSavedCozyLayout(raw: unknown): void {
  if (!haveServerValue) apply(resolveLayout(raw));
}

export async function loadSavedCozyLayout(): Promise<void> {
  try {
    const saved = await SecureStore.getItemAsync(LAYOUT_KEY);
    if (saved) {
      savedLayout = resolveLayout(saved);
      setSavedCozyLayout(saved);
      return;
    }
    const cozy = await SecureStore.getItemAsync(COZY_CACHE_KEY);
    const active = cozy ? JSON.parse(cozy)?.active : null;
    if (hasLayoutField(active)) setSavedCozyLayout(active.layout);
  } catch {}
}

// Fetches the live month's layout (at launch and when the app comes back).
// Calls made while one is running share it.
let inFlight: Promise<void> | null = null;
export function refreshActiveCozyLayout(): Promise<void> {
  if (!inFlight) {
    inFlight = apiGet<{ active?: { layout?: string } }>('/cozy/home')
      .then((res) => {
        setMonthThemes(res);
        if (hasLayoutField(res?.active)) setActiveCozyLayout(res.active.layout);
      })
      .catch(() => {})
      .finally(() => { inFlight = null; });
  }
  return inFlight;
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

// ── The month's name and theme, for the PlayRoom room headers ──────────────
// Kept from every /cozy/home response the app already makes (launch,
// foreground, the Cozy tab, the rooms), for this month and last month.

export type MonthTheme = { monthLabel?: string; themeTitle?: string };
let monthThemes: { active?: MonthTheme; previous?: MonthTheme } = {};
const themeListeners = new Set<() => void>();

function pickTheme(m: unknown): MonthTheme | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const month = m as { monthLabel?: unknown; theme?: { title?: unknown } | null };
  return {
    monthLabel: typeof month.monthLabel === 'string' ? month.monthLabel : undefined,
    themeTitle: typeof month.theme?.title === 'string' ? month.theme.title : undefined,
  };
}

export function setMonthThemes(res: unknown): void {
  const r = (res ?? {}) as { active?: unknown; previous?: unknown };
  monthThemes = {
    active: pickTheme(r.active) ?? monthThemes.active,
    previous: pickTheme(r.previous) ?? monthThemes.previous,
  };
  themeListeners.forEach((l) => l());
}

function subscribeThemes(listener: () => void) {
  themeListeners.add(listener);
  return () => { themeListeners.delete(listener); };
}

export function useMonthTheme(key: 'active' | 'previous'): MonthTheme | undefined {
  const value = useSyncExternalStore(subscribeThemes, () => monthThemes[key]);
  // Nothing kept yet (e.g. a room opened before Cozy): fetch /cozy/home once.
  useEffect(() => { if (!monthThemes[key]) refreshActiveCozyLayout(); }, [key]);
  return value;
}

// ── Link parameter for the Cozy pages a tile opens ──────────────────────────
// `month=previous` → last month (opened from the archive); otherwise this month.
// The pages' PlayRoom names and look come from the live layout, not the link.

export function cozyMonthKey(raw?: string | string[]): 'active' | 'previous' {
  return raw === 'previous' ? 'previous' : 'active';
}

// "January" from "January 2027"; "" when unknown.
export function monthNameFromLabel(monthLabel?: string | null): string {
  return (monthLabel ?? '').trim().split(/\s+/)[0] ?? '';
}

export function newbiesLabel(monthLabel?: string | null): string {
  const name = monthNameFromLabel(monthLabel);
  return name ? `${name}'s Newbies` : "This Month's Newbies";
}
