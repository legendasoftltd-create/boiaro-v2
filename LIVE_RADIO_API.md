# Live Radio (FM) API

Reference for the mobile app covering live streaming, real-time chat/
reactions/song-requests, host moderation, program schedule, RJ profiles,
catch-up (podcast) audio, and the host broadcast lifecycle (credentials,
terms, test mode, reconnect handling). Base URL and auth headers: see
[REST_API.md](REST_API.md). REST endpoints below are under `/api/v1`; the
real-time layer is a separate Socket.IO connection (see below).

**Not covered here (explicitly deferred):** listeners actually joining the
live broadcast audio themselves (call-in). The request/accept/on-air/mute/
remove **state machine** is fully built (section 9) and safe to wire up in
the UI, but no audio transport exists yet — going on-air today only flips a
status, it doesn't connect any audio. That needs a separate WebRTC/media-SDK
integration. The feature is also off platform-wide by default
(`radio_callin_enabled`) until that's built and an admin turns it on per
station/show.

---

## 1. Streaming

### `GET /radio/stations`
Public, but stream URLs are omitted when guest listening is switched off
platform-wide (`radio_guest_listening_enabled`) **and** the request is
unauthenticated — station metadata (name, artwork) still returns either way.
```json
{ "stations": [{ "id": "uuid", "name": "BoiAro Radio", "stream_url": "https://...", "stream_url_medium": null, "stream_url_low": null, "artwork_url": "https://...", "description": "..." }] }
```
`stream_url_medium`/`stream_url_low` are `null` unless the admin configured
separate lower-bitrate mount points — only show a quality selector when at
least one is present. There's no server-side transcoding; these are real
alternate URLs the station itself provides.

### `GET /radio/live`
Public (same guest-listening gating as above applies to `stream_url`). The
currently-live RJ session, if any — **never** a private test broadcast, and
never a "reconnecting" session past the point it's given up (see section 8).
```json
{
  "live": {
    "id": "uuid", "rj_user_id": "uuid", "show_title": "Morning Vibes",
    "stream_url": "https://...", "status": "live", "started_at": "2026-07-26T...",
    "category": "Talk Show", "chat_enabled": true, "requests_enabled": true,
    "station": { "id": "uuid", "name": "..." },
    "rj_profile": { "stage_name": "DJ Test", "avatar_url": null, "bio": "...", "specialty": "..." },
    "listener_count": 42
  }
}
```
`status` can be `"live"` or `"reconnecting"` — the latter means the host's
stream just dropped and the backend is waiting out a grace period before
giving up; keep playing/showing the player as normal, optionally show a
subtle "reconnecting" badge (see `session:reconnecting` socket event).
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
  backend has visibility into beyond the host's own heartbeat (section 8).
  Handle playback errors client-side (retry with backoff, surface an error
  state) same as before.

---

## 2. Real-time layer (Socket.IO)

One connection handles chat, reactions, song requests, moderation, and live
listener count for whichever session you `join_session` into.

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

Every chat/reaction/request action is also gated server-side by the
platform's feature toggles (`radio_chat_enabled`, `radio_reactions_enabled`,
`radio_requests_enabled`) and the session's own per-show toggles
(`chat_enabled`, `requests_enabled` from `GET /radio/live`) — if either is
off you'll get an `error` event back, so don't rely solely on hiding UI for
a toggle you haven't checked.

### Client → Server events

| Event | Payload | Notes |
| :--- | :--- | :--- |
| `join_session` | `{ sessionId, platform? }` | Call once you know the live session id (from `GET /radio/live`). Leaves any previously-joined session automatically. `platform`: `"web"` \| `"android"` \| `"ios"` — recorded for listener analytics, defaults to `"web"` if omitted. |
| `leave_session` | *(none)* | Also happens automatically on disconnect. |
| `chat:send` | `{ sessionId, message }` | Max 500 chars. Rate-limited to 1 message per 2s per user. Blocked with an `error` event if you're muted (section 7) or chat is off. |
| `reaction:send` | `{ sessionId, emoji }` | Ephemeral — broadcast only, nothing persisted per-reaction. The session's running `reaction_count` total is still incremented for analytics. |
| `song_request:send` | `{ sessionId, requestText }` | Max 200 chars. Persisted. Same mute/toggle gating as chat. |
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
| `session:reconnecting` | `{ sessionId }` — the host's heartbeat went stale; show a "reconnecting" state, keep the player as-is |
| `session:ended` | `{ sessionId, reason }` — session was auto-ended (`reason: "heartbeat_timeout"`) or force-ended by an admin |
| `error` | `{ message }` — rate limit, mute, disabled feature, or permission denial |

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
socket) — use this if you're not maintaining a socket connection. `403` if
requests are disabled (platform toggle or per-show) or you're muted.

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
afterward (either an external URL, or a file uploaded through the normal
`/upload/media` endpoint first). Test broadcasts never appear here.

### `GET /radio/catchup?limit=20&cursor=...`
Public. Returns an empty list (not an error) when the platform toggle
`radio_catchup_enabled` is off. Cursor-paginated, most recent first.
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

## 7. Moderation & Reports

### `POST /radio/live/:sessionId/report`
🔒 Auth required. Any listener can report a chat message or song request.
Body: `{ "target_type": "chat_message" | "song_request", "target_id": "uuid", "reason": "..." }`.
Reviewed by admins (not mobile-facing).

### `POST /radio/live/:sessionId/mute`
🔒 Host/moderator only. Body: `{ "user_id": "uuid", "reason"?: "...", "duration_minutes"?: 30 }`.
Omit `duration_minutes` for a permanent mute (until explicitly unmuted). A
muted user can still listen — chat and song requests are blocked, with a
clear `error`/`403` explaining why.

### `DELETE /radio/live/:sessionId/mute/:userId`
🔒 Host/moderator only. Lifts a mute immediately.

---

## 8. Going live (RJ/Host)

The full broadcast lifecycle — credential, terms, going live, staying live,
and what happens if the connection drops. Every one of these is enforced
server-side, not just hidden in the UI.

### Broadcast token (required to go live)
A secret distinct from the RJ's login session — think of it as a
broadcaster API key. Shown in plaintext **exactly once**, when generated;
only its hash is ever stored. Regenerating immediately invalidates the old
one. Suspending, deactivating, or rejecting an RJ (admin action) revokes it
instantly too.

- `GET /radio/rj/broadcast-token` → `{ has_token, created_at, revoked_at }`
- `POST /radio/rj/broadcast-token/regenerate` → `{ "token": "..." }` — **save this immediately, it's never shown again**
- `DELETE /radio/rj/broadcast-token` → `{ revoked: true }`

### Broadcaster terms
Must be accepted (current version) before the first — and every subsequent,
if the version changes — live session. Covers copyright/licensed-content
responsibility, since the RJ is legally on the hook for what they play.

- `GET /radio/rj/terms` → `{ current_version, accepted_version, accepted_at, needs_acceptance }`
- `POST /radio/rj/terms/accept` → `{ accepted: true, version }`

### `GET /radio/rj/live/my-session`
🔒 Auth required. The caller's own currently-live (non-test) session, if
any — use this instead of `GET /radio/live` for "am I live right now" on
your own dashboard, since the latter is the platform-wide current session
and won't be yours if someone else is also live.

### `POST /radio/rj/live/start`
🔒 Auth required, approved + active RJ, valid broadcast token, current terms
accepted. Body:
```json
{
  "stream_url": "https://...",
  "show_title": "Evening Poetry",
  "station_id": "uuid",
  "category": "Poetry",
  "broadcast_token": "the-plaintext-token",
  "is_test": false,
  "chat_enabled": true,
  "requests_enabled": true,
  "recording_enabled": true,
  "callin_enabled": false
}
```
- `station_id` and `category` are optional.
- `is_test: true` starts a **private test broadcast** — never appears in
  `GET /radio/live`, `catchup`, or triggers a follower notification. Use it
  to verify your stream/audio before actually going on air (spec's "Test
  Broadcast Mode"). Only you (and admins) can see it via
  `GET /radio/rj/live/my-session` — there's no separate "test session"
  endpoint, it's the same session shape with `is_test: true`.
- `callin_enabled: true` is rejected (`403`) unless the platform toggle
  `radio_callin_enabled` is also on.
- Fails with `409 Conflict` if another (non-test) session is already live on
  the same `station_id` — only one host per station at a time.
- Fails with `403` if your RJ account is suspended/deactivated, or your
  token/terms aren't current.

### `POST /radio/rj/live/:sessionId/end`
🔒 Host only (their own session).

### `POST /radio/rj/live/:sessionId/heartbeat`
🔒 Host only. **Call this every ~20 seconds while broadcasting.** This is
how the backend knows your stream is still actually running — a heartbeat
that goes stale for `radio_reconnect_grace_seconds` (default 120s) flips
the session to `"reconnecting"` (listeners see a subtle "reconnecting"
state, playback keeps trying); if it stays stale for
`radio_reconnect_timeout_seconds` (default 600s total), the session is
auto-ended with `disconnect_reason: "heartbeat_timeout"`. Sending a fresh
heartbeat while `"reconnecting"` immediately flips it back to `"live"` — no
separate "I'm back" call needed. **If your app never calls this, every live
session will silently end itself after ~10 minutes regardless of whether
the stream is actually fine** — it isn't optional.

---

## 9. Listener call-in (state machine only — see the note at the top)

Off by default (`radio_callin_enabled`). Even when on, a show must also set
`callin_enabled: true` when going live. Nothing here transports audio yet.

- `POST /radio/live/:sessionId/callin/request` — 🔒 Body: `{ "consent_given": true }` (consent is mandatory — recording implications). Idempotent: calling again while you already have an active request just returns it.
- `GET /radio/live/:sessionId/callin/my-status` — 🔒 Your own current call state.
- `GET /radio/live/:sessionId/callin/queue` — 🔒 Host/moderator only.
- `POST /radio/callin/:callId/accept` — 🔒 Host/moderator. → status `"waiting"`.
- `POST /radio/callin/:callId/reject` — 🔒 Host/moderator.
- `POST /radio/callin/:callId/on-air` — 🔒 Host/moderator. Enforces `radio_callin_max_concurrent` (default 1) — `409` if already at the limit.
- `POST /radio/callin/:callId/mute` — 🔒 Host/moderator.
- `POST /radio/callin/:callId/remove` — 🔒 Host/moderator.
- `POST /radio/callin/:callId/end` — 🔒 Caller only, ends their own call.

Status values: `requested → waiting → on_air → (muted) → ended`, or
`rejected`/`removed` at any point after `requested`.

---

## 10. Push notification types

New `type` values on notifications delivered via the existing FCM pipeline:

| type | Fired when |
| :--- | :--- |
| `rj_live` | An RJ you follow goes live (never for a test broadcast) |
| `show_reminder` | A followed RJ's scheduled show starts in ~15 minutes |
| `competition_won`, etc. | Unrelated — see GAMIFICATION_RETENTION_API.md |

---

## 11. Everything else (tRPC only — no REST mirror yet)

- `rj.myProfile` / `createProfile` / `updateProfile` — self-service profile
- `rj.mySessions` — session history
- `rj.approvalHistory` — your own approve/reject/suspend/reactivate timeline
- `rj.attachRecording` `{ sessionId, recordingUrl }` — enables catch-up for that session
- `rj.myShowSchedules` — read-only view of admin-assigned slots
- `rj.liveSession.mutedUsers` `{ sessionId }` — host/moderator's view of who's currently muted
