import { Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { getResolvedPlatform } from './iap-shim';

// Matches app.json's android.package / the DEEP_LINK_SCHEME constant used
// elsewhere (e.g. modules/adm-push's AdmNotificationDisplay.kt) — update
// here too if that ever changes.
const ANDROID_PACKAGE = 'com.betweencovers.app';

// Amazon publishes no in-app review API (expo-store-review's
// isAvailableAsync() always resolves false on Fire OS) — the only supported
// mechanism is deep-linking out to the app's own Amazon Appstore listing.
// amzn:// opens the Appstore app directly if installed (standard Fire OS
// pattern, keyed by package name — see
// https://developer.amazon.com/docs/reports-promo/deeplink-to-the-amazon-client.html);
// falls back to the web listing URL if the Appstore app can't handle it.
const AMAZON_APPSTORE_DEEP_LINK = `amzn://apps/android?p=${ANDROID_PACKAGE}`;
const AMAZON_APPSTORE_WEB_URL = `https://www.amazon.com/gp/mas/dl/android?p=${ANDROID_PACKAGE}`;

async function openAmazonAppstoreListing(): Promise<void> {
  try {
    await Linking.openURL(AMAZON_APPSTORE_DEEP_LINK);
  } catch {
    try {
      await Linking.openURL(AMAZON_APPSTORE_WEB_URL);
    } catch {
      // Never let a review-prompt failure affect the calling flow.
    }
  }
}

/**
 * Fire-and-forget review prompt — three different mechanisms depending on
 * platform, not one uniform behavior:
 *
 * - iOS: SKStoreReviewController via expo-store-review. In-app, no
 *   navigation away from BC.
 * - Android (Google Play): Play's In-App Review API, same expo-store-review
 *   call, same in-app behavior.
 * - Amazon Fire OS: no in-app review API exists, so instead of calling
 *   expo-store-review (which would silently no-op there —
 *   isAvailableAsync() always resolves false on Fire OS), this deep-links
 *   out to BC's Amazon Appstore listing page — the standard, expected
 *   pattern for every Fire OS app, not a BC-specific workaround.
 *
 * Never gates functionality and never awaited by callers — on iOS/Android,
 * the OS's own system-level throttling (Apple caps this at 3 prompts/365
 * days regardless of call frequency) means this is safe to call
 * opportunistically at a genuine satisfaction moment without any
 * frequency-capping logic of our own. The Amazon path has no equivalent
 * built-in throttle, so it should only be wired at deliberately infrequent,
 * high-signal moments — same as the other two.
 */
export async function maybeRequestReview(): Promise<void> {
  if (getResolvedPlatform() === 'amazon') {
    await openAmazonAppstoreListing();
    return;
  }

  try {
    const isAvailable = await StoreReview.isAvailableAsync();
    if (isAvailable) {
      await StoreReview.requestReview();
    }
  } catch {
    // Never let a review-prompt failure affect the calling flow.
  }
}
