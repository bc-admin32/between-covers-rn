import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_PREFERENCES_KEY = 'bc_guest_preferences_v1';
const API_BASE = 'https://api.betweencovers.app';

export const SPICE_OPTIONS = [
  { key: 'NONE', label: '🫖 Clean & cozy' },
  { key: 'LIGHT', label: '😇 Keep it cute' },
  { key: 'WARM', label: '🍹 A little kick' },
  { key: 'HOT', label: "🥂 We're day drinking" },
  { key: 'VERY_HOT', label: '🥵 Absolutely unhinged' },
] as const;

export const TRIGGER_OPTIONS = [
  { key: 'cheating', label: '🚫 Cheating / Infidelity' },
  { key: 'abuse', label: '🖤 Emotional or physical abuse' },
  { key: 'mentalHealthTrauma', label: '🧠 Mental health trauma / self-harm' },
  { key: 'violence', label: '🩸 Violence or graphic injury' },
  { key: 'pregnancyLoss', label: '👶 Pregnancy loss / fertility struggle' },
  { key: 'addiction', label: '🧪 Drug or addiction themes' },
  { key: 'heavyHeartbreak', label: '😢 Heavy emotional heartbreak' },
  { key: 'illness', label: '😰 Illness or injury' },
] as const;

export type SpiceLevel = (typeof SPICE_OPTIONS)[number]['key'];
export type ComfortBoundary = (typeof TRIGGER_OPTIONS)[number]['key'];

export type GuestPreferences = {
  spiceLevel: SpiceLevel | null;
  comfortBoundaries: ComfortBoundary[];
};

const SPICE_LEVELS = new Set<string>(SPICE_OPTIONS.map(({ key }) => key));
const COMFORT_BOUNDARIES = new Set<string>(TRIGGER_OPTIONS.map(({ key }) => key));

export async function getGuestPreferences(): Promise<GuestPreferences | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(GUEST_PREFERENCES_KEY);
  } catch (error) {
    console.warn('[guest-preferences] failed to read saved preferences', error);
    return null;
  }
  if (!raw) return null;

  try {
    const value = JSON.parse(raw);
    const spiceLevel = SPICE_LEVELS.has(value?.spiceLevel) ? value.spiceLevel as SpiceLevel : null;
    const comfortBoundaries = Array.isArray(value?.comfortBoundaries)
      ? value.comfortBoundaries.filter(
          (key: unknown): key is ComfortBoundary =>
            typeof key === 'string' && COMFORT_BOUNDARIES.has(key),
        )
      : [];
    if (!spiceLevel && comfortBoundaries.length === 0) return null;
    return { spiceLevel, comfortBoundaries };
  } catch (error) {
    console.warn('[guest-preferences] failed to parse saved preferences', error);
    return null;
  }
}

export async function saveGuestPreferences(preferences: GuestPreferences): Promise<void> {
  if (!preferences.spiceLevel && preferences.comfortBoundaries.length === 0) {
    await AsyncStorage.removeItem(GUEST_PREFERENCES_KEY);
    return;
  }
  await AsyncStorage.setItem(GUEST_PREFERENCES_KEY, JSON.stringify(preferences));
}

function encodeBase64UrlAscii(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let encoded = '';
  for (let i = 0; i < value.length; i += 3) {
    const first = value.charCodeAt(i);
    const second = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
    const third = i + 2 < value.length ? value.charCodeAt(i + 2) : 0;
    if (first > 0x7f || second > 0x7f || third > 0x7f) {
      throw new Error('Guest preference header values must be ASCII');
    }
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 0x03) << 4) | (second >> 4)];
    if (i + 1 < value.length) encoded += alphabet[((second & 0x0f) << 2) | (third >> 6)];
    if (i + 2 < value.length) encoded += alphabet[third & 0x3f];
  }
  return encoded;
}

export async function getGuestPreferencesHeader(): Promise<string | null> {
  const preferences = await getGuestPreferences();
  if (!preferences) return null;
  return encodeBase64UrlAscii(JSON.stringify(preferences));
}

function hasNonEmptyAccountPreference(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') {
    return Object.values(value).some(Boolean);
  }
  return false;
}

export async function carryGuestPreferencesToAccount(idToken: string): Promise<void> {
  const guestPreferences = await getGuestPreferences();
  if (!guestPreferences) return;

  const headers = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
  const profileResponse = await fetch(`${API_BASE}/profile`, { headers });
  if (!profileResponse.ok) {
    throw new Error(`Could not load account preferences (HTTP ${profileResponse.status})`);
  }
  const profile = await profileResponse.json();
  const updates: Record<string, unknown> = {};

  if (!hasNonEmptyAccountPreference(profile?.spiceLevel) && guestPreferences.spiceLevel) {
    updates.spiceLevel = guestPreferences.spiceLevel;
  }
  if (
    !hasNonEmptyAccountPreference(profile?.comfortBoundaries) &&
    guestPreferences.comfortBoundaries.length > 0
  ) {
    updates.comfortBoundaries = Object.fromEntries(
      guestPreferences.comfortBoundaries.map((key) => [key, true]),
    );
  }
  if (Object.keys(updates).length === 0) return;

  const updateResponse = await fetch(`${API_BASE}/profile`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  if (!updateResponse.ok) {
    throw new Error(`Could not save guest preferences to account (HTTP ${updateResponse.status})`);
  }
}
