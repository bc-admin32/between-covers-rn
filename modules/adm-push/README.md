# adm-push

Local Expo module bridging Amazon Device Messaging (ADM) registration to JS for
Fire OS. Backs the `amazon` branch in `lib/pushNotifications.ts`.

## Still required before this builds for the Amazon flavor

Drop the ADM SDK jar (downloaded from the Amazon Developer console for package
`com.betweencovers.app`) at:

```
modules/adm-push/android/libs/amazon-device-messaging.jar
```

`android/build.gradle` in this module references it via
`amazonImplementation files('libs/amazon-device-messaging.jar')` — scoped to the
`amazon` flavor only, so its absence doesn't affect Google Play builds, but the
Amazon flavor won't compile until it's there. This repo already commits
`adm/api_key.txt` in the same repo (see `adm/README.md`) — follow that same
convention here (commit the jar) unless you want to gitignore it instead.

## Also unverified

- `AdmPushBridge.kt` (amazon variant) and the `ADMMessageHandlerJobBase` /
  `ADMMessageReceiver` subclasses were written from Amazon's published
  integration guide, not compiled against the actual SDK — check method
  signatures against the javadoc bundled in the jar above before trusting a
  build failure is something else.
- The `ADM_JOB_ID` constant in `AdmMessageReceiver.kt` (1001) must not collide
  with any other JobService id in the app.
- `onMessage()` in `AdmMessageHandlerService.kt` doesn't render notifications
  yet — only registration is wired. Confirm the backend's ADM payload shape
  before building that out.
