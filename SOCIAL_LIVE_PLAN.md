# BoiAro On Air — Social Live Broadcasting Plan

Phase 0 deliverable for the client brief *"Facebook + YouTube Social Live Broadcasting — Claude AI /
AI Coding Assistant Final Developer Guide"* (30 August 2026). That brief mandates an audit before any
code, then a phased build. This document is that audit plus the plan it produced.

Written 2 September 2026 against `boiaro-v2 @ main`. **Both production servers were inspected live**
(read-only, plus two 20-second encoder benchmarks); everything in §2 and §3 is measured, not inferred
from the repository. **No code has been written yet.**

Web version (same content, nicer to read):
<https://claude.ai/code/artifact/62ffb471-5a2e-4228-a49d-0ae014d25668>

---

## 0. The one rule everything else defers to

Social Live is a **consumer** of the existing radio feed, never a dependency of it. The encoder reads
the same public stream URL a listener reads. It has no write path into `live_sessions`, the Icecast
config, the Studio bridge, or the socket layer. Kill it mid-show and the only observable effect is
that Facebook and YouTube go dark.

> **Acceptance test, applied at every phase:** run `pkill -9` against the encoder during a live show.
> App and Website audio must not stutter, the listener count must not move, and the RJ must see
> nothing. If any of those fail, the phase is rejected regardless of what else works.

This is the brief's §22 "Critical Acceptance Test" and its §3 "Architecture Rule", and it is the
reason the encoder is a separate process on a separate host reading over HTTP rather than anything
more tightly coupled.

---

## 1. What the audit found in the codebase

Most of what this feature needs already exists, built for the recording pipeline. The brief's §24
guardrails ("reuse existing style/services/components", "don't refactor unrelated files") are
satisfied by leaning on these rather than writing new machinery.

| Existing component | Where | Decision | Why it matters here |
| :--- | :--- | :--- | :--- |
| FFmpeg process management | `server/src/lib/liveRecorder.ts` | **Copy the shape** | Already spawns with an argument array (no shell), keeps a keyed registry, and does SIGTERM → 5s → SIGKILL. That is exactly the brief's §15/§19 contract. The encoder mirrors it and adds a DB-persisted PID for crash recovery. |
| Secret encryption at rest | `server/src/lib/secretEncryption.ts` | **Reuse as-is** | AES-256-GCM with an `enc:v1:` prefix, key derived from `SECRETS_ENCRYPTION_KEY` or `JWT_SECRET`. §6 and §19 are satisfied by calling it — no new crypto, no new deployment secret. |
| Scheduler | `server/src/jobs/index.ts` | **Registered ✅** | The single `node-cron` registry, Dhaka-pinned. `socialAutoBroadcast.ts` is now registered there — one more job, not a second scheduler. |
| Audit trail | `server/src/lib/radioAudit.ts` | **Reuse** | Writes to the shared `audit_log` table with `target_type="radio"`. Social events use `target_type="social_live"` through the same helper — §21 done without a new log model. |
| Admin permission enforcement | `server/src/lib/adminPermissions.ts` | **No change needed, but naming matters** | Permissions are classified from the *procedure name*. `/broadcast/` maps to the `cms` module, so a name containing "Broadcast" lands in the right module with **zero edits to a security-sensitive file**. **Correction (found while building P1):** the *action* verbs (`save`, `delete`, `test`…) are anchored to the **start** of the name, so `socialBroadcastConnectionSave` would classify as a read-only `view` and pass a view-level permission check. The verb has to come first — `saveSocialBroadcastConnection`, `deleteSocialBroadcastConnection`, `testSocialBroadcastConnection`. Verified in the live audit trail: `module: cms`, `strict: true`. |
| Source health signal | `server/src/lib/streamHealth.ts` | **Not used — see note** | The existing 3-sample window is tied to a *live radio session*. The social supervisor instead runs its own source probe on its own cadence (`social_source_check_seconds`), because a social broadcast can be running when no `live_session` row exists at all — a case the existing helper cannot answer. Deliberate divergence from the original plan, not an oversight. |
| Boot-time orphan reconcile | `server/src/jobs/streamReconnect.ts:59` | **Same pattern** | Precedent for "server restarted, clean up rows claiming to be live". §15 crash recovery follows it rather than inventing a scheme. |
| Icecast mount derivation | `server/src/lib/icecastMount.ts` | **Not needed after all** | *Corrected 2026-09-03.* The encoder reads `radio_stations.stream_url` **directly** — the public listening URL, exactly as a listener does. `deriveIcecastMountPath` derives the Icecast *mount name*, which the encoder never needs. §5's "no hard-coded production URL" is satisfied by reading the column, not by this helper. |
| Radio feature settings | `server/src/lib/radioSettings.ts` | **Add keys** | Additive `social_*` keys in the existing defaults map, so the kill switch and tuning live where every other radio toggle lives and the admin settings screen already reads them. |
| Studio Music Library rights | `prisma/schema.prisma` → `StudioAudioAsset` | **Add columns** | Already has `rights_holder`, `license_type`, `license_document_url`, `allowed_usage`. §16 adds social-platform flags beside them — no new table. |
| Admin menu & routing | `src/pages/admin/AdminLayout.tsx:126`, `src/App.tsx:365` | **One entry each** | "Social Live" slots into the existing CMS & Content group after Studio Music Library, exactly as §7 specifies. |
| Broadcast state, shows, schedule | `live_sessions`, `show_schedules`, `radio_stations` | **Read only** | Social Live reads current show, RJ and station from these. It never writes to them — that is what makes the kill test pass by construction. |
| Social platform models | — | **4 new tables** | Nothing comparable exists. Additive only; see §5. |

---

## 2. Both servers, checked live

Read off the running machines on 2026-09-02. Two findings changed the plan; one closed a risk the
plan had been carrying.

| | App server · `217.15.162.31` | Media server · `217.217.253.151` |
| :--- | :--- | :--- |
| **Role** | API, web, Postgres, Icecast, recorder, coturn | Studio bridge, LiveKit, Egress, dead-air fallback |
| **OS** | Ubuntu 22.04.5 | Ubuntu 24.04.4 |
| **Cores / RAM** | 6 · 11 GB | 6 · 11 GB |
| **Load at inspection** | 0.34 – 0.56 | 0.06 (essentially idle) |
| **Disk free** | 179 GB (8% used) | 184 GB (5% used) |
| **FFmpeg** | 4.4.2 — x264, gnutls, freetype, fontconfig, fribidi — **no libharfbuzz** | 6.1.1 — same plus **libharfbuzz** |
| **RTMPS support** | ✅ `rtmp`, `rtmps`, `rtmpt`, `rtmpts` | ✅ same |
| **Bengali fonts** | 48 faces installed | present |
| **Reaches YouTube ingest** | ✅ 1935 & 443 | ✅ 1935 & 443 |
| **Reaches Facebook ingest** | ✅ 443 | ✅ 443 |
| **Reads the public stream** | localhost to Icecast | ✅ verified HTTP 200, audio flowing |
| **PM2** | `boiaro-api`, `boiaro-web` — fork mode, online | `studio-bridge` — fork mode, 0 restarts |

### 2.1 State of BoiAro On Air itself

- **Both stations' stream URLs are correct.** `BoiAro on air` → `https://boiaro.com/radio-stream/live.mp3`,
  `BoiAro` → `.../live1.mp3`. The wrong-host value (`studio.boiaro.com`) that this plan originally
  carried as a P3 prerequisite is gone — **that risk is closed**.
- **The dead-air fallback is alive.** The looper on the media server is connected to the app server's
  Icecast on `/studio-fallback.mp3`, and `/live.mp3` currently answers with real audio even though no
  show is on — listeners hear the standby loop, not silence.
- **Icecast has room.** Configured for 200 clients and 10 sources, five mounts defined, effectively
  zero listeners right now. The encoder consumes one **client** slot, not a source slot.
- **No show has aired since 31 August.** Three active schedules exist. The empty listener-sample
  table for the last 10 minutes is correct behaviour, not a broken job — `runIcecastListenerPoll`
  returns early when nothing is live.
- **PM2 fork mode confirmed on both hosts**, so the in-memory registry assumption holds — and stays a
  documented constraint (see §7, Risk 4).

### 2.2 The ffmpeg version split, and what it forces

The app server's FFmpeg 4.4.2 has **no `libharfbuzz`**, so its `drawtext` filter cannot shape Bengali
conjuncts correctly. The media server's 6.1.1 does have it — but relying on that would make the
feature silently host-dependent.

> **Rule: Bengali is never rendered by FFmpeg.** Scenes are composed to PNG with `sharp` (librsvg),
> which already renders Bengali correctly on these boxes — `server/src/lib/shareCard.ts` is the
> proven precedent — and FFmpeg only encodes the finished image.

Without checking the servers this would have shipped and produced broken conjuncts **in production
only**, since local dev runs the newer ffmpeg.

---

## 3. Measured encoding cost

The plan's biggest unknown was whether 1080p30 H.264 is affordable on these boxes. It was measured on
both, not estimated: 20 seconds of 1080p30 at 4500 kbps CBR, `-preset veryfast`, converted to the
number of cores needed to sustain real time.

| Scene | App server | Media server | What it means |
| :--- | ---: | ---: | :--- |
| **Static branded card** (the MVP scene) | 0.95 cores | 0.96 cores | About one sixth of either box. Comfortably affordable. |
| **Fully moving frame** (worst case for the waveform) | 1.98 cores | 2.44 cores | A third to 40% of a box for one broadcast. Fine on an idle host, uncomfortable on a busy one. |

The site stayed HTTP 200 on the production host throughout the benchmark. Both boxes are the same
6-core AMD EPYC class, so the choice between them is about isolation and headroom, not raw speed.

> **What the numbers force: encode once, fan out twice.** Facebook and YouTube must be two outputs of
> a single encoder via FFmpeg's `tee` muxer with `onfail=ignore`, not two encoder processes. That
> keeps two destinations at the one-broadcast cost above and still lets one platform fail without
> touching the other. Two separate processes would double it, which the waveform scene cannot afford.

---

## 4. Architecture

One direction of flow, one new branch. The encoder attaches where a listener's browser attaches.

```
RJ Studio (mic + music + SFX)          [unchanged]
        |
        v
Icecast master feed                    [unchanged, single source of truth]
radio_stations.stream_url
        |
        +--> Android / iOS app         [untouched]
        +--> Website player            [untouched]
        +--> Recording pipeline        [untouched]
        +--> Social Broadcast Engine   [NEW — HTTP read only, on the media server]
                     |
                     v
              scene PNG + audio -> H.264 / AAC -> ffmpeg tee (onfail=ignore)
                    /                                  \
                   v                                    v
            Facebook Live                        YouTube Live
```

**Encoder states** (brief §17). Every state is derived from the encoder process and the platform's
own reported ingest — never from whether an admin clicked a button:

`OFFLINE` · `STARTING` · `LIVE` · `RECONNECTING` · `STOPPING` · `FAILED`

---

## 5. Data model

Four additive tables following the project's Prisma conventions — UUID primary keys, `snake_case`
table names via `@@map`, `created_at` / `updated_at`. No existing table is modified in Phase 1, which
is what makes its rollback a clean drop.

| Table | Holds | Notable fields |
| :--- | :--- | :--- |
| `social_platform_connections` | One row per Facebook Page or YouTube channel the platform can broadcast to. | `platform`, `account_name`, `account_ref`, `rtmp_url`, `stream_key_encrypted`, `enabled`, `status`, `last_tested_at`, `last_error` |
| `social_broadcasts` | One row per social broadcast attempt — the unit an admin starts, stops and reviews. | `live_session_id`, `show_schedule_id`, `station_id`, `trigger` (manual \| scheduled), `started_by`, `started_at`, `ended_at`, `state`, `social_title`, `social_description`, `cover_url` |
| `social_broadcast_destinations` | Per-platform leg of a broadcast. The row the encoder process owns. | `broadcast_id`, `connection_id`, `state`, `encoder_pid`, `reconnect_attempts`, `last_disconnect_at`, `last_reconnect_at`, `last_error`, `platform_watch_url` |
| `show_social_settings` | Per-show automation preferences (§12). | `show_schedule_id`, `facebook_enabled`, `youtube_enabled`, `auto_start`, `auto_stop`, `start_before_minutes`, `stop_after_minutes`, `social_title`, `social_description`, `cover_url` |

**Secrets.** Stream keys are written only through `encryptSecret()` and never returned by any query,
tRPC procedure or REST route. The API returns a masked form (`abcd••••••••xyz`) computed from the
plaintext at read time and discarded. Decryption happens in exactly one place: the moment the encoder
builds its argument array. No log line, no error message and no audit entry may carry the full key.

**Duplicate encoder prevention** — three layers, because one is not enough (§8, §15):

1. a partial unique index on `social_broadcast_destinations` for rows in a non-terminal state per
   connection (this is the one that survives a restart);
2. the in-memory registry check;
3. a preflight that refuses to start when a live PID for that destination is still running.

---

## 6. Phases

The order is the brief's own §4 and §23. Each phase ends in a reviewable state with a working
rollback, and ships the mandatory §25 report: files changed, DB changes, env vars, dependencies, test
steps, rollback, remaining work. Nothing in a later phase begins before the previous gate is signed
off.

### P0 — Audit and plan ✅ done

Read the codebase, inspect both servers, decide what gets reused. Output is this document.

- **Files changed:** none · **DB:** none · **Rollback:** n/a
- **Gate:** the four decisions in §8 are confirmed. Two of them change P2's shape, so they are asked
  before code, not after.

### P1 — Data model, credential vault, and the TLS fix · ~0.5 day

The four tables, the migration, and a thin credential module wrapping the existing encryption with
masking and validation. Plus the Platform Connections admin screen (§9) so keys can be entered,
shape-checked and stored — with nothing yet able to use them.

- **Also in this phase:** move the app→media control channel onto TLS (§7, Risk 1). **⚠️ STILL
  OUTSTANDING as of 2026-09-03** — deliberately not applied, because it needs a production API restart
  and only matters once the encoder actually runs on the media server. Scheduled to go out with the P3
  deployment. Everything else in P1 is done.
- RTMP URL and stream key are validated against strict allowlist patterns at write time, so an
  injection attempt never reaches storage, let alone a process.
- "Test Connection" at this phase verifies reachability and credential shape only — no stream is
  published.

| | |
| :--- | :--- |
| **New files** | `server/src/lib/socialCredentials.ts`, `src/pages/admin/AdminSocialLive.tsx` |
| **DB** | 1 additive migration, 4 new tables, 0 existing tables touched |
| **Env** | `STUDIO_BRIDGE_INTERNAL_URL` repointed to the HTTPS endpoint |
| **Rollback** | revert commit; drop 4 tables — no existing data at risk |

**Gate:** a stream key saved through the admin screen is unreadable in `psql`, the API returns only
the masked form, and the control channel no longer carries its shared secret in cleartext.

### P2 — Encoder core, publishing nowhere · ~2 days

The heart of the feature, tested against a local sink before any external platform sees a packet. The
encoder reads the Icecast URL over HTTP, loops a static scene image, and writes H.264 + AAC to
`-f null` or a local RTMP listener.

- Spawn with an argument array, `shell: false`, no string concatenation anywhere near user input.
- Preflight before start: source reachable, ffmpeg present, at least one destination enabled,
  credentials decryptable, no live PID for that destination, concurrency cap not exceeded.
- PID and state persisted per destination; boot-time reconcile sweeps rows left claiming to be live
  after a restart.
- Procedures named `socialBroadcastStart` / `socialBroadcastStop`, rate-limited, admin-gated,
  audit-logged.
- Hard kill switch: `social_live_enabled` platform setting, default `false`, checked on every start
  path.
- Re-measure CPU on the real pipeline and record it.

| | |
| :--- | :--- |
| **New files** | `server/src/lib/socialEncoder.ts`, `server/src/services/socialLive.service.ts` |
| **Changed** | `server/src/routers/admin.ts` (new procedures only), `server/src/lib/radioSettings.ts` (additive keys), `server/src/index.ts` (boot reconcile) |
| **Env** | `SOCIAL_SCENE_DIR`, optional `FFMPEG_PATH`. *Corrected:* the concurrency cap was **not** built as an env var — it is the platform setting `social_max_concurrent_encoders`, so an admin can change it without a deploy, consistent with every other radio setting. |
| **Rollback** | flip `social_live_enabled` to false — the code becomes inert without a deploy |

**Gate:** start, run 30 minutes to a local sink, stop cleanly, leave no orphan process. Then hard-kill
it mid-run and confirm radio, recording and listener count are all unaffected.

**P2 addendum — the RTMP output path, proven against two local RTMP sinks (2026-09-03).** Everything in
P2 published to `-f null`, which exercises encoding but never the actual output path. Publishing to two
local RTMP listeners standing in for YouTube and Facebook found a real bug that no dry run could have
surfaced: **the `tee` muxer needs explicit `-map`**, and without it ffmpeg dies with *"Output file does
not contain any stream"*. Default stream selection happens to produce a working *single* output, so the
one-platform path worked while the two-platform path was broken. Fixed by mapping unconditionally
(`-map 0:v:0 -map 1:a:0`), which keeps both paths identical. Verified after the fix:

- One encoder process fed **both** destinations; both received continuously.
- Output is **H.264 1920×1080 @ 30fps + AAC 48 kHz stereo** — the brief's §10 spec, confirmed with `ffprobe`.
- Killing one destination's listener left the other still receiving, and the encoder alive — `onfail=ignore` works.
- The stream key was redacted (`***REDACTED***`) in the stored error, confirming §21 holds on the failure path too.

### P3 — YouTube private test — the MVP milestone · ~1 day

The brief's §26 stated first production milestone, and nothing more: an admin presses one button and
the existing Icecast feed appears on an unlisted YouTube live stream with a static branded card and
clean audio.

- Real RTMPS ingest, real stream key from the vault, real stop.
- Wrong-key handling verified deliberately: the destination goes `FAILED` with a useful `last_error`,
  and nothing else on the platform notices.

**Prerequisite:** a BoiAro-owned YouTube channel with live streaming already enabled (that permission
can take 24 hours to activate on a fresh channel).

**Gate:** 30 minutes unlisted-live, audio in sync, no dropped-frame growth, clean stop — and the kill
test passes again. **Facebook and automation do not begin until this is stable.**

### P4 — Facebook, then both at once · ~1 day

The second destination, exercising the `tee` fan-out. Facebook alone first, then simultaneously with
YouTube. One platform failing must leave the other live — that is a test, not an assumption.

**Prerequisite:** a Facebook Page with a persistent stream key.
**Rollback:** disable the Facebook connection row.

### P5 — Social Live dashboard · ~1.5 days ✅ done, pulled forward

**Re-ordered deliberately (2026-09-03).** The plan assumed I would run the YouTube test with a key handed
to me, which put the dashboard after it. Since **all stream keys are entered from the admin panel**, the
panel has to exist before anyone can run P3 at all — so it was built first. Nothing else in the order
changes: Facebook and automation still wait on a stable YouTube test.

The full §8 control centre: On Air status, per-platform status, current show / RJ / station, start
time and duration, manual start and stop, per-platform toggles, and Emergency Stop All behind a
confirmation. Plus the broadcast history list and detail view (§20).

State is polled from the backend every few seconds and reflects the encoder and platform, not the
last click.

**Changed:** `src/pages/admin/AdminSocialLive.tsx`, new `src/pages/admin/AdminSocialLiveControls.tsx`,
plus a `socialBroadcastHistory` endpoint.

**Verified by driving a real browser**, not just by compiling — the last UI regression in this repo passed
every API-level test and only a browser caught it. Signed in through the UI, turned the feature on with the
master switch, added a connection through the dialog, started a test encode, watched the duration tick, and
stopped it. The stream key never appeared in the rendered page — only its masked form. No console errors.

One bug found and fixed that way: the history panel read *"Nothing has been broadcast yet"* while a
broadcast was visibly running above it, because only the status query was invalidated after start/stop.
Both now refresh together.

### P6 — Show Schedule integration and automation · ✅ done

Brief §12 and §13. A social panel on each show in the schedule, and one new idempotent job registered
in the existing cron file — never a second scheduler.

- Runs every minute; auto-start re-verifies active show, schedule window, feed availability and
  destination credentials before doing anything.
- Repeated execution creates no second encoder; repeated auto-stop is a safe no-op.
- All time comparisons go through the existing Dhaka timezone helper, not raw `Date` getters.

**New file:** `server/src/jobs/socialAutoBroadcast.ts`. **Changed:** `server/src/jobs/index.ts` (one
registration). **Rollback:** set `social_auto_start_enabled` false; the job becomes a no-op.
**Gate:** a scheduled show goes live and ends on its own, twice, with the job manually re-invoked
mid-window to prove idempotence.

### P7 — Visual scenes · ✅ done

Brief §11's four scenes — Starting Soon, Live Now, Be Right Back, Show Ended — composited
server-side with `sharp` from the show cover, title, RJ name and BoiAro branding.

- **Bengali is never rendered by FFmpeg** (see §2.2). Proof-read against real show titles containing
  conjuncts — such as `বই আরও নাইট স্টোরিজ`, which is live in the schedule — not transliterated
  placeholders.
- The audio-reactive waveform is the expensive half. It ships only against a re-measured CPU budget,
  behind its own setting, and falls back to the static card if the budget is not there.

**New file:** `server/src/lib/socialScenes.ts`. **Dependencies:** none — `sharp` and the Noto fonts
are already present on both hosts.
**Gate:** all four scenes render correct Bengali at 1920×1080, and a scene change mid-broadcast does
not drop the stream.

### P8 — Failover, reconnect and monitoring · ✅ done

Brief §14 and §17. A few seconds of lost audio must not end a live broadcast: switch to the Be Right
Back scene, retry with backoff, resume when the source returns, and only mark the destination
degraded once a threshold is crossed — then alert.

- Source state comes from the existing 3-sample Icecast health window, so one poll blip cannot
  trigger a failover.
- Social panel added to Radio Safety & Controls with duration, bitrates, dropped frames, reconnect
  attempts, last error, and Restart / Stop / Emergency Stop behind confirmations.

**Gate:** cut the Icecast source for 20 seconds mid-broadcast. The platform stream stays up on the
fallback scene and resumes automatically.

### P9 — Social broadcast rights on the music library · ✅ done

Brief §16. Per-platform rights flags beside the existing licence fields, and a warning-first policy:
an RJ playing a track not cleared for Facebook or YouTube sees a warning and the event is audited —
nothing is blocked in this phase.

**DB:** additive nullable columns on `studio_audio_assets`. **Changed:**
`src/pages/admin/AdminStudioLibrary.tsx`.
**Gate:** existing library rows keep working with the new columns null.

### P10 — Staging QA and production rollout · ~2 days

The full §22 checklist end to end, then a staged release: deploy with the kill switch off, enable for
one unlisted YouTube test on production, then Facebook, then automation.

Server restart recovery, wrong stream key, duplicate start request, platform disconnect and
reconnect, Bengali title rendering, show cover replacement, Emergency Stop.

**Gate:** every checklist line signed off, with the critical kill test done **by ear on a real
device**, not inferred from logs.

---

## 7. Security posture

The brief's §19 requirements as concrete, reviewable commitments:

- **No shell.** FFmpeg is spawned with an argument array. There is no code path that builds a shell
  string, and none that concatenates a user-supplied value into a command.
- **Validated at the boundary.** RTMP URLs must match an `rtmps?://` host-and-path allowlist pattern;
  stream keys must match a strict character class and length. Anything else is rejected on save, not
  at spawn time.
- **Secrets stay encrypted.** Plaintext exists only in the argument array of a running process.
  Nothing logs it, no error carries it, no API returns it, and the audit trail records that a key was
  changed, never what it changed to.
- **Admin only.** Enforced server-side by the existing permission classifier, not by hiding a menu item.
- **Rate-limited.** Start, stop and emergency-stop are throttled per admin, because a repeated start
  is the most likely way to produce a duplicate encoder.
- **Audited**, all through the existing radio audit helper. Emitted **today**: broadcast started,
  broadcast stopped, emergency stop, encoder crash, encoders reconciled after a restart, and connection
  created / updated / deleted / tested. Also emitted now: auto-start and auto-stop (P6), source lost,
  source recovered, broadcast degraded and per-destination failure (P8), social rights warnings and
  per-show settings changes (P9).

---

## 8. Risks

### ✅ Closed — CPU is affordable

Measured, not estimated (§3): one core for the static MVP card, two to two and a half for a fully
moving frame, on a six-core box. Running it on the idle media server leaves the app server untouched
entirely. The waveform is still gated on a re-measurement in P7 because a real audio-reactive filter
chain is not identical to a synthetic moving source, but the order of magnitude is known and it fits.

### ✅ Closed — the station stream URLs are correct

Checked directly in the production database. Both stations point at `boiaro.com/radio-stream/…`, the
host listeners actually use. The stale `studio.boiaro.com` value this plan carried as a P3
prerequisite is no longer there, and the media server was confirmed able to read the stream over
HTTPS.

### ⚠️ Risk 1 — the control channel between the two servers is unencrypted

*Pre-existing infrastructure, not caused by this feature, and still open.*

The app server already commands the media server over `http://217.217.253.151:8899`, authenticated by
a shared secret in an `X-Studio-Internal-Secret` header. `ufw` correctly restricts that port to the
app server's IP, but the traffic is **plain HTTP across the public internet** — so the shared secret
is on the wire in cleartext today, on every mount registration.

That is tolerable for a mount name. It is not tolerable for a Facebook or YouTube stream key.
**Moving this channel onto TLS is a prerequisite for running the encoder on the media server**, and it
is cheap: that host already terminates HTTPS with a valid Let's Encrypt certificate for
`studio.boiaro.com`, so it is an nginx `location /internal/` block proxying to the existing port, plus
repointing `STUDIO_BRIDGE_INTERNAL_URL`. It also fixes the existing exposure. **Scheduled for P1.**

### ⚠️ Risk 2 — local development cannot test this as-is

The local database has **zero** `radio_stations` rows, so there is no stream URL to read. P2 needs
either a seeded local station pointed at a reachable test stream, or a local Icecast. Worth setting up
at the start of P2 rather than discovering mid-phase.

### ⚠️ Risk 3 — music rights on public platforms

Facebook and YouTube run automated content matching. A track that is fine to stream on BoiAro's own
app can mute a video, or put a strike on the Page or channel. §16's warning-first policy is the right
first step, but the business exposure is real and belongs in the go-live conversation, not only in a
checkbox.

### ✅ Closed — per-destination state is now real

Closed by P8. ffmpeg names the failing output when a tee slave dies, so the encoder matches that line
against each destination's ingest URL (minus its key) and marks exactly that leg `FAILED` with the
reason. The dashboard no longer reports a dead platform as `LIVE`, and the on-screen caveat that said
so has been removed because it is no longer true.

### ⚠️ Risk 5 — single-instance assumption

The encoder registry lives in memory, which is safe only because PM2 runs one fork-mode instance
(confirmed on both hosts). The recording pipeline already carries this constraint. If cluster mode is
ever switched on, both features break in the same way. P2 adds a boot-time assertion so this fails
loudly rather than silently double-encoding.

---

## 9. Decisions needed before Phase 1

### 1. Which host runs the encoder? — the servers answered this

I had planned to recommend the app server and let a measurement decide later. Having checked both,
the media server is the clear answer: it sits at 0.06 load against the app server's ~0.5, it is
already off the path every listener depends on, it runs a newer FFmpeg, it already reads the public
stream successfully, its outbound path to both platforms is open, and the app server already has an
authenticated control channel to it. Putting the encoder there makes the architecture rule physical
rather than conventional.

The one condition is the unencrypted control channel (§8, Risk 1), fixed in P1 before any stream key
exists to send.

> **Recommended: media server, with the control channel moved to TLS first.**

### 2. Static card or waveform for the MVP?

A static branded card gets to a working YouTube stream fastest and at about one core. The
audio-reactive waveform is the visually better answer and the one §11 asks for, but it is roughly
2.5× the encoding load and a real amount of work.

> **Recommended: static card through P3, waveform in P7 against a known budget.**

### 3. Manual stream keys, or OAuth from the start?

The brief explicitly permits RTMPS URL + stream key for the MVP, with official API integration later.
OAuth would let the system create the broadcast object, set title and privacy, and read back real
platform-side status — but it is substantial work with its own review process on both platforms.

> **Recommended: manual keys through P4; treat OAuth as a separate later project.**

### 4. Who owns the test channel and page?

P3 needs a YouTube channel with live streaming already enabled (can take 24 hours to activate on a
fresh channel), and P4 needs a Facebook Page with a persistent stream key. Both must be BoiAro-owned,
not a personal account.

> **Needed before P3 starts, so worth requesting during P1.**

---

*Phase 0 report · prepared against `boiaro-v2 @ main` · both servers inspected live 2 September 2026 ·
no code has been written yet.*
