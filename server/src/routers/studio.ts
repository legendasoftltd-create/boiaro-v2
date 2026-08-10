import { z } from "zod";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { AccessToken, RoomServiceClient, EgressClient } from "livekit-server-sdk";
import { StreamOutput, StreamProtocol } from "@livekit/protocol";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { shouldAutoRecord, startRecording, stopRecording } from "../lib/liveRecorder.js";
import { notifyFollowersOfGoLive } from "../lib/radioNotify.js";

// Host capabilities are a strict superset of Co-host/RJ/Producer/Guest, so a
// participant who is both "the RJ" and "running the room" just holds the
// "host" role — no need to model multiple simultaneous roles per participant.
const MODERATOR_ROLES = ["host", "co_host"];
const BROADCAST_CONTROL_ROLES = ["host", "rj"];
const DEFAULT_CAN_PUBLISH: Record<string, boolean> = {
  host: true,
  co_host: true,
  rj: true,
  producer: false, // control-room role — mic off by default, can be promoted
  guest: false, // only publishes once a host/co-host grants it
};

function livekitEnv() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "LiveKit is not configured on this server" });
  }
  return { url, apiKey, apiSecret, httpUrl: url.replace(/^ws/, "http") };
}

async function getSession(sessionId: string) {
  const session = await prisma.studioSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Studio session not found" });
  return session;
}

async function getParticipant(sessionId: string, userId: string) {
  const participant = await prisma.studioParticipant.findFirst({
    where: { studio_session_id: sessionId, user_id: userId, left_at: null },
  });
  return participant;
}

async function assertHost(sessionId: string, userId: string) {
  const session = await getSession(sessionId);
  if (session.host_user_id === userId) return session;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can do this" });
  return session;
}

async function assertModerator(sessionId: string, userId: string) {
  const session = await getSession(sessionId);
  if (session.host_user_id === userId) return session;
  const participant = await getParticipant(sessionId, userId);
  if (participant && MODERATOR_ROLES.includes(participant.role)) return session;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "Only the host or co-host can do this" });
  return session;
}

async function assertBroadcastControl(sessionId: string, userId: string) {
  const session = await getSession(sessionId);
  if (session.host_user_id === userId) return session;
  const participant = await getParticipant(sessionId, userId);
  if (participant && BROADCAST_CONTROL_ROLES.includes(participant.role)) return session;
  throw new TRPCError({ code: "FORBIDDEN", message: "Only the host or RJ can control the broadcast" });
}

function mintToken(identity: string, roomName: string, canPublish: boolean) {
  const { apiKey, apiSecret } = livekitEnv();
  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({ room: roomName, roomJoin: true, canPublish, canSubscribe: true });
  return at.toJwt();
}

export const studioRouter = router({
  createSession: protectedProcedure
    .input(z.object({ showScheduleId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.studioSession.create({
        data: {
          room_name: `studio-${randomBytes(8).toString("hex")}`,
          host_user_id: ctx.userId!,
          show_schedule_id: input.showScheduleId ?? null,
        },
      });
      await prisma.studioParticipant.create({
        data: { studio_session_id: session.id, user_id: ctx.userId!, role: "host" },
      });
      await logRadioAction(ctx.userId!, "studio_session_created", { sessionId: session.id });
      return session;
    }),

  // For a caller who's already a StudioParticipant (the host from
  // createSession, or anyone who's already redeemed an invite) — mints a
  // fresh LiveKit token for their existing role. Invite redemption itself
  // goes through the separate REST /studio/join/:token route instead, since
  // that flow has no prior StudioParticipant row to look up.
  joinToken: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getSession(input.sessionId);
      let role: string;
      if (session.host_user_id === ctx.userId) {
        role = "host";
      } else {
        const participant = await getParticipant(input.sessionId, ctx.userId!);
        if (!participant) throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant of this session" });
        role = participant.role;
      }
      const jwt = await mintToken(ctx.userId!, session.room_name, DEFAULT_CAN_PUBLISH[role] ?? false);
      return { token: jwt, url: process.env.LIVEKIT_URL, role, roomName: session.room_name };
    }),

  mySessions: protectedProcedure.query(({ ctx }) =>
    prisma.studioSession.findMany({
      where: {
        OR: [
          { host_user_id: ctx.userId! },
          { participants: { some: { user_id: ctx.userId!, left_at: null } } },
        ],
      },
      orderBy: { created_at: "desc" },
    })
  ),

  participants: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await getParticipant(input.sessionId, ctx.userId!).then((p) => {
        if (!p) throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant of this session" });
      });
      return prisma.studioParticipant.findMany({
        where: { studio_session_id: input.sessionId, left_at: null },
        orderBy: { joined_at: "asc" },
      });
    }),

  generateInviteLink: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      role: z.enum(["co_host", "producer", "rj", "guest"]),
      expiresInMinutes: z.number().int().min(5).max(1440).default(120),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertHost(input.sessionId, ctx.userId!);
      const invite = await prisma.studioInviteLink.create({
        data: {
          studio_session_id: input.sessionId,
          token: randomBytes(24).toString("hex"),
          role: input.role,
          expires_at: new Date(Date.now() + input.expiresInMinutes * 60_000),
          created_by: ctx.userId!,
        },
      });
      return { token: invite.token, expiresAt: invite.expires_at };
    }),

  promoteToPublish: protectedProcedure
    .input(z.object({ sessionId: z.string(), participantUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await assertModerator(input.sessionId, ctx.userId!);
      const target = await getParticipant(input.sessionId, input.participantUserId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Participant not found" });

      const { httpUrl, apiKey, apiSecret } = livekitEnv();
      const rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await rooms.updateParticipant(session.room_name, input.participantUserId, {
        permission: { canPublish: true, canSubscribe: true, canPublishData: true },
      });
      return { ok: true };
    }),

  muteParticipant: protectedProcedure
    .input(z.object({ sessionId: z.string(), participantUserId: z.string(), trackSid: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await assertModerator(input.sessionId, ctx.userId!);
      const target = await getParticipant(input.sessionId, input.participantUserId);
      if (!target || !["guest", "producer"].includes(target.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Can only mute a guest or producer" });
      }
      const { httpUrl, apiKey, apiSecret } = livekitEnv();
      const rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await rooms.mutePublishedTrack(session.room_name, input.participantUserId, input.trackSid, true);
      return { ok: true };
    }),

  removeParticipant: protectedProcedure
    .input(z.object({ sessionId: z.string(), participantUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await assertModerator(input.sessionId, ctx.userId!);
      const target = await getParticipant(input.sessionId, input.participantUserId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Participant not found" });
      if (target.role === "host") throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the host" });

      const { httpUrl, apiKey, apiSecret } = livekitEnv();
      const rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await rooms.removeParticipant(session.room_name, input.participantUserId).catch(() => null);

      await prisma.studioParticipant.update({
        where: { id: target.id },
        data: { left_at: new Date() },
      });
      await logRadioAction(ctx.userId!, "studio_participant_removed", {
        sessionId: input.sessionId, targetUserId: input.participantUserId,
      });
      return { ok: true };
    }),

  startBroadcast: protectedProcedure
    .input(z.object({ sessionId: z.string(), stationId: z.string().optional(), showTitle: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await assertBroadcastControl(input.sessionId, ctx.userId!);
      if (session.status === "live") {
        throw new TRPCError({ code: "CONFLICT", message: "This studio session is already live" });
      }

      const streamUrlSetting = await prisma.siteSetting.findUnique({ where: { key: "radio_public_stream_url" } });
      const streamUrl = streamUrlSetting?.value || process.env.LIVEKIT_DEV_ICECAST_STREAM_URL || "http://localhost:8000/studio-test.mp3";
      const bridgeRtmpUrl = process.env.STUDIO_BRIDGE_RTMP_URL || "rtmp://127.0.0.1:1935/live";

      const liveSession = await prisma.liveSession.create({
        data: {
          rj_user_id: session.host_user_id,
          station_id: input.stationId ?? null,
          stream_url: streamUrl,
          show_title: input.showTitle ?? null,
          status: "live",
          started_at: new Date(),
          last_heartbeat_at: new Date(),
          is_test: false,
        },
      });

      const { httpUrl, apiKey, apiSecret } = livekitEnv();
      const egress = new EgressClient(httpUrl, apiKey, apiSecret);
      const output = new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [`${bridgeRtmpUrl}/${session.room_name}`],
      });
      await egress.startRoomCompositeEgress(session.room_name, { stream: output }, { audioOnly: true });

      const updated = await prisma.studioSession.update({
        where: { id: session.id },
        data: {
          status: "live",
          started_at: new Date(),
          live_session_id: liveSession.id,
          master_recording_status: "recording",
        },
      });

      if (await shouldAutoRecord(input.stationId, true)) {
        startRecording(liveSession.id, streamUrl);
      }
      const hostProfile = await prisma.rjProfile.findUnique({ where: { user_id: session.host_user_id } });
      if (hostProfile) {
        notifyFollowersOfGoLive(session.host_user_id, hostProfile.stage_name, input.showTitle).catch(() => null);
      }
      await logRadioAction(ctx.userId!, "studio_broadcast_started", { sessionId: session.id, liveSessionId: liveSession.id });
      return updated;
    }),

  endBroadcast: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await assertBroadcastControl(input.sessionId, ctx.userId!);
      if (session.status !== "live") {
        throw new TRPCError({ code: "CONFLICT", message: "This studio session is not live" });
      }

      const { httpUrl, apiKey, apiSecret } = livekitEnv();
      const egress = new EgressClient(httpUrl, apiKey, apiSecret);
      const active = await egress.listEgress({ roomName: session.room_name });
      await Promise.all(active.filter((e) => !e.endedAt).map((e) => egress.stopEgress(e.egressId).catch(() => null)));

      if (session.live_session_id) {
        stopRecording(session.live_session_id);
        await prisma.liveSession.update({
          where: { id: session.live_session_id },
          data: { status: "ended", ended_at: new Date() },
        });
      }

      // "processing" here is provisional — the Bridge Relay's ffmpeg process
      // is still flushing/closing the WAV file asynchronously at this point;
      // the internal master-ready webhook flips this to "completed" (or
      // clears it if the recording turned out empty) once the upload lands.
      const updated = await prisma.studioSession.update({
        where: { id: session.id },
        data: {
          status: "ended",
          ended_at: new Date(),
          master_recording_status: session.master_recording_status === "recording" ? "processing" : session.master_recording_status,
        },
      });
      await logRadioAction(ctx.userId!, "studio_broadcast_ended", { sessionId: session.id });
      return updated;
    }),
});

export { mintToken, DEFAULT_CAN_PUBLISH, getSession };
