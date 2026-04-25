# Between Covers — Frontend Batch Plan
**Branch:** `supabase-auth-fix` | **Date:** 2026-04-24 | **Status:** Planning only — no code written

---

## Codebase Map (Step 1)

| Area | Path(s) |
|------|---------|
| Paywall | `app/(auth)/paywall.tsx` |
| Signup / auth | `app/(auth)/login.tsx`, `app/(auth)/redirect.tsx`, `app/index.tsx` |
| Onboarding layout | `app/(onboarding)/_layout.tsx` |
| Onboarding steps | `app/(onboarding)/welcome.tsx`, `acceptance.tsx`, `name.tsx`, `location.tsx`, `genre.tsx`, `drinks.tsx`, `snacks.tsx`, `spicy.tsx`, `about.tsx` |
| Drinks selection | `app/(onboarding)/drinks.tsx` |
| Snacks selection | `app/(onboarding)/snacks.tsx` |
| Genre selection | `app/(onboarding)/genre.tsx` |
| Cozy page | `app/(tabs)/cozy/index.tsx` |
| Iris video player | Inline in onboarding screens + `app/(tabs)/home/index.tsx` (no dedicated component) |
| Profile overview | `app/(tabs)/profile/index.tsx` |
| Profile preferences | `app/(tabs)/profile/preferences/index.tsx` |
| expo-iap | `app/(auth)/paywall.tsx` — `useIAP` hook, no wrapper file |
| API service | `lib/api.ts` (`apiFetch`, `apiGet`, `apiPost`, `apiPatch`, `apiDelete`) |
| Route mapping | `lib/routes.ts` (`normalizeRoute`) |
| Sign-out | `lib/signout.ts` |
| App icon | `app.json` (top-level `icon`, `splash`, `android.adaptiveIcon`) + `assets/icon.png`, `assets/adaptive-icon.png` |

### Key patterns to keep in mind
- **All post-auth routing is server-driven.** Every screen calls `/auth/resolve` → `{ nextRoute }` → `normalizeRoute()` → `router.replace()`. Any new screen route must be a path the backend can return.
- `normalizeRoute()` already passes through any path starting with `/(` unchanged, so new screens under `/(auth)/`, `/(tabs)/`, etc. require no changes to `lib/routes.ts`.
- `expo-iap` is imported directly in `paywall.tsx` — no shared hook or context wrapper exists.
- Drink and snack state in `profile/preferences/index.tsx` uses `ChipGroup` (single-select, `string | null`) not `MultiChipGroup` (multi-select, `string[]`). Genre already uses `MultiChipGroup`.
- All onboarding screens post `{ step, value }` to `/onboarding/submit` — value is a scalar string for drinks/snacks, an array for genre.

---

## Per-Item Plans (Step 2)

---

### Item 1 — Onboarding Multi-Select Expansion

#### Files to touch
- `app/(onboarding)/drinks.tsx`
- `app/(onboarding)/snacks.tsx`
- `app/(onboarding)/genre.tsx`
- `app/(tabs)/profile/preferences/index.tsx`

#### What changes
**`drinks.tsx` and `snacks.tsx`:** The current single-tap-selects-and-submits pattern must become a multi-select list. Each item gets a toggle (selected / unselected visual state). A "Next →" button appears once the selection count is within the valid range (min 2, max 3 for drinks and snacks). On "Next", the screen posts `value: string[]` (the selected array) to `/onboarding/submit` and navigates on success.

**`genre.tsx`:** Genre is already submitted as `value: [value]` (array wrapping one string), but the UI is still single-tap-exits. Change to a multi-select toggle pattern with a "Next →" button that becomes active once ≥ 1 genre is selected. No maximum. The 39-second fallback timer that currently auto-submits on timeout needs careful handling — either remove it or reset it so it only fires if the user has ≥ 1 selection.

**`profile/preferences/index.tsx`:** The `snack` and `drink` state variables currently hold `string | null`; they must become `string[]`. The `ChipGroup` single-select component for those two sections must be swapped to `MultiChipGroup` (which already exists in this file) with min/max validation (min 1, max 3). The `apiPatch` call at save sends `snack` and `drink` as scalars today — must send arrays instead.

#### Risks / Breaking changes
- **Critical data migration risk:** The DynamoDB Users table currently stores `drink` and `snack` as `String`. When the frontend sends arrays, the backend `/onboarding/submit` and `PATCH /profile` endpoints must accept `List<String>`. Existing users still have `String` values. The frontend `GET /profile` response handler in `preferences/index.tsx` must normalize: if the API returns a `String`, wrap it in an array (`data.drink ? [data.drink] : []`) until all existing records are migrated. Without this normalization, existing users' preferences will silently clear on their next save.
- The auto-submit timer in `drinks.tsx` (19s), `snacks.tsx` (29s), and `genre.tsx` (39s) — which trigger on video progress — currently submits a single value. Timer behavior must be reconsidered: options are (a) start the timer only after the minimum selection count is reached, or (b) remove the timer and rely on the "Next" button entirely. Option (b) is simpler and avoids partial-selection auto-submits.
- Min/max enforcement must happen at the UI layer (disable "Next" button) AND be communicated clearly to the user with a label like "Choose 2–3".

#### Dependencies
- Upstream: none.
- Downstream: **Item 6 (Cozy personalization)** reads `drink` and `snack` from the user profile. It should be implemented after the profile sends arrays, so the 70/30 logic is built against the correct data shape.
- **Backend coordination required** before implementation: `/onboarding/submit` and `PATCH /profile` must accept arrays for `drink` and `snack`.

#### Estimated complexity: **M**

#### Open questions
1. Will the backend migration coerce existing `String` records to `["STRING"]` arrays before we ship, or does the frontend need indefinite backward-compat normalization code?
2. Should the auto-submit timeout be kept at all? If kept for genre, what value count triggers it?
3. The spec says min 2 for drinks and snacks — should "NONE" count as a valid selection that can form part of the minimum? (e.g., user picks WATER + NONE = 2, valid or invalid?)

---

### Item 2 — Onboarding Videos Refresh

#### Files to touch
- `app/(onboarding)/welcome.tsx`
- `app/(onboarding)/name.tsx`
- `app/(onboarding)/location.tsx`
- `app/(onboarding)/genre.tsx`
- `app/(onboarding)/drinks.tsx`
- `app/(onboarding)/snacks.tsx`
- `app/(onboarding)/spicy.tsx`
- `app/(onboarding)/about.tsx`

#### What changes
Each onboarding screen hard-codes its video URL as a string literal passed directly to `useVideoPlayer(...)`. There is no shared constants file. The change is to replace the existing S3 URL strings with new placeholder S3 URLs in each file. Placeholder format to use until the owner drops in real URLs: `https://onboarding-videos-betweencovers.s3.us-east-1.amazonaws.com/v2/Welcome.mp4` (same bucket, `v2/` prefix). Owner replaces the actual `v2/` filenames after asset delivery.

No video player rebuild is needed. The existing `expo-video` `useVideoPlayer` + `VideoView` pattern is sound.

#### Risks / Breaking changes
- None beyond broken video if URLs are wrong — since these are S3 links, a 403 or 404 just shows a black background. Not a crash.
- The onboarding layout background image is also served from the same S3 bucket (`app/(onboarding)/_layout.tsx`). If it also needs refreshing, add that file to the touch list.

#### Dependencies
- None. Fully independent.
- **Note:** This is a pure content swap. Consider creating a single `ONBOARDING_VIDEOS` constants object in a new file (e.g., `lib/onboardingAssets.ts`) so future URL updates require touching one file instead of eight. This is optional scope — confirm before adding.

#### Estimated complexity: **S**

#### Open questions
1. Does the `_layout.tsx` background image (`background.png`) also need to change?
2. Should we centralize all onboarding video URLs into a shared constants file as part of this task, or keep them inline?
3. What is the naming convention for the new video files in S3? (e.g., same filenames, different folder? Different names entirely?)

---

### Item 3 — Paywall Restructure (Door + Hard Paywall + Trial State Machine)

#### Files to touch
- `app/(auth)/paywall.tsx` — **repurpose or retire** (see below)
- `app/(auth)/door.tsx` — **new file** (The Door: entry paywall for new users)
- `app/(auth)/hard-paywall.tsx` — **new file** (Hard Paywall for expired-trial users)
- `lib/routes.ts` — no changes needed (pass-through already handles `/(auth)/xxx` paths)
- `lib/signout.ts` — already exists; `door.tsx` will import and call it for "Not now"

#### What changes

**Architecture decision — two screens, not one:**  
The current `paywall.tsx` serves both new users and returning subscribers. The new flow requires distinct UX: The Door (trial offer, "Not now" exits) vs Hard Paywall (expired, no exit). Create two separate screen files rather than adding conditional branches to one file. The backend controls which screen is shown via `/auth/resolve` returning `/(auth)/door` or `/(auth)/hard-paywall`. The existing `paywall.tsx` can be left in place temporarily to avoid breaking any backend routing already using `/(auth)/paywall`, but it should eventually be retired once the backend migrates all `nextRoute` responses to the new routes.

**`app/(auth)/door.tsx` — The Door:**  
Full-screen entry paywall. Copies the StoreKit purchase lifecycle from `paywall.tsx` (`useIAP`, `fetchProducts`, `requestPurchase`, `finishTransaction`, `currentPurchase` effect, `currentPurchaseError` effect). On successful purchase, posts to `/subscription/write` then calls `/auth/resolve` to route to tabs — identical to current paywall flow. Adds "Not now" secondary button that calls `signOut()` from `lib/signout.ts` and navigates to `/(auth)/login`. Includes all four Apple-required compliance elements: Terms of Use link, Privacy Policy link, EULA link, Restore Purchases button. The TERMS_URL and PRIVACY_URL constants already exist in `paywall.tsx` and can be reused; EULA URL is unknown (see Open Questions).

**`app/(auth)/hard-paywall.tsx` — Hard Paywall:**  
Shown only to users whose `subscriptionStatus === "expired"`. Same StoreKit purchase lifecycle as The Door. No "Not now" / logout option — the only way out is to subscribe or restore. Both Monthly and Annual plans shown with plan selector cards (identical pattern to existing `paywall.tsx`). CTA is "Choose your plan" / "Subscribe Now" rather than "Start your free trial". Microcopy does not mention trial. All four Apple compliance elements present.

**Trial state — what the frontend does vs what the backend does:**  
When the StoreKit purchase succeeds on The Door, the frontend posts `{ productId, transactionId, platform, originalPurchaseDate }` to `/subscription/write` — identical to the current flow. The backend Lambda is responsible for writing `subscriptionStatus: "trial"`, `trialEndDate: now+7d`, and related fields. The frontend does NOT write these fields directly. After posting, the frontend calls `/auth/resolve` to get the next route. If the backend has set the trial up correctly, `resolve` returns a tabs route and the user enters the app.

**Day-6 and day-7 transitions:** These are entirely backend-driven (Lambda cron flipping `subscriptionStatus`). The frontend only reads `subscriptionStatus` — it does not compute or flip it.

**"Not now" behavior:** Taps call `signOut()` which hits the Cognito `/logout` endpoint, deletes all `SecureStore` keys (`bc_id_token`, `bc_access_token`, `bc_biometric_enabled`), and navigates to `/(auth)/login`. This is the standard logout path already implemented in `lib/signout.ts`.

**What `/auth/resolve` must return for the new flow to work:**

| User state | `nextRoute` backend should return |
|---|---|
| New user, onboarding complete, no subscription | `/(auth)/door` |
| Trial or active subscriber | `/(tabs)/home` (or other tab) |
| Expired trial | `/(auth)/hard-paywall` |

**Backend coordination required:** The `/auth/resolve` Lambda must be updated to return these new routes. Until that happens, new users will continue landing on `/(auth)/paywall` instead of `/(auth)/door`.

#### Risks / Breaking changes
- **Highest-risk item in the batch.** The paywall is the auth gate — a bug here means users cannot enter the app.
- The "Not now" / sign-out flow must be tested for edge cases: user who taps "Not now" must not be able to re-enter the app via biometric sign-in since their tokens will be cleared.
- If the backend `/auth/resolve` update and the frontend deployment are not coordinated, there's a window where the backend returns `/(auth)/door` but the screen doesn't exist yet (or vice versa). Plan a coordinated deploy.
- The current `paywall.tsx` "Already a member? Sign In" link navigates to `/(auth)/login`. The Hard Paywall probably needs a "Restore Purchase" button that calls the restore flow (already in `paywall.tsx`) rather than offering re-login. Confirm UX intent.
- Apple compliance: the Restore Purchases button is a hard App Store requirement on every paywall screen. Omitting it is a rejection risk.

#### Dependencies
- Upstream: none. Independent of Items 1, 2, 6.
- Downstream: **Item 5 (Day-6 video overlay)** references `subscriptionStatus === "trial"` — needs the trial to actually be set by this item's purchase flow.
- Backend must deploy new `/auth/resolve` routing before this item is testable end-to-end.

#### Estimated complexity: **L**

#### Open questions
1. What is the EULA URL? (Not present anywhere in the codebase currently.)
2. Does the backend `/subscription/write` endpoint set `subscriptionStatus: "trial"` automatically when the product is a free-trial IAP, or does the frontend need to explicitly pass `subscriptionStatus: "trial"` in the request body?
3. Should users who cancelled during trial still see The Door when they re-open the app during their remaining trial days, or should they see a different screen?
4. If a user has `subscriptionStatus: "active"` (subscribed) and opens the app, `/auth/resolve` routes them straight to tabs — correct?
5. The Hard Paywall has no "Not now" exit. Is there any scenario where an expired user can dismiss the hard paywall without subscribing? (e.g., to view their own profile or account settings?)
6. Does the Hard Paywall support a "cancel subscription" scenario where the user resubscribes after expiry using the same Apple ID — does Restore Purchases handle that, or must they go through a new purchase flow?

---

### Item 4 — Feedback Button / Form

#### Files to touch
- `components/FeedbackModal.tsx` — **new file** (reusable modal component used in both Profile and Item 5 overlay)
- `app/(tabs)/profile/index.tsx` — add Feedback menu row + wire to `FeedbackModal`

#### What changes

**`components/FeedbackModal.tsx` (new):**  
A self-contained modal that renders over whatever screen invokes it. Contains a `TextInput` (multiline, min 10 chars, max 1000 chars), character count display, and a Submit button. On submit, POSTs to a placeholder feedback endpoint (placeholder URL: `/feedback`; full URL to be wired once the Lambda is deployed). On success response, replaces the form with a thank-you message: "Got it — your words mean more than you know. ~ Iris". On failure, shows an inline error with a retry option — the form input is preserved. The modal accepts an `onClose` prop and is dismissible by the user at any point. This component is imported by both the Profile screen and the Item 5 overlay.

**`app/(tabs)/profile/index.tsx`:**  
Add a new "Share Feedback" row to the existing menu list (positioned between "Reading Preferences" and "Legal" or at bottom of menu — confirm ordering preference). Tapping it sets a local boolean state that renders `<FeedbackModal />`.

#### Risks / Breaking changes
- No auth changes; the `apiFetch` wrapper in `lib/api.ts` automatically attaches the Bearer token, so the POST will be authenticated.
- The feedback Lambda doesn't exist yet. The frontend should fail gracefully when the endpoint returns a non-200. Test the failure path during dev.
- The modal must not block the keyboard on iOS (use `KeyboardAvoidingView` or equivalent).

#### Dependencies
- Upstream: none.
- Downstream: **Item 5** imports `FeedbackModal` for the end-of-video overlay. Implement Item 4 first.

#### Estimated complexity: **M**

#### Open questions
1. What is the POST body schema for `/feedback`? Just `{ message: string }`, or should the frontend include additional fields (e.g., `screen: string`, `userId` — noting that userId is available from the JWT and the backend can extract it)?
2. Where in the Profile menu list should "Share Feedback" live?
3. Should the feedback form include a subject/category selector (e.g., "Bug", "Feature Request", "General"), or is free-text-only sufficient?

---

### Item 5 — Day-6 Trial Reminder Video + End-of-Video Overlay

#### Files to touch
- `app/(tabs)/home/index.tsx` — add trial day-6 targeting check + post-video overlay rendering

#### What changes

**Targeting logic:**  
After `/home/resolve` returns, the screen already has `irisDaily` (with `mode`, `videoUrl`, `context`). Two approaches exist; which to use depends on a backend decision (see Open Questions):

- **Option A (backend-flagged, preferred):** The backend adds a field to the `irisDaily` response, e.g., `context.type: 'trial_reminder'`, when the user is on trial day 6. The frontend checks `irisDaily.context.type === 'trial_reminder'` to decide whether to show the overlay after the video ends. The frontend has no day-counting logic.
- **Option B (frontend-computed):** The frontend reads `trialEndDate` from the user profile (SecureStore cache or a separate profile fetch), computes `daysSinceTrialStart`, and enables the overlay only when `subscriptionStatus === 'trial' && daysSinceTrialStart === 6`. This requires the profile cache to expose `subscriptionStatus` and `trialEndDate`.

**End-of-video overlay:**  
In `home/index.tsx`, the `playingChange` listener already detects when the video stops (sets `overlayOpen = false`, `watched = true`). Extend this: if the trial-reminder flag is true AND the video plays to natural completion (not via the "skip" button), instead of simply closing the video overlay and showing the "Chat with Iris" avatar, render a new overlay on top of the paused final video frame. The overlay contains:
- "Manage trial" button → `Linking.openURL('itms-apps://apps.apple.com/account/subscriptions')`
- "Share feedback" button → renders `<FeedbackModal />` (from Item 4)
- Dismiss button / tap-outside to dismiss → restores normal Home Screen UI

The overlay must be conditional — only for this specific video context. All other Iris videos (static or non-reminder daily videos) follow the existing behavior unchanged.

**The skip button:** If the user taps "skip" before the video ends, the overlay does NOT appear (same as today — the overlay is only triggered by natural video completion, not by skip).

#### Risks / Breaking changes
- The `playingChange` event fires for both natural end and seek-end. The current code works because the video is not seekable (no controls). This remains safe.
- If Option B (frontend-computed) is used, there's a timezone risk: "day 6" depends on which timezone `now` is evaluated in. Use the trial start date in UTC and compute days elapsed in UTC.
- If the backend changes the `irisDaily` response shape, the TypeScript `HomeData` type definition in `home/index.tsx` must be updated before TypeScript build will pass.

#### Dependencies
- **Item 4 (FeedbackModal)** must be complete before this item — the overlay imports it.
- **Item 3 (Paywall/trial)** must be complete — this item requires a user in `subscriptionStatus: "trial"` state to test.
- **Backend decision needed** on Option A vs Option B before implementation begins.

#### Estimated complexity: **M**

#### Open questions
1. **Critical:** Will the backend add a `type: 'trial_reminder'` (or equivalent) field to the `/home/resolve` `irisDaily.context` response for trial day-6 users? Or should the frontend compute trial day-6 independently from `trialEndDate`? Option A is strongly preferred — it keeps business logic on the backend and avoids timezone edge cases.
2. What is the S3 URL for the day-6 trial reminder video?
3. If the user dismisses the overlay and re-opens the Home Screen on the same day, should the overlay appear again?
4. Should the "Manage trial" deep link also open inside the app (settings screen) for users who can't use the Apple subscriptions URL?

---

### Item 6 — Cozy Personalization (70/30)

#### Files to touch
- `app/(tabs)/cozy/index.tsx`

#### What changes

**Profile read:**  
The Cozy screen currently fetches only `/cozy/home`. It needs the user's preference data (`drink`, `snack`, `genre`) to apply the 70/30 filter. The profile is already cached in SecureStore under key `bc_profile_cache`. The Cozy screen should read this cache on mount (not make a new network call) to get the user's selections. If the cache is missing or stale, fall back to fetching `GET /profile` once and caching it.

**Filtering the lifestyle items:**  
The `resolveLifestyleItems()` helper currently returns the full list from whichever section is largest. After this change, it applies a 70/30 split:
- Separate items into "matching" (their `category` or other field matches a user preference) and "non-matching".
- Calculate target counts: `Math.round(total * 0.7)` matching, remainder from non-matching.
- If there aren't enough matching items to fill 70%, use all matching items and pad with non-matching to fill the display.
- If the user has no preferences set (empty arrays), show all items unfiltered — no crash path.

The exact filtering logic depends on what field in `VisualItem` maps to user preferences (see Open Questions). The existing `VisualItem` type has a `category` field — this is the most likely candidate.

**No API change:**  
The filtering is entirely frontend-side on the already-fetched response. The `/cozy/home` API call is unchanged.

#### Risks / Breaking changes
- If `VisualItem.category` values don't cleanly map to drink/snack/genre keys (e.g., the item category is `"mocktail"` but the user preference is `"COCKTAIL"`), the matching logic will fail silently. A mapping/normalization table may be needed.
- After Item 1 ships, `drink` and `snack` in the profile will be arrays. The Cozy filtering code must handle arrays from the start.
- The 70/30 split is probabilistic — with a small total item count (e.g., 5 items), integer rounding may produce 4/1 or 3/2 rather than exactly 3.5/1.5. This is fine and expected.

#### Dependencies
- **Item 1 (multi-select)** should ship first so the profile returns arrays, and the filtering logic is written for the correct data shape from day one.

#### Estimated complexity: **M**

#### Open questions
1. **Critical:** What values does `VisualItem.category` take, and how do they map to user preference keys (`TEA`, `COFFEE`, `COCKTAIL`, `POPCORN`, `CHOCOLATE`, `CONTEMPORARY_ROMANCE`, etc.)? Need to see actual API response data or backend schema.
2. Does the `/cozy/home` API return a `category` field on each `VisualItem`, or is the categorization indicated by a different field (e.g., `type`, `section`, `tags`)?
3. Should the 70/30 filter apply only to the "Cozy Lifestyle Picks" section, or also to "Iris' Picks" (books), "Visual Escapes", and other sections?
4. What does "wildcards from adjacent or different categories" mean exactly for snacks — if the user selected `POPCORN` and `CHOCOLATE`, should wildcards be other snack types (e.g., `CHIPS`, `FRUIT`) or can they be from entirely different categories (drinks, recipes)?

---

### Item 7 — App Icon Update

#### Files to touch
- `app.json` — `"icon": "./assets/icon.png"` and `"android.adaptiveIcon.foregroundImage": "./assets/adaptive-icon.png"`
- `assets/icon.png` — replace with new asset (owner drops in file)
- `assets/adaptive-icon.png` — replace with new Android asset (owner drops in file)
- `assets/splash.png` — may also need updating if the icon rebrand extends to the splash screen (confirm with owner)
- `assets/splash-icon.png` — same consideration as above

#### What changes
The owner drops the new `icon.png` file into `assets/`. No code changes are needed if the filename stays `icon.png`. If the filename changes, update the paths in `app.json`. The notification icon referenced in the `expo-notifications` plugin config (`app.json` line: `"icon": "./assets/icon.png"`) also updates automatically since it points to the same file.

**iOS-specific:** For iOS, `expo` generates all required icon sizes from the single `icon.png`. The file must be 1024×1024px PNG, no transparency, no rounded corners (Apple applies them). If the new asset doesn't meet these specs, the EAS build will reject it.

**Android-specific:** `adaptive-icon.png` is the foreground layer of the Android adaptive icon. The background color `"#0d0d0d"` is set in `app.json` and will remain unless the owner wants to change it.

#### Risks / Breaking changes
- Icon dimension or transparency violations will cause EAS to fail at build time — better to catch this in a dev/preview build.
- No code changes means this item cannot introduce regressions.

#### Dependencies
- None. Fully independent.
- **This item blocks the production build** until the owner has the final asset ready. Do not include in a build without the real asset.

#### Estimated complexity: **S**

#### Open questions
1. Will the splash screen image also be updated? If so, `assets/splash.png` and `assets/splash-icon.png` are also in scope.
2. Is `assets/wig.png` (visible in the assets directory) character art that might need updating alongside the icon?
3. Should `android.adaptiveIcon.backgroundColor` remain `#0d0d0d`?

---

## Recommended Build Sequence (Step 3)

**Confirmed sequence (2026-04-24):** 7 → 2 → 1 → 3 → 4 → 5. Item 6 is on hold pending Cozy table schema review.

```
Item 7: App icon — asset drop-in (no code changes; owner provides file)
Item 2: Video URL swaps — URL literals in 8 onboarding screens
Item 1: Multi-select expansion — drinks/snacks/genre onboarding + preferences screen
Item 3: Paywall restructure — door.tsx + hard-paywall.tsx + acceptedPolicyVersion bump
Item 4: Feedback modal — FeedbackModal component + Profile screen integration
Item 5: Day-6 trial reminder video + overlay (Option B: frontend-computed)
Item 6: ON HOLD — skip until Cozy table schema is reviewed
```

**QA checkpoints:**  
- After Item 3: full auth flow test on a preview build (sign up → onboarding → Door → trial purchase → tabs; expired user → hard paywall → resubscribe).  
- After Item 5: test on a device with a trial account at day 6.  
- Before production build: full regression pass on all 5 tabs + onboarding + paywall flows.

---

## Flag Ambiguities (Step 4)

### Backend coordination required before any frontend work begins

1. **`/auth/resolve` new routes:** The backend must return `/(auth)/door` for new-user post-onboarding state and `/(auth)/hard-paywall` for expired-trial state. Until this is deployed, the new paywall screens cannot be tested end-to-end. **Decision needed: when will the backend deploy this, and what will it return for each subscription state?**

2. **drink/snack schema as List\<String\>:** Backend `/onboarding/submit` and `PATCH /profile` must accept arrays. GET /profile must return arrays (or strings that the frontend normalizes). **Decision needed: will the backend migrate existing records before or after frontend ships? What does GET /profile return for migrated vs unmigrated users?**

3. **`/subscription/write` and trial fields:** Clarify what the backend sets when it receives a free-trial IAP purchase. Does it automatically set `subscriptionStatus: "trial"` and `trialEndDate`? Or must the frontend pass additional fields? **Decision needed: exact POST body schema and response for trial purchase.**

4. **Day-6 video targeting — Option A vs B:** Will the backend flag the `irisDaily` response for trial day-6 users, or should the frontend compute this? **Decision needed before Item 5 implementation.**

5. **VisualItem category mapping for Cozy:** Need the actual `category` field values returned by `/cozy/home` and how they map to user preference keys. **Decision needed before Item 6 implementation** — without this, the filtering logic cannot be written correctly.

### Spec clarifications needed

6. **EULA URL:** No EULA URL exists anywhere in the codebase. Both paywall screens require it for Apple compliance. **What is the EULA URL?** (If it's the same S3 bucket, format would be: `https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/eula.html`)

7. **"Not now" on The Door logs the user out.** Confirmed: this calls `signOut()` which hits Cognito's logout endpoint and clears all tokens. A user who taps "Not now" must re-authenticate from scratch. Is this the intended behavior if the user taps "Not now" accidentally?

8. **Hard Paywall — no exit.** An expired user hitting the Hard Paywall cannot navigate anywhere in the app (no tabs are accessible). Is there any exception — e.g., can they access their Profile to update account details, or are they fully locked?

9. **Drinks/snacks minimum and "NONE" snack option:** The snack options include `NONE` ("✨ No Snack"). With a minimum of 2, can `NONE` be paired with another snack? That combination is semantically odd. Should `NONE` be excluded from the multi-select minimum counting?

10. **Day-6 reminder video: re-trigger on same-day revisit.** If the user dismisses the overlay and returns to Home on the same day, should the overlay appear again on the next video play?

11. **Feedback POST endpoint:** Spec says "POST to /feedback API endpoint (backend Lambda being built separately)." Confirm the full URL will be `https://api.betweencovers.app/feedback` and the request body is `{ message: string }`. Should the frontend pass any additional context (e.g., screen, platform)?

12. **Video player sizing for day-6 video.** The current Iris daily video renders in a 140×140 circle/square (`styles.videoContainer`). The day-6 video is a different asset — is it the same aspect ratio, or does it need a different container size?

13. **Item 2 — video naming convention.** To generate placeholder S3 URLs now, I need to know: are the new videos stored in the same S3 bucket with the same filenames (overwriting), or in a new path/prefix?

---

## Summary for Review

**What was found:**  
The codebase is clean, server-routed, and well-organized. Key findings: (1) expo-iap lives entirely in `paywall.tsx` with no shared wrapper, (2) drinks/snacks are hard single-select in both onboarding and preferences — multi-select requires changing both layers plus backend schema, (3) the Home screen's Iris video overlay is inline in `home/index.tsx` with a `playingChange` listener already wired for end-of-video events — Item 5 extends this existing pattern, (4) no centralized constants file for video URLs — Item 2 touches 8 files, (5) `ChipGroup` (single-select) and `MultiChipGroup` (multi-select) both already exist in `preferences/index.tsx` — Item 1 just swaps which component is used for snack/drink, (6) the current paywall already has Terms + Privacy links but is missing EULA (Apple requirement), (7) `normalizeRoute()` already passes through `/(auth)/xxx` paths unchanged — no routing changes needed for new paywall screens.

**Recommended build sequence:**  
Item 7 → Item 2 → Item 1 → Item 3 → Item 4 → Item 5 → Item 6

**Decisions needed before implementation begins:**  
- EULA URL (blocks Item 3 — Apple compliance requirement)
- Backend deploy plan for new `/auth/resolve` routes `/(auth)/door` and `/(auth)/hard-paywall` (blocks Item 3 testing)
- Backend confirmation that `/onboarding/submit` and `PATCH /profile` will accept arrays for `drink` and `snack`, and migration plan for existing String records (blocks Item 1)
- Option A vs Option B for day-6 video targeting (blocks Item 5)
- `VisualItem.category` field values and mapping to user preference keys (blocks Item 6)
- Whether the day-6 trial reminder video is the same dimensions as the current 140×140 Iris daily video format
