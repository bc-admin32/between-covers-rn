import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { hasSession } from './api';
import { setReturnTo } from './guest';

// Why the guest is being asked to sign up — keys the copy on the login screen.
export type GateReason =
  | 'reply' | 'react' | 'vote' | 'submit' | 'report' | 'block'
  | 'iris' | 'live' | 'rate' | 'profile' | 'submission' | 'feedback' | 'library'
  | 'expired';

// signup_started.source on the login screen: which gated action sent the
// guest there. Finer-grained than GateReason (which only picks login copy);
// defaults to the reason when a call site doesn't pass one.
export type SignupSource =
  | 'lounge_react' | 'lounge_reply' | 'poll_vote' | 'confession' | 'monthly_submit'
  | 'lounge_report' | 'iris_send' | 'live_watch' | 'live_rsvp' | 'cozy_rate'
  | 'book_rate' | 'cozy_event' | 'profile' | 'submissions' | 'feedback' | 'library';

// Last known session state, shared across hook instances so a newly mounted
// screen doesn't start from "unknown". Refreshed on every mount.
let lastKnownGuest: boolean | null = null;

export function setSessionKnown(signedIn: boolean) {
  lastKnownGuest = !signedIn;
}

function currentHref(pathname: string, params: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.append(key, value);
  }
  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// isGuest is null until the stored token has been checked. requireAccount()
// returns true (and opens sign-up, remembering where to come back to) when the
// user is a guest; call sites bail on true:
//   if (requireAccount('reply')) return;
export function useGuest() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const [isGuest, setIsGuest] = useState<boolean | null>(lastKnownGuest);

  useEffect(() => {
    let cancelled = false;
    hasSession().then((signedIn) => {
      lastKnownGuest = !signedIn;
      if (!cancelled) setIsGuest(!signedIn);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const requireAccount = useCallback((
    reason: GateReason,
    opts: { returnTo?: string; source?: SignupSource } = {},
  ): boolean => {
    if (isGuest !== true) return false;
    const href = opts.returnTo ?? currentHref(pathname, params);
    const source = opts.source ?? reason;
    setReturnTo(href).finally(() => {
      router.push(`/(auth)/login?gate=${reason}&source=${source}` as any);
    });
    return true;
  }, [isGuest, pathname, params, router]);

  return { isGuest, requireAccount };
}

// For screens a guest can only reach by deep link / notification (live event,
// profile, submissions): swap the screen for sign-up instead of letting its
// authenticated calls fire. Uses replace (not push) so "Not now" on login goes
// back to wherever the guest came from rather than re-entering this gate.
// Returns true while the screen must not render (session unknown, or guest).
export function useGuestRedirect(reason: GateReason, source: SignupSource | GateReason = reason): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { isGuest } = useGuest();

  useEffect(() => {
    if (isGuest !== true) return;
    setReturnTo(currentHref(pathname, params)).finally(() => {
      router.replace(`/(auth)/login?gate=${reason}&source=${source}` as any);
    });
    // Run once when guest status resolves; pathname/params are the entry URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

  return isGuest !== false;
}
