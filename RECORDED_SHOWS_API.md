# BoiAro On Air — Recorded Show Publishing

RJ live show → auto recording → Admin review → publish → **App → On Air → Latest Shows** → replay.

A finished broadcast is **never** public on its own. Its Studio master WAV lands in
Admin → Recordings as a *candidate*; only an admin publishing it creates an
`OnAirEpisode`, and only a published episode is returned by any app endpoint.

---

## 1. What gets stored

| | |
|---|---|
| **Master (backup)** | The Studio WAV, uploaded by the Bridge Relay to `studio-masters/`. Never streamed, never deleted by a publish or an episode delete. |
| **Stream (app)** | A 128 kbps CBR MP3 produced at publish time by `server/src/lib/episodeTranscoder.ts` and stored in `onair-episodes/`. This is the only audio any client receives. |

The MP3 prefix is **not** in the S3 public-read policy — episode URLs are handed
out **presigned, 6-hour TTL**, so a `premium` show can't be hot-linked past the
subscription check.

### `onair_episodes`

`id`, `studio_session_id` (unique), `live_session_id`, `show_schedule_id`,
`station_id`, `rj_user_id`, `title`, `episode_title`, `description`,
`cover_image_url`, `master_audio_url`, `stream_audio_url`, `stream_mime_type`,
`stream_size_bytes`, `duration_seconds`, `recording_type`, `status`,
`visibility`, `recorded_at`, `publish_at`, `published_at`, `transcode_status`,
`transcode_error`, `play_count`, `created_by`, `updated_by`, timestamps.

`onair_episode_progress` holds `position_seconds` / `duration_seconds` /
`completed` / `total_plays` per `(user_id, episode_id)` — the resume position.

### Status

`processing` → `draft` → `pending_review` → `published` → `unpublished`

- **processing** — the WAV→MP3 conversion is running. Never listed.
- **draft** — saved, not released. Also where a *scheduled* publish parks until
  `publish_at` passes (`server/src/jobs/episodePublish.ts`, every minute).
- **published** — live in the app.
- **unpublished** — pulled back; disappears from lists *and* from direct-id lookups.

### Visibility

| | In lists | By direct id |
|---|---|---|
| `public` | everyone | everyone |
| `premium` | active subscribers only | card returned with `audio_url: null`, `locked: true`, `lock_reason: "premium"` so the app can prompt an upgrade |
| `unlisted` | never | anyone with the link |

### Recording type

`mixed` (Full Mix — mic + music/jingles) is the default publish source.
`voice_only` is an internal editing/mastering artefact: publishing one publicly
is **refused** unless the admin ticks the explicit per-episode override.

---

## 2. App REST API — `/api/v1/radio`

Auth is optional on the read endpoints; sending a bearer token adds the
listener's premium access and `resume_position_seconds`.

### `GET /shows/latest?limit=5`
Newest published first — the On Air screen's "Latest Shows / সম্প্রতি প্রচারিত" strip.

```json
{ "shows": [ {
  "id": "…", "title": "রাতও কথা বলে", "episode_title": "পর্ব ১২",
  "description": "…", "cover_image_url": "…", "audio_url": "https://…mp3?X-Amz-…",
  "mime_type": "audio/mpeg", "duration_seconds": 4680,
  "recorded_at": "2026-09-04T17:00:00.000Z", "published_at": "2026-09-05T05:00:00.000Z",
  "visibility": "public", "play_count": 128, "show_schedule_id": "…",
  "rj_user_id": "…", "rj_stage_name": "RJ শুভ্র ধ্রুব", "rj_avatar_url": "…",
  "station": { "id": "…", "name": "…", "artwork_url": "…" },
  "resume_position_seconds": 930, "completed": false
} ] }
```

`resume_position_seconds` / `completed` are present only for an authenticated caller.

### `GET /shows?limit=20&cursor=&show_id=&rj_id=&station_id=&sort=latest|oldest`
The archive behind **View All**. Cursor-paginated; returns `next_cursor` (null at the end).

### `GET /shows/filters`
`{ "shows": [{id, name}], "rjs": [{id, name}] }` — only entries that actually have a published show.

### `GET /shows/:id`
`{ "show": { …, "locked": false } }`. 404 for anything not published.
A premium show a non-subscriber opens returns `locked: true` with `audio_url: null`.

### `POST /shows/:id/play`
Call on playback start. Bumps `play_count`, returns
`{ "resume_position_seconds": 930, "completed": false }` — seek straight to it.
403 if the show is premium and the caller isn't subscribed.

### `GET /shows/:id/progress` *(auth)*
### `POST /shows/:id/progress` *(auth)* — `{ "position_seconds": 930, "duration_seconds": 4680 }`
Post every ~15s while playing and once on pause/stop. ≥95% marks `completed`.

### `GET /shows-history` *(auth)*
`{ "history": [ { …progress, "show": {…} } ] }`, most recently played first.

---

## 3. Web tRPC equivalents

Same rules, same service layer (`server/src/services/onAirEpisode.service.ts`):

`rj.onAir.latestShows` · `rj.onAir.shows` · `rj.onAir.filters` · `rj.onAir.show`
· `rj.onAir.recordShowPlay` · `rj.onAir.myShowProgress` · `rj.onAir.saveShowProgress`
· `rj.onAir.myShowHistory`

---

## 4. Admin tRPC (module `cms`)

| Procedure | Purpose |
|---|---|
| `admin.listOnAirRecordingCandidates` | Completed Studio masters + the episode (if any) made from each |
| `admin.listOnAirEpisodes` | All episodes, optionally filtered by `status` |
| `admin.listOnAirShowOptions` | Programme list for the publish form's Show/Program select |
| `admin.publishOnAirEpisode` | Create/update + `action: draft \| review \| publish`; starts the transcode |
| `admin.updateOnAirEpisode` | Edit Details — metadata only, status untouched |
| `admin.unpublishOnAirEpisode` | Pull from the app; clears `publish_at` so the sweep can't re-release it |
| `admin.deleteOnAirEpisode` | Removes the episode + its MP3. **The master WAV is kept.** |
| `admin.retryOnAirEpisodeTranscode` | Re-run a failed conversion |

`publishOnAirEpisode` refuses to publish when: there's no master audio, the master
is still saving, the recording is `voice_only` without `allowVoiceOnly: true`, or
the recording-storage budget is exhausted.

---

## 5. App screens

- **`/on-air`** — Live Radio → Radio Stations → Latest Shows → Upcoming Shows.
- **`/shows`** — "আগের অনুষ্ঠান": all published shows, filterable by programme and
  RJ, sortable latest/oldest, plus an "আমার শোনা" tab.
- **`/shows/:id`** — deep-link target for a shared show.

Playback reuses the app's existing audio player (`useOnAirShowPlayer`), so
background playback, lock-screen controls, seek and duration come for free.
The word *"Recordings"* is deliberately kept out of every listener-facing screen.
