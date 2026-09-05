# BoiAro Push Notifications — Complete Payload Reference

Every push payload the BoiAro server sends, on every surface, and exactly what each
client receives.

For architecture, Firebase project setup and the admin UI, see
[PUSH_NOTIFICATIONS_API.md](PUSH_NOTIFICATIONS_API.md). This document is the **wire
format**.

Server source of truth: `server/src/lib/firebase.ts` → `sendPushToTokens()`.
One send path feeds all three surfaces — Android, iOS and web browser.

---

## ⚠️ Read this first — the two traps

**1. `data.notification_id` is NOT the id you mark as read.**

The push carries `Notification.id` (the *content* row, shared by every recipient).
`GET /api/v1/notifications` returns, and `POST /api/v1/notifications/read` expects,
`UserNotification.id` (the *per-user delivery* row). One content row fans out to many
delivery rows, so **the two ids are never equal**:

```
push data.notification_id = 59829abe-7d78-400b-8fd8-38f638382c6f   ← one content row
list id / read id         = bd8857b8-ae4b-4395-bece-e76135254468   ← per user
                            93c702cf-005c-4490-974e-d6f66077c746
                            d085a85c-13db-4b6c-b960-1dab3876db62
```

Passing `data.notification_id` to `/read` matches zero rows and **still returns
`{"success": true}`** — a silent no-op. To mark the tapped notification read, fetch the
list and use the `id` from there. Treat `data.notification_id` as a correlation key only.

**2. `data.link` and `data.notification_id` are optional.** They're conditionally added,
so many pushes arrive as just `{"type": "..."}`. Never index into them unguarded.

---

## 1. The FCM message the server builds

Identical construction for every notification, on every surface:

```json
{
  "notification": {
    "title": "🎧 \"রাতও কথা বলে\" এখন শোনা যাচ্ছে",
    "body":  "সম্প্রতি প্রচারিত অনুষ্ঠানটি যেকোনো সময় শুনুন।",
    "imageUrl": "https://cdn.boiaro.com/images/abc.jpg"
  },
  "data": {
    "type": "catchup_published",
    "link": "/shows/c69f6b44-b2bb-4004-8851-77dc70a8b644",
    "notification_id": "9f1c2d3e-4567-890a-bcde-f1234567890a"
  },
  "android": { "priority": "high", "notification": { "sound": "default" } },
  "apns":    { "payload": { "aps": { "sound": "default" } } }
}
```

| Field | Always? | Notes |
|---|---|---|
| `notification.title` | **yes** | Bengali text, usually with a leading emoji |
| `notification.body` | **yes** | Called `message` server-side, delivered as `body` |
| `notification.imageUrl` | **no** | **Only** on admin-composed sends. Every code-triggered type omits it |
| `data.type` | **yes** | Falls back to `"general"` when the sender omits it |
| `data.link` | **no** | App-relative path. Absent on several types — see §4 |
| `data.notification_id` | **no** | `Notification.id`. See the warning above |

**All `data` values are strings.** FCM transports `data` as a string map — no numbers,
booleans or nested objects.

**A `notification` block is always present**, so these are *notification messages*, not
data-only messages:

- **Background / killed** → the OS renders the tray item itself. Your code runs only on
  **tap**; read `data` there.
- **Foreground** → nothing is shown automatically. The app renders its own banner.

Never set by the server, so don't depend on them: `collapse_key`, `ttl`, `channel_id`,
`click_action`, `badge`, `sound` beyond `"default"`.

> **Android:** `sound: "default"` is set but **no `channel_id`**. Create a default
> channel in the app, or Android 8+ falls back to system defaults.

---

## 2. What each surface actually receives

The server sends one message; the three clients unwrap it differently.

### Android / iOS — Capacitor (`@capacitor/push-notifications`)

```js
PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
  const link = action.notification?.data?.link;   // may be undefined
  const type = action.notification?.data?.type;   // always present
});
```

`data` arrives exactly as sent. On iOS the `aps.sound` drives the alert sound; on
Android `priority: "high"` gets it delivered promptly in Doze.

### Web — service worker, background (`public/firebase-messaging-sw.js`)

FCM's JS SDK exposes the image as **`payload.notification.image`**, not `imageUrl`. The
service worker re-shapes the message before displaying it, and **passes only `link`
through** — `type` and `notification_id` are dropped at this point:

```js
messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification?.title || "BoiAro", {
    body:  payload.notification?.body || "",
    icon:  "/favicon-64.png",
    badge: "/favicon-32.png",
    image: payload.notification?.image,   // note: .image, not .imageUrl
    data:  { link: payload.data?.link || "/" },
  });
});
```

On click it focuses an existing tab and navigates, else opens a new window.

### Web — foreground (`src/lib/webPush.ts`)

Normalised to a flat object before reaching UI code:

```ts
{ title?: string; body?: string; link?: string; image?: string }
```

---

## 3. Complete type list

Every `data.type` the application can emit. Types marked **live** have been observed in
production; the rest are wired up and will fire when their trigger occurs.

### Radio / On Air — all gated by `radio_enabled`

| `type` | `link` | Trigger | |
|---|---|---|---|
| `rj_live` | `/live/{liveSessionId}` | A followed RJ goes live | **live** |
| `show_reminder_30` | `/schedule#{scheduleId}` | 30 min before a scheduled show | |
| `show_reminder_10` | `/schedule#{scheduleId}` | 10 min before a scheduled show | |
| `show_cancelled` | `/schedule` | A followed RJ's show is cancelled | |
| `show_rescheduled` | `/schedule` | A followed RJ's show moves | |
| `catchup_published` | `/shows/{episodeId}` **or** `/catchup` | A recording is published — see note | |
| `special_announcement` | custom, defaults to `/schedule` | Manual RJ/admin announcement | |

> **`catchup_published` carries two different link shapes.** A published **recorded
> show** deep-links to `/shows/{episodeId}`; the older Icecast catch-up feed links to the
> bare `/catchup` list. Route on the path, not the type — don't assume an id is there.

### Orders & support

| `type` | `link` | Trigger | Gate | |
|---|---|---|---|---|
| `order` | `/orders` | Order cancelled | `order_enabled` | **live** |
| `support` | `/support/tickets/{ticketId}` | Admin replies to a ticket | `support_enabled` | |

### Engagement & rewards

| `type` | `link` | Trigger | Gate | |
|---|---|---|---|---|
| `weekly_summary` | `/profile?tab=weekly-report` | Weekly report ready (Sun 18:00 Dhaka) | `reminder_enabled` | **live** |
| `inactivity_alert` | `/book/{bookSlug}` | User inactive — points at their last book | `reminder_enabled` | **live** |
| `competition_won` | *(none)* | Competition payout | `promotional_enabled` | **live** |
| `monthly_leaderboard_won` | *(none)* | Monthly leaderboard prize | *push_enabled only* | |
| `streak_alert` | *(none)* | Streak about to lapse | `reminder_enabled` | **retired** |

> `streak_alert` sent 4,771 notifications up to **2026-08-20** and is now
> **deliberately unscheduled** — the nightly send caused an unwanted spike in evening app
> opens. Handle the type defensively; expect none.

### Admin-composed broadcasts

Chosen from a fixed list in Admin → Notifications. The admin writes the link freehand and
may attach an image — **the only types that can carry `imageUrl`**.

| `type` | `link` | `imageUrl` | |
|---|---|---|---|
| `system` | admin-supplied, may be empty | optional | **live** |
| `order` | admin-supplied, may be empty | optional | |
| `payment` | admin-supplied, may be empty | optional | |
| `creator` | admin-supplied, may be empty | optional | |
| `promotional` | admin-supplied, may be empty | optional | **live** |

Admin **templates** (`notification_templates`) additionally store `cta_text` / `cta_link`,
but those are **not** part of the push payload — only `title`, `message`, `type`, `link`
and `image_url` reach FCM.

### Fallback

| `type` | Meaning |
|---|---|
| `general` | Emitted when a sender omits the type. Treat as `system`. |

**Handle unknown types gracefully** — open the notification list rather than dropping the
tap. New types ship server-side without an app release.

---

## 4. Deep-link routing

`link` is always an **app-relative path**, never an absolute URL.

| Link pattern | Screen |
|---|---|
| `/live/{sessionId}` | Live show / player |
| `/schedule` · `/schedule#{id}` | Show schedule (scroll to id when present) |
| `/shows/{episodeId}` | Recorded show detail → play |
| `/shows` | Recorded show archive ("আগের অনুষ্ঠান") |
| `/catchup` | Legacy catch-up list |
| `/orders` | My orders |
| `/support/tickets/{id}` | Support ticket thread |
| `/profile?tab=weekly-report` | Profile → weekly report tab |
| `/book/{slug}` | Book detail |
| *(absent or empty)* | Open the in-app notification list |

"No link" is a normal case, not an error.

---

## 5. Why a push may never arrive

Delivery is dropped, silently, unless **all four** hold:

1. Platform setting `firebase_push_enabled` ≠ `"false"` *(global kill switch)*
2. The user's `NotificationPreference.push_enabled` ≠ `false`
3. The type's category preference ≠ `false`:

| Preference | Gates |
|---|---|
| `radio_enabled` | `rj_live`, `show_reminder_*`, `show_cancelled`, `show_rescheduled`, `catchup_published`, `special_announcement` |
| `order_enabled` | `order` (cancellation) |
| `support_enabled` | `support` |
| `reminder_enabled` | `weekly_summary`, `inactivity_alert`, `streak_alert` |
| `promotional_enabled` | `competition_won` |
| *(none — 1 & 2 only)* | `monthly_leaderboard_won`, admin-composed broadcasts |

4. The user has at least one registered device token.

**The in-app row is created even when the push is suppressed.** So the notification list
can legitimately contain items the device never got a push for — always sync the list on
app open rather than building it from pushes.

---

## 6. Token registration

**`POST /api/v1/notifications/register-token`** *(auth)*

```json
{ "token": "<FCM registration token>", "platform": "android" }
```

`platform`: `"android"` | `"ios"` | `"web"` — anything else is stored as `"android"`.

```json
{ "success": true, "push_enabled": true, "firebase_configured": true }
```

**`DELETE /api/v1/notifications/register-token`** *(auth)* — body `{ "token": "..." }`.

Unique per `(user_id, token)`, so re-registering is idempotent. Register on every app
start (FCM rotates tokens) and delete on logout, or the device keeps receiving the
previous account's notifications.

---

## 7. The in-app notification list

**`GET /api/v1/notifications?limit=20&offset=0`** *(auth)*

```json
{
  "notifications": [
    {
      "id": "bd8857b8-ae4b-4395-bece-e76135254468",
      "title": "🎧 \"রাতও কথা বলে\" এখন শোনা যাচ্ছে",
      "message": "সম্প্রতি প্রচারিত অনুষ্ঠানটি যেকোনো সময় শুনুন।",
      "type": "catchup_published",
      "link": "/shows/c69f6b44-…",
      "image_url": null,
      "is_read": false,
      "created_at": "2026-09-05T11:24:08.591Z"
    }
  ],
  "total": 42, "limit": 20, "offset": 0, "has_more": true
}
```

`limit` 1–100 (default 20). Note the payload field is `message` here but `body` in the
push, and `image_url` here but `imageUrl` in the push.

**`POST /api/v1/notifications/read`** *(auth)* — `{ "ids": ["<id from this list>"] }`.
Omit `ids`, or send `[]`, to mark **all** as read. These are `UserNotification.id`s — see
the warning at the top.

---

## 8. Test checklist

- [ ] Token registered on login **and** every app start; deleted on logout
- [ ] Foreground push renders an in-app banner (the OS shows nothing)
- [ ] Background tap routes correctly for every `link` pattern in §4
- [ ] Push with **no** `link` opens the notification list
- [ ] Push with an **unknown** `type` does not crash
- [ ] Mark-as-read uses the id from `GET /notifications`, **not** `data.notification_id`
- [ ] Bengali text and emoji render correctly in the tray
- [ ] `imageUrl` renders on admin broadcasts; its absence is handled everywhere else
- [ ] Android notification channel exists (payload sets no `channel_id`)
- [ ] Notification list is synced on app open, not built from pushes alone
