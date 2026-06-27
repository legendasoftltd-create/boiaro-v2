# Firebase / Push Notification — API List

All APIs related to Firebase Cloud Messaging (FCM) push notifications: admin configuration, device token registration, and delivery.

Base URLs:
- tRPC: `{API_BASE}/trpc/{router}.{procedure}`
- REST: `{API_BASE}/api/v1/...`

---

## 1. Admin — Firebase configuration (tRPC, admin-only)

### `admin.getFirebaseSettings`
**Type:** query
**Auth:** admin

Returns current Firebase config (service account JSON is returned as-is for the admin UI to mask/show).

Response:
```json
{
  "service_account_json": "{...}",
  "push_enabled": true,
  "web_api_key": "AIza...",
  "web_auth_domain": "boiaro.firebaseapp.com",
  "web_project_id": "boiaro",
  "web_storage_bucket": "boiaro.appspot.com",
  "web_messaging_sender_id": "123456789",
  "web_app_id": "1:123456789:web:abc123",
  "web_vapid_key": "B..."
}
```

### `admin.saveFirebaseSettings`
**Type:** mutation
**Auth:** admin

Input:
```json
{
  "service_account_json": "{...}",
  "push_enabled": true,
  "web_api_key": "AIza...",
  "web_auth_domain": "boiaro.firebaseapp.com",
  "web_project_id": "boiaro",
  "web_storage_bucket": "boiaro.appspot.com",
  "web_messaging_sender_id": "123456789",
  "web_app_id": "1:123456789:web:abc123",
  "web_vapid_key": "B..."
}
```
Response: `{ "success": true }`

Persists everything to `platform_settings` (DB-managed, no redeploy needed) and invalidates the cached Admin SDK app instance.

### `admin.testFirebasePush`
**Type:** mutation
**Auth:** admin

No input. Sends a dry-run FCM message to verify the service account credentials are valid.

Response:
```json
{ "ok": true }
```
or
```json
{ "ok": false, "error": "..." }
```

### `admin.sendNotification`
**Type:** mutation
**Auth:** admin

Input: `{ "id": "<notification_id>" }`

Sends an already-composed notification to its target audience: creates `UserNotification` rows (in-app) and, if push is enabled and the user hasn't opted out (`NotificationPreference.push_enabled`), fans out an FCM push to all of that user's registered device tokens.

Response:
```json
{ "sent": 42, "push_sent": 37 }
```

---

## 2. Public — Web SDK config (REST, no auth)

### `GET /api/v1/push/web-config`
**Auth:** none (public — these are client-safe values, not secrets)

Returns the Firebase Web SDK config needed by the browser and the service worker to receive web push. Returns `{ "configured": false }` if not yet set up in the admin panel, or if push is globally disabled.

Response (configured):
```json
{
  "configured": true,
  "apiKey": "AIza...",
  "authDomain": "boiaro.firebaseapp.com",
  "projectId": "boiaro",
  "storageBucket": "boiaro.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123",
  "vapidKey": "B..."
}
```

Response (not configured):
```json
{ "configured": false }
```

---

## 3. Device token registration

### tRPC — `notifications.registerPushToken`
**Type:** mutation
**Auth:** logged-in user

Input:
```json
{ "token": "<fcm-or-web-push-token>", "platform": "web" }
```
`platform`: `"android" | "ios" | "web"` (defaults to `"web"`)

Upserts into `device_push_tokens`, unique per `(user_id, token)`.

### tRPC — `notifications.unregisterPushToken`
**Type:** mutation
**Auth:** logged-in user

Input: `{ "token": "<token>" }`

Deletes the token row — called on push opt-out.

### REST — `POST /api/v1/notifications/register-token`
**Auth:** Bearer token (mobile app)

Body:
```json
{ "token": "<fcm-token>", "platform": "android" }
```
`platform`: `"android" | "ios" | "web"`

Response:
```json
{ "success": true, "push_enabled": true, "firebase_configured": true }
```

### REST — `DELETE /api/v1/notifications/register-token`
**Auth:** Bearer token (mobile app)

Body: `{ "token": "<token>" }`

Response: `{ "success": true }`

---

## 4. Internal sending helper (not an HTTP API — server-side only)

`server/src/lib/firebase.ts`:
- `sendPushToTokens(tokens, payload)` — multicast FCM send, returns success count. No-ops silently if Firebase isn't configured.
- `testFirebaseCredentials()` — dry-run validation used by `admin.testFirebasePush`.
- `isFirebaseConfigured()` — used by the REST register-token response.
- `invalidateFirebaseCache()` — forces re-init of the cached Admin SDK app after settings change.

---

## 5. Where each platform fits

| Platform | Registers via | Receives via |
| :--- | :--- | :--- |
| Web (browser) | `notifications.registerPushToken` (tRPC) | Firebase Web SDK + `public/firebase-messaging-sw.js`, config from `GET /api/v1/push/web-config` |
| Mobile (Capacitor native app, this repo) | `notifications.registerPushToken` (tRPC) | `@capacitor/push-notifications` plugin → FCM (Android) / APNs via FCM (iOS) |
| Any external mobile app consuming the REST API | `POST /api/v1/notifications/register-token` | Native FCM/APNs SDK on that app's side |
