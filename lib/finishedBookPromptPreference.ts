import * as SecureStore from 'expo-secure-store';

// Local-only preference: whether TagBookModal auto-opens when a book is
// marked Finished. Mirrors the storage pattern already used for the
// biometric-login preference (SecureStore.getItemAsync/setItemAsync with a
// 'true'/'false' string, read on demand rather than cached) — see
// app/(tabs)/profile/account/index.tsx's bc_biometric_enabled usage.
//
// Local-only, not backend-synced: the biometric preference also PATCHes
// /profile so it persists across devices/reinstalls; doing the same here
// would need a new backend-accepted /profile field, which doesn't exist yet.
// Flagging as a deliberate scope decision, not an oversight — this defaults
// to enabled (auto-prompt shows) unless explicitly turned off on THIS device.
const KEY = 'bc_finished_book_prompt_enabled';

export async function getFinishedBookPromptEnabled(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    return stored !== 'false';
  } catch {
    return true;
  }
}

export async function setFinishedBookPromptEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, enabled ? 'true' : 'false');
  } catch {
    // Best-effort — a failed write just means the prompt keeps showing.
  }
}
