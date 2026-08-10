package expo.modules.admpush

import android.content.Context
import com.amazon.device.messaging.ADM
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout

// VERIFY against the javadoc bundled with your downloaded ADM SDK jar — this
// was written from Amazon's published integration guide (not compiled
// bytecode, since Amazon doesn't publish ADM on Maven Central).
object AdmPushBridge {
    @Volatile
    internal var pending: CompletableDeferred<String>? = null

    fun isSupported(): Boolean = true

    suspend fun registerAndAwait(context: Context, timeoutMs: Long = 15_000L): String {
        val adm = ADM(context)
        adm.registrationId?.let { return it }  // already registered from a prior run

        val deferred = CompletableDeferred<String>()
        pending = deferred
        adm.startRegister()

        return try {
            withTimeout(timeoutMs) { deferred.await() }
        } finally {
            pending = null
        }
    }
}
