package expo.modules.admpush

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Turns a received ADM data message into a real system notification, and
 * wires its tap action to the app's own deep-link handling.
 *
 * ADM has no FCM-style "notification" block that the OS displays
 * automatically — every data message reaches [AdmMessageHandlerService]
 * (or, on devices without JobScheduler support, [AdmMessageHandlerLegacy])
 * as a raw Intent that the app must turn into a notification itself. Shared
 * here so both handlers post identically instead of duplicating this logic.
 */
internal object AdmNotificationDisplay {

  // Matches app.json's top-level "scheme" (also the Android applicationId in
  // this app, though that's coincidental — scheme is what expo-router's deep
  // link handling actually resolves against). If that scheme ever changes,
  // update this too.
  private const val DEEP_LINK_SCHEME = "com.betweencovers.app"

  // Same channel ID/importance expo-notifications' Android side falls back to
  // when the app hasn't registered a custom channel (see BaseNotificationBuilder.kt
  // in expo-notifications — FALLBACK_CHANNEL_ID / FALLBACK_CHANNEL_IMPORTANCE).
  // This app never calls Notifications.setNotificationChannelAsync, so FCM
  // pushes land on this exact channel — reusing it here keeps Fire OS
  // notifications under the same channel name/importance/sound the user
  // already sees for Google Play, rather than a second, separate channel.
  private const val CHANNEL_ID = "expo_notifications_fallback_notification_channel"
  private const val CHANNEL_NAME = "Miscellaneous" // matches expo-notifications' fallback channel name

  fun show(context: Context, intent: Intent) {
    val extras = intent.extras ?: return
    val title = extras.getString("title")
    val body = extras.getString("body")
    val deepLink = extras.getString("deepLink")

    if (title.isNullOrBlank() && body.isNullOrBlank()) {
      // Nothing to show — e.g. a silent/data-only push with no display fields.
      return
    }

    ensureChannel(context)

    // Icon/color used to be resolved at runtime via
    // PackageManager.getApplicationInfo(GET_META_DATA) — replaced with the
    // compile-time R.drawable/R.color references below (see git history for
    // that change). That fix regressed on real Fire HD hardware: the icon
    // went from washed-out-but-visible to not showing at all. Root cause
    // (confirmed via aapt2/dexdump against the actual shipped APK, not
    // guessed): AAPT2's PNG crunch step losslessly (and silently) converts
    // any PNG whose alpha-bearing pixels are all exactly R=G=B into 8-bit
    // gray+alpha — which this icon's source was, unintentionally. Fire OS's
    // notification renderer doesn't display that format the way stock
    // Android/Google Play does. The actual source of truth,
    // assets/notification-icon.png at the JS project root, now has every
    // alpha-bearing pixel's blue channel nudged by 1/255 — imperceptible
    // visually, but enough to make the grayscale conversion lossy, so
    // AAPT2's own documented safety check (it only grayscale-converts when
    // doing so loses no information) skips it.
    //
    // R.drawable.notification_icon / R.color.notification_icon_color below
    // are this module's OWN local resources
    // (modules/adm-push/android/src/amazon/res/), kept byte-identical to the
    // app's own copy for consistency — but note Android's resource merge
    // gives the APP module's same-named resource precedence over this
    // library's, so in practice the app's copy (regenerated from
    // assets/notification-icon.png by expo-notifications' config plugin at
    // every prebuild) is what actually determines the packaged bytes,
    // regardless of what's committed here. This module's copy exists so
    // R.drawable.notification_icon / R.color.notification_icon_color resolve
    // to something at THIS module's own compile time — confirmed via
    // dexdump that the compiled reference correctly patches to the real
    // final merged resource ID either way. If app.json's notification.icon
    // or notification.color ever changes, update assets/notification-icon.png
    // (the actual source of truth) and mirror the change here to keep them
    // in sync, even though only the app's copy is load-bearing for content.
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(R.drawable.notification_icon)
      .setColor(ContextCompat.getColor(context, R.color.notification_icon_color))
      .setAutoCancel(true)
      .setContentIntent(buildContentIntent(context, deepLink))
    val notification = builder.build()

    // POST_NOTIFICATIONS (API 33+) is requested from the JS side via
    // Notifications.requestPermissionsAsync() (lib/pushNotifications.ts) —
    // this only guards against posting when that was never granted/denied.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
    ) {
      NotificationManagerCompat.from(context).notify(System.currentTimeMillis().toInt(), notification)
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH)
    channel.setShowBadge(true)
    channel.enableVibration(true)
    manager.createNotificationChannel(channel)
  }

  // Deep-link approach: build a real ACTION_VIEW intent against the app's own
  // scheme and let the app's existing deep-link handling (expo-router, via
  // the manifest intent-filter Expo's "scheme" config generates) resolve it —
  // the same path any other com.betweencovers.app:// link already goes
  // through, rather than hooking into expo-notifications' JS response
  // listener (which only fires for notifications posted through its own
  // presentation path, not one built directly here). Empty/missing deepLink
  // falls back to just opening the app to its default screen.
  private fun buildContentIntent(context: Context, deepLink: String?): PendingIntent {
    val uri = deepLink?.takeIf { it.isNotBlank() }?.let {
      if (it.contains("://")) Uri.parse(it) else Uri.parse("$DEEP_LINK_SCHEME://${it.removePrefix("/")}")
    }

    val intent = if (uri != null) {
      Intent(Intent.ACTION_VIEW, uri)
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(Intent.ACTION_VIEW, Uri.parse("$DEEP_LINK_SCHEME://"))
    }
    intent.setPackage(context.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    return PendingIntent.getActivity(
      context,
      System.currentTimeMillis().toInt(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
