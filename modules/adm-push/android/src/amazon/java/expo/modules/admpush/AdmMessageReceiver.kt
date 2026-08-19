package expo.modules.admpush

import com.amazon.device.messaging.ADMMessageReceiver

// super() takes the legacy (pre-JobScheduler) handler class — required even
// though AdmMessageHandlerService (registered via registerJobServiceClass
// below) is what actually handles registration/messages on modern devices.
// Verified against Amazon's own ADMMessenger sample
// (SampleADMMessageReceiver.java).
class AdmMessageReceiver : ADMMessageReceiver(AdmMessageHandlerLegacy::class.java) {
    init {
        registerJobServiceClass(AdmMessageHandlerService::class.java, ADM_JOB_ID)
    }
}

// Arbitrary but must not collide with any other JobService id in the app.
// Nothing else here schedules JobServices as of this writing — confirm still true.
internal const val ADM_JOB_ID = 1001
