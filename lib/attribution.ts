import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'bc_acquisition_attribution';
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type AttributionType = 'paid' | 'referral' | 'direct';
type Attribution = { type: AttributionType; campaign?: string; capturedAt: number };

const VALID_TYPES: AttributionType[] = ['paid', 'referral', 'direct'];

export async function captureFromUrl(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const parsed = new URL(url);
    const type = parsed.searchParams.get('type') as AttributionType | null;
    const campaign = parsed.searchParams.get('campaign') || undefined;
    if (!type || !VALID_TYPES.includes(type)) return;
    const existingRaw = await AsyncStorage.getItem(KEY);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as Attribution;
      if (Date.now() - existing.capturedAt < WINDOW_MS) return; // first-touch
    }
    await AsyncStorage.setItem(KEY, JSON.stringify({ type, campaign, capturedAt: Date.now() }));
  } catch {}
}

export async function getAttribution(): Promise<Attribution | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (Date.now() - parsed.capturedAt > WINDOW_MS) return null;
    return parsed;
  } catch { return null; }
}

export async function clearAttribution(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
