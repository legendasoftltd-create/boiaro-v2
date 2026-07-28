# BoiAro On Air API

("Live Radio" internally — routes, DB tables, and most backend code still
say `radio`/`live` for compatibility; user-facing text everywhere says
"BoiAro On Air".)

Reference for the mobile app covering live streaming, real-time chat/
reactions/song-requests, host moderation, program schedule, RJ profiles,
catch-up (podcast) audio, listener call-in (real WebRTC audio), automatic
recording, and the host broadcast lifecycle (credentials, terms, test mode,
reconnect handling). Base URL and auth headers: see [REST_API.md](REST_API.md).
REST endpoints below are under `/api/v1`; the real-time layer is a separate
Socket.IO connection (see below).

**Broadcasting audio itself (RJ → server) is external-encoder based, not
in-app.** RJs push their stream to the Icecast/Shoutcast mount from OBS,
Mixxx, BUTT, or any compatible encoder — see section 8a. There's no
in-browser/in-app "record and upload live" studio; building one (with
mixing, ducking, jingles) was scoped out in favor of RJs using tools built
for exactly this. **Listener call-in audio (a caller ↔ host, not RJ →
server) is real WebRTC**, peer-to-peer, signaled over the existing
Socket.IO connection — see section 9. A self-hosted coturn TURN relay on
the production server covers callers behind strict/symmetric NAT; clients
fetch STUN+TURN with time-limited credentials from
`GET /radio/callin/ice-servers` (or tRPC `rj.callIn.iceServers`) right
before creating the peer connection.

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
Public schedule, every active slot — both weekly-recurring and one-time
specials:
```json
[{
  "id": "uuid", "show_title": "Morning Vibes",
  "schedule_type": "recurring", "day_of_week": 0, "specific_date": null,
  "start_time": "08:00", "end_time": "09:00", "status": "active",
  "category": "Music", "cover_image_url": null,
  "station": { "name": "..." }, "rj_stage_name": "DJ Test", "rj_avatar_url": null
}]
```
`schedule_type` is `"recurring"` (uses `day_of_week`, 0=Sunday..6=Saturday,
JS `Date.getDay()` convention) or `"one_time"` (uses `specific_date`
instead). `status` is `"active"`, `"cancelled"`, or `"rescheduled"` —
cancelled shows are filtered out of this list already (they also have
`is_active: false`), so you don't need to check `status` client-side unless
you're building an admin view.

Admin owns the schedule; an RJ can only *propose* a cancellation or
reschedule for their own slot (`rj.requestScheduleChange`, tRPC-only today),
which an admin then approves or rejects. Approval is what actually changes
the `ShowSchedule` row and fires the cancel/reschedule notification below —
the request itself doesn't change anything until reviewed.

### Show reminders
Following an RJ (see section 6) gets you push notifications at two points
before each of their scheduled shows — **30 minutes** and **10 minutes**
before start (`show_reminder_30` / `show_reminder_10`) — plus another the
moment they actually go live (`rj_live`). A cancelled show fires
`show_cancelled`; a rescheduled one fires `show_rescheduled`; a newly
published catch-up recording fires `catchup_published`. See section 10 for
the full notification type table. No separate "set a reminder" call — it's
all tied to follow state.

---

## 5. Catch-up / Podcast Archive

Two ways a recording gets attached to a session:
1. **Automatic** — if `recording_enabled: true` was passed to `live/start`
   (and the platform + station toggles allow it), the server captures the
   Icecast stream itself via `ffmpeg -c copy` (zero-transcode remux, so it
   costs no meaningful CPU) for the whole broadcast and uploads it to S3 the
   moment the session ends. Starts as `recording_status: "draft"` —
   **awaiting review**, not visible in catch-up yet.
2. **Manual** — RJ/moderator pastes an external URL or uploads a file via
   `/upload/media` first, then `POST /live/:sessionId/recording` (or tRPC
   `rj.attachRecording`). Goes straight to `"published"`.

Either way, a draft only becomes visible to listeners once **published**
(review workflow below). Test broadcasts never appear here, published or
not.

### Recording review workflow (host/moderator)
- `GET /radio/live/pending-recordings` — sessions with a draft recording awaiting review.
- `POST /radio/live/:sessionId/recording/:action` — `action` is `approve` (marks reviewed, doesn't publish), `reject`, `publish` (makes it live in catch-up + notifies the RJ's followers, `catchup_published`), `unpublish` (pulls it back to draft), or `delete` (removes the S3 file and clears the recording fields).
- Drafts/rejected recordings are auto-deleted after `radio_recording_draft_retention_days` (default 7, admin-configurable, `0`/blank = never). Published recordings only auto-delete if `radio_recording_published_retention_days` is explicitly set (blank by default = kept forever). Runs as a daily cron.

### `GET /radio/catchup?limit=20&cursor=...`
Public. Only `recording_status: "published"` sessions appear here. Returns
an empty list (not an error) when the platform toggle `radio_catchup_enabled`
is off. Cursor-paginated, most recent first.
```json
{
  "sessions": [{ "id": "uuid", "show_title": "...", "recording_url": "https://...", "started_at": "...", "station": {...}, "rj_stage_name": "...", "rj_avatar_url": null }],
  "next_cursor": "uuid-or-null"
}
```
Play `recording_url` like any on-demand audio file.

### `POST /radio/live/:sessionId/recording`
🔒 Host/moderator only. Body: `{ "recording_url": "https://..." }` (must be
`https://`). Manually attaches a recording to an ended session and
publishes it immediately, making it appear in the catch-up list right away
(no separate publish step for the manual path).

### Resume, plays, and completion tracking
One `CatchupProgress` row per user per session, doubling as both "resume
where you left off" and the analytics source for unique listeners /
completion rate.

- `GET /radio/catchup/:sessionId/progress` — 🔒 your own saved position: `{ "progress": { "position_seconds", "duration_seconds", "completed", "total_plays", "last_played_at" } | null }`. `null` if you've never played it.
- `POST /radio/catchup/:sessionId/play` — 🔒 call once when playback starts (not on every tick) — increments the session's total play count and your own `total_plays`.
- `POST /radio/catchup/:sessionId/progress` — 🔒 call periodically (e.g. every 15s) and on pause. Body: `{ "position_seconds": 123, "duration_seconds"?: 1800 }`. Marks `completed: true` once you've reached 95% of duration.
- `GET /radio/catchup/history` — 🔒 your own last 50 played recordings, most recently played first, with session details embedded.

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
🔒 Host/moderator only. Body: `{ "user_id": "uuid", "reason"?: "...", "duration_minutes"?: 30, "type"?: "mute" | "ban" }`.
Omit `duration_minutes` for permanent (until explicitly unmuted/unbanned).
- `type: "mute"` (default) — chat and song requests are blocked; the user
  can still listen.
- `type: "ban"` — same restriction, **and** the user is forcibly
  disconnected from the session's real-time layer right away (their socket
  is kicked from the room), not just blocked on their next message.

### `DELETE /radio/live/:sessionId/mute/:userId`
🔒 Host/moderator only. Lifts a mute or ban immediately.

### Chat safety (automatic, no endpoint — enforced inside `chat:send`)
- **Slow mode**: minimum gap between a user's messages, admin-configurable
  (`radio_slow_mode_seconds`, default 2s).
- **Blocked words**: admin-maintained list (`radio_blocked_words`,
  comma-separated); a message containing any of them is rejected with an
  `error` event, never saved or broadcast.
- **Duplicate prevention**: sending the same message text twice within
  `radio_duplicate_message_window_seconds` (default 30s) is rejected.
- **Link spam**: if `radio_chat_links_enabled` is off, any message
  containing a URL is rejected outright.

All four checks happen server-side inside the socket handler — a modified
client can't bypass them, they're not just UI-side hints.

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

## 8a. Broadcasting the show itself — external encoder (feasibility + setup)

**Why not in-browser/in-app broadcasting?** A browser can *capture* a mic
via `getUserMedia`, but Icecast/Shoutcast (what this platform's stream
infrastructure speaks) expects a "source client" talking the Icecast
source protocol — browsers don't speak that natively, and there's no
standard way to push a MediaRecorder blob to it as a continuous live
stream. The real alternative would be a server-side WebRTC-to-Icecast
bridge (an SFU that decodes the browser's WebRTC audio and re-encodes it
into the Icecast mount) — extra always-on infrastructure, added latency,
and real CPU/bandwidth cost on a server this project is deliberately
keeping lean (see section 11 / server cost control). Every mainstream
internet radio operation — professional or hobbyist — broadcasts with a
dedicated encoder for exactly this reason, so that's the path this
platform uses too, rather than reinventing a worse version of tools that
already do this well.

**Recommended tools** (either works; pick based on whether you also want
a mixer):
- **[BUTT](https://danielnoethen.de/butt/)** (Broadcast Using This Tool) —
  free, tiny, purpose-built for exactly this: pick your mic, paste the
  Icecast mount details, hit Start. No mixing/jingles, just a clean single
  source. Easiest option if you're only ever speaking live with no music
  bed.
- **[Mixxx](https://mixxx.org/)** — free DJ software with a real mixer
  (decks, crossfader, cue) *and* built-in Icecast broadcasting in
  Preferences → Live Broadcasting. Use this if you want to play music/
  jingles between talking segments from the same app.
- **OBS Studio** — works too, but **not out of the box for Icecast**: OBS's
  native "Custom" streaming output speaks RTMP, not the Icecast source
  protocol. To use OBS you need either the community `obs-shoutcast-icecast`
  plugin, or route OBS's audio through a virtual audio cable (e.g.
  VB-Audio Cable) into BUTT/Mixxx acting as the actual Icecast source. If
  you're not already invested in OBS for video, BUTT or Mixxx is the more
  direct path.

**Setup (BUTT, the simplest case):**
1. Get your station's Icecast mount details from an admin — hostname,
   port, mount point, and source password (not your BoiAro login).
2. Get your **broadcast token** first: RJ dashboard → Broadcast Token →
   Generate (see section 8) — this is separate from the Icecast source
   password and is what authorizes your session with *this* API.
3. In BUTT: Settings → Main → Add a server, protocol `Icecast`, fill in
   host/port/mount/password from step 1. Settings → Audio → pick your mic.
4. Start streaming in BUTT (this starts the actual audio flowing to
   Icecast) — *then* call `POST /radio/rj/live/start` (or use the RJ
   dashboard's "Go Live" button) with your station's public `stream_url`
   so the platform shows you as live and listeners' players pick up the
   stream. Starting the API session before audio is flowing means
   listeners hit dead air; starting audio without the API session means
   you're not discoverable and no chat/reactions/schedule tie-in happens.
5. Send a heartbeat every ~20s while live (section 8) — BUTT keeps the
   audio connection alive on its own, but the API session will still
   auto-end without heartbeats.
6. Use **test mode** (`is_test: true`) the first time to confirm your
   BUTT → Icecast → player chain actually works before going live for
   real — it behaves identically but never appears publicly or notifies
   followers.

This is a genuinely manual, external-tool-dependent flow — there's no way
to shrink it to a single in-app button without building the bridge
described above. If real usage shows this is too much friction for RJs,
building that bridge (or shipping a bundled, pre-configured BUTT profile)
would be the next investment, not a quick add-on.

---

## 9. Listener call-in — real WebRTC audio (peer-to-peer)

A caller talking live with the host, not the RJ's own broadcast — this is
a separate audio path from section 8a. Off by default
(`radio_callin_enabled`), and a show must also set `callin_enabled: true`
when going live. Audio is **peer-to-peer WebRTC** between the caller's and
host's browsers/apps — the server never touches the audio itself, it only
relays signaling messages (SDP offer/answer, ICE candidates) over the
existing Socket.IO connection from section 2. This means **native mobile
apps need their own WebRTC implementation** (e.g. `react-native-webrtc` or
platform-native WebRTC) — this API only handles the signaling relay and
the request/accept/on-air state machine; the actual `RTCPeerConnection`
setup is a client concern on every platform, web included.

**ICE servers — fetch them from the API, don't hardcode.**
`GET /radio/callin/ice-servers` (🔒 auth required; tRPC:
`rj.callIn.iceServers`) returns
`{ "ice_servers": [{ "urls": ... , "username"?, "credential"? }] }` —
public STUN entries plus, on production, the self-hosted coturn TURN relay
(`turn:217.15.162.31:3478`, UDP and TCP). TURN credentials are
**time-limited (1 hour)** HMAC credentials (coturn's `use-auth-secret`
REST mechanism) — fetch them right before creating the
`RTCPeerConnection`, don't cache them across shows. The relay covers
callers behind strict/symmetric NAT or restrictive corporate/
mobile-carrier firewalls who can't connect peer-to-peer via STUN alone.
On environments without TURN configured (local dev), the endpoint
degrades to STUN-only.

### State machine + REST
- `POST /radio/live/:sessionId/callin/request` — 🔒 Body: `{ "consent_given": true }` (consent is mandatory — recording implications). Idempotent: calling again while you already have an active request just returns it.
- `GET /radio/live/:sessionId/callin/my-status` — 🔒 Your own current call state.
- `GET /radio/live/:sessionId/callin/queue` — 🔒 Host/moderator only.
- `POST /radio/callin/:callId/accept` — 🔒 Host/moderator. → status `"waiting"`.
- `POST /radio/callin/:callId/reject` — 🔒 Host/moderator.
- `POST /radio/callin/:callId/on-air` — 🔒 Host/moderator. Enforces `radio_callin_max_concurrent` (default 1) — `409` if already at the limit. This is the signal for the **caller's** client to start the WebRTC handshake (send an offer) — it doesn't connect any audio by itself.
- `POST /radio/callin/:callId/mute` — 🔒 Host/moderator. Tells the caller's client to disable its own outgoing mic track.
- `POST /radio/callin/:callId/remove` — 🔒 Host/moderator. Ends the call and tells both sides to tear down the peer connection.
- `POST /radio/callin/:callId/end` — 🔒 Caller only, ends their own call.

Status values: `requested → waiting → on_air → (muted) → ended`, or
`rejected`/`removed` at any point after `requested`.

### WebRTC signaling (Socket.IO, same connection as section 2)
Once a caller's status flips to `on_air` (via `callin:status` below), the
**caller's** client creates an `RTCPeerConnection`, gets the mic via
`getUserMedia`, creates an offer, and emits it; the **host's** client
answers. Both sides exchange ICE candidates the same way. The server
validates that both the sender and the target of every signal are
legitimate participants in that session's call (the host, or a caller with
a live `CallInRequest`) before relaying — arbitrary users can't target
each other with fake offers.

| Event | Direction | Payload |
| :--- | :--- | :--- |
| `callin:status` | server → both | `{ callId, status, hostUserId? }` — mirrors the REST state machine above in real time |
| `callin:offer` | either → server → target | `{ sessionId, targetUserId, payload: RTCSessionDescriptionInit }` |
| `callin:answer` | either → server → target | `{ sessionId, targetUserId, payload: RTCSessionDescriptionInit }` |
| `callin:ice-candidate` | either → server → target | `{ sessionId, targetUserId, payload: RTCIceCandidateInit }` |
| `callin:mute` | server → caller | `{ callId }` — disable your outgoing track |
| `callin:hangup` | either → server → target | `{ sessionId, targetUserId }` in, `{ sessionId, fromUserId }` out — tear down your peer connection |

Rate-limited server-side (min ~150ms between signaling events per user) to
prevent one side flooding the other's socket.

---

## 10. Push notification types

New `type` values on notifications delivered via the existing FCM pipeline:

| type | Fired when |
| :--- | :--- |
| `rj_live` | An RJ you follow goes live (never for a test broadcast) |
| `show_reminder_30` | A followed RJ's scheduled show starts in ~30 minutes |
| `show_reminder_10` | A followed RJ's scheduled show starts in ~10 minutes |
| `show_cancelled` | A followed RJ's scheduled show was cancelled (admin approved the RJ's cancel request) |
| `show_rescheduled` | A followed RJ's scheduled show moved to a new day/time (admin approved the RJ's reschedule request) |
| `catchup_published` | A followed RJ's recording became available in catch-up |
| `competition_won`, etc. | Unrelated — see GAMIFICATION_RETENTION_API.md |

---

## 11. Everything else (tRPC only — no REST mirror yet)

- `rj.myProfile` / `createProfile` / `updateProfile` — self-service profile
- `rj.mySessions` — session history
- `rj.approvalHistory` — your own approve/reject/suspend/reactivate timeline
- `rj.attachRecording` `{ sessionId, recordingUrl }` — enables catch-up for that session (https URLs only)
- `rj.myShowSchedules` — read-only view of admin-assigned slots
- `rj.requestScheduleChange` `{ scheduleId, requestType: "cancel"|"reschedule", proposedDayOfWeek?, proposedStartTime?, proposedEndTime?, proposedSpecificDate?, reason? }` — propose a change to your own slot; admin reviews it
- `rj.myScheduleChangeRequests` — your own change requests and their `pending`/`approved`/`rejected` status
- `rj.pendingRecordings` / `approveRecording` / `rejectRecording` / `publishRecording` / `unpublishRecording` / `deleteRecording` — recording review workflow (tRPC form of the REST `recording/:action` endpoint in section 5)
- `rj.myCatchupProgress` / `recordCatchupPlay` / `saveCatchupProgress` / `myCatchupHistory` — tRPC form of the catch-up progress endpoints in section 5
- `rj.liveSession.mutedUsers` `{ sessionId }` — host/moderator's view of who's currently muted or banned
- `admin.radioAnalytics` `{ from?, to?, groupBy?: "none"|"rj"|"station" }` — admin-only. Unique/peak-concurrent/average listeners, total listening minutes, new followers, chat/reaction/request counts, catch-up plays/unique listeners/completion rate, device breakdown, optionally broken down per RJ or per station. Surfaced in the admin "Radio Safety & Controls" → Analytics tab, not exposed to mobile.
- `admin.serverMetrics` — admin-only. CPU/memory/disk plus radio-specific storage/bandwidth estimates and cost-alert thresholds (70/85/95%) for the server cost control requirements.
