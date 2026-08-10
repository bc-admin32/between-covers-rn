package expo.modules.admpush

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AdmPushModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AdmPush")

    Function("isSupported") {
      AdmPushBridge.isSupported()
    }

    AsyncFunction("registerAsync") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("No Android context available")
      AdmPushBridge.registerAndAwait(context)
    }
  }
}
