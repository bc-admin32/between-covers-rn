package expo.modules.admpush

import android.content.Context

/**
 * No-op for the googlePlay flavor. ADM (Amazon Device Messaging) doesn't exist
 * on Google Play devices, so this flavor never registers for push.
 *
 * This is its own per-flavor source file rather than a shared src/main
 * default — Android/Gradle source sets are additive, not overriding: a
 * product flavor's compilation merges src/main + src/<flavor> together, so a
 * class declared in both would double-declare instead of one replacing the
 * other. Each flavor that needs a distinct implementation gets its own file
 * and src/main stays empty for this class. Same pattern react-native-iap uses
 * for RNIapActivityListener (src/amazon + src/play, no src/main copy) — see
 * plugins/withRNIapAmazonActivityListener.js.
 */
object AdmPushBridge {
    fun isSupported(): Boolean = false

    suspend fun registerAndAwait(context: Context, timeoutMs: Long = 15_000L): String {
        throw IllegalStateException("ADM is not available on this build flavor")
    }
}
