# Push Notification System — Full Reference

A single push pipeline that delivers admin-sent notifications to three surfaces: the web app (browser push), the Capacitor-wrapped native app (FCM/APNs via the OS), and in-app (always works, no permission needed). All three read from one `device_push_tokens` table and are triggered by the same admin "Send Notification" action.

---

## 1. Architecture

```
Admin composes notification → admin.sendNotification
                                      │
                       ┌──────────────┼───────────────┐
                       ▼              ▼               ▼
              UserNotification   DevicePushToken   (filtered by
              rows (in-app)      rows → FCM         NotificationPreference
                                  multicast send     .push_enabled)
                                      │
                ┌─────────────────────┼─────────────────────┐
                ▼                     ▼                     ▼
         Browser (web push)   Android (Capacitor)     iOS (Capacitor)
         via Firebase Web SDK  via @capacitor/         via @capacitor/
         + service worker      push-notifications      push-notifications
                                (FCM under the hood)    (APNs via FCM)
```

One Firebase project serves both: the **Admin SDK** (server-side, sends pushes) and the **Web SDK** (browser-side, receives pushes + requests permission). The native app needs no separate SDK config beyond the standard `google-services.json`/`GoogleService-Info.plist` Firebase already requires for any FCM-enabled app.

---

## 2. What already existed vs. what was added

| Piece | Before | Now |
| :--- | :--- | :--- |
| FCM Admin SDK sending (`server/src/lib/firebase.ts`) | ✅ existed | unchanged |
| `device_push_tokens` table + REST register/unregister | ✅ existed | unchanged, `platform` now also accepts `"web"` |
| Admin "Send Notification" → push fan-out | ✅ existed | now filters out users who opted out via `NotificationPreference.push_enabled` |
| Admin Firebase settings page | ✅ existed (service account JSON only) | extended with Web SDK config + VAPID key fields |
| **Browser (web) push** | ❌ did not exist — no Firebase Web SDK, no service worker, no permission flow | ✅ fully implemented |
| **Native (Capacitor) push registration code** | ❌ plugin not installed, no registration code | ✅ fully implemented |
| tRPC token registration (web app's native path) | ❌ only REST existed | ✅ added `notifications.registerPushToken` / `unregisterPushToken` |

---

## 3. Backend changes

### `server/src/routers/admin.ts`
- `getFirebaseSettings` / `saveFirebaseSettings` — extended to store the public Web SDK config under `platformSetting` keys: `firebase_web_api_key`, `firebase_web_auth_domain`, `firebase_web_project_id`, `firebase_web_storage_bucket`, `firebase_web_messaging_sender_id`, `firebase_web_app_id`, `firebase_web_vapid_key`.
- `sendNotification` — now excludes device tokens belonging to users with `NotificationPreference.push_enabled === false` before calling `sendPushToTokens`. Previously it sent to every registered token for the target audience regardless of individual opt-out.

### `server/src/routes/rest/push.ts` (new)
- `GET /api/v1/push/web-config` — **public, no auth**. Returns the Web SDK config (all client-safe values, no secrets) or `{ configured: false }` if not yet set up or push is globally disabled. Used by both the browser main thread and the service worker.

### `server/src/routes/rest/notifications.ts`
- `POST /api/v1/notifications/register-token` — `platform` now accepts `"web"` in addition to `"android"`/`"ios"`.

### `server/src/routers/notifications.ts`
- `registerPushToken` (mutation) — `{ token, platform: "android"|"ios"|"web" }`, upserts into `DevicePushToken`. Used by the web app instead of the REST endpoint (consistent with the rest of the web stack).
- `unregisterPushToken` (mutation) — `{ token }`, deletes the token row. Called when a user disables push from Notification Settings.

No schema migration needed — `DevicePushToken.platform` was already a free-form `String`.

---

## 4. Web (browser) push — new

### Files
- `public/firebase-messaging-sw.js` — the service worker. Fetches its Firebase config at runtime from `GET /api/v1/push/web-config` (so credential changes in the admin panel take effect without a frontend rebuild), initializes `firebase.messaging()`, and shows a native OS notification for messages received while the tab isn't focused. Handles notification-click to focus/open the right page.
- `src/lib/webPush.ts` — main-thread helper:
  - `isWebPushSupported()` — feature-detects `Notification` + `serviceWorker` + Firebase's own `isSupported()` check (excludes browsers like old Safari/in-app webviews that don't support push).
  - `requestWebPushToken()` — fetches config, prompts `Notification.requestPermission()`, registers the service worker, returns an FCM token (or `null` if unsupported/denied/not configured).
  - `onForegroundPush(callback)` — subscribes to messages that arrive while the tab is open and focused (background messages are handled by the service worker instead).
  - `getWebPushPermissionState()` — reads `Notification.permission` without prompting, used to silently re-register on subsequent visits.

### Flow
1. User opens **Notification Settings** and turns on the "পুশ নোটিফিকেশন" toggle.
2. `enablePush()` (from `usePushNotifications`) → `requestWebPushToken()` → browser shows the native permission prompt → on "Allow", the FCM token is sent to the server via `notifications.registerPushToken`.
3. On every subsequent app load, if `Notification.permission === "granted"` already, the token is silently re-fetched and re-registered (no re-prompt) — see `usePushNotifications`'s effect.
4. Turning the toggle off calls `unregisterPushToken` and removes the locally cached token.

---

## 5. Mobile (Capacitor native app) push — new

This repo's mobile app is a Capacitor wrapper (`capacitor.config.ts`, `appId: com.boiaro.app`) that loads `https://boiaro.com` in a native WebView — there's no separate native codebase to maintain. Push notifications for it use the `@capacitor/push-notifications` plugin (FCM on Android, APNs-via-FCM on iOS), since standard browser web push doesn't work reliably inside a native WebView shell.

### Files
- `src/lib/nativePush.ts`:
  - `isNativePushSupported()` — `Capacitor.isNativePlatform()`.
  - `registerNativePush(onToken, onNotificationTap)` — requests OS permission, calls `PushNotifications.register()`, and wires up all four plugin listeners (`registration`, `registrationError`, `pushNotificationReceived`, `pushNotificationActionPerformed`). Returns a cleanup function.
- `capacitor.config.ts` — added a `plugins.PushNotifications.presentationOptions` block (`badge`, `sound`, `alert`) so foreground notifications show natively on iOS.

### Required manual step before building the native apps
The plugin needs Firebase's native config files, which only Firebase Console can generate per-platform (cannot be fabricated):
1. In Firebase Console, add an **Android app** with package name `com.boiaro.app` → download `google-services.json` → place at `android/app/google-services.json` after running `npx cap add android`.
2. Add an **iOS app** with bundle ID `com.boiaro.app` → download `GoogleService-Info.plist` → add to the Xcode project after running `npx cap add ios`.
3. For iOS, also enable the **Push Notifications** capability in Xcode and upload an APNs auth key to Firebase Console (Project Settings → Cloud Messaging → Apple app configuration).
4. Run `npx cap sync` after adding the plugin/config files.

This sandbox has no Android Studio/Xcode, so the native build itself wasn't (and can't be) test-run here — only the shared TypeScript registration logic was verified (typecheck + production build both pass).

---

## 6. Shared orchestration

`src/hooks/usePushNotifications.ts` is the single entry point both surfaces use:
- On a native platform → calls `registerNativePush`, including tap-to-navigate (deep links into the notification's `link` field).
- On the web → silently re-registers if permission was already granted, and subscribes to foreground messages (refreshes the notification bell badge + shows a lightweight `Notification` while the tab is focused).
- Exposes `enablePush()` / `disablePush()` for explicit user opt-in/opt-out, wired into the toggle in `src/pages/NotificationSettings.tsx`.

Mounted once at the app root via `src/components/PushNotificationManager.tsx` (added to `src/App.tsx` alongside the existing `PresenceTracker`/`BandwidthReporter` pattern) — silent, renders nothing, active whenever a user is logged in.

---

## 7. Admin configuration (`/admin` → Push Settings)

Two config blocks, both stored in `platform_settings` (not env vars, so they're editable without a redeploy):
1. **Firebase Service Account** (existing) — the Admin SDK private key JSON, used server-side only to *send* pushes.
2. **Web Push Config** (new) — the public Web SDK config + VAPID key, used client-side to *receive* pushes in the browser. These are not secrets (Firebase's web config is meant to ship inside the frontend bundle), but storing them in the DB rather than hardcoding avoids a rebuild whenever they change.

---

## 8. What was deliberately left out

- **No automatic push triggers for system events** (orders, payments, etc.) — today, exactly one code path creates notifications: the admin's manual "Send Notification" compose flow (`admin.sendNotification`). Wiring push notifications into other lifecycle events (order shipped, chapter unlocked, etc.) is a separate feature, not part of "complete the push delivery pipeline."
- **No retry/dead-letter handling for invalid tokens.** `sendPushToTokens` already silently drops failures (returns just a success count); pruning stale/unregistered tokens from `DevicePushToken` on FCM's `registration-token-not-registered` response would be a reasonable follow-up but wasn't requested.
