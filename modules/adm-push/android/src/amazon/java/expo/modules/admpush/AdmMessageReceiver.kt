package expo.modules.admpush

import com.amazon.device.messaging.ADMMessageReceiver

// super() takes the legacy handler class (backward-compat for older Fire OS);
// registerJobServiceClass wires the modern JobService path. Both required per
// Amazon's own integration sample.
class AdmMessageReceiver : ADMMessageReceiver(AdmMessageHandlerService::class.java) {
    init {
        registerJobServiceClass(AdmMessageHandlerService::class.java, ADM_JOB_ID)
    }
}

// Arbitrary but must not collide with any other JobService id in the app.
// Nothing else here schedules JobServices as of this writing — confirm still true.
internal const val ADM_JOB_ID = 1001
