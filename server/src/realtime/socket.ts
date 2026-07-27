import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

interface AuthedSocket extends Socket {
  userId?: string;
}

const MESSAGE_MIN_INTERVAL_MS = 2000; // basic per-socket spam throttle
const lastMessageAt = new Map<string, number>();

function room(sessionId: string) {
  return `live:${sessionId}`;
}

async function isHostOrModerator(userId: string, session: { rj_user_id: string }): Promise<boolean> {
  if (userId === session.rj_user_id) return true;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  return !!role;
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

    socket.on("join_session", async ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return;
      if (joinedSessionId) socket.leave(room(joinedSessionId));
      socket.join(room(sessionId));
      joinedSessionId = sessionId;
      emitListenerCount(sessionId);
    });

    socket.on("leave_session", () => {
      if (!joinedSessionId) return;
      socket.leave(room(joinedSessionId));
      emitListenerCount(joinedSessionId);
      joinedSessionId = null;
    });

    socket.on("chat:send", async ({ sessionId, message }: { sessionId: string; message: string }) => {
      const text = (message || "").trim().slice(0, 500);
      if (!sessionId || !text) return;

      const now = Date.now();
      const last = lastMessageAt.get(userId) ?? 0;
      if (now - last < MESSAGE_MIN_INTERVAL_MS) {
        socket.emit("error", { message: "You're sending messages too fast" });
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
      // Ephemeral — no DB write, purely a broadcast for floating-reaction animation.
      io!.to(room(sessionId)).emit("reaction:new", { emoji: String(emoji).slice(0, 8), user_id: userId });
    });

    socket.on("song_request:send", async ({ sessionId, requestText }: { sessionId: string; requestText: string }) => {
      const text = (requestText || "").trim().slice(0, 200);
      if (!sessionId || !text) return;
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

    socket.on("disconnect", () => {
      if (joinedSessionId) emitListenerCount(joinedSessionId);
      lastMessageAt.delete(userId);
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
