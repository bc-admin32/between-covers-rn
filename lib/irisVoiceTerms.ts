import Constants from 'expo-constants';
import { apiGet, apiPost } from './api';

// Must match IRIS_VOICE_TERMS_VERSION on the backend (bcAcceptLegal and
// irisVoice). The server sets the stored version on accept; we only compare.
export const CURRENT_IRIS_VOICE_TERMS_VERSION = '1';

// In-memory copy of the profile's voice-terms field, kept for the app
// session. Read once from GET /profile, then updated locally on accept (or on a
// VOICE_TERMS_REQUIRED 403) so the sheet never reappears in the same session.
let acceptedVersionCache: string | null | undefined; // undefined = not loaded yet

export async function needsIrisVoiceTerms(): Promise<boolean> {
  if (acceptedVersionCache === undefined) {
    const profile = await apiGet<{ voiceTermsAcceptedVersion?: string | null }>('/profile');
    acceptedVersionCache = profile?.voiceTermsAcceptedVersion ?? null;
  }
  return String(acceptedVersionCache ?? '') !== CURRENT_IRIS_VOICE_TERMS_VERSION;
}

export async function acceptIrisVoiceTerms(): Promise<void> {
  const res = await apiPost<{ result?: string; voiceTermsVersion?: string }>('/legal/accept', {
    context: 'voice',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
  });
  acceptedVersionCache = res?.voiceTermsVersion ?? CURRENT_IRIS_VOICE_TERMS_VERSION;
}

// The server says terms are missing or outdated (403 VOICE_TERMS_REQUIRED).
export function markIrisVoiceTermsRequired(): void {
  acceptedVersionCache = null;
}
