# Subscription / Entitlement Investigation (client-side)

Repo: `between-covers-rn` · branch `supabase-auth-fix` · investigation only, **no code changed**.

**Bug:** On Android, after an app update the app shows the user as *unsubscribed*
even though Google Play holds an active subscription. Repurchase is blocked
("already subscribed"/`E_ALREADY_OWNED`) and restore does nothing / errors.

**Scope:** Client only. The backend (`api.betweencovers.app`, AWS Lambda, not in
this repo) is documented as "what the client sends / expects back" — no backend
behavior is assumed or invented. IAP lib is `react-native-iap@12.16.4` (+ patch).

---

## TL;DR — single most likely cause

**Entitlement is read *exclusively* from the backend (`POST /auth/resolve`) on
every launch, but the only client→backend path that ever records a Google
purchase is a fragile, fire-and-forget `POST /subscription/write` at purchase
time** — run *after* `finishTransaction`, **not awaited**, with errors swallowed
(`.catch(console.warn)`), and **it never sends the Google `purchaseToken`**.
There is **no launch-time or restore-time reconciliation** that pushes Google's
*current* entitlement to the backend. So if the backend `Users` record is ever
missing/stale (e.g. that one write failed silently, or trial converted
server-side), an app update — which starts a fresh process and re-asks the
backend — surfaces it as "unsubscribed," and **no client path can self-heal**:
restore validates against Google but then just calls `/auth/resolve` (the same
stale backend) without writing the verified purchase back. Google still owns the
sub, so repurchase is rejected.

In short: the launch entitlement check is correctly backend-authoritative, but
the *write path that feeds that backend* is one-shot, unverified, and
unrecoverable.

---

## 1. Data-flow summary

```
PURCHASE (door.tsx / hard-paywall.tsx, identical):
  requestPurchase(skus)                        [iap-shim → react-native-iap]
    → purchase surfaces as useIAP().currentPurchase
    → finishTransaction(purchase)              ← ACKED TO GOOGLE FIRST  (door:69)
    → POST /subscription/write {productId, transactionId, platform, date}
         • fire-and-forget: NOT awaited for success, .catch(console.warn)  (door:79)
         • purchaseToken NOT included
    → POST /auth/resolve → nextRoute → navigate                          (door:99)

LAUNCH (index.tsx):
  read bc_id_token (SecureStore)               ← local gate only
    → POST /auth/resolve {Bearer idToken} → nextRoute → navigate         (index:38)
    NO getAvailablePurchases, NO device entitlement check at launch.

RESTORE (door.tsx / hard-paywall.tsx):
  getAvailablePurchases()                       [iap-shim realRestorePurchases]
    → find product in ALL_PRODUCT_IDS
    → if found: POST /auth/resolve → nextRoute → navigate                (door:172)
         • DOES NOT write the restored purchase to the backend
    → if not found / throws: "No active subscription found." / "Restore failed."

ENTITLEMENT READ:
  Navigation gate  = backend nextRoute from /auth/resolve  (authoritative)
  Submissions gate = client isEntitled(profile) off GET /profile (+ 403 fallback)
```

The **source of truth for "subscribed vs not" is the backend `/auth/resolve`
response** (a `nextRoute` string the client follows: e.g. `/(auth)/door`,
`/(auth)/hard-paywall`, or `/(tabs)`). The device's IAP state is used **only**
inside the purchase and restore handlers — never to decide entitlement at launch.

---

## 2. Where entitlement is set / stored / restored

| Concern | Mechanism | File:line |
|---|---|---|
| **Launch entitlement check** | `POST /auth/resolve` (Bearer id token) → follow `nextRoute` | [app/index.tsx:37-51](app/index.tsx#L37) |
| Local gate before that call | reads `bc_id_token` from SecureStore; absent/invalid → login | [app/index.tsx:33-37](app/index.tsx#L33) |
| Post-login entitlement check | `POST /auth/resolve` → `nextRoute` | [app/(auth)/redirect.tsx:87-111](app/(auth)/redirect.tsx#L87) |
| Post-login (sibling/session) | `resolveFromSession()` → `POST /auth/resolve` | [app/(auth)/redirect.tsx:48-55](app/(auth)/redirect.tsx#L48) |
| Biometric re-entry check | `POST /auth/resolve` | [app/(auth)/login.tsx:72-79](app/(auth)/login.tsx#L72) |
| **Purchase → backend write** | `POST /subscription/write` (fire-and-forget, no token) | [door.tsx:79-93](app/(auth)/door.tsx#L79) · [hard-paywall.tsx:78-92](app/(auth)/hard-paywall.tsx#L78) |
| Acknowledge to store | `finishTransaction()` **before** the write | [door.tsx:69](app/(auth)/door.tsx#L69) · [hard-paywall.tsx:68](app/(auth)/hard-paywall.tsx#L68) |
| Post-purchase re-check | `POST /auth/resolve` → `nextRoute` | [door.tsx:99-110](app/(auth)/door.tsx#L99) · [hard-paywall.tsx:98-109](app/(auth)/hard-paywall.tsx#L98) |
| **Restore (device read)** | `getAvailablePurchases()` | [iap-shim.ts:263-270](lib/iap-shim.ts#L263) ← [door.tsx:166](app/(auth)/door.tsx#L166) · [hard-paywall.tsx:164](app/(auth)/hard-paywall.tsx#L164) |
| Restore → entitlement | `POST /auth/resolve` only — **no `/subscription/write`** | [door.tsx:172-187](app/(auth)/door.tsx#L172) · [hard-paywall.tsx:170-185](app/(auth)/hard-paywall.tsx#L170) |
| Submissions gate (client-derived) | `isEntitled(profile)` off `GET /profile`, "optimistic" | [app/submissions/[type].tsx:40-46](app/submissions/[type].tsx#L40), [104-112](app/submissions/[type].tsx#L104) |
| Submissions gate (backend) | `403` from submit → show soft-block | [app/submissions/[type].tsx:285-287](app/submissions/[type].tsx#L285) |
| Profile cache (NOT entitlement) | `bc_profile_cache` written from `/profile` (used for day-6 only) | [app/(tabs)/profile/index.tsx:76](app/(tabs)/profile/index.tsx#L76) |

---

## 3. Section-by-section findings

### 1. IAP setup
- **Import / connection:** react-native-iap is loaded lazily in the shim
  [lib/iap-shim.ts:139-142](lib/iap-shim.ts#L139) (`require('react-native-iap')`).
  Connection is managed by `useIAP()` (the lib's hook) via `withIAPContext`
  ([iap-shim.ts:144](lib/iap-shim.ts#L144)); `withIAPContext` wraps the root in
  [app/_layout.tsx:169](app/_layout.tsx#L169) (`export default withIAPContext(RootLayout)`).
  There is **no explicit `initConnection()` call** in app code — it's the hook's
  responsibility; screens read `connected` ([door.tsx:29,55](app/(auth)/door.tsx#L55)).
- **Patch** (`patches/react-native-iap+12.16.4.patch`): two changes, both native,
  **neither touches purchase/entitlement logic**:
  1. iOS podspec: removes `s.dependency "RCT-Folly"` (build fix).
  2. Android `RNIapModule.kt`: `currentActivity` → `getCurrentActivity()` in the
     subscription-request path (null-activity crash fix).
- **Product IDs / SKUs:** `com.betweencovers.app.membership.monthly` and
  `…annual`, defined in [door.tsx:19-21](app/(auth)/door.tsx#L19) and
  [hard-paywall.tsx:18-20](app/(auth)/hard-paywall.tsx#L18) (duplicated), and in
  the Expo Go stub [iap-shim.ts:107-108](lib/iap-shim.ts#L107).

### 2. Purchase flow
- `requestPurchase` called from `handlePurchase` ([door.tsx:147](app/(auth)/door.tsx#L147),
  [hard-paywall.tsx:145](app/(auth)/hard-paywall.tsx#L145)); shim routes per platform,
  Android building `subscriptionOffers:[{sku, offerToken}]` ([iap-shim.ts:210-239](lib/iap-shim.ts#L210)).
- **Result handling is via `useIAP().currentPurchase` / `currentPurchaseError`**
  (the lib's `purchaseUpdated`/`purchaseError` listeners surface through the hook),
  consumed by the `useEffect`s at [door.tsx:61-133](app/(auth)/door.tsx#L61). There are
  **no explicit `purchaseUpdatedListener`/`purchaseErrorListener`** in app code.
- **Acknowledge / finish:** `finishTransaction({isConsumable:false})` is called
  **first** in the confirm effect ([door.tsx:69](app/(auth)/door.tsx#L69)) — i.e. the
  purchase is acknowledged to Google **before** any backend call and **regardless
  of backend success**.
- **Backend write:** `POST /subscription/write` ([door.tsx:79](app/(auth)/door.tsx#L79))
  with `{productId, transactionId, platform, originalPurchaseDate}`. ⚠️ It is
  **not awaited for success** (the `fetch(...).catch(console.warn)` is awaited only
  as far as the network promise; failures are swallowed and flow continues), and
  ⚠️ **the Google `purchaseToken` is never sent** — only `transactionId` (which on
  Play Billing v5 is often the orderId and can be empty). The client does **not**
  wait for backend confirmation before `finishTransaction` (finish already ran).

### 3. Entitlement source of truth (key question)
- **On cold start: backend only.** [index.tsx:37-51](app/index.tsx#L37) reads
  `bc_id_token` then `POST /auth/resolve` and follows `nextRoute`. **No
  `getAvailablePurchases()`, no device check, no persisted subscription flag** is
  consulted to decide entitlement.
- The only persisted local state involved at launch is **`bc_id_token`** (auth,
  SecureStore) — a gate to *make* the call, not an entitlement value.
- A **second, independent** entitlement derivation exists client-side in the
  submissions screen: `isEntitled(profile)` over `GET /profile`
  ([submissions/[type].tsx:40-46](app/submissions/[type].tsx#L40)), gated
  "optimistically" (only blocks on an explicit non-entitled signal,
  [:110-112](app/submissions/[type].tsx#L110)), with a `403` backend fallback
  ([:285-287](app/submissions/[type].tsx#L285)).
- **Nothing persists subscription state across launches as a source of truth.**
  `bc_profile_cache` holds `subscriptionStatus` but is read only for the day-6
  reminder, not for entitlement/gating.

### 4. Backend calls (subscription / entitlement / trial / staff)
| Endpoint | Method | Payload (client→) | Response consumed | Trigger | File:line |
|---|---|---|---|---|---|
| `/auth/resolve` | POST | `Authorization: Bearer <idToken>` (no body) | `{ nextRoute }` (route string) | launch, post-login, biometric, post-purchase, post-restore | [index.tsx:38](app/index.tsx#L38), [redirect.tsx:87](app/(auth)/redirect.tsx#L87),[:48](app/(auth)/redirect.tsx#L48), [login.tsx:72](app/(auth)/login.tsx#L72), [door.tsx:99](app/(auth)/door.tsx#L99),[:172](app/(auth)/door.tsx#L172), [hard-paywall.tsx:98](app/(auth)/hard-paywall.tsx#L98),[:170](app/(auth)/hard-paywall.tsx#L170) |
| `/subscription/write` | POST | `{productId, transactionId, platform, originalPurchaseDate}` | (ignored; fire-and-forget) | after a purchase finishes | [door.tsx:79](app/(auth)/door.tsx#L79), [hard-paywall.tsx:78](app/(auth)/hard-paywall.tsx#L78) |
| `/profile` | GET | `Authorization: Bearer` | `{subscriptionStatus, subscriptionEndDate, isStaff, …}` | submissions gate; profile screen (caches) | [submissions/[type].tsx:106](app/submissions/[type].tsx#L106), [profile/index.tsx:74](app/(tabs)/profile/index.tsx#L74) |
| `/auth/resolve` (resolve route) | POST | Bearer | `{nextRoute}` (used to detect deactivation in redirect) | redirect resolve | [redirect.tsx:87-107](app/(auth)/redirect.tsx#L87) |

There is **no** `/restore` endpoint, **no** entitlement/"me" endpoint beyond
`/profile`, and **no** call that sends the `purchaseToken` for server-side Play
verification. The trial reminder/lifecycle is backend-owned (not a client call).

### 5. Restore flow
- Triggered by `handleRestore` ([door.tsx:161](app/(auth)/door.tsx#L161),
  [hard-paywall.tsx:159](app/(auth)/hard-paywall.tsx#L159)).
- Calls `restorePurchases()` → `getAvailablePurchases()`
  ([iap-shim.ts:263-270](lib/iap-shim.ts#L263)), finds a product in
  `ALL_PRODUCT_IDS`, and on success calls **`/auth/resolve` only**.
- ⚠️ **It never writes the restored purchase to the backend** (`/subscription/write`
  is absent from the restore path). So even when the device *does* report the
  active Google sub, restore just re-reads the (stale) backend via `/auth/resolve`,
  which still says unsubscribed → user is routed back to the paywall or sees
  "No active subscription found." Why it can also throw for a user who *has* an
  active sub: `getAvailablePurchases()` rejects if billing isn't connected /
  Play services hiccup → caught as "Restore failed." Either branch leaves the
  user stuck.

### 6. Paywall gating + isStaff
- **Which paywall shows is decided by the backend**, not the client: `/auth/resolve`
  returns a `nextRoute` of `/(auth)/door` (soft) or `/(auth)/hard-paywall`
  (hard), which the client blindly follows. The screens themselves contain no
  entitlement logic — they always render their paywall and only react to IAP
  state. (`door` has a "Not now" exit → `signOut` ([door.tsx:198-202](app/(auth)/door.tsx#L198)); `hard-paywall` has **no exit**.)
- **`isStaff`** is read **only** from the backend `GET /profile` response, in the
  submissions screen: `isEntitled()` returns `true` when `profile.isStaff === true`
  ([submissions/[type].tsx:41](app/submissions/[type].tsx#L41)). It is **not** stored
  locally and **does not** affect the purchase flow or which paywall shows (that's
  the backend's `nextRoute`). No other client file reads `isStaff`.

### 7. App-update behavior
- On cold start after an update, entitlement is **re-fetched from the backend**
  (`index.tsx` → `/auth/resolve`); it is **not** re-derived from the store and
  **not** read from a persisted entitlement flag. SecureStore (`bc_id_token`)
  survives the update, so the app stays "logged in" and immediately asks the
  backend. **If the backend says unsubscribed, the app shows unsubscribed** — and
  because no client path reconciles Google→backend (see §2/§5), the update simply
  *exposes* a backend record that never captured (or lost) the Google entitlement.
  The update itself doesn't wipe anything client-side; it just forces the
  backend re-check that reveals the gap.

---

## Places the client trusts device / local / in-memory state (flagged)

1. **`finishTransaction` before backend confirmation** — the purchase is
   acknowledged to Google purely on the device event, before `/subscription/write`
   and without awaiting its success. [door.tsx:69](app/(auth)/door.tsx#L69),
   [hard-paywall.tsx:68](app/(auth)/hard-paywall.tsx#L68). *(Flag: device event
   treated as completion; backend may never learn.)*
2. **`/subscription/write` fire-and-forget, no `purchaseToken`** — backend record
   depends on an un-awaited call that omits the field needed for server-side Play
   verification. [door.tsx:79-93](app/(auth)/door.tsx#L79). *(Flag.)*
3. **Restore trusts the device read but never persists it** —
   `getAvailablePurchases()` result is used only to decide whether to call
   `/auth/resolve`; the verified purchase is discarded, not written back.
   [door.tsx:166-187](app/(auth)/door.tsx#L166). *(Flag: device-confirmed
   entitlement thrown away.)*
4. **Submissions "optimistic" client entitlement** — `isEntitled(profile)` decides
   gating client-side from the `/profile` payload; backend-derived but evaluated
   locally with an optimistic default. [submissions/[type].tsx:40-46,104-112](app/submissions/[type].tsx#L40). *(Minor flag — backend `403` still backstops it.)*
5. **`bc_id_token` as the launch gate** — local SecureStore token decides whether
   to even attempt the backend entitlement check. [index.tsx:33-37](app/index.tsx#L33).
   *(Low risk — it's auth, not entitlement, and survives updates.)*

> Note the user's hypothesis is partly **inverted**: the *navigation/entitlement
> gate* is backend-authoritative (good). The actual defect is the **opposite** —
> the device holds the truth (Google's active sub) and the client never reliably
> pushes it to the backend, with **no reconciliation on launch or restore**.

---

## Suggested direction (not implemented — investigation only)
The fix is a **client→backend reconciliation that sends the verified
`purchaseToken`** and is **idempotent / repeatable**, not one-shot:
- Send `purchaseToken` (and productId/platform) to a verify/reconcile endpoint
  and **await success before `finishTransaction`** (or re-send on failure).
- Make **restore write the restored `purchaseToken` to the backend** before
  re-reading `/auth/resolve`, so it can self-heal a stale record.
- Optionally, on launch, if `/auth/resolve` says unsubscribed, run a silent
  `getAvailablePurchases()` reconcile before showing a paywall.

All of the above are backend-contract changes too (the Lambda must accept and
verify the `purchaseToken` via the Play Developer API) — out of scope for this
client-only investigation, but the client gaps above are the levers.
```
