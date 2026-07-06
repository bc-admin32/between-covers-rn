/**
 * TEMPORARY DEBUG INSTRUMENTATION — remove once the Amazon PurchasingListener
 * stack trace is captured.
 *
 * Captures IAP errors (message + name + code + FULL stack + context + resolved
 * store) into a module-level observable so <IapDebugBanner /> can render the
 * complete trace on-device for screenshotting. Ships JS-only via `eas update`
 * (no native rebuild). Every instrumented call site RE-THROWS after recording,
 * so runtime behavior is identical except for the visible banner.
 */
import { getResolvedPlatform } from './iap-shim';

export type CapturedIapError = {
  context: string;
  store: string;
  name: string;
  code: string;
  message: string;
  stack: string;
  at: number;
};

type Listener = (err: CapturedIapError | null) => void;

let current: CapturedIapError | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(current);
}

/** Subscribe to captured-error changes. Returns an unsubscribe fn. */
export function subscribeIapError(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLatestIapError(): CapturedIapError | null {
  return current;
}

export function clearIapError(): void {
  current = null;
  emit();
}

/**
 * Stringify and store an IAP error. Never throws on its own (a debug tool must
 * not create new failures), and also console.error's under the [IAP_DEBUG] tag
 * so it's greppable in logcat.
 */
export function recordIapError(context: string, err: unknown): void {
  let store = 'unknown';
  try {
    store = getResolvedPlatform();
  } catch {
    // getResolvedPlatform reads a native constant; ignore if unavailable.
  }

  const anyErr = err as any;
  const name = String(anyErr?.name ?? (err && typeof err === 'object' ? 'Error' : typeof err));
  const code = String(anyErr?.code ?? '');
  const message = String(anyErr?.message ?? anyErr ?? '');
  const stack = String(anyErr?.stack ?? '(no stack available)');

  current = { context, store, name, code, message, stack, at: Date.now() };

  // Greppable log line in case a logcat tool is available.
  // eslint-disable-next-line no-console
  console.error('[IAP_DEBUG]', context, `store=${store}`, `code=${code}`, message, '\n', stack);

  emit();
}
