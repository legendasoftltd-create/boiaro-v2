import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { getListenerCount, emitToSession } from "../../realtime/socket.js";

export const radioRestRouter = Router();

async function assertHostOrModerator(userId: string, session: { rj_user_id: string }): Promise<boolean> {
  if (userId === session.rj_user_id) return true;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  return !!role;
}

// ── GET /api/v1/radio/stations ────────────────────────────────────────────────
radioRestRouter.get("/stations", async (_req, res) => {
  try {
    const stations = await prisma.radioStation.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } });
    res.json({ stations });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/live ──────────────────────────────────────────────────────
// Public. The currently-live session, if any.
radioRestRouter.get("/live", async (_req, res) => {
  try {
    const session = await prisma.liveSession.findFirst({
      where: { status: "live" },
      include: { station: true },
      orderBy: { started_at: "desc" },
    });
    if (!session) { res.json({ live: null }); return; }
    const rjProfile = await prisma.rjProfile.findUnique({ where: { user_id: session.rj_user_id } });
    res.json({ live: { ...session, rj_profile: rjProfile, listener_count: getListenerCount(session.id) } });
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
    res.json({ deleted: true });
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
    res.json(updated);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/radio/catchup ──────────────────────────────────────────────────
// Public. Podcast-style archive of ended sessions with a recording attached.
radioRestRouter.get("/catchup", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const sessions = await prisma.liveSession.findMany({
      where: { status: "ended", recording_url: { not: null } },
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
