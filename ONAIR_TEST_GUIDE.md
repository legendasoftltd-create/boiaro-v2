# BoiAro On Air — Production Test Guide

Written after a Phase 0 sweep of the live production infrastructure (2026-08-13). Two real bugs
were found and fixed before this guide was written — see §0. Everything else below is a manual,
step-by-step walkthrough for testing the feature end to end on **production** (boiaro.com).

---

## 0. What I already checked and fixed (Phase 0)

Before writing this guide I verified the current state of both stations and found the second one
broken. Both are now fixed and confirmed streaming real audio:

| Station | Stream URL | Before | After |
| :--- | :--- | :--- | :--- |
| BoiAro | `https://boiaro.com/radio-stream/live.mp3` | ✅ working | ✅ still working (untouched) |
| Boi Aro 2 | `https://studio.boiaro.com/radio-stream/app.mp3` | ❌ 404 | ✅ fixed, streaming |

**What was actually wrong (two separate bugs, both on the studio-bridge box, 217.217.253.151):**

1. **Stale Icecast bind mount.** The Icecast Docker container's bind-mounted `icecast.xml` had
   gone stale at some point (host file writes stopped propagating into the running container —
   confirmed by writing a marker string to the host file and finding it absent inside the
   container). Every station-mount sync since then was silently writing to disk correctly but
   never actually reaching the running Icecast process. Fixed by restarting the container
   (`docker compose restart icecast` in `/opt/studio-bridge`) to re-establish a fresh bind mount.
   Confirmed the main station's live stream was unaffected throughout (it's served by a separate,
   local Icecast instance on the app box, 217.15.162.31 — not this one).

2. **Wrong stream URL for "Boi Aro 2".** Its `stream_url` was `https://studio.boiaro.com/app.mp3`
   — missing the `/radio-stream/` prefix that `studio.boiaro.com`'s nginx requires to route to
   Icecast (bare paths fall through to the LiveKit proxy instead, hence the 404). This looks like
   leftover test data from earlier "Add Station" UI verification, not something anyone configured
   deliberately — its `artwork_url` was also just the bare studio-bridge base URL, clearly a
   placeholder. Fixed the `stream_url` to `https://studio.boiaro.com/radio-stream/app.mp3`
   (matching the same pattern the working main station uses) and cleared the placeholder
   `artwork_url`.

**Not fixed, just flagged:** "Boi Aro 2" is still a real station in the admin panel with no real
content behind it (no schedule, presumably no dedicated RJ). If it's not meant to be a real second
station, consider deactivating it (toggle off in Admin → BoiAro On Air) rather than leaving a
station listeners could stumble into with nothing ever live on it. If it *is* meant to be a real
second station, it's now in a working state to build on.

**Current baseline confirmed:** no live session on either station, 3 approved RJs (Rayhan Ahmed,
Rayhan 4766 66Ahmed, RJ Kabir), 3 active show schedules, catchup archive empty, RJ profile
endpoints still clean (no `broadcast_token_hash`/phone/email leakage — re-verified the fix from
earlier this session still holds).

---

## 1. Prerequisites

- **Admin account**: `sadmin@gmail.com` — you have this.
- **An RJ account** for the parts below that need one. Any of the 3 existing approved RJs, or
  promote a test user: Admin → Users → find user → assign `rj` role (or Admin → RJ Management →
  add). You'll need that RJ's login credentials — I don't have them, so this part is on you.
- **A second browser/device** (or a second person) for anything involving a listener watching an
  RJ go live simultaneously, and for the Studio call-in/co-host flow specifically.
- **A real microphone** for the Studio (browser-based) flow — I can't test audio quality myself.
- **An external encoder** (BUTT or Mixxx — free) only if you want to test the *external encoder*
  Go Live path, as opposed to the *Studio* (browser) path. Most RJs will use Studio; test whichever
  matches how your RJs actually broadcast.

---

## 2. Phase 1 — Admin: Station Management ✅ (already verified)

Nothing to do here — confirmed working during Phase 0. If you want to see it yourself:
Admin → CMS & Content → BoiAro On Air → both stations show as toggled on, each with its own
Stream URL. "Add Station" creates a third if you want to test that flow again.

---

## 3. Phase 2 — RJ: Go Live (external encoder path)

1. Log in as an RJ at `/rj-auth`, go to the RJ dashboard.
2. Find "Go Live" — it should now show a **station picker** if the RJ has access to more than one
   station (this was a gap fixed earlier this session — confirm it's still there).
3. Pick "BoiAro" station. The form should show Icecast connection details (host/port/mount) for
   an external encoder — enter those into BUTT/Mixxx and connect.
4. Once connected, check:
   - RJ dashboard shows "You are live"
   - `https://boiaro.com/live` (or `/live/:sessionId`) shows the LIVE badge and plays your audio
   - `GET https://boiaro.com/api/v1/radio/live` returns your session, not `null`
5. Repeat with "Boi Aro 2" selected instead — **while BoiAro is not live** first, then **try going
   live on both stations at the same time with two different RJs** (needs two RJ accounts/browser
   sessions) — this is the core "does one station's broadcast affect the other" check from
   earlier this session. Confirm:
   - Both `/live/:sessionId` pages show correctly, independently
   - Stopping one doesn't affect the other's stream
6. Disconnect the encoder, confirm the RJ dashboard clears "live" state and the station's public
   stream URL falls back to idle/silence content within a few seconds (not a 404 — that's exactly
   what §0 was checking).

---

## 4. Phase 3 — RJ: Go Live via Studio (browser, solo)

1. From the RJ dashboard, choose Studio instead of external encoder.
2. Grant microphone permission when prompted.
3. Go live. Check:
   - Studio room UI shows your own audio level/waveform reacting to your voice
   - `/live` page (in a second browser/incognito tab, as a listener) shows LIVE and plays your
     actual voice with reasonable latency (a few seconds is normal for Icecast/HLS-style relay)
   - Try muting/unmuting yourself in the Studio UI — confirm the listener-side stream reflects it
4. End the broadcast from the Studio UI. Confirm listener side returns to idle/fallback content,
   not an error.

---

## 5. Phase 4 — Studio: Multi-participant (co-host/guest call-in)

This is the piece flagged as "still pending" from earlier work on this feature — worth
prioritizing.

1. While live in Studio (from Phase 3), generate a Studio invite link (co-host or guest, whichever
   role your UI offers) from the Studio room controls.
2. Open that invite link in a **second browser or device** — join as the co-host/guest.
3. Confirm both participants' audio channels are audible on the listener side simultaneously (not
   one cutting the other out).
4. Test a call-in request from a regular (non-RJ) logged-in user if that flow exists in your build
   (`POST /radio/live/:id/song-request` or an actual call-in button) — confirm it shows up in the
   RJ's request queue and can be accepted/rejected.
5. Have the co-host leave; confirm the RJ's own stream continues uninterrupted.
6. This is the one part of this guide that most needs a second real person + second real device —
   worth scheduling deliberately rather than trying to fake with two tabs on one machine (mic
   conflicts).

---

## 6. Phase 5 — Listener Experience

While someone is live (Phase 3 or the external-encoder test in Phase 2):

1. Open `/live` as a logged-in listener. Check:
   - Live chat sends/receives in real time
   - Listener count updates (roughly) as you open/close tabs
   - Song/topic request submission works, and shows up for the RJ
2. Check `/host/:userId` (public RJ profile) for the currently-live RJ — confirm it shows their
   live status and doesn't leak `phone`/`email`/`broadcast_token_hash` (already re-verified via
   API in §0, but worth a visual check too).
3. Check `/schedule` shows the 3 existing active schedules correctly, with correct next-occurrence
   times.

---

## 7. Phase 6 — Recording & Catch-up

1. On a station with `auto_recording_enabled` — both current stations have this **off**. Either
   turn it on for one via Admin → BoiAro On Air before testing, or manually trigger a recording
   attachment if your admin has that control (`POST /radio/live/:id/recording` exists per the API
   docs).
2. Go live, stay live for at least a minute or two (recordings of a few seconds may not process
   cleanly), then end the session.
3. Check `/catchup` — the session should appear within a reasonable delay (there's a background
   job for this; if it doesn't appear within a few minutes, that's a real bug to report back).
4. Play the catch-up recording back — confirm audio quality and that it actually matches what was
   broadcast.

---

## 8. Phase 7 — Admin Moderation (Radio Safety & Controls)

1. While a session is live and a chat is active, go to Admin → Radio Safety & Controls (or use the
   in-chat moderation controls if RJs have them too).
2. Mute a test user in chat — confirm they can no longer post, but can still listen.
3. Ban a test user — confirm they're fully blocked from chat.
4. Delete a chat message — confirm it disappears for other listeners in near-real-time, not just
   on refresh.
5. Use the "emergency disconnect" call-in control if you test call-ins in Phase 4 — confirm it
   actually hangs up that specific caller without affecting the RJ or other participants.

---

## 9. Phase 8 — Show Schedule → Reminder Notifications

1. Admin → Show Schedule → create a new one-time show a few minutes in the future, assigned to a
   real RJ and station.
2. Confirm it appears on `/schedule` immediately.
3. Wait for the scheduled reminder job to fire (check whether listeners who follow that RJ get a
   notification shortly before start time — this depends on notification preferences being on for
   a test account).
4. Confirm the show auto-marks correctly once its time window passes (still "Active" vs whatever
   your completed-state looks like).

---

## 10. What's out of scope for manual testing

- **Load testing** (many concurrent listeners) — this needs a real tool (e.g. `k6`, or scripted
  concurrent `curl`/ffmpeg listener connections against the Icecast mount) rather than manual
  clicking. Say the word if you want this built and run separately — it's a different kind of test
  from everything above.
- **Real audio quality across bad networks** (3G, packet loss) — needs real devices on real
  networks, can't be simulated meaningfully from here.

---

## 11. If something breaks

Tell me exactly which phase/step and what you saw (screenshot if it's visual, or just what URL/
button and what happened instead of what was expected) — I can usually reproduce and fix most of
these directly against production the way §0 was done, rather than needing a local repro first.
