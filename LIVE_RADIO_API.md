# Live Radio (FM) API

Reference for the mobile app covering live streaming, real-time chat/
reactions/song-requests, host moderation, program schedule, RJ profiles,
and catch-up (podcast) audio. Base URL and auth headers: see
[REST_API.md](REST_API.md). REST endpoints below are under `/api/v1`; the
real-time layer is a separate Socket.IO connection (see below).

**Not covered here (explicitly deferred):** listeners joining the live
broadcast audio themselves (call-in) — that needs a WebRTC/media-SDK
integration that hasn't been built yet. Everything else in this doc is live.

---

## 1. Streaming

### `GET /radio/stations`
Public. All active stations.
```json
{ "stations": [{ "id": "uuid", "name": "BoiAro Radio", "stream_url": "https://...", "stream_url_medium": null, "stream_url_low": null, "artwork_url": "https://...", "description": "..." }] }
```
`stream_url_medium`/`stream_url_low` are `null` unless the admin configured
separate lower-bitrate mount points — only show a quality selector when at
least one is present. There's no server-side transcoding; these are real
alternate URLs the station itself provides.

### `GET /radio/live`
Public. The currently-live RJ session, if any (an ad-hoc broadcast takes
priority over the station's default stream when present).
```json
{
  "live": {
    "id": "uuid", "rj_user_id": "uuid", "show_title": "Morning Vibes",
    "stream_url": "https://...", "status": "live", "started_at": "2026-07-26T...",
    "station": { "id": "uuid", "name": "..." },
    "rj_profile": { "stage_name": "DJ Test", "avatar_url": null, "bio": "...", "specialty": "..." },
    "listener_count": 42
  }
}
```
`live` is `null` when nobody's broadcasting — fall back to the station's
own `stream_url`.

### Playback notes
- Streams may be plain MP3/AAC/OGG (play directly) or HLS (`.m3u8`). Use
  your platform's native HLS support (`AVPlayer` on iOS, `ExoPlayer`/Media3
  on Android both handle HLS natively) — no special handling needed
  mobile-side beyond picking a player that supports HLS, unlike the web
  client which had to add hls.js.
- For background/lock-screen playback, wire up the platform's standard
  background-audio mechanism (iOS: `AVAudioSession` background audio mode;
  Android: a foreground `MediaSessionService`) — this is entirely a
  client-side concern, nothing to call on the API for it.
- There's no way to query "is this specific stream URL currently healthy"
  from the API — Icecast/Shoutcast stream health isn't something this
  backend has visibility into. Handle playback errors client-side (retry
  with backoff, surface an error state) same as before.

---

## 2. Real-time layer (Socket.IO)

One connection handles chat, reactions, song requests, and live listener
count for whichever session you `join_session` into.

```
Socket.IO endpoint: same host as the REST API, path "/socket.io"
Auth: pass your access token in the connection handshake —
  io(baseUrl, { path: "/socket.io", auth: { token: accessToken } })
```

A connection **requires** a valid, non-expired access token — there is no
anonymous/guest socket connection (anonymous stream *listening* still works
fine over plain HTTP audio playback; only the interactive layer needs auth).
Refresh your token and reconnect the socket the same way you'd retry a REST
401.

### Client → Server events

| Event | Payload | Notes |
| :--- | :--- | :--- |
| `join_session` | `{ sessionId }` | Call once you know the live session id (from `GET /radio/live`). Leaves any previously-joined session automatically. |
| `leave_session` | *(none)* | Also happens automatically on disconnect. |
| `chat:send` | `{ sessionId, message }` | Max 500 chars. Rate-limited to 1 message per 2s per user — sending faster gets an `error` event, not silently dropped. |
| `reaction:send` | `{ sessionId, emoji }` | Ephemeral — broadcast only, nothing persisted. Use for a floating-emoji animation. |
| `song_request:send` | `{ sessionId, requestText }` | Max 200 chars. Persisted. |
| `moderation:delete_message` | `{ sessionId, messageId }` | Host/moderator only — others get an `error` event. |
| `song_request:update_status` | `{ sessionId, requestId, status }` | Host/moderator only. `status` is `"played"` or `"rejected"`. |

### Server → Client events

| Event | Payload |
| :--- | :--- |
| `listener_count` | `{ sessionId, count }` — fires whenever anyone joins/leaves the room you're in |
| `chat:new` | `{ id, user_id, display_name, avatar_url, message, created_at }` |
| `chat:deleted` | `{ messageId }` |
| `reaction:new` | `{ emoji, user_id }` |
| `song_request:new` | `{ id, user_id, display_name, request_text, status, created_at }` |
| `song_request:updated` | `{ id, status }` |
| `error` | `{ message }` — rate limit or permission denial |

**REST fallbacks exist for everything except live delivery** — if
maintaining a persistent socket connection is inconvenient for a given
screen, you can still submit a song request or moderate over plain HTTP
(section 3); you just won't get the real-time push for it (or from anyone
else) without the socket connected.

---

## 3. Chat, Reactions, Song Requests — REST

### `GET /radio/live/:sessionId/chat?limit=50`
Public. Recent chat history (for populating the screen before/without a
live socket connection). Same shape as the `chat:new` socket payload.

### `DELETE /radio/live/:sessionId/chat/:messageId`
🔒 Host/moderator only.

### `POST /radio/live/:sessionId/song-request`
🔒 Auth required. Body: `{ "request_text": "..." }`. Same effect as the
`song_request:send` socket event (and broadcasts to anyone connected via
socket) — use this if you're not maintaining a socket connection.

### `GET /radio/live/:sessionId/song-requests`
🔒 Host/moderator only. Full queue, newest first.

### `PATCH /radio/live/:sessionId/song-requests/:id`
🔒 Host/moderator only. Body: `{ "status": "played" | "rejected" }`.

### `GET /radio/live/:sessionId/listener-count`
Public. `{ "count": 42 }` — current in-app concurrent listeners (socket
room size; this app has no visibility into raw Icecast connection counts
from other clients, only its own connected users).

---

## 4. Program Schedule (EPG)

### `GET /rj/showSchedules` *(tRPC)* — mobile REST equivalent not yet built; use the tRPC endpoint or ask backend to mirror it if needed
Public weekly schedule, every active slot:
```json
[{ "id": "uuid", "show_title": "Morning Vibes", "day_of_week": 0, "start_time": "08:00", "end_time": "09:00", "station": { "name": "..." }, "rj_stage_name": "DJ Test", "rj_avatar_url": null }]
```
`day_of_week` is 0=Sunday..6=Saturday (JS `Date.getDay()` convention).

### Show reminders
Following an RJ (see section 6) gets you a push notification ~15 minutes
before each of their scheduled shows, and another the moment they actually
go live. No separate "set a reminder" call — it's tied to follow state.

---

## 5. Catch-up / Podcast Archive

This platform doesn't record streams automatically — catch-up audio only
exists for sessions where the RJ (or admin) manually attached a recording
afterward.

### `GET /radio/catchup?limit=20&cursor=...`
Public. Cursor-paginated, most recent first.
```json
{
  "sessions": [{ "id": "uuid", "show_title": "...", "recording_url": "https://...", "started_at": "...", "station": {...}, "rj_stage_name": "...", "rj_avatar_url": null }],
  "next_cursor": "uuid-or-null"
}
```
Play `recording_url` like any on-demand audio file.

### `POST /radio/live/:sessionId/recording`
🔒 Host/moderator only. Body: `{ "recording_url": "https://..." }`. Attaches
a recording to an ended session, making it appear in the catch-up list.

---

## 6. RJ Profiles & Follow

### `GET /radio/rj/profiles`
Public. All approved, active RJs.

### `GET /rj/profileById` *(tRPC, input `{ userId }`)*
Public. One RJ's profile (stage name, bio, specialty, avatar).

### Follow (generic — reused from the existing author/narrator follow system)
- `GET /follows` equivalents aren't REST-mirrored yet; use the tRPC
  `follows.toggle` / `follows.isFollowing` / `follows.countFor` procedures
  with `profileId` set to the RJ's **user_id** (not their RJ-profile row id)
  — this is what ties a follow to "notify me when this RJ goes live or has
  a show coming up."

---

## 7. Push notification types

New `type` values on notifications delivered via the existing FCM pipeline:

| type | Fired when |
| :--- | :--- |
| `rj_live` | An RJ you follow goes live |
| `show_reminder` | A followed RJ's scheduled show starts in ~15 minutes |
| `competition_won`, etc. | Unrelated — see GAMIFICATION_RETENTION_API.md |

---

## 8. Host-side quick reference (for a "Host/RJ mode" in the app, if built)

All under the tRPC `rj.*` router today — REST mirrors exist for the
interactive layer above but not yet for these:
- `rj.myProfile` / `createProfile` / `updateProfile` — self-service profile
- `rj.liveSession.start` `{ streamUrl, showTitle?, stationId? }` — requires an approved profile; auto-notifies followers
- `rj.liveSession.end` `{ sessionId }`
- `rj.mySessions` — session history
- `rj.attachRecording` `{ sessionId, recordingUrl }` — enables catch-up for that session
- `rj.myShowSchedules` — read-only view of admin-assigned slots
