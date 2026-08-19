package expo.modules.admpush

import android.content.Intent
import com.amazon.device.messaging.ADMMessageHandlerBase

// Legacy (pre-JobScheduler) handler. ADMMessageReceiver requires this class
// specifically in its super() constructor call — see AdmMessageReceiver.kt —
// even though registration/messages are actually handled by
// AdmMessageHandlerService (the JobBase implementation) on any device that
// supports it. Verified against Amazon's own ADMMessenger sample
// (SampleADMMessageHandler.java, bundled in the ADM SDK download) — the
// earlier version of this file skipped this class entirely and pointed
// ADMMessageReceiver's super() at the JobBase class instead, which is the
// wrong type per that sample.
class AdmMessageHandlerLegacy : ADMMessageHandlerBase(AdmMessageHandlerLegacy::class.java.name) {

    override fun onMessage(intent: Intent) {
        // Not expected to run: registerJobServiceClass() in AdmMessageReceiver
        // routes messages to AdmMessageHandlerService instead on any device
        // that supports JobScheduler-based delivery. Mirrored for correctness
        // on any device that falls back to this path. ADMMessageHandlerBase
        // extends IntentService (verified against the SDK jar), so `this` is
        // a valid Context here.
        AdmNotificationDisplay.show(this, intent)
    }

    override fun onRegistered(registrationId: String) {
        AdmPushBridge.pending?.complete(registrationId)
    }

    override fun onRegistrationError(errorId: String) {
        AdmPushBridge.pending?.completeExceptionally(
            IllegalStateException("ADM registration failed: $errorId")
        )
    }

    override fun onUnregistered(registrationId: String) {
        // No-op — the next registerAndAwait() call re-registers on demand.
    }
}
