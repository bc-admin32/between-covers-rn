// Inactive tab icons are dark (#6A5550) on the app's light pages. Screens with
// a dark background call useLightTabIconsWhileFocused() so the icons turn
// light while that screen is on screen, and go back to dark when it isn't
// (tab switch, pushed screen, back navigation).
import { useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';

// How many focused screens are asking for light icons. A count, not a flag,
// so the order of one screen's blur and the next one's focus doesn't matter.
let lightRequests = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function update(delta: number) {
  lightRequests += delta;
  listeners.forEach((l) => l());
}

export function useLightTabIconsWhileFocused(): void {
  useFocusEffect(
    useCallback(() => {
      update(1);
      return () => update(-1);
    }, [])
  );
}

export function useLightTabIcons(): boolean {
  return useSyncExternalStore(subscribe, () => lightRequests > 0);
}
