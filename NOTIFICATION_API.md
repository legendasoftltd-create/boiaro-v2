# Notification API — REST Reference

The REST surface a client (mobile app, or any non-admin consumer) uses to read
notifications, mark them read, and register/unregister a device for push. Creating,
scheduling, and sending notifications is admin-only and lives in the tRPC admin
router (`admin.createNotification` / `admin.sendNotification` / etc.), not REST —
not covered here. For the push delivery pipeline design (web/native registration
flow), see [`PUSH_NOTIFICATIONS_API.md`](./PUSH_NOTIFICATIONS_API.md).

**Base URL**

```
Development: http://localhost:3001/api/v1
Production:  https://boiaro.com/api/v1
```

**Conventions**

| Header | Value |
| :--- | :--- |
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <accessToken>` *(all endpoints below except `GET /push/web-config`)* |

Error responses: `{ "error": "Error message description" }`.

---

## 1. Data model returned by these endpoints

### `Notification` fields exposed via `GET /notifications`

| Field | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid | this is the `UserNotification.id` (the per-user delivery record), not the underlying `Notification.id` — use it for `POST /notifications/read` |
| `title` | string | |
| `message` | string | |
| `type` | string | `system` \| `order` \| `payment` \| `creator` \| `promotional` |
| `link` | string \| null | deep-link path, e.g. `/orders/123` |
| `image_url` | string \| null | **image support** — absolute URL; render as a thumbnail in the notification list/bell |
| `is_read` | boolean | |
| `created_at` | ISO datetime | |

### `DevicePushToken` (written by the register-token endpoints)

| Field | Type | Notes |
| :--- | :--- | :--- |
| `token` | string | FCM registration token |
| `platform` | string | `android` \| `ios` \| `web` |
| `user_id` | uuid | from the auth token |

---

## 2. Endpoints

### `GET /notifications`

Get the authenticated user's notifications, most recent first. 🔒 Auth required.

**Query params:**

| Param | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `limit` | integer | `20` | clamped to `1`–`100` |
| `offset` | integer | `0` | |

**Success (200):**
```json
{
  "notifications": [
    {
      "id": "8f2c1e4a-...",
      "title": "New Book Available",
      "message": "Check out our latest release!",
      "type": "new_book",
      "link": "/book/the-great-gatsby",
      "image_url": "https://cdn.boiaro.com/banners/gatsby.jpg",
      "is_read": false,
      "created_at": "2026-08-09T10:00:00.000Z"
    },
    {
      "id": "3a91c7d0-...",
      "title": "Flash Sale!",
      "message": "50% off all audiobooks this weekend only.",
      "type": "promotional",
      "link": "/store/sale",
      "image_url": null,
      "is_read": true,
      "created_at": "2026-08-07T09:00:00.000Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```
`image_url` is `null` whenever the admin didn't attach an image — always render
title/message alone in that case, don't assume a placeholder image.

---

### `POST /notifications/read`

Mark one, many, or all notifications as read. 🔒 Auth required.

**Request body:**
```json
{ "ids": ["8f2c1e4a-...", "3a91c7d0-..."] }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `ids` | uuid[] | ❌ | the `id` values from `GET /notifications`. If omitted or `[]`, marks **all** unread notifications as read. |

**Mark all as read:**
```json
{}
```

**Success (200):**
```json
{ "success": true, "message": "Notifications marked as read" }
```

---

### `POST /notifications/register-token`

Register a device push token (FCM) for the authenticated user. Call this after the
user grants push permission and you receive an FCM token. 🔒 Auth required.

**Request body:**
```json
{ "token": "fcm-device-token", "platform": "android" }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `token` | string | ✅ | FCM registration token |
| `platform` | string | ❌ | `android` \| `ios` \| `web`, default `android`. An unrecognized value also falls back to `android`. |

Upserts into `device_push_tokens`, unique on `(user_id, token)` — safe to call
repeatedly with the same token (e.g. on every app launch).

**Success (200):**
```json
{ "success": true, "push_enabled": true, "firebase_configured": true }
```
`firebase_configured` is `false` if the server has no Firebase Admin credentials
set — pushes to this token won't actually be delivered until an admin configures
Firebase, even though the token registration itself succeeded.

---

### `DELETE /notifications/register-token`

Unregister a device push token — call on logout or when the user disables push in
settings. 🔒 Auth required.

**Request body:**
```json
{ "token": "fcm-device-token" }
```

**Success (200):**
```json
{ "success": true }
```

---

### `GET /push/web-config`

Public — **no auth required**. Returns the Firebase **Web SDK** config (client-safe
values only, no secrets) so the browser main thread and the
`firebase-messaging-sw.js` service worker can initialize Firebase Cloud Messaging
for browser push. Not something a mobile app needs to call.

**Success — configured (200):**
```json
{
  "configured": true,
  "apiKey": "AIza...",
  "authDomain": "boiaro-app.firebaseapp.com",
  "projectId": "boiaro-app",
  "storageBucket": "boiaro-app.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abcdef",
  "vapidKey": "BF3d..."
}
```

**Success — not configured or push disabled (200):**
```json
{ "configured": false }
```

---

## 3. How `image_url` reaches the device

An admin attaches `image_url` when composing a notification. It flows through FCM
and shows up differently per surface:

| Surface | Behavior |
| :--- | :--- |
| `GET /notifications` response | `image_url` as-is — render as a thumbnail in the in-app notification list/bell |
| Web push, tab unfocused/closed | Rendered as a large image in the OS notification banner (via the service worker) |
| Web push, tab open & focused | Shown in the lightweight in-page `Notification` popup |
| Android / iOS native app | Rendered by the OS as a big-picture / attachment-style push notification |

If the admin didn't set an image, `image_url` is `null` and every surface above
falls back to a plain title+body notification — no broken image icon, nothing to
special-case client-side beyond a normal null check.

---

## 4. Quick reference

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| GET | `/notifications` | ✅ | List notifications (paginated) |
| POST | `/notifications/read` | ✅ | Mark one/many/all as read |
| POST | `/notifications/register-token` | ✅ | Register a device for push |
| DELETE | `/notifications/register-token` | ✅ | Unregister a device |
| GET | `/push/web-config` | ❌ | Public Firebase Web SDK config |
