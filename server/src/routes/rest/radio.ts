import { Router } from "express";
import { z } from "zod";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { getListenerCount, emitToSession } from "../../realtime/socket.js";
import { getRadioSetting, getRadioSettingBool, getRadioSettingNumber } from "../../lib/radioSettings.js";
import { logRadioAction } from "../../lib/radioAudit.js";
import { generateBroadcastToken, verifyBroadcastToken } from "../../lib/broadcastToken.js";

export const radioRestRouter = Router();

async function assertHostOrModerator(userId: string, session: { rj_user_id: string }): Promise<boolean> {
  if (userId === session.rj_user_id) return true;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  return !!role;
}

async function isMuted(sessionId: string, userId: string): Promise<boolean> {
  const mute = await prisma.radioMute.findFirst({
    where: { live_session_id: sessionId, user_id: userId, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] },
  });
  return !!mute;
}

// ═══════════════════════════════════════════════════════════════════════════
//  📻  LISTENER — public
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/v1/radio/stations ────────────────────────────────────────────────
// Stream URLs are omitted for anonymous requests when guest listening is
// switched off (radio_guest_listening_enabled) — station metadata still
// shows, just not a playable URL.
radioRestRouter.get("/stations", async (req: AuthenticatedRequest, res) => {
  try {
    const stations = await prisma.radioStation.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } });
    const guestAllowed = await getRadioSettingBool("radio_guest_listening_enabled");
    const isAuthed = !!req.auth?.userId;
    const visible = guestAllowed || isAuthed
      ? stations
      : stations.map((s) => ({ ...s, stream_url: null, stream_url_medium: null, stream_url_low: null }));
    res.json({ stations: visible });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/live ──────────────────────────────────────────────────────
// Public. The currently-live (non-test) session, if any.
radioRestRouter.get("/live", async (req: AuthenticatedRequest, res) => {
  try {
    const session = await prisma.liveSession.findFirst({
      where: { status: { in: ["live", "reconnecting"] }, is_test: false },
      include: { station: true },
      orderBy: { started_at: "desc" },
    });
    if (!session) { res.json({ live: null }); return; }
    const rjProfile = await prisma.rjProfile.findUnique({ where: { user_id: session.rj_user_id } });

    const guestAllowed = await getRadioSettingBool("radio_guest_listening_enabled");
    const isAuthed = !!req.auth?.userId;
    const streamUrl = guestAllowed || isAuthed ? session.stream_url : null;

    res.json({ live: { ...session, stream_url: streamUrl, rj_profile: rjProfile, listener_count: getListenerCount(session.id) } });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/live/:sessionId/chat ────────────────────────────────────
radioRestRouter.get("/live/:sessionId/chat", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const messages = await prisma.liveChatMessage.findMany({
      where: { live_session_id: String(req.params.sessionId) },
      orderBy: { created_at: "desc" },
      take: limit,
    });
    const userIds = [...new Set(messages.map((m) => m.user_id))];
    const profiles = userIds.length
      ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true, avatar_url: true } })
      : [];
    const pMap = new Map(profiles.map((p) => [p.user_id, p]));
    res.json({
      messages: messages.reverse().map((m) => ({
        id: m.id, user_id: m.user_id, message: m.message, created_at: m.created_at,
        display_name: pMap.get(m.user_id)?.display_name ?? null,
        avatar_url: pMap.get(m.user_id)?.avatar_url ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/live/:sessionId/listener-count ──────────────────────────
radioRestRouter.get("/live/:sessionId/listener-count", (req, res) => {
  res.json({ count: getListenerCount(String(req.params.sessionId)) });
});

// ── POST /api/v1/radio/live/:sessionId/song-request ───────────────────────────
// Auth required. REST fallback for clients not maintaining a socket
// connection — pushes the same live update socket-originated requests get.
radioRestRouter.post("/live/:sessionId/song-request", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const text = String(req.body?.request_text || "").trim().slice(0, 200);
    if (!text) { res.status(400).json({ error: "request_text is required" }); return; }
    const userId = req.auth.userId!;

    if (!(await getRadioSettingBool("radio_requests_enabled"))) { res.status(403).json({ error: "Song requests are currently disabled" }); return; }
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { requests_enabled: true } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!session.requests_enabled) { res.status(403).json({ error: "Requests are off for this show" }); return; }
    if (await isMuted(sessionId, userId)) { res.status(403).json({ error: "You've been muted in this room" }); return; }

    const [saved, profile] = await Promise.all([
      prisma.songRequest.create({ data: { live_session_id: sessionId, user_id: userId, request_text: text } }),
      prisma.profile.findUnique({ where: { user_id: userId }, select: { display_name: true } }),
    ]);
    const payload = { id: saved.id, user_id: userId, display_name: profile?.display_name ?? null, request_text: saved.request_text, status: saved.status, created_at: saved.created_at };
    emitToSession(sessionId, "song_request:new", payload);
    res.status(201).json(payload);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/live/:sessionId/song-requests ───────────────────────────
// Host/moderator only.
radioRestRouter.get("/live/:sessionId/song-requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!(await assertHostOrModerator(req.auth.userId!, session))) { res.status(403).json({ error: "Not authorized" }); return; }

    const requests = await prisma.songRequest.findMany({ where: { live_session_id: sessionId }, orderBy: { created_at: "desc" }, take: 100 });
    const userIds = [...new Set(requests.map((r) => r.user_id))];
    const profiles = userIds.length
      ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } })
      : [];
    const pMap = new Map(profiles.map((p) => [p.user_id, p.display_name]));
    res.json({ requests: requests.map((r) => ({ ...r, display_name: pMap.get(r.user_id) ?? null })) });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── PATCH /api/v1/radio/live/:sessionId/song-requests/:id ─────────────────────
// Host/moderator only. Body: { status: "played" | "rejected" }
radioRestRouter.patch("/live/:sessionId/song-requests/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const status = String(req.body?.status || "");
    if (!["played", "rejected"].includes(status)) { res.status(400).json({ error: "status must be 'played' or 'rejected'" }); return; }

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!(await assertHostOrModerator(req.auth.userId!, session))) { res.status(403).json({ error: "Not authorized" }); return; }

    const updated = await prisma.songRequest.update({ where: { id: String(req.params.id) }, data: { status } });
    emitToSession(sessionId, "song_request:updated", { id: updated.id, status: updated.status });
    res.json(updated);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── DELETE /api/v1/radio/live/:sessionId/chat/:messageId ──────────────────────
// Host/moderator only.
radioRestRouter.delete("/live/:sessionId/chat/:messageId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!(await assertHostOrModerator(req.auth.userId!, session))) { res.status(403).json({ error: "Not authorized" }); return; }

    await prisma.liveChatMessage.delete({ where: { id: String(req.params.messageId) } }).catch(() => null);
    emitToSession(sessionId, "chat:deleted", { messageId: req.params.messageId });
    await logRadioAction(req.auth.userId!, "chat_message_deleted", { sessionId, messageId: req.params.messageId });
    res.json({ deleted: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/live/:sessionId/report ──────────────────────────────────
// Auth required. Report a chat message or song request.
radioRestRouter.post("/live/:sessionId/report", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      target_type: z.enum(["chat_message", "song_request"]),
      target_id: z.string(),
      reason: z.string().min(1).max(500),
    });
    const input = schema.parse(req.body);
    const report = await prisma.liveReport.create({
      data: {
        live_session_id: String(req.params.sessionId),
        reporter_id: req.auth.userId!,
        target_type: input.target_type,
        target_id: input.target_id,
        reason: input.reason,
      },
    });
    res.status(201).json(report);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/live/:sessionId/mute ────────────────────────────────────
// Host/moderator only. Body: { user_id, reason?, duration_minutes? }
radioRestRouter.post("/live/:sessionId/mute", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!(await assertHostOrModerator(req.auth.userId!, session))) { res.status(403).json({ error: "Not authorized" }); return; }
    const { user_id, reason, duration_minutes } = req.body || {};
    if (!user_id) { res.status(400).json({ error: "user_id is required" }); return; }
    const mute = await prisma.radioMute.create({
      data: {
        live_session_id: sessionId,
        user_id: String(user_id),
        muted_by: req.auth.userId!,
        reason: reason ? String(reason) : undefined,
        expires_at: duration_minutes ? new Date(Date.now() + Number(duration_minutes) * 60_000) : null,
      },
    });
    await logRadioAction(req.auth.userId!, "user_muted", { sessionId, userId: user_id, permanent: !duration_minutes });
    res.status(201).json(mute);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── DELETE /api/v1/radio/live/:sessionId/mute/:userId ──────────────────────────
radioRestRouter.delete("/live/:sessionId/mute/:userId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!(await assertHostOrModerator(req.auth.userId!, session))) { res.status(403).json({ error: "Not authorized" }); return; }
    await prisma.radioMute.deleteMany({ where: { live_session_id: sessionId, user_id: String(req.params.userId) } });
    await logRadioAction(req.auth.userId!, "user_unmuted", { sessionId, userId: req.params.userId });
    res.json({ unmuted: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/live/:sessionId/recording ──────────────────────────────
// Host/moderator only. Body: { recording_url }
radioRestRouter.post("/live/:sessionId/recording", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const url = String(req.body?.recording_url || "").trim();
    if (!url) { res.status(400).json({ error: "recording_url is required" }); return; }

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!(await assertHostOrModerator(req.auth.userId!, session))) { res.status(403).json({ error: "Not authorized" }); return; }

    const updated = await prisma.liveSession.update({ where: { id: sessionId }, data: { recording_url: url } });
    await logRadioAction(req.auth.userId!, "recording_attached", { sessionId });
    res.json(updated);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/catchup ──────────────────────────────────────────────────
// Public. Podcast-style archive of ended, non-test sessions with a recording.
radioRestRouter.get("/catchup", async (req, res) => {
  try {
    if (!(await getRadioSettingBool("radio_catchup_enabled"))) { res.json({ sessions: [], next_cursor: null }); return; }
    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const sessions = await prisma.liveSession.findMany({
      where: { status: "ended", recording_url: { not: null }, is_test: false },
      include: { station: { select: { id: true, name: true, artwork_url: true } } },
      orderBy: { started_at: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = sessions.length > limit;
    const page = hasMore ? sessions.slice(0, limit) : sessions;
    const rjIds = [...new Set(page.map((s) => s.rj_user_id))];
    const profiles = rjIds.length
      ? await prisma.rjProfile.findMany({ where: { user_id: { in: rjIds } }, select: { user_id: true, stage_name: true, avatar_url: true } })
      : [];
    const pMap = new Map(profiles.map((p) => [p.user_id, p]));
    res.json({
      sessions: page.map((s) => ({ ...s, rj_stage_name: pMap.get(s.rj_user_id)?.stage_name ?? null, rj_avatar_url: pMap.get(s.rj_user_id)?.avatar_url ?? null })),
      next_cursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/rj/profiles ──────────────────────────────────────────────
radioRestRouter.get("/rj/profiles", async (_req, res) => {
  try {
    const profiles = await prisma.rjProfile.findMany({ where: { is_active: true, is_approved: true }, orderBy: { created_at: "desc" } });
    res.json({ profiles });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/live/:sessionId/callin/request ─────────────────────────
// Auth required. Body: { consent_given: boolean }
radioRestRouter.post("/live/:sessionId/callin/request", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    if (!(await getRadioSettingBool("radio_callin_enabled"))) { res.status(403).json({ error: "Call-in is not enabled on this platform" }); return; }
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status === "ended") { res.status(404).json({ error: "Session not found" }); return; }
    if (!session.callin_enabled) { res.status(403).json({ error: "Call-in is off for this show" }); return; }
    if (!req.body?.consent_given) { res.status(400).json({ error: "consent_given is required to request to speak" }); return; }

    const userId = req.auth.userId!;
    const existing = await prisma.callInRequest.findFirst({
      where: { live_session_id: sessionId, user_id: userId, status: { in: ["requested", "waiting", "accepted", "on_air", "muted"] } },
    });
    if (existing) { res.json(existing); return; }

    const call = await prisma.callInRequest.create({ data: { live_session_id: sessionId, user_id: userId, consent_given_at: new Date() } });
    res.status(201).json(call);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/live/:sessionId/callin/my-status ─────────────────────────
radioRestRouter.get("/live/:sessionId/callin/my-status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const call = await prisma.callInRequest.findFirst({
      where: { live_session_id: String(req.params.sessionId), user_id: req.auth.userId! },
      orderBy: { created_at: "desc" },
    });
    res.json({ call });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/live/:sessionId/callin/queue ──────────────────────────────
// Host/moderator only.
radioRestRouter.get("/live/:sessionId/callin/queue", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!(await assertHostOrModerator(req.auth.userId!, session))) { res.status(403).json({ error: "Not authorized" }); return; }
    const calls = await prisma.callInRequest.findMany({
      where: { live_session_id: sessionId, status: { in: ["requested", "waiting", "accepted", "on_air", "muted"] } },
      orderBy: { requested_at: "asc" },
    });
    const userIds = [...new Set(calls.map((c) => c.user_id))];
    const profiles = userIds.length
      ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true, avatar_url: true } })
      : [];
    const pMap = new Map(profiles.map((p) => [p.user_id, p]));
    res.json({ calls: calls.map((c) => ({ ...c, display_name: pMap.get(c.user_id)?.display_name ?? null, avatar_url: pMap.get(c.user_id)?.avatar_url ?? null })) });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/callin/:callId/:action ───────────────────────────────────
// Host/moderator only. action: accept | reject | on-air | mute | remove
// Caller-only: end
radioRestRouter.post("/callin/:callId/:action", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const callId = String(req.params.callId);
    const action = String(req.params.action);
    const call = await prisma.callInRequest.findUnique({ where: { id: callId }, include: { session: { select: { rj_user_id: true, id: true } } } });
    if (!call) { res.status(404).json({ error: "Call not found" }); return; }

    if (action === "end") {
      if (call.user_id !== req.auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }
      res.json(await prisma.callInRequest.update({ where: { id: callId }, data: { status: "ended", ended_at: new Date() } }));
      return;
    }

    if (!(await assertHostOrModerator(req.auth.userId!, call.session))) { res.status(403).json({ error: "Not authorized" }); return; }

    switch (action) {
      case "accept":
        res.json(await prisma.callInRequest.update({ where: { id: callId }, data: { status: "waiting", responded_at: new Date() } }));
        return;
      case "reject":
        res.json(await prisma.callInRequest.update({ where: { id: callId }, data: { status: "rejected", responded_at: new Date() } }));
        return;
      case "on-air": {
        const maxConcurrent = (await getRadioSettingNumber("radio_callin_max_concurrent")) ?? 1;
        const onAirCount = await prisma.callInRequest.count({ where: { live_session_id: call.session.id, status: "on_air" } });
        if (onAirCount >= maxConcurrent) { res.status(409).json({ error: `Maximum ${maxConcurrent} caller(s) on air already` }); return; }
        res.json(await prisma.callInRequest.update({ where: { id: callId }, data: { status: "on_air", on_air_at: new Date() } }));
        return;
      }
      case "mute":
        res.json(await prisma.callInRequest.update({ where: { id: callId }, data: { status: "muted" } }));
        return;
      case "remove":
        res.json(await prisma.callInRequest.update({ where: { id: callId }, data: { status: "removed", ended_at: new Date() } }));
        return;
      default:
        res.status(400).json({ error: "Unknown action" });
    }
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  🎙️  RJ / HOST — auth required
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/v1/radio/rj/broadcast-token ────────────────────────────────────────
radioRestRouter.get("/rj/broadcast-token", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await prisma.rjProfile.findUnique({ where: { user_id: req.auth.userId! } });
    if (!profile) { res.status(404).json({ error: "No RJ profile" }); return; }
    res.json({
      has_token: !!profile.broadcast_token_hash && !profile.broadcast_token_revoked_at,
      created_at: profile.broadcast_token_created_at,
      revoked_at: profile.broadcast_token_revoked_at,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/rj/broadcast-token/regenerate ────────────────────────────
// Plaintext token returned exactly once.
radioRestRouter.post("/rj/broadcast-token/regenerate", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await prisma.rjProfile.findUnique({ where: { user_id: req.auth.userId! } });
    if (!profile) { res.status(404).json({ error: "No RJ profile" }); return; }
    if (!profile.is_approved || !profile.is_active) { res.status(403).json({ error: "Only approved, active RJs can generate a broadcast token" }); return; }
    const { token, hash } = generateBroadcastToken();
    await prisma.rjProfile.update({
      where: { user_id: req.auth.userId! },
      data: { broadcast_token_hash: hash, broadcast_token_created_at: new Date(), broadcast_token_revoked_at: null },
    });
    await logRadioAction(req.auth.userId!, "broadcast_token_regenerated");
    res.json({ token });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── DELETE /api/v1/radio/rj/broadcast-token ──────────────────────────────────────
radioRestRouter.delete("/rj/broadcast-token", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.rjProfile.update({ where: { user_id: req.auth.userId! }, data: { broadcast_token_revoked_at: new Date() } });
    await logRadioAction(req.auth.userId!, "broadcast_token_revoked");
    res.json({ revoked: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/rj/terms ───────────────────────────────────────────────────
radioRestRouter.get("/rj/terms", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [profile, currentVersion] = await Promise.all([
      prisma.rjProfile.findUnique({ where: { user_id: req.auth.userId! } }),
      getRadioSetting("radio_terms_version"),
    ]);
    res.json({
      current_version: currentVersion,
      accepted_version: profile?.terms_accepted_version ?? null,
      accepted_at: profile?.terms_accepted_at ?? null,
      needs_acceptance: profile?.terms_accepted_version !== currentVersion,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/rj/terms/accept ────────────────────────────────────────────
radioRestRouter.post("/rj/terms/accept", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const version = await getRadioSetting("radio_terms_version");
    await prisma.rjProfile.update({
      where: { user_id: req.auth.userId! },
      data: { terms_accepted_at: new Date(), terms_accepted_version: version },
    });
    res.json({ accepted: true, version });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/rj/live/my-session ────────────────────────────────────────
// The caller's own currently-live (non-test) session, if any.
radioRestRouter.get("/rj/live/my-session", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const session = await prisma.liveSession.findFirst({
      where: { rj_user_id: req.auth.userId!, is_test: false, status: { in: ["live", "reconnecting"] } },
      orderBy: { started_at: "desc" },
    });
    res.json({ session });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/rj/live/start ──────────────────────────────────────────────
radioRestRouter.post("/rj/live/start", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      stream_url: z.string().min(1),
      show_title: z.string().optional(),
      station_id: z.string().optional(),
      category: z.string().optional(),
      broadcast_token: z.string().min(1),
      is_test: z.boolean().default(false),
      chat_enabled: z.boolean().default(true),
      requests_enabled: z.boolean().default(true),
      recording_enabled: z.boolean().default(true),
      callin_enabled: z.boolean().default(false),
    });
    const input = schema.parse(req.body);
    const userId = req.auth.userId!;

    const profile = await prisma.rjProfile.findUnique({ where: { user_id: userId } });
    if (!profile || !profile.is_approved) { res.status(403).json({ error: "Only approved RJs can start a live session" }); return; }
    if (!profile.is_active) { res.status(403).json({ error: "Your RJ account is suspended or deactivated" }); return; }
    if (!profile.broadcast_token_hash || profile.broadcast_token_revoked_at) { res.status(403).json({ error: "No active broadcast token — generate one first" }); return; }
    if (!verifyBroadcastToken(input.broadcast_token, profile.broadcast_token_hash)) { res.status(401).json({ error: "Invalid broadcast token" }); return; }

    const currentTermsVersion = await getRadioSetting("radio_terms_version");
    if (profile.terms_accepted_version !== currentTermsVersion) { res.status(403).json({ error: "You must accept the current broadcaster terms before going live" }); return; }

    if (!input.is_test && input.station_id) {
      const clash = await prisma.liveSession.findFirst({
        where: { station_id: input.station_id, is_test: false, status: { in: ["live", "reconnecting"] } },
      });
      if (clash) { res.status(409).json({ error: "Another host is already live on this station" }); return; }
    }

    if (input.callin_enabled && !(await getRadioSettingBool("radio_callin_enabled"))) {
      res.status(403).json({ error: "Call-in is not enabled on this platform" });
      return;
    }

    const session = await prisma.liveSession.create({
      data: {
        rj_user_id: userId,
        station_id: input.station_id ?? null,
        stream_url: input.stream_url,
        show_title: input.show_title ?? null,
        category: input.category ?? null,
        status: "live",
        started_at: new Date(),
        last_heartbeat_at: new Date(),
        is_test: input.is_test,
        chat_enabled: input.chat_enabled,
        requests_enabled: input.requests_enabled,
        recording_enabled: input.recording_enabled,
        callin_enabled: input.callin_enabled,
      },
    });
    await logRadioAction(userId, input.is_test ? "test_broadcast_started" : "live_session_started", { sessionId: session.id });
    res.status(201).json(session);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/rj/live/:sessionId/end ─────────────────────────────────────
radioRestRouter.post("/rj/live/:sessionId/end", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.rj_user_id !== req.auth.userId) { res.status(403).json({ error: "You can only end your own live session" }); return; }
    const updated = await prisma.liveSession.update({ where: { id: sessionId }, data: { status: "ended", ended_at: new Date() } });
    await logRadioAction(req.auth.userId!, session.is_test ? "test_broadcast_ended" : "live_session_ended", { sessionId });
    res.json(updated);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/radio/rj/live/:sessionId/heartbeat ────────────────────────────────
radioRestRouter.post("/rj/live/:sessionId/heartbeat", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true, status: true } });
    if (!session || session.rj_user_id !== req.auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }
    const data: { last_heartbeat_at: Date; status?: string } = { last_heartbeat_at: new Date() };
    if (session.status === "reconnecting") data.status = "live";
    res.json(await prisma.liveSession.update({ where: { id: sessionId }, data }));
  } catch (error) {
    sendHttpError(res, error);
  }
});
