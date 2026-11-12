/**
 * Maps API route strings (e.g. "/home", "/hard-paywall", "/onboarding/name")
 * to their corresponding expo-router file paths (e.g. "/(tabs)/home",
 * "/(auth)/hard-paywall", "/(onboarding)/name").
 *
 * "/door" (the retired soft paywall) goes to the hard paywall. Falls back to
 * "/(auth)/login" for any other unknown path.
 */

const ONBOARDING_SLUGS = new Set([
  'acceptance', 'legal', 'name', 'welcome',
]);

// Removed onboarding steps: a stray route to one lands on the final step,
// the name + genres form.
const REMOVED_ONBOARDING_SLUGS = new Set([
  'about', 'drinks', 'genre', 'location', 'snacks', 'spicy',
]);

const TAB_SLUGS = new Set([
  'home', 'cozy', 'library', 'lounge', 'profile',
]);

const AUTH_SLUGS = new Set([
  'login', 'hard-paywall', 'redirect', 'age-gate',
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

  const onboardingSlug = first === 'onboarding' ? segments[1] : first;
  if (onboardingSlug && REMOVED_ONBOARDING_SLUGS.has(onboardingSlug)) {
    return log('/(onboarding)/name', 'onboarding-removed');
  }

  if (first === 'door') {
    return log('/(auth)/hard-paywall', 'door');
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