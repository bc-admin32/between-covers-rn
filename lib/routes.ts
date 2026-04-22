/**
 * Maps web-style API route strings (e.g. "/home", "/onboarding/name")
 * to their correct expo-router paths (e.g. "/(tabs)/home", "/(onboarding)/name").
 * Falls back to "/(auth)/login" for any unknown path.
 */
const ONBOARDING_SLUGS = new Set([
  'about', 'acceptance', 'drinks', 'genre', 'legal',
  'location', 'name', 'snacks', 'spicy', 'welcome',
]);
const TAB_SLUGS = new Set(['home', 'cozy', 'library', 'lounge', 'profile']);
export function normalizeRoute(apiRoute: string): string {
  // Handle expo-router group paths like "/(auth)/paywall" — pass through unchanged
  if (apiRoute.startsWith('/(') && apiRoute.includes(')/')) {
    return apiRoute;
  }
  const path = apiRoute.startsWith('/') ? apiRoute.slice(1) : apiRoute;
  const segments = path.split('/').filter(Boolean);
  const first = segments[0];
  if (!first) return '/(auth)/login';
  if (TAB_SLUGS.has(first)) {
    const rest = segments.slice(1).join('/');
    return rest ? `/(tabs)/${first}/${rest}` : `/(tabs)/${first}`;
  }
  if (first === 'onboarding' && segments[1] && ONBOARDING_SLUGS.has(segments[1])) {
    return `/(onboarding)/${segments[1]}`;
  }
  if (ONBOARDING_SLUGS.has(first)) {
    return `/(onboarding)/${first}`;
  }
  if (first === 'login' || first === 'auth') {
    return '/(auth)/login';
  }
  return '/(auth)/login';
}