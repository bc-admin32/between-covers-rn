package expo.modules.admpush

import android.content.Context
import android.content.Intent
import com.amazon.device.messaging.ADMMessageHandlerJobBase

class AdmMessageHandlerService : ADMMessageHandlerJobBase() {

    override fun onRegistered(context: Context, newRegistrationId: String) {
        AdmPushBridge.pending?.complete(newRegistrationId)
    }

    override fun onRegistrationError(context: Context, errorId: String) {
        AdmPushBridge.pending?.completeExceptionally(
            IllegalStateException("ADM registration failed: $errorId")
        )
    }

    override fun onUnregistered(context: Context, registrationId: String) {
        // No-op — the next registerAndAwait() call re-registers on demand.
    }

    override fun onMessage(context: Context, intent: Intent) {
        // TODO out of scope here: FCM pushes render via expo-notifications'
        // handler; ADM messages arrive as a raw Intent and need equivalent
        // handling once the backend's ADM send path/payload shape is confirmed.
    }
}
