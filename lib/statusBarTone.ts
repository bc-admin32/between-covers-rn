import { useCallback } from 'react';
import { StatusBar } from 'react-native';
import { useFocusEffect } from 'expo-router';

// The app-wide status bar has dark icons (app/_layout.tsx), since most
// screens are light. Dark screens (the PlayRoom home, the PlayRoom rooms'
// plum strip, the Confessions, the book page's navy top, the paywall) call
// this so the icons turn light while the screen is on screen; the app-wide
// setting comes back when it loses focus (tab switch, pushed screen, back)
// or when `enabled` turns false. On Android the app is edge-to-edge, so the
// bar is always transparent over the page and only the icon color changes.
export function useLightStatusBarWhileFocused(enabled = true): void {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const entry = StatusBar.pushStackEntry({ barStyle: 'light-content', animated: true });
      return () => StatusBar.popStackEntry(entry);
    }, [enabled])
  );
}
