package expo.modules.admpush

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AdmPushModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AdmPush")

    Function("isSupported") {
      AdmPushBridge.isSupported()
    }

    // Plain AsyncFunction("name") { ... } takes a non-suspend () -> Any?
    // body — calling AdmPushBridge.registerAndAwait() (a suspend fun)
    // directly inside that wouldn't compile. Coroutine {} (from
    // expo.modules.kotlin.functions.AsyncFunctionBuilder.kt) wraps the block
    // as a SuspendBody instead, which the module system runs on its own
    // coroutine scope — same pattern expo-secure-store's SecureStoreModule.kt
    // uses for its suspend-backed AsyncFunctions. No manual scope/launch needed.
    // Explicit `->` (zero declared params) — Coroutine is overloaded per arity
    // (AsyncFunctionBuilder.kt), and a bare `{ ... }` with no parameter list is
    // structurally valid for both the 0-param and 1-param overloads (via an
    // unused implicit `it`), which is genuinely ambiguous to the compiler.
    // Pinning the arity explicitly, same as every real usage in
    // expo-secure-store's SecureStoreModule.kt does with its named params.
    AsyncFunction("registerAsync") Coroutine { ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("No Android context available")
      return@Coroutine AdmPushBridge.registerAndAwait(context)
    }
  }
}
