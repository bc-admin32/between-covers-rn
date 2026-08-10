package expo.modules.admpush

import android.content.Context

/**
 * No-op default. The identically-named class in src/amazon overrides this
 * one for the amazon variant via Gradle flavor source-set resolution — same
 * mechanism react-native-iap uses for RNIapActivityListener (see
 * plugins/withRNIapAmazonActivityListener.js). googlePlay links this stub.
 */
object AdmPushBridge {
    fun isSupported(): Boolean = false

    suspend fun registerAndAwait(context: Context, timeoutMs: Long = 15_000L): String {
        throw IllegalStateException("ADM is not available on this build flavor")
    }
}
