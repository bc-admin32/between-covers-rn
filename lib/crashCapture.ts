// Crash capture. Loaded first from entry.js, before the router and the app.
//
// - JS errors: a global handler saves the error to a file synchronously, then
//   hands it to the previous handler (which may abort the app). The next
//   launch sends it as a client_error event (see sendPendingCrashReports in
//   lib/analytics.ts).
// - Native crashes leave no JS error, so voice mode also writes breadcrumbs:
//   one line per step, saved before the native call. If the app dies, the
//   last breadcrumb names the step that was running.
//
// Keep imports here small: anything imported runs before the handler exists.
import { File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import * as Application from 'expo-application';

const MAX_REPORTS = 5;
const MAX_BREADCRUMBS = 40;

export type CrashEntry = {
  at: string;
  isFatal: boolean;
  name: string;
  message: string;
  stack: string;
  cause: string;
  appVersion: string;
  buildNumber: string;
  breadcrumbs: string[];
};

const reportsFile = () => new File(Paths.document, 'bc-crash-reports.json');
const breadcrumbsFile = () => new File(Paths.document, 'bc-voice-breadcrumbs.json');

let breadcrumbs: string[] = [];
let trailId = 0;
let trailActive = false;

function readJson<T>(file: File, fallback: T): T {
  try {
    return file.exists ? (JSON.parse(file.textSync()) as T) : fallback;
  } catch {
    return fallback;
  }
}

function describeCause(cause: unknown): string {
  if (!cause || typeof cause !== 'object') return cause == null ? '' : String(cause);
  // React Native puts the Objective-C exception's name, reason and native
  // stack here when a native module call throws.
  const c = cause as { name?: unknown; message?: unknown; stackSymbols?: unknown };
  const symbols = Array.isArray(c.stackSymbols) ? c.stackSymbols.slice(0, 25).join('\n') : '';
  return [c.name, c.message, symbols].filter(Boolean).map(String).join('\n');
}

function saveError(error: unknown, isFatal: boolean): void {
  const err = (error ?? {}) as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown };
  const entry: CrashEntry = {
    at: new Date().toISOString(),
    isFatal,
    name: String(err.name ?? 'Error'),
    message: String(err.message ?? error).slice(0, 1000),
    stack: String(err.stack ?? '').slice(0, 4000),
    cause: describeCause(err.cause).slice(0, 4000),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildNumber: Application.nativeBuildVersion ?? 'unknown',
    breadcrumbs: [...breadcrumbs],
  };
  const file = reportsFile();
  const saved = readJson<CrashEntry[]>(file, []);
  file.write(JSON.stringify([...saved, entry].slice(-MAX_REPORTS)));
}

function install(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const capture = captureLoadError;
    try {
      // A captured load error is handled by the caller, so it isn't fatal.
      saveError(error, capture ? false : !!isFatal);
    } catch {
      // Never block the original handler.
    }
    if (capture) {
      capture(error);
      return;
    }
    previous?.(error, isFatal);
  });
}

type ErrorUtilsLike = {
  getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

let captureLoadError: ((error: unknown) => void) | null = null;

install();

// Runs a dynamic import() so that an error thrown while the module loads
// rejects the import instead of crashing the app.
//
// Why: when a module throws while it first loads, Metro reports the error to
// the global handler as fatal (which aborts a release build) and the import
// resolves to a module with no exports. React.lazy then fails with
// "resolves to: undefined", hiding the real error. In release builds Metro
// loads the module synchronously inside import(), so the handler can catch
// the error during that call and hand it back here. (In dev, bundles load
// asynchronously and this has no effect.)
export function importWithoutFatal<T extends { default?: unknown }>(load: () => Promise<T>): Promise<T> {
  let loadError: unknown = null;
  captureLoadError = (error) => {
    if (loadError === null) loadError = error;
  };
  let pending: Promise<T>;
  try {
    pending = load();
  } finally {
    captureLoadError = null;
  }
  return pending.then((mod) => {
    if (loadError !== null) throw loadError;
    if (mod?.default === undefined) throw new Error('Module loaded without a default export');
    return mod;
  });
}

// ── Voice breadcrumbs ──

// Starts a fresh trail. Called when voice mode opens.
export function startBreadcrumbs(step: string): void {
  trailId++;
  trailActive = true;
  breadcrumbs = [];
  breadcrumb(step);
}

// Id of the current trail, for endBreadcrumbs.
export function currentTrail(): number {
  return trailId;
}

// Records a step and saves the trail synchronously, so it survives a crash
// in the native call that follows. Does nothing outside voice mode.
export function breadcrumb(step: string): void {
  if (!trailActive) return;
  try {
    breadcrumbs = [...breadcrumbs, `${new Date().toISOString()} ${step}`].slice(-MAX_BREADCRUMBS);
    breadcrumbsFile().write(JSON.stringify(breadcrumbs));
  } catch {
    // Best effort.
  }
}

// The current trail (last MAX_BREADCRUMBS steps), for attaching to a report.
export function recentBreadcrumbs(): string[] {
  return [...breadcrumbs];
}

// Voice mode closed normally: drop the trail so the next launch doesn't
// report it. Ignored if a newer trail has started since.
export function endBreadcrumbs(trail: number): void {
  if (trail !== trailId) return;
  trailActive = false;
  breadcrumbs = [];
  try {
    const file = breadcrumbsFile();
    if (file.exists) file.delete();
  } catch {
    // Best effort.
  }
}

// ── Read and clear, for the next launch ──

export function readPendingCrashReports(): CrashEntry[] {
  return readJson<CrashEntry[]>(reportsFile(), []);
}

// A trail left on disk means the last voice session never closed: the app
// crashed or was killed while voice mode was on.
export function readUnfinishedBreadcrumbs(): string[] {
  return readJson<string[]>(breadcrumbsFile(), []);
}

export function clearPendingCrashReports(): void {
  try {
    const file = reportsFile();
    if (file.exists) file.delete();
  } catch {}
}

export function clearUnfinishedBreadcrumbs(): void {
  try {
    const file = breadcrumbsFile();
    if (file.exists) file.delete();
  } catch {}
}
