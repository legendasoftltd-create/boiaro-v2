# BoiAro On Air — Recorded Shows — Mobile App API Reference

REST endpoints for the **On Air → Latest Shows / আগের অনুষ্ঠান** feature: the recorded
radio shows an admin has published for replay. These are the **only** APIs the mobile
app needs to list published shows, browse the archive, play one, and resume it later.

Base URL: `{API_BASE}/api/v1/radio`

**Auth**
- Read endpoints work **without** a token. Sending `Authorization: Bearer <access_token>`
  adds two things: access to `premium` shows, and the listener's own resume position.
- Endpoints marked **(auth)** require a bearer token.

**Required header on every `POST`**
- `X-Requested-With: XMLHttpRequest` — the API rejects a state-changing call without it
  (`403 FORBIDDEN`, `"Missing X-Requested-With header"`) unless the request carries a
  bearer token. `POST /shows/:id/play` is callable while logged out, so **always send
  this header** on it. `POST` bodies must be `Content-Type: application/json`.

**Audio**
- `audio_url` is always an optimised **MP3 (128 kbps CBR, 44.1 kHz stereo)**. The Studio
  master WAV is a backup and is never returned by any endpoint.
- The URL is **pre-signed and expires ~6 hours after it was issued**. Don't cache it
  across sessions or store it in a local database — re-fetch the show and use the fresh
  `audio_url`. It is safe for the length of any single show.

---

## The show object

Every endpoint below returns shows in this shape.

```json
{
  "id": "c69f6b44-b2bb-4004-8851-77dc70a8b644",
  "title": "রাতও কথা বলে",
  "episode_title": "পর্ব ১২ — শীতের রাত",
  "description": "এই পর্বে যা ছিল…",
  "cover_image_url": "https://cdn.example/episode.jpg",
  "audio_url": "https://…/onair-episodes/….mp3?X-Amz-Signature=…",
  "mime_type": "audio/mpeg",
  "duration_seconds": 4680,
  "recorded_at": "2026-09-04T17:00:00.000Z",
  "published_at": "2026-09-05T05:00:00.000Z",
  "visibility": "public",
  "play_count": 128,
  "show_schedule_id": "…",
  "rj_user_id": "…",
  "rj_stage_name": "RJ শুভ্র ধ্রুব",
  "rj_avatar_url": "https://…",
  "station": { "id": "…", "name": "BoiAro Radio", "artwork_url": "https://…" },
  "resume_position_seconds": 930,
  "completed": false
}
```

| Field | Notes |
|---|---|
| `title` | Show name. Render as the card's first line. |
| `episode_title` | Nullable. Render as a second line only when present. |
| `cover_image_url` | Nullable. Already falls back server-side: episode cover → programme cover → station artwork. If it is still `null`, draw your own placeholder. |
| `audio_url` | `null` when the show is locked (see `visibility`). Never build a player around a null URL. |
| `duration_seconds` | Measured from the encoded MP3, so it always matches the file. Display as `1h 18m` / `42m`. |
| `published_at` | Use this for the card's date; fall back to `recorded_at` if null. |
| `visibility` | `public` · `premium` · `unlisted` — see below. |
| `resume_position_seconds`, `completed` | **Only present for an authenticated request.** Absent for anonymous callers. |

### Visibility

| | Appears in lists | Reachable by id |
|---|---|---|
| `public` | everyone | everyone |
| `premium` | subscribers only | non-subscribers get the card with `audio_url: null` and `"locked": true` — show an upgrade prompt, not an error |
| `unlisted` | never listed | anyone with the link (shared deep links) |

---

## 1. Latest Shows

**`GET /api/v1/radio/shows/latest?limit=5`**

The On Air screen's "সম্প্রতি প্রচারিত" strip. Newest published first.
`limit` defaults to `5`, max `20`. Show the first 3–5 and a **View All** button into §2.

Response `200`:
```json
{ "shows": [ { "id": "…", "title": "রাতও কথা বলে", "…": "…" } ] }
```

Returns `{ "shows": [] }` when nothing is published yet — hide the whole section in that case.

---

## 2. Show archive (View All)

**`GET /api/v1/radio/shows`**

| Query param | |
|---|---|
| `limit` | default `20`, max `50` |
| `cursor` | pass the previous response's `next_cursor` |
| `show_id` | filter by programme — ids come from §3 |
| `rj_id` | filter by RJ — ids come from §3 |
| `station_id` | filter by station |
| `sort` | `latest` (default) or `oldest` |

Response `200`:
```json
{ "shows": [ … ], "next_cursor": "c69f6b44-…" }
```

`next_cursor` is `null` on the last page. Paginate by passing it back as `cursor`.

---

## 3. Filter options

**`GET /api/v1/radio/shows/filters`**

Only programmes and RJs that actually have a published show behind them, so the
filter dropdowns never offer a choice that returns nothing.

```json
{
  "shows": [ { "id": "…", "name": "রাতও কথা বলে" } ],
  "rjs":   [ { "id": "…", "name": "RJ শুভ্র ধ্রুব" } ]
}
```

---

## 4. One show

**`GET /api/v1/radio/shows/:id`**

The deep-link target for a shared show, and the only way to reach an `unlisted` one.

Response `200`:
```json
{ "show": { "id": "…", "…": "…", "locked": false } }
```

Premium show, caller not subscribed — `200` with the card but no audio:
```json
{ "show": { "id": "…", "audio_url": null, "locked": true, "lock_reason": "premium", "…": "…" } }
```

`404` `{ "message": "Show not found" }` — not published, unpublished, or deleted.

---

## 5. Start playback

**`POST /api/v1/radio/shows/:id/play`**

Call once when the listener presses play. Counts the play and returns where they left off.
Works logged out (then the position is always `0`).

Headers: `X-Requested-With: XMLHttpRequest` (required), `Authorization` (optional).
No body.

Response `200`:
```json
{ "resume_position_seconds": 930, "completed": false }
```

Seek straight to `resume_position_seconds` when it is greater than ~5 — resuming at
0:03 feels broken rather than helpful.

`403` `{ "message": "This show is for subscribers" }` — premium, caller not subscribed.
`404` — not published.

---

## 6. Read saved position **(auth)**

**`GET /api/v1/radio/shows/:id/progress`**

```json
{ "position_seconds": 930, "duration_seconds": 4680, "completed": false }
```

Returns the zero-value object (not a 404) when the listener has never played it.

---

## 7. Save position **(auth)**

**`POST /api/v1/radio/shows/:id/progress`**

```json
{ "position_seconds": 930, "duration_seconds": 4680 }
```

`duration_seconds` is optional — the server falls back to the show's own duration.

Call it:
- every ~15 seconds while playing,
- on pause,
- and when the app goes to background (`onPause` / `applicationDidEnterBackground`).

That last one matters most: on mobile, backgrounding is how a listening session usually
ends, and skipping it silently costs the listener their place.

Response `200` — the stored progress row. `completed` flips to `true` at ≥95% of the
duration (the last minutes of a radio show are usually outro or jingle).

`404` `{ "message": "Show not found" }` for an unknown id.

---

## 8. Listening history **(auth)**

**`GET /api/v1/radio/shows-history`**

"আমার শোনা" — the listener's played shows, most recently played first, max 50.
Note the path is `shows-history`, **not** `shows/history` (which would read as a show id).

```json
{
  "history": [
    {
      "id": "…", "episode_id": "…", "user_id": "…",
      "position_seconds": 930, "duration_seconds": 4680,
      "completed": false, "total_plays": 2,
      "last_played_at": "2026-09-05T11:24:08.591Z",
      "show": { "id": "…", "title": "রাতও কথা বলে", "…": "…" }
    }
  ]
}
```

Unpublished shows drop out of this list automatically — an entry always has a playable
`show` attached.

---

## Player requirements

Reuse the app's existing audiobook player. A recorded show needs:

- Play / pause, seek, current time, total duration
- **Background playback** and **lock-screen / notification controls** — set the media
  metadata from `title`, `episode_title`, `rj_stage_name` and `cover_image_url`
- **Resume**: seek to `resume_position_seconds` from §5 on start, and post progress per §7

The MP3 carries a Xing header, so seeking is accurate without scanning the whole file.

---

## Screen flow

```
On Air screen
├─ Live Radio          (existing /api/v1/radio/live)
├─ Radio Stations      (existing /api/v1/radio/stations)
├─ Latest Shows        §1  → tap a card → §5 then play
│  └─ View All         → Archive screen
└─ Upcoming Shows      (existing schedule endpoints)

Archive screen ("আগের অনুষ্ঠান")
├─ filters             §3
├─ list + paging       §2
└─ tap a card          → §5 then play
```

Do not label anything "Recordings" in the UI — that word describes the admin's raw
files. Use **আগের অনুষ্ঠান**, **Shows**, or **Replay**.

---

## Errors

| Status | Meaning |
|---|---|
| `403` `"Missing X-Requested-With header"` | Add the header to the `POST` |
| `403` `"This show is for subscribers"` | Premium show, no active subscription |
| `404` `"Show not found"` | Not published, unpublished, deleted, or a bad id |
| `401` | Missing/expired token on an **(auth)** endpoint — refresh and retry |
