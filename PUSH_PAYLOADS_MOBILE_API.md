# BoiAro Push Notifications — Payload Reference (Mobile App)

Every FCM message the BoiAro server sends, and exactly what the app receives.

This is the **payload contract**. For architecture, Firebase project setup and the
web-push side, see [PUSH_NOTIFICATIONS_API.md](PUSH_NOTIFICATIONS_API.md).

Server source of truth: `server/src/lib/firebase.ts` → `sendPushToTokens()`.

---

## 1. The message shape — identical for every notification

The server always sends a **multicast notification message** built like this:

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
  "android": {
    "priority": "high",
    "notification": { "sound": "default" }
  },
  "apns": {
    "payload": { "aps": { "sound": "default" } }
  }
}
```

### Field rules — read these before coding

| Field | Always present? | Notes |
|---|---|---|
| `notification.title` | **yes** | Often contains an emoji and Bengali text. |
| `notification.body` | **yes** | Sent as `message` server-side, delivered as `body`. |
| `notification.imageUrl` | **no** | Only ever set on **admin-composed** notifications. Every code-triggered type omits it. |
| `data.type` | **yes** | Falls back to `"general"` when the sender omits it. Use it to route/categorise. |
| `data.link` | **no** | Absent on several types (see §3). Never assume it exists. |
| `data.notification_id` | **no** | Present for user-targeted sends; absent for some broadcast paths. Use it to mark-as-read via the API. |

**All `data` values are strings.** FCM transports `data` as a string map — there are no
numbers, booleans or nested objects anywhere in `data`.

**There is a `notification` block**, so this is a *notification message*, not a
data-only message. That means:

- **Background / killed:** the OS renders the tray notification itself. Your code runs
  only when the user **taps** it — read `data` there.
- **Foreground:** nothing is shown automatically. The app must render its own in-app
  banner from `title` / `body`.

Not set by the server, so don't rely on them: `collapse_key`, `ttl`, `channel_id`,
`click_action`, `badge`, `priority` inside `data`.

> **Android channel:** the payload sets `sound: "default"` but no `channel_id`. Create a
> default channel in the app or Android 8+ will use the system fallback.

---

## 2. Registering for push

**`POST /api/v1/notifications/register-token`** *(auth)*

```json
{ "token": "<FCM registration token>", "platform": "android" }
```

`platform`: `"android"` | `"ios"` | `"web"` — anything else is stored as `"android"`.

Response:
```json
{ "success": true, "push_enabled": true, "firebase_configured": true }
```

**`DELETE /api/v1/notifications/register-token`** *(auth)* — body `{ "token": "..." }`.
Call on logout and when the user turns push off; otherwise the device keeps receiving
the previous account's notifications.

Tokens are unique per `(user_id, token)`, so re-registering the same token is safe and
idempotent. Register on every app start — FCM rotates tokens.

---

## 3. Every notification type

`data.type` values the app can receive, with the `link` each one carries.

### Radio / On Air

| `type` | `link` | Trigger |
|---|---|---|
| `rj_live` | `/live/{liveSessionId}` | An RJ the user follows goes live |
| `show_reminder_30` | `/schedule#{scheduleId}` | 30 min before a scheduled show |
| `show_reminder_10` | `/schedule#{scheduleId}` | 10 min before a scheduled show |
| `show_cancelled` | `/schedule` | A followed RJ's show is cancelled |
| `show_rescheduled` | `/schedule` | A followed RJ's show moves |
| `catchup_published` | `/shows/{episodeId}` **or** `/catchup` | A recording is published — see note |
| `special_announcement` | custom, defaults to `/schedule` | Manual RJ/admin announcement |

> **`catchup_published` carries two different link shapes.** A newly published
> **recorded show** links to `/shows/{episodeId}` (deep-link to that episode). The older
> Icecast catch-up feed links to the bare `/catchup` list. Route on the path, not on the
> type — do not assume an id is present.

### Orders, support, account

| `type` | `link` | Trigger |
|---|---|---|
| `order` | `/orders` | Order cancelled |
| `support` | `/support/tickets/{ticketId}` | Admin replies to a support ticket |

### Engagement / rewards

| `type` | `link` | Trigger |
|---|---|---|
| `weekly_summary` | `/profile?tab=weekly-report` | Weekly reading report ready (Sun 18:00 Dhaka) |
| `inactivity_alert` | `/book/{bookSlug}` | User inactive — points at their last book |
| `competition_won` | *(none)* | Competition payout |
| `monthly_leaderboard_won` | *(none)* | Monthly leaderboard prize |
| `streak_alert` | *(none)* | **Not currently sent** — deliberately unscheduled, see note |

> `streak_alert` exists in the code but is **not scheduled**: sending it daily caused an
> unwanted evening spike in app opens. Handle the type defensively, but expect none.

### Admin-composed broadcasts

Sent from Admin → Notifications. The admin picks the type from a fixed list, writes the
link freehand, and may attach an image (**the only types that can carry `imageUrl`**):

| `type` | `link` | `imageUrl` |
|---|---|---|
| `system` | admin-supplied, may be empty | optional |
| `order` | admin-supplied, may be empty | optional |
| `payment` | admin-supplied, may be empty | optional |
| `creator` | admin-supplied, may be empty | optional |
| `promotional` | admin-supplied, may be empty | optional |

### Fallback

| `type` | Meaning |
|---|---|
| `general` | Emitted when a sender omits the type. Treat as `system`. |

**Handle unknown types gracefully** — open the app's notification list rather than
crashing or dropping the tap. New types get added server-side without an app release.

---

## 4. Deep-link routing

`link` is always an **app-relative path**, never a full URL. Map it to a screen:

| Link pattern | Screen |
|---|---|
| `/live/{sessionId}` | Live show / player |
| `/schedule` · `/schedule#{id}` | Show schedule (scroll to the id when present) |
| `/shows/{episodeId}` | Recorded show detail → play |
| `/shows` | Recorded show archive ("আগের অনুষ্ঠান") |
| `/catchup` | Legacy catch-up list |
| `/orders` | My orders |
| `/support/tickets/{id}` | Support ticket thread |
| `/profile?tab=weekly-report` | Profile → weekly report tab |
| `/book/{slug}` | Book detail |
| *(absent or empty)* | Open the in-app notification list |

Because `link` may be missing, treat "no link" as a first-class case, not an error.

---

## 5. Delivery gating — why a user may get nothing

A push is dropped, silently, unless **all** of these hold:

1. `firebase_push_enabled` platform setting is not `"false"` *(global kill switch)*
2. The user's `NotificationPreference.push_enabled` is not `false`
3. The type's category preference is not `false` — this is per-type:

| Category preference | Gates these types |
|---|---|
| `radio_enabled` | `rj_live`, `show_reminder_*`, `show_cancelled`, `show_rescheduled`, `catchup_published`, `special_announcement` |
| `order_enabled` | `order` (cancellation) |
| `support_enabled` | `support` |
| `reminder_enabled` | `weekly_summary`, `inactivity_alert`, `streak_alert` |
| `promotional_enabled` | `competition_won` |
| *(none — only 1 & 2)* | `monthly_leaderboard_won`, admin-composed broadcasts |

4. The user has at least one registered device token.

**The in-app notification row is still created even when the push is suppressed.** So
`GET /api/v1/notifications` can legitimately show items the device never got a push for
— always sync the list on app open rather than building it purely from pushes.

---

## 6. Reading and clearing notifications

**`GET /api/v1/notifications`** *(auth)* — the user's in-app list.

**`POST /api/v1/notifications/read`** *(auth)* — mark as read. Use the
`data.notification_id` from the payload when it's present.

Both need `X-Requested-With: XMLHttpRequest` on the `POST` unless the request carries a
bearer token (it will, since these are authenticated).

---

## 7. Test checklist

- [ ] Token registered on login **and** on every app start (FCM rotates tokens)
- [ ] Token deleted on logout
- [ ] Foreground push renders an in-app banner (the OS shows nothing)
- [ ] Background tap opens the right screen for each `link` pattern in §4
- [ ] Push with **no** `link` opens the notification list
- [ ] Push with an **unknown** `type` does not crash
- [ ] Bengali text and emoji render correctly in the tray
- [ ] `imageUrl` renders on admin broadcasts; absence is handled everywhere else
- [ ] Android: a notification channel exists (the payload sets no `channel_id`)
