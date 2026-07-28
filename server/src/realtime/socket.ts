import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { getRadioSettingBool, getRadioSettingNumber } from "../lib/radioSettings.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { checkMessageSafety } from "../lib/chatSafety.js";

interface AuthedSocket extends Socket {
  userId?: string;
}

const lastMessageAt = new Map<string, number>();
// socketId -> ListenerSession row id, so leave/disconnect can close it out.
const listenerSessionRows = new Map<string, string>();
// userId -> last callin:offer/answer/ice-candidate timestamp, so a
// participant can't flood their call partner's socket (repeated
// getUserMedia-triggering offers, or an ICE-candidate storm).
const lastCallInSignalAt = new Map<string, number>();
const CALLIN_SIGNAL_MIN_INTERVAL_MS = 150;

function room(sessionId: string) {
  return `live:${sessionId}`;
}

async function isHostOrModerator(userId: string, session: { rj_user_id: string }): Promise<boolean> {
  if (userId === session.rj_user_id) return true;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  return !!role;
}

/** "mute" or "ban" — either counts as restricted for chat/request purposes. */
async function activeRestriction(sessionId: string, userId: string): Promise<string | null> {
  const mute = await prisma.radioMute.findFirst({
    where: { live_session_id: sessionId, user_id: userId, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] },
  });
  return mute?.type ?? null;
}

let io: SocketIOServer | null = null;

export function initLiveSocket(httpServer: HttpServer): SocketIOServer {
  const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:8080")
    .split(",")
    .map((o) => o.trim());

  io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) cb(null, true);
        else cb(new Error("CORS: origin not allowed"), false);
      },
      credentials: true,
    },
  });

  io.use((socket: AuthedSocket, next) => {
    // Auth is required to connect at all — anonymous stream listening still
    // works over plain HTTP audio playback; the socket is only for the
    // interactive layer (chat, reactions, requests, listener count).
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    const userId = socket.userId!;
    let joinedSessionId: string | null = null;

    const emitListenerCount = (sessionId: string) => {
      const count = io!.sockets.adapter.rooms.get(room(sessionId))?.size ?? 0;
      io!.to(room(sessionId)).emit("listener_count", { sessionId, count });
    };

    const closeListenerSessionRow = async () => {
      const rowId = listenerSessionRows.get(socket.id);
      if (!rowId) return;
      listenerSessionRows.delete(socket.id);
      await prisma.listenerSession.update({ where: { id: rowId }, data: { left_at: new Date() } }).catch(() => null);
    };

    socket.on("join_session", async ({ sessionId, platform }: { sessionId: string; platform?: string }) => {
      if (!sessionId) return;
      const restriction = await activeRestriction(sessionId, userId);
      if (restriction === "ban") {
        socket.emit("error", { message: "You've been banned from this room" });
        return;
      }
      if (joinedSessionId) {
        socket.leave(room(joinedSessionId));
        await closeListenerSessionRow();
      }
      socket.join(room(sessionId));
      joinedSessionId = sessionId;
      emitListenerCount(sessionId);

      const row = await prisma.listenerSession
        .create({ data: { live_session_id: sessionId, user_id: userId, platform: platform ?? "web" } })
        .catch(() => null);
      if (row) listenerSessionRows.set(socket.id, row.id);
    });

    socket.on("leave_session", async () => {
      if (!joinedSessionId) return;
      socket.leave(room(joinedSessionId));
      emitListenerCount(joinedSessionId);
      await closeListenerSessionRow();
      joinedSessionId = null;
    });

    socket.on("chat:send", async ({ sessionId, message }: { sessionId: string; message: string }) => {
      const text = (message || "").trim().slice(0, 500);
      if (!sessionId || !text) return;

      if (!(await getRadioSettingBool("radio_chat_enabled"))) {
        socket.emit("error", { message: "Chat is currently disabled" });
        return;
      }
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { chat_enabled: true } });
      if (!session?.chat_enabled) {
        socket.emit("error", { message: "Chat is off for this show" });
        return;
      }
      if (await activeRestriction(sessionId, userId)) {
        socket.emit("error", { message: "You've been muted in this room" });
        return;
      }

      const slowModeMs = ((await getRadioSettingNumber("radio_slow_mode_seconds")) ?? 2) * 1000;
      const now = Date.now();
      const last = lastMessageAt.get(userId) ?? 0;
      if (now - last < slowModeMs) {
        socket.emit("error", { message: "You're sending messages too fast" });
        return;
      }

      const rejection = await checkMessageSafety(sessionId, userId, text);
      if (rejection) {
        socket.emit("error", { message: rejection });
        return;
      }
      lastMessageAt.set(userId, now);

      const [saved, profile] = await Promise.all([
        prisma.liveChatMessage.create({ data: { live_session_id: sessionId, user_id: userId, message: text } }),
        prisma.profile.findUnique({ where: { user_id: userId }, select: { display_name: true, avatar_url: true } }),
      ]);
      io!.to(room(sessionId)).emit("chat:new", {
        id: saved.id,
        user_id: userId,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        message: saved.message,
        created_at: saved.created_at,
      });
    });

    socket.on("reaction:send", async ({ sessionId, emoji }: { sessionId: string; emoji: string }) => {
      if (!sessionId || !emoji) return;
      if (!(await getRadioSettingBool("radio_reactions_enabled"))) return;
      // Ephemeral — no per-reaction DB write, purely a broadcast for the
      // floating-reaction animation. The running total is still tracked
      // (LiveSession.reaction_count) so analytics has a real number.
      io!.to(room(sessionId)).emit("reaction:new", { emoji: String(emoji).slice(0, 8), user_id: userId });
      await prisma.liveSession.update({ where: { id: sessionId }, data: { reaction_count: { increment: 1 } } }).catch(() => null);
    });

    socket.on("song_request:send", async ({ sessionId, requestText }: { sessionId: string; requestText: string }) => {
      const text = (requestText || "").trim().slice(0, 200);
      if (!sessionId || !text) return;

      if (!(await getRadioSettingBool("radio_requests_enabled"))) {
        socket.emit("error", { message: "Song requests are currently disabled" });
        return;
      }
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { requests_enabled: true } });
      if (!session?.requests_enabled) {
        socket.emit("error", { message: "Requests are off for this show" });
        return;
      }
      if (await activeRestriction(sessionId, userId)) {
        socket.emit("error", { message: "You've been muted in this room" });
        return;
      }

      const [saved, profile] = await Promise.all([
        prisma.songRequest.create({ data: { live_session_id: sessionId, user_id: userId, request_text: text } }),
        prisma.profile.findUnique({ where: { user_id: userId }, select: { display_name: true } }),
      ]);
      io!.to(room(sessionId)).emit("song_request:new", {
        id: saved.id,
        user_id: userId,
        display_name: profile?.display_name ?? null,
        request_text: saved.request_text,
        status: saved.status,
        created_at: saved.created_at,
      });
    });

    socket.on("moderation:delete_message", async ({ sessionId, messageId }: { sessionId: string; messageId: string }) => {
      if (!sessionId || !messageId) return;
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
      if (!session || !(await isHostOrModerator(userId, session))) {
        socket.emit("error", { message: "Not authorized to moderate this session" });
        return;
      }
      await prisma.liveChatMessage.delete({ where: { id: messageId } }).catch(() => null);
      io!.to(room(sessionId)).emit("chat:deleted", { messageId });
      logRadioAction(userId, "chat_message_deleted", { sessionId, messageId }).catch(() => null);
    });

    socket.on("song_request:update_status", async ({ sessionId, requestId, status }: { sessionId: string; requestId: string; status: string }) => {
      if (!sessionId || !requestId || !["pending", "played", "rejected"].includes(status)) return;
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
      if (!session || !(await isHostOrModerator(userId, session))) {
        socket.emit("error", { message: "Not authorized to manage requests for this session" });
        return;
      }
      const updated = await prisma.songRequest.update({ where: { id: requestId }, data: { status } }).catch(() => null);
      if (updated) io!.to(room(sessionId)).emit("song_request:updated", { id: updated.id, status: updated.status });
    });

    // ── Listener call-in: WebRTC signaling relay ──────────────────────────
    // The server never sees or touches audio — it only relays SDP/ICE
    // messages between the host and one specific caller so their browsers
    // can establish a direct (or TURN-relayed) peer connection. Either side
    // must be a legitimate participant in that session's call: the host, or
    // the target listener with a non-terminal CallInRequest.
    const isCallInParticipant = async (sessionId: string, participantUserId: string): Promise<boolean> => {
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
      if (!session) return false;
      if (session.rj_user_id === participantUserId) return true;
      const call = await prisma.callInRequest.findFirst({
        where: { live_session_id: sessionId, user_id: participantUserId, status: { in: ["waiting", "accepted", "on_air", "muted"] } },
      });
      return !!call;
    };

    for (const evt of ["callin:offer", "callin:answer", "callin:ice-candidate"] as const) {
      socket.on(evt, async ({ sessionId, targetUserId, payload }: { sessionId: string; targetUserId: string; payload: unknown }) => {
        if (!sessionId || !targetUserId) return;
        const lastAt = lastCallInSignalAt.get(userId) ?? 0;
        if (Date.now() - lastAt < CALLIN_SIGNAL_MIN_INTERVAL_MS) return;
        lastCallInSignalAt.set(userId, Date.now());
        // Both ends of the relay must be legitimate call-in participants —
        // otherwise a waiting/accepted caller could target an arbitrary
        // listener in the room and trigger an uninvited getUserMedia prompt
        // on their device (the client answers offers automatically).
        if (!(await isCallInParticipant(sessionId, userId)) || !(await isCallInParticipant(sessionId, targetUserId))) {
          socket.emit("error", { message: "Not part of this call" });
          return;
        }
        emitToUserInSession(sessionId, targetUserId, evt, { sessionId, fromUserId: userId, payload });
      });
    }

    socket.on("callin:hangup", async ({ sessionId, targetUserId }: { sessionId: string; targetUserId: string }) => {
      if (!sessionId || !targetUserId) return;
      if (!(await isCallInParticipant(sessionId, userId)) || !(await isCallInParticipant(sessionId, targetUserId))) return;
      emitToUserInSession(sessionId, targetUserId, "callin:hangup", { sessionId, fromUserId: userId });
    });

    socket.on("disconnect", async () => {
      if (joinedSessionId) emitListenerCount(joinedSessionId);
      await closeListenerSessionRow();
      lastMessageAt.delete(userId);
      lastCallInSignalAt.delete(userId);
    });
  });

  return io;
}

// Current in-app concurrent listener count for a live session — room
// membership size, i.e. authenticated users with the player/chat open, not
// raw Icecast stream connections (this app has no visibility into those).
export function getListenerCount(sessionId: string): number {
  if (!io) return 0;
  return io.sockets.adapter.rooms.get(room(sessionId))?.size ?? 0;
}

// Lets REST handlers (mobile clients that submit a song request over HTTP
// rather than staying connected to the socket) push the same live update
// that socket-originated requests get, so web/socket listeners in the room
// still see it in real time either way.
export function emitToSession(sessionId: string, event: string, payload: unknown): void {
  io?.to(room(sessionId)).emit(event, payload);
}

// Forcibly removes a specific user's socket(s) from a live room — used for
// bans and admin emergency-disconnect, so the removal is immediate rather
// than only taking effect the next time they try to rejoin or send something.
export function kickUserFromSession(sessionId: string, userId: string, reason: string): void {
  if (!io) return;
  const roomSockets = io.sockets.adapter.rooms.get(room(sessionId));
  if (!roomSockets) return;
  for (const socketId of roomSockets) {
    const s = io.sockets.sockets.get(socketId) as AuthedSocket | undefined;
    if (s?.userId === userId) {
      s.emit("error", { message: reason });
      s.leave(room(sessionId));
    }
  }
  const count = io.sockets.adapter.rooms.get(room(sessionId))?.size ?? 0;
  io.to(room(sessionId)).emit("listener_count", { sessionId, count });
}

// Targeted send to one specific user's socket(s) within a session's room —
// used for call-in WebRTC signaling (offer/answer/ICE), which must go to
// exactly one peer, never broadcast to the whole room.
export function emitToUserInSession(sessionId: string, userId: string, event: string, payload: unknown): void {
  if (!io) return;
  const roomSockets = io.sockets.adapter.rooms.get(room(sessionId));
  if (!roomSockets) return;
  for (const socketId of roomSockets) {
    const s = io.sockets.sockets.get(socketId) as AuthedSocket | undefined;
    if (s?.userId === userId) s.emit(event, payload);
  }
}
