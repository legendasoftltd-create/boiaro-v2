import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { getRadioSettingBool, getRadioSettingNumber } from "../lib/radioSettings.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { checkMessageSafety } from "../lib/chatSafety.js";
import { detectCountryCode, detectCityName } from "../lib/geoCountry.js";

interface AuthedSocket extends Socket {
  userId?: string;
  isGuest?: boolean;
}

const lastMessageAt = new Map<string, number>();
// Reactions and song requests had no rate limit at all before this — a
// connected listener could spam either at socket speed. Simple fixed
// per-user cooldowns, same pattern as chat's slow mode.
const lastReactionAt = new Map<string, number>();
const REACTION_COOLDOWN_MS = 1000;
const lastSongRequestAt = new Map<string, number>();
const SONG_REQUEST_COOLDOWN_MS = 5000;
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

  io.use(async (socket: AuthedSocket, next) => {
    // A missing token is allowed through as a guest (join_session/listener
    // tracking only) when radio_guest_listening_enabled is on — matches the
    // REST layer's existing "signed-out visitors get a playable stream URL"
    // behavior, extended to also cover the socket/analytics layer. A
    // present-but-invalid token is always rejected outright, never silently
    // downgraded to guest — that would mask real auth bugs.
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      if (!(await getRadioSettingBool("radio_guest_listening_enabled"))) {
        return next(new Error("Authentication required"));
      }
      socket.isGuest = true;
      return next();
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    // Guests (see middleware above) have no userId — every handler below
    // that writes to a user-attributed table (chat, reactions, requests,
    // moderation, call-in) must explicitly reject them; only join/leave
    // (listener tracking) works without one.
    const userId = socket.userId;
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

    socket.on("join_session", async ({ sessionId, platform, deviceId }: { sessionId: string; platform?: string; deviceId?: string }) => {
      if (!sessionId) return;
      // Mutes/bans are user-attributed only — there's no device-id ban list,
      // so a guest can't be individually restricted today (a real gap, but
      // one that needs its own moderation feature, not a silent skip risk
      // here since guests can't chat/react/request anyway — see the guards
      // on those handlers below).
      const restriction = userId ? await activeRestriction(sessionId, userId) : null;
      if (restriction === "ban") {
        socket.emit("error", { message: "You've been banned from this room" });
        return;
      }
      // radio_max_concurrent_listeners was a stored admin setting nothing
      // ever enforced. This checks it against socket-room size — the same
      // number "current listeners" already reports — which only covers
      // users with the chat/player socket open, not raw Icecast stream
      // connections this app has no visibility into. A real cap on actual
      // stream audience would need to live at the Icecast/nginx layer.
      const maxListeners = await getRadioSettingNumber("radio_max_concurrent_listeners");
      if (maxListeners && maxListeners > 0 && getListenerCount(sessionId) >= maxListeners) {
        socket.emit("error", { message: "This show is at capacity — please try again shortly" });
        return;
      }
      if (joinedSessionId) {
        socket.leave(room(joinedSessionId));
        await closeListenerSessionRow();
      }
      socket.join(room(sessionId));
      joinedSessionId = sessionId;
      emitListenerCount(sessionId);

      const country = detectCountryCode({ headers: socket.handshake.headers, ip: socket.handshake.address });
      const city = detectCityName({ headers: socket.handshake.headers, ip: socket.handshake.address });

      // A page refresh (or a brief network drop) tears down and reopens the
      // socket, which used to always create a brand-new ListenerSession row
      // — fragmenting one continuous listen into several short ones and
      // dragging down average-duration-style metrics even though the total
      // listening time was still counted correctly. Resume a still-open (or
      // very recently closed) row for the same listener+session instead of
      // starting a fresh one, so a refresh doesn't fragment their listen.
      const RESUME_WINDOW_MS = 45_000;
      const resumeWhere = userId
        ? { live_session_id: sessionId, user_id: userId }
        : deviceId
          ? { live_session_id: sessionId, user_id: null, device_id: deviceId }
          : null;
      // Excludes any row already claimed by a currently-connected socket —
      // e.g. the same listener open in a second tab — so resuming a
      // refreshed tab's row never steals an actually-still-open one out
      // from under it.
      const activeRowIds = new Set(listenerSessionRows.values());
      const resumableCandidate = resumeWhere
        ? await prisma.listenerSession.findFirst({
            where: {
              ...resumeWhere,
              OR: [{ left_at: null }, { left_at: { gte: new Date(Date.now() - RESUME_WINDOW_MS) } }],
            },
            orderBy: { joined_at: "desc" },
          })
        : null;
      const resumable = resumableCandidate && !activeRowIds.has(resumableCandidate.id) ? resumableCandidate : null;

      const row = resumable
        ? await prisma.listenerSession
            .update({ where: { id: resumable.id }, data: { left_at: null, platform: platform ?? resumable.platform, country: country ?? resumable.country, city: city ?? resumable.city } })
            .catch(() => null)
        // Mutually exclusive, same convention as anonymous book-view tracking
        // (viewTracking.ts): a real user gets user_id, a guest gets a
        // privacy-safe client-generated device_id (never a device fingerprint).
        : await prisma.listenerSession
            .create({
              data: {
                live_session_id: sessionId,
                user_id: userId ?? null,
                device_id: userId ? null : (deviceId ?? null),
                platform: platform ?? "web",
                country,
                city,
              },
            })
            .catch(() => null);
      if (row) listenerSessionRows.set(socket.id, row.id);
    });

    // Reported by the client once it knows which quality tier it's actually
    // playing (see LiveRadio.tsx's handleQualityChange) — not set at join
    // time since not every station offers tiers and the initial tier can
    // change mid-listen.
    socket.on("listener:set_quality", async ({ quality }: { quality?: string }) => {
      if (!quality || !["high", "medium", "low"].includes(quality)) return;
      const rowId = listenerSessionRows.get(socket.id);
      if (!rowId) return;
      await prisma.listenerSession.update({ where: { id: rowId }, data: { quality } }).catch(() => null);
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
      if (!userId) {
        socket.emit("error", { message: "Sign in to send a message" });
        return;
      }

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
      if (!sessionId || !emoji || !userId) return;
      const now = Date.now();
      if (now - (lastReactionAt.get(userId) ?? 0) < REACTION_COOLDOWN_MS) return;
      lastReactionAt.set(userId, now);
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
      if (!userId) {
        socket.emit("error", { message: "Sign in to send a request" });
        return;
      }

      const now = Date.now();
      if (now - (lastSongRequestAt.get(userId) ?? 0) < SONG_REQUEST_COOLDOWN_MS) {
        socket.emit("error", { message: "You're sending requests too fast" });
        return;
      }
      lastSongRequestAt.set(userId, now);

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

      // Duplicate detection: same (trimmed, case-insensitive) text already
      // pending/accepted in this session within the last 10 minutes — saved
      // as its own row (so the requester still sees it was received) but
      // flagged "duplicate" rather than joining the actionable queue twice.
      const recentDuplicate = await prisma.songRequest.findFirst({
        where: {
          live_session_id: sessionId,
          status: { in: ["pending", "accepted"] },
          created_at: { gte: new Date(now - 10 * 60 * 1000) },
          request_text: { equals: text, mode: "insensitive" },
        },
      });
      const nextPosition = recentDuplicate ? 0 : ((await prisma.songRequest.aggregate({
        where: { live_session_id: sessionId },
        _max: { position: true },
      }))._max.position ?? -1) + 1;

      const [saved, profile] = await Promise.all([
        prisma.songRequest.create({
          data: {
            live_session_id: sessionId,
            user_id: userId,
            request_text: text,
            status: recentDuplicate ? "duplicate" : "pending",
            position: nextPosition,
          },
        }),
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

    // A user can delete their own message; host/moderator can delete anyone's.
    socket.on("moderation:delete_message", async ({ sessionId, messageId }: { sessionId: string; messageId: string }) => {
      if (!sessionId || !messageId || !userId) return;
      const [session, message] = await Promise.all([
        prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } }),
        prisma.liveChatMessage.findUnique({ where: { id: messageId }, select: { user_id: true, live_session_id: true } }),
      ]);
      if (!session || !message || message.live_session_id !== sessionId) return;
      const isOwn = message.user_id === userId;
      if (!isOwn && !(await isHostOrModerator(userId, session))) {
        socket.emit("error", { message: "Not authorized to delete this message" });
        return;
      }
      await prisma.liveChatMessage.delete({ where: { id: messageId } }).catch(() => null);
      io!.to(room(sessionId)).emit("chat:deleted", { messageId });
      logRadioAction(userId, isOwn ? "chat_message_deleted_own" : "chat_message_deleted", { sessionId, messageId }).catch(() => null);
    });

    socket.on("song_request:update_status", async ({ sessionId, requestId, status }: { sessionId: string; requestId: string; status: string }) => {
      if (!sessionId || !requestId || !userId || !["pending", "accepted", "played", "skipped", "rejected", "duplicate"].includes(status)) return;
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
      if (!session || !(await isHostOrModerator(userId, session))) {
        socket.emit("error", { message: "Not authorized to manage requests for this session" });
        return;
      }
      const updated = await prisma.songRequest.update({ where: { id: requestId }, data: { status } }).catch(() => null);
      if (updated) io!.to(room(sessionId)).emit("song_request:updated", { id: updated.id, status: updated.status });
    });

    // Swap a pending request's position with its immediate neighbor —
    // simple, reliable reordering without needing a drag-and-drop payload.
    socket.on("song_request:reorder", async ({ sessionId, requestId, direction }: { sessionId: string; requestId: string; direction: "up" | "down" }) => {
      if (!sessionId || !requestId || !userId || (direction !== "up" && direction !== "down")) return;
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { rj_user_id: true } });
      if (!session || !(await isHostOrModerator(userId, session))) return;
      const current = await prisma.songRequest.findUnique({ where: { id: requestId } });
      if (!current || current.live_session_id !== sessionId) return;
      const neighbor = await prisma.songRequest.findFirst({
        where: {
          live_session_id: sessionId,
          position: direction === "up" ? { lt: current.position } : { gt: current.position },
        },
        orderBy: { position: direction === "up" ? "desc" : "asc" },
      });
      if (!neighbor) return;
      await prisma.$transaction([
        prisma.songRequest.update({ where: { id: current.id }, data: { position: neighbor.position } }),
        prisma.songRequest.update({ where: { id: neighbor.id }, data: { position: current.position } }),
      ]);
      io!.to(room(sessionId)).emit("song_request:reordered", { sessionId });
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
        where: { live_session_id: sessionId, user_id: participantUserId, status: { in: ["waiting", "accepted", "previewing", "on_air", "muted"] } },
      });
      return !!call;
    };

    for (const evt of ["callin:offer", "callin:answer", "callin:ice-candidate"] as const) {
      socket.on(evt, async ({ sessionId, targetUserId, payload }: { sessionId: string; targetUserId: string; payload: unknown }) => {
        if (!sessionId || !targetUserId || !userId) return;
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
      if (!sessionId || !targetUserId || !userId) return;
      if (!(await isCallInParticipant(sessionId, userId)) || !(await isCallInParticipant(sessionId, targetUserId))) return;
      emitToUserInSession(sessionId, targetUserId, "callin:hangup", { sessionId, fromUserId: userId });
    });

    socket.on("disconnect", async () => {
      if (joinedSessionId) emitListenerCount(joinedSessionId);
      await closeListenerSessionRow();
      if (userId) {
        lastMessageAt.delete(userId);
        lastCallInSignalAt.delete(userId);
        lastReactionAt.delete(userId);
        lastSongRequestAt.delete(userId);
      }
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
