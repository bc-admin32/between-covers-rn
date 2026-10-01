import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { hasSession } from './api';
import { setReturnTo } from './guest';

// Why the guest is being asked to sign up — keys the copy on the login screen.
export type GateReason =
  | 'reply' | 'react' | 'vote' | 'submit' | 'report' | 'block'
  | 'iris' | 'live' | 'rate' | 'profile' | 'submission' | 'feedback' | 'library'
  | 'expired';

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

  const requireAccount = useCallback((reason: GateReason, returnTo?: string): boolean => {
    if (isGuest !== true) return false;
    const href = returnTo ?? currentHref(pathname, params);
    setReturnTo(href).finally(() => {
      router.push(`/(auth)/login?gate=${reason}` as any);
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
export function useGuestRedirect(reason: GateReason): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { isGuest } = useGuest();

  useEffect(() => {
    if (isGuest !== true) return;
    setReturnTo(currentHref(pathname, params)).finally(() => {
      router.replace(`/(auth)/login?gate=${reason}` as any);
    });
    // Run once when guest status resolves; pathname/params are the entry URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

  return isGuest !== false;
}
