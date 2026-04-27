/**
 * Maps API route strings (e.g. "/home", "/door", "/onboarding/name")
 * to their corresponding expo-router file paths (e.g. "/(tabs)/home",
 * "/(auth)/door", "/(onboarding)/name").
 *
 * Falls back to "/(auth)/login" for any unknown path.
 */

const ONBOARDING_SLUGS = new Set([
  'about', 'acceptance', 'drinks', 'genre', 'legal',
  'location', 'name', 'snacks', 'spicy', 'welcome',
]);

const TAB_SLUGS = new Set([
  'home', 'cozy', 'library', 'lounge', 'profile',
]);

const AUTH_SLUGS = new Set([
  'login', 'door', 'hard-paywall', 'redirect',
]);

export function normalizeRoute(apiRoute: string): string {
  console.log('[normalizeRoute] IN:', apiRoute);

  const log = (out: string, branch: string) => {
    console.log(`[normalizeRoute] OUT: ${out}  (branch: ${branch})`);
    return out;
  };

  if (apiRoute.startsWith('/(') && apiRoute.includes(')/')) {
    return log(apiRoute, 'group-passthrough');
  }

  const queryIndex = apiRoute.indexOf('?');
  const pathPart   = queryIndex >= 0 ? apiRoute.slice(0, queryIndex) : apiRoute;
  const queryStr   = queryIndex >= 0 ? apiRoute.slice(queryIndex)   : '';

  const path     = pathPart.startsWith('/') ? pathPart.slice(1) : pathPart;
  const segments = path.split('/').filter(Boolean);
  const first    = segments[0];

  if (!first) return log('/(auth)/login', 'empty');

  if (TAB_SLUGS.has(first)) {
    const rest = segments.slice(1).join('/');
    const base = rest ? `/(tabs)/${first}/${rest}` : `/(tabs)/${first}`;
    return log(`${base}${queryStr}`, 'tab');
  }

  if (first === 'onboarding' && segments[1] && ONBOARDING_SLUGS.has(segments[1])) {
    return log(`/(onboarding)/${segments[1]}${queryStr}`, 'onboarding-prefixed');
  }
  if (ONBOARDING_SLUGS.has(first)) {
    return log(`/(onboarding)/${first}${queryStr}`, 'onboarding-bare');
  }

  if (AUTH_SLUGS.has(first)) {
    return log(`/(auth)/${first}${queryStr}`, 'auth');
  }

  if (first === 'auth') {
    return log('/(auth)/login', 'legacy-auth');
  }

  console.warn(`[normalizeRoute] UNKNOWN ROUTE "${apiRoute}" → fallback to login`);
  return log('/(auth)/login', 'fallback');
}