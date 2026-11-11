import { useCallback } from 'react';
import { StatusBar } from 'react-native';
import { useFocusEffect } from 'expo-router';

// The app-wide status bar has light icons (app/_layout.tsx), for its dark
// screens. Light pages call this so the icons turn dark while the page is on
// screen; the app-wide setting comes back when it loses focus (tab switch,
// pushed screen, back) or when `enabled` turns false (e.g. while a dark
// overlay is up). On Android the app is edge-to-edge, so the bar is always
// transparent over the page and only the icon color changes.
export function useDarkStatusBarWhileFocused(enabled = true): void {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const entry = StatusBar.pushStackEntry({ barStyle: 'dark-content', animated: true });
      return () => StatusBar.popStackEntry(entry);
    }, [enabled])
  );
}
