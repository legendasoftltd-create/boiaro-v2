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

## 2. Mobile app API

Documented separately, in full, in **[RECORDED_SHOWS_MOBILE_API.md](RECORDED_SHOWS_MOBILE_API.md)** —
that is the reference to hand the app team.

Summary of the surface (`{API_BASE}/api/v1/radio`):

| Endpoint | |
|---|---|
| `GET /shows/latest?limit=5` | The "Latest Shows / সম্প্রতি প্রচারিত" strip, newest first |
| `GET /shows` | Archive, cursor-paged, `show_id` / `rj_id` / `station_id` / `sort` |
| `GET /shows/filters` | Programme + RJ filter options that actually have shows |
| `GET /shows/:id` | One show; the only route to an `unlisted` one |
| `POST /shows/:id/play` | Count a play, get the resume position |
| `GET`/`POST /shows/:id/progress` | Read/write the resume position *(auth)* |
| `GET /shows-history` | "আমার শোনা" *(auth)* |

Two things that bite if missed, both covered in the mobile doc: every `POST` needs
`X-Requested-With: XMLHttpRequest` unless it carries a bearer token (and
`/shows/:id/play` is callable logged out), and `audio_url` is a pre-signed URL that
expires in ~6 hours, so it must not be cached across sessions.

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
