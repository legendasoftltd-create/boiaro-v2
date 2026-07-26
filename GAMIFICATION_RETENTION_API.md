# Gamification & Retention API

Reference for the mobile app covering: Daily Reward, Streak, Badges, Weekly
Report + shareable cards, Home Screen Leaderboard, Spin Wheel, Quiz, and
Mega Competitions. Base URL and auth headers: see
[REST_API.md](REST_API.md). All endpoints below are under `/api/v1`.

---

## Streak

A login streak — consecutive calendar days the app has recorded activity
for this user. It underlies both the Daily Reward schedule and the
`streak`-type badge (🔥 ৭ দিনের ধারা, awarded at 7).

### `POST /gamification/streak/update`

Advances the streak for today. 🔒 Auth required. Call once per app open —
idempotent for the rest of the day (repeat calls the same day are no-ops).
You normally don't need to call this directly: `POST /gamification/daily-reward`
(below) advances it for you as part of claiming.

```http
POST /api/v1/gamification/streak/update
```

**Response (200):**
```json
{ "user_id": "uuid", "current_streak": 3, "best_streak": 5, "last_activity_date": "2026-07-26" }
```

### `GET /gamification/streak`

```json
{ "current_streak": 3, "best_streak": 5, "last_activity_date": "2026-07-26" }
```

---

## Daily Reward

<a name="daily-reward"></a>

A Day 1–7 escalating coin reward, tied to the login streak above. Day
resets to 1 after a missed day (streak breaks) or after completing day 7
(cycles). Reward amounts are admin-configurable — always read `schedule`
from the response rather than hardcoding amounts client-side.

### `GET /gamification/daily-reward/status`

Preview without claiming — use this to render the Day 1–7 dialog on app
open before the user taps claim.

```json
{
  "claimed_today": false,
  "day": 3,
  "schedule": [5, 10, 15, 20, 25, 30, 50],
  "reward": 15
}
```

### `POST /gamification/daily-reward`

Claims today's reward. 🔒 Auth required. Once per calendar day. This call
also advances the streak (see above) — you don't need a separate
`streak/update` call first.

```json
{
  "success": true,
  "reward": 15,
  "day": 3,
  "schedule": [5, 10, 15, 20, 25, 30, 50],
  "current_streak": 3
}
```

**Already claimed:** `{ "success": false, "reason": "already_claimed" }`

Also available at the legacy path `POST /wallet/claim-daily` (same logic,
slightly different response field names — kept for backward compatibility,
prefer the `/gamification/daily-reward` path for new integrations).

### Client UI notes

Render a 7-tile strip (Day 1–7), highlight the current `day`, mark days
`< day` as claimed/greyed with a checkmark, show `schedule[day-1]` as
today's claimable amount. No need to track claim history client-side — the
server is authoritative on `claimed_today` and `day` every time you call
`status`.

---

## Badges

Reading badges are unique-per-user-lifetime, auto-awarded server-side the
moment their condition is met (book completion count, streak length, etc.)
— there's no "claim" call, just display what's already been earned.

### `GET /gamification/badges/definitions`

All badge types that exist (earned or not), for rendering a full grid with
locked/unlocked state.

```json
{
  "definitions": [
    {
      "id": "uuid", "key": "first_book", "title": "🥉 প্রথম বই",
      "description": "১টি বই সম্পূর্ণ শেষ করলে", "category": "reading",
      "coin_reward": 20, "sort_order": 1
    }
  ]
}
```

### `GET /gamification/badges`

Badges this user has actually earned, with `earned_at`.

```json
{
  "badges": [
    { "id": "uuid", "key": "first_book", "title": "🥉 প্রথম বই", "coin_reward": 20, "earned_at": "2026-07-26T08:00:00.000Z" }
  ]
}
```

Render the grid by taking `definitions` and marking each as earned/locked
based on whether its `id` appears in `badges`.

### `GET /share/badge/:userBadgeId.png`

Generates a branded 1200×630 PNG for social sharing when a badge unlocks.
🔒 Auth required — only the badge's owner can render it (their display name
is baked into the card). `userBadgeId` is the `id` from `GET /gamification/badges`
(not the badge definition id).

```http
GET /api/v1/share/badge/{userBadgeId}.png
Authorization: Bearer <accessToken>
```

Returns `image/png` directly. On native, fetch as bytes and hand to the OS
share sheet (`Share.shareXFiles` in Flutter, or platform-native
UIActivityViewController/Intent.ACTION_SEND with the image attached) — don't
just share the URL, since it requires auth and isn't a stable public link.

---

## Weekly Report

<a name="weekly-report"></a>

A per-user "your week in reading" recap — total minutes across ebook +
audiobook, distinct books touched, and the delta vs. the prior 7 days. A
push notification (`type: "weekly_summary"`, see below) fires when it's
ready; deep-link to whatever screen renders this data.

### `GET /gamification/weekly-report`

```json
{
  "totalSeconds": 1500,
  "totalMinutes": 25,
  "bookCount": 1,
  "books": [{ "id": "uuid", "title": "ঠেলাগাড়ী", "cover_url": "https://..." }],
  "lastWeekSeconds": 900,
  "weekOverWeekPercent": 67
}
```

`weekOverWeekPercent` is `null` if there was no activity last week (no
baseline to compare against) — show the delta line conditionally.

### `GET /share/weekly-report.png`

Same auth/sharing pattern as the badge card above — 1200×630 PNG with this
week's minutes, book count, and top book.

---

## Home Screen Leaderboard

<a name="leaderboard"></a>

### `GET /gamification/leaderboard/home?period=&metric=`

Public — no auth required.

| Query param | Values | Default |
| :--- | :--- | :--- |
| period | `daily` \| `weekly` \| `monthly` | `weekly` |
| metric | `reading` \| `listening` \| `coins` | `reading` |

Windows are rolling (daily = last 24h, weekly = last 7 days, monthly = last
30 days), not calendar-aligned.

```json
{
  "leaderboard": [
    { "rank": 1, "user_id": "uuid", "total": 3600, "display_name": "রুকাইয়া মৌসুমী", "avatar_url": "https://..." }
  ]
}
```

`total` is **seconds** for `reading`/`listening` metrics, **coins** for the
`coins` metric — format accordingly (e.g. `total / 60` minutes, or `Xh Ym`
for larger values).

Can return `{ "leaderboard": [] }` if an admin has hidden the leaderboard
platform-wide — treat an empty array as "don't show this section" rather
than an error.

---

## Spin Wheel

<a name="spin-wheel"></a>

Admin-configured prize wheel with weighted-random payout and a daily spin
limit. Config (segments, odds, daily limit) is entirely server-driven —
never hardcode segment labels/rewards client-side.

### `GET /gamification/spin-wheel/status`

```json
{
  "available": true,
  "segments": [
    { "label": "5 coins", "coin_reward": 5, "weight": 3 },
    { "label": "10 coins", "coin_reward": 10, "weight": 2 },
    { "label": "Try again", "coin_reward": 0, "weight": 1 }
  ],
  "spinsToday": 0,
  "spinsPerDay": 2,
  "canSpin": true
}
```

`available: false` means no admin-configured wheel exists yet — hide the
feature entirely rather than showing an empty/broken wheel.

### `POST /gamification/spin-wheel/spin`

```json
{
  "success": true,
  "segment": { "label": "10 coins", "coin_reward": 10, "weight": 2 },
  "segmentIndex": 1,
  "segments": [ /* full segment list, for animating the wheel to segmentIndex */ ]
}
```

**Not available / limit reached:**
```json
{ "success": false, "reason": "daily_limit_reached" }
```
(`reason` is also `"not_configured"` if the admin hasn't set up a wheel.)

### Client UI notes

`weight` controls odds (probability), **not** visual slice size — render
segments as equal-size slices around the wheel regardless of weight. To
animate: compute the target rotation so `segmentIndex`'s slice centers
under a fixed pointer, add several full rotations for effect, and land on
it — the server has already decided the outcome by the time you get the
response, the animation is purely presentational.

---

## Quiz

<a name="quiz"></a>

One attempt per user per quiz, ever. Correct answers are never sent to the
client before submission.

### `GET /gamification/quizzes`

```json
{
  "quizzes": [
    {
      "id": "uuid", "title": "Book Trivia", "description": "Test your knowledge",
      "coin_reward": 20, "pass_percentage": 50,
      "attempt": null
    }
  ]
}
```

`attempt` is `null` if not yet taken, otherwise
`{ "score": 2, "total": 2, "passed": true, "coin_reward": 20 }` — use this
to show "Play" vs. a result badge.

### `GET /gamification/quizzes/:id`

```json
{
  "id": "uuid", "title": "Book Trivia", "coin_reward": 20, "pass_percentage": 50,
  "questions": [
    { "id": "uuid", "question": "2+2=?", "options": ["3", "4", "5"], "sort_order": 0 }
  ]
}
```

Note: no `correct_index` field — options are presented blind.

### `POST /gamification/quizzes/:id/submit`

```json
{ "answers": [1, 1] }
```

`answers[i]` is the chosen option index for `questions[i]`, in the same
order `GET /gamification/quizzes/:id` returned them.

**Response:**
```json
{ "success": true, "score": 2, "total": 2, "passed": true, "reward": 20, "correctIndexes": [1, 1] }
```
Use `correctIndexes` to show right/wrong per question after submitting.
Coins are only credited if `passed` — `reward` is `0` on a fail.

**Already attempted:** `{ "success": false, "reason": "already_attempted" }`
— show their prior result (from `GET /gamification/quizzes`) instead of a
retake option.

---

## Mega Competitions

<a name="competitions"></a>

Time-boxed contests ranked by a live metric (reading time, listening time,
purchases, or referrals) — no explicit "join" step, every user with
activity in the window is automatically ranked. Top 3 get coin prizes,
credited automatically once the competition ends (you'll also get a push
notification, `type: "competition_won"`).

### `GET /gamification/competitions`

Public. Active and recently-completed competitions (last 10).

```json
{
  "competitions": [
    {
      "id": "uuid", "title": "Test Reading Sprint", "description": null,
      "metric": "reading_time", "start_at": "2026-07-26T06:00:00.000Z", "end_at": "2026-08-02T06:00:00.000Z",
      "prize_coin_top1": 100, "prize_coin_top2": 50, "prize_coin_top3": 25,
      "prize_description": null, "status": "active"
    }
  ]
}
```

`metric` values: `reading_time`, `listening_time`, `purchases`, `referrals`.
`status`: `active` | `completed` | `cancelled`.

### `GET /gamification/competitions/:id/leaderboard`

Public. Live-computed ranking for the competition's window (top 20).

```json
{
  "leaderboard": [
    { "user_id": "uuid", "total": 1200, "display_name": "Super Admin", "avatar_url": null }
  ]
}
```

`total` is seconds for time-based metrics, a plain count for
purchases/referrals.

---

## Push notification types

New notification `type` values delivered via the existing FCM push pipeline
(see [REST_API.md § 12 Notifications](REST_API.md) for the base
`GET /notifications` shape) — use these to pick an icon/deep-link when a
push arrives:

| type | Fired when | Suggested deep-link |
| :--- | :--- | :--- |
| `inactivity_alert` | No reading/listening activity for 3 days | The book named in the notification `link` field |
| `streak_alert` | Streak active but no activity yet today (evening) | Reader/home — anywhere that lets them log activity fast |
| `weekly_summary` | Weekly report ready (Sunday) | Weekly Report screen (`GET /gamification/weekly-report`) |
| `competition_won` | A competition ended and this user placed top 3 | Wallet / coin balance |

All four are opt-out via the existing `reminder_enabled` /
`promotional_enabled` notification preferences (`competition_won` uses
`promotional_enabled`, the other three use `reminder_enabled`) — no new
preference toggles were added.
