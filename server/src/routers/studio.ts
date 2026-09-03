import { z } from "zod";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { AccessToken, RoomServiceClient, EgressClient } from "livekit-server-sdk";
import { StreamOutput, StreamProtocol, TrackSource } from "@livekit/protocol";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { createPresignedGetUrl, isS3Url, s3Configured } from "../lib/s3.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { shouldAutoRecord, startRecording, stopRecording } from "../lib/liveRecorder.js";
import { notifyFollowersOfGoLive } from "../lib/radioNotify.js";
import { registerBridgeMount } from "../lib/studioBridge.js";
import { deriveIcecastMountPath } from "../lib/icecastMount.js";
import { getRadioSetting, getRadioSettingBool, getRadioSettingNumber } from "../lib/radioSettings.js";
import { isCallinAllowedForBroadcast } from "../lib/callinPolicy.js";
import { isBandwidthBudgetAvailable } from "../lib/radioCostControl.js";
import { runningShowMessage } from "../lib/runningShow.js";

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

// Best-effort recovery, called from rj.ts's heartbeat (already firing every
// 20s while a Studio broadcast is live). Observed in production: a LiveKit
// room that briefly empties and gets recreated (e.g. the host's tab
// reloading/reconnecting) silently ends the old Icecast-bound Egress job
// without ever restarting it — the LiveSession stays "live", the host's own
// room connection looks fine, but real listeners hear nothing (or the
// dead-air fallback) until someone notices. No-ops if a healthy egress is
// already running; never throws, so a LiveKit hiccup here can't break the
// heartbeat itself.
export async function ensureStudioEgressAlive(studioSessionId: string): Promise<void> {
  try {
    const session = await prisma.studioSession.findUnique({ where: { id: studioSessionId } });
    if (!session || session.status !== "live" || !session.live_session_id) return;
    const liveSession = await prisma.liveSession.findUnique({ where: { id: session.live_session_id } });
    if (!liveSession?.stream_url) return;
    const mount = deriveIcecastMountPath(liveSession.stream_url);
    if (!mount) return;

    const { httpUrl, apiKey, apiSecret } = livekitEnv();
    const egress = new EgressClient(httpUrl, apiKey, apiSecret);
    const active = await egress.listEgress({ roomName: session.room_name, active: true });
    if (active.length > 0) return; // healthy — nothing to do

    const bridgeRtmpUrl = process.env.STUDIO_BRIDGE_RTMP_URL || "rtmp://127.0.0.1:1935/live";
    await registerBridgeMount(`/live/${session.room_name}`, { mount, toIcecast: true, toWav: session.recording_mode === "mixed" });
    const output = new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [`${bridgeRtmpUrl}/${session.room_name}`] });
    await egress.startRoomCompositeEgress(session.room_name, { stream: output }, { audioOnly: true });

    if (session.recording_mode === "voice_only") {
      const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      const hostParticipant = await roomService.getParticipant(session.room_name, session.host_user_id).catch(() => null);
      const hostMicTrackSid = hostParticipant?.tracks.find((t) => t.source === TrackSource.MICROPHONE)?.sid;
      if (hostMicTrackSid) {
        const voiceOutput = new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [`${bridgeRtmpUrl}/${session.room_name}-voice`] });
        await registerBridgeMount(`/live/${session.room_name}-voice`, { toIcecast: false, toWav: true });
        await egress.startTrackCompositeEgress(session.room_name, { stream: voiceOutput }, { audioTrackId: hostMicTrackSid });
      }
    }
  } catch {
    // Best-effort — the next heartbeat (20s later) tries again.
  }
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

/**
 * Studio music lives under the private `audio/` prefix, so its stored URL is
 * not fetchable on its own — every asset handed to a client must be presigned.
 *
 * The mixer fetches these with the Web Audio API (loadBuffer -> decodeAudioData)
 * and the admin library plays them in an <audio> element; both need a URL that
 * resolves without credentials, which is exactly what a presigned GET is. An
 * hour is comfortably longer than a show.
 */
const STUDIO_ASSET_URL_TTL = 3600;

async function withPlayableUrl<T extends { file_url: string | null }>(asset: T): Promise<T> {
  if (!asset.file_url) return asset;
  if (!(s3Configured && isS3Url(asset.file_url))) {
    return { ...asset, file_url: resolveFileUrl(asset.file_url) ?? asset.file_url };
  }
  try {
    return { ...asset, file_url: await createPresignedGetUrl(asset.file_url, STUDIO_ASSET_URL_TTL) };
  } catch {
    return asset;
  }
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
    .input(z.object({
      sessionId: z.string(),
      stationId: z.string().optional(),
      showTitle: z.string().optional(),
      description: z.string().optional(),
      coverImageUrl: z.string().optional(),
      category: z.string().optional(),
      chatEnabled: z.boolean().default(true),
      requestsEnabled: z.boolean().default(true),
      recordingEnabled: z.boolean().default(true),
      callinEnabled: z.boolean().default(false),
      // §14 mixer: whether the master recording captures the full mix (mic
      // + mixer music/jingles) or just the host's mic. The live Icecast
      // stream always carries the full mix either way — see the dual Egress
      // taps below.
      recordingMode: z.enum(["mixed", "voice_only"]).default("voice_only"),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await assertBroadcastControl(input.sessionId, ctx.userId!);
      if (session.status === "live") {
        throw new TRPCError({ code: "CONFLICT", message: "This studio session is already live" });
      }

      // One live broadcast per RJ, full stop. Nothing enforced this before:
      // the check above only catches restarting the *same* studio session,
      // and the station clash further down only fires when a station is set
      // — and blames "another host" when the other host is you. So an RJ
      // whose show had gone quiet would just start another, and another:
      // ten sessions in ninety minutes on 2026-08-31, listeners split
      // across them with no way to tell which was the real show.
      const mine = await prisma.liveSession.findFirst({
        where: { rj_user_id: session.host_user_id, status: { in: ["live", "reconnecting"] } },
        select: { id: true, show_title: true, started_at: true },
      });
      if (mine) {
        throw new TRPCError({ code: "CONFLICT", message: runningShowMessage(mine) });
      }

      if (input.callinEnabled && !(await isCallinAllowedForBroadcast(input.stationId, session.host_user_id))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Call-in is not enabled for this station/RJ" });
      }

      // Studio broadcasts are never test broadcasts, unlike the traditional
      // (external encoder) goLive flow — always gated.
      if (!(await isBandwidthBudgetAvailable())) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This month's bandwidth budget has been reached — new broadcasts are paused until next month or an admin raises the limit." });
      }

      // Real (non-test) broadcasts: no two RJs live on the same station at
      // once — mirrors the identical check in the traditional (external
      // encoder) rj.ts goLive flow. Checked against LiveSession directly so
      // it also catches a clash against a traditional-flow broadcast on the
      // same station, not just other Studio ones.
      let station: { id: string; stream_url: string } | null = null;
      if (input.stationId) {
        const clash = await prisma.liveSession.findFirst({
          where: { station_id: input.stationId, is_test: false, status: { in: ["live", "reconnecting"] } },
        });
        if (clash) throw new TRPCError({ code: "CONFLICT", message: "Another host is already live on this station" });

        station = await prisma.radioStation.findUnique({
          where: { id: input.stationId },
          select: { id: true, stream_url: true },
        });
        if (!station) throw new TRPCError({ code: "NOT_FOUND", message: "Station not found" });
      }

      // Each station has its own Icecast mount (station.stream_url, same
      // field the traditional broadcast flow points listeners at) — reused
      // here as the bridge's push target too, so concurrent stations land
      // on separate mounts instead of colliding on one shared mount.
      const streamUrlSetting = station
        ? null
        : await prisma.siteSetting.findUnique({ where: { key: "radio_public_stream_url" } });
      const streamUrl = station?.stream_url
        || streamUrlSetting?.value
        || process.env.LIVEKIT_DEV_ICECAST_STREAM_URL
        || "http://localhost:8000/studio-test.mp3";
      const bridgeRtmpUrl = process.env.STUDIO_BRIDGE_RTMP_URL || "rtmp://127.0.0.1:1935/live";

      const mount = deriveIcecastMountPath(streamUrl);
      if (!mount) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Invalid stream URL configured: ${streamUrl}` });
      }

      // voice_only needs the host's mic track id *before* Egress starts, so
      // resolve it first and fail fast (with a clear message) rather than
      // going live and silently falling back to no voice-only tap.
      let hostMicTrackSid: string | undefined;
      if (input.recordingMode === "voice_only") {
        const { httpUrl: rsUrl, apiKey: rsKey, apiSecret: rsSecret } = livekitEnv();
        const roomService = new RoomServiceClient(rsUrl, rsKey, rsSecret);
        const hostParticipant = await roomService.getParticipant(session.room_name, session.host_user_id).catch(() => null);
        hostMicTrackSid = hostParticipant?.tracks.find((t) => t.source === TrackSource.MICROPHONE)?.sid;
        if (!hostMicTrackSid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Turn your mic on before going live with voice-only recording, or switch to mixed recording",
          });
        }
      }

      await registerBridgeMount(`/live/${session.room_name}`, { mount, toIcecast: true, toWav: input.recordingMode === "mixed" });

      // The clash findFirst above is a friendly fast-path error — it can't
      // stop two concurrent startBroadcast calls for the same station both
      // passing it and both creating a session (same race as goLive in
      // rj.ts, and the same fix: a partial unique index
      // — live_sessions_one_live_per_station — is the actual atomic guard).
      // No Egress/stream has started yet at this point, so it's safe to
      // just surface the friendly error here.
      let liveSession;
      try {
        liveSession = await prisma.liveSession.create({
          data: {
            rj_user_id: session.host_user_id,
            station_id: input.stationId ?? null,
            stream_url: streamUrl,
            show_title: input.showTitle ?? null,
            description: input.description ?? null,
            cover_image_url: input.coverImageUrl ?? null,
            category: input.category ?? null,
            status: "live",
            started_at: new Date(),
            last_heartbeat_at: new Date(),
            is_test: false,
            chat_enabled: input.chatEnabled,
            requests_enabled: input.requestsEnabled,
            recording_enabled: input.recordingEnabled,
            callin_enabled: input.callinEnabled,
          },
        });
      } catch (err: any) {
        if (err?.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "Another host is already live on this station" });
        }
        throw err;
      }

      const { httpUrl, apiKey, apiSecret } = livekitEnv();
      const egress = new EgressClient(httpUrl, apiKey, apiSecret);
      const output = new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [`${bridgeRtmpUrl}/${session.room_name}`],
      });
      // Always runs — this is what listeners actually hear, full mix
      // (mic + any mixer music/jingles) regardless of recordingMode.
      await egress.startRoomCompositeEgress(session.room_name, { stream: output }, { audioOnly: true });

      // voice_only: a second, independent Egress job scoped to just the
      // host's mic track — Icecast never sees this one (registered with
      // toIcecast:false above/below), it only exists to produce a
      // voice-only master WAV. Uses a distinct RTMP path (…-voice) so the
      // Bridge Relay's per-stream-path ffmpeg taps don't collide.
      if (input.recordingMode === "voice_only" && hostMicTrackSid) {
        const voiceOutput = new StreamOutput({
          protocol: StreamProtocol.RTMP,
          urls: [`${bridgeRtmpUrl}/${session.room_name}-voice`],
        });
        await registerBridgeMount(`/live/${session.room_name}-voice`, { toIcecast: false, toWav: true });
        await egress.startTrackCompositeEgress(session.room_name, { stream: voiceOutput }, { audioTrackId: hostMicTrackSid });
      }

      const updated = await prisma.studioSession.update({
        where: { id: session.id },
        data: {
          status: "live",
          started_at: new Date(),
          live_session_id: liveSession.id,
          master_recording_status: "recording",
          recording_mode: input.recordingMode,
        },
      });

      if (await shouldAutoRecord(input.stationId, true)) {
        startRecording(liveSession.id, streamUrl);
      }
      const hostProfile = await prisma.rjProfile.findUnique({ where: { user_id: session.host_user_id } });
      if (hostProfile) {
        notifyFollowersOfGoLive(session.host_user_id, hostProfile.stage_name, input.showTitle, liveSession.id).catch(() => null);
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

  // Platform-wide ducking defaults + feature toggles, admin-set (see
  // radioSettings.ts) — seeds a new broadcast's sliders; each RJ can still
  // adjust their own per-broadcast afterward (see useStudioMixer.ts), never
  // persisted back here. `enabled`/`rjUploadEnabled` gate the client UI as a
  // convenience — the real enforcement is server-side in libraryUpload etc.
  mixerDefaults: protectedProcedure.query(async () => ({
    duckLevel: (await getRadioSettingNumber("radio_mixer_duck_level")) ?? 0.25,
    duckAttackMs: (await getRadioSettingNumber("radio_mixer_duck_attack_ms")) ?? 200,
    duckReleaseMs: (await getRadioSettingNumber("radio_mixer_duck_release_ms")) ?? 1000,
    enabled: await getRadioSettingBool("radio_mixer_enabled"),
    rjUploadEnabled: await getRadioSettingBool("radio_mixer_rj_upload_enabled"),
    maxPlaylistLength: (await getRadioSettingNumber("radio_mixer_max_playlist_length")) ?? 50,
  })),

  // ── §14 Mixer: music/jingle/SFX library ─────────────────────────────────
  // owner_user_id null = admin-curated, platform-wide; set = one RJ's own
  // self-certified upload. One procedure serves both admin and RJ uploads
  // (platformWide:true requires an admin/moderator role and skips the
  // license checkbox, since platform assets are admin-cleared already).
  libraryList: protectedProcedure
    .input(z.object({
      category: z.enum(["music", "jingle", "sfx"]).optional(),
      subcategory: z.enum(["station_id", "intro", "outro", "commercial", "transition", "applause"]).optional(),
      search: z.string().max(200).optional(),
      favoritesOnly: z.boolean().default(false),
      // Admin library-management view — sees every platform track
      // regardless of status (including unpublished), so publish/unpublish
      // has something to toggle back. Silently ignored for non-admins.
      adminView: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const isAdminView = input.adminView && !!(await prisma.userRole.findFirst({ where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } } }));
      const [assets, favoriteRows] = await Promise.all([
        prisma.studioAudioAsset.findMany({
          where: {
            ...(input.category ? { category: input.category } : {}),
            ...(input.subcategory ? { subcategory: input.subcategory } : {}),
            ...(input.search ? { title: { contains: input.search, mode: "insensitive" } } : {}),
            // Platform-wide tracks only show once approved/published; an RJ
            // always sees their own uploads regardless of status, so they
            // can tell a pending/rejected submission apart from a live one.
            // Admin management view sees every platform track regardless.
            OR: isAdminView ? [{ owner_user_id: null }, { owner_user_id: ctx.userId }] : [{ owner_user_id: null, status: "approved" }, { owner_user_id: ctx.userId }],
          },
          orderBy: { created_at: "desc" },
        }),
        prisma.studioAssetFavorite.findMany({ where: { user_id: ctx.userId }, select: { audio_asset_id: true } }),
      ]);
      const favoriteIds = new Set(favoriteRows.map((f) => f.audio_asset_id));
      const withFavorite = await Promise.all(
        assets.map(async (a) => ({ ...(await withPlayableUrl(a)), isFavorite: favoriteIds.has(a.id) }))
      );
      return input.favoritesOnly ? withFavorite.filter((a) => a.isFavorite) : withFavorite;
    }),

  toggleFavorite: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.studioAssetFavorite.findUnique({
        where: { user_id_audio_asset_id: { user_id: ctx.userId!, audio_asset_id: input.assetId } },
      });
      if (existing) {
        await prisma.studioAssetFavorite.delete({ where: { id: existing.id } });
        return { favorited: false };
      }
      await prisma.studioAssetFavorite.create({ data: { user_id: ctx.userId!, audio_asset_id: input.assetId } });
      return { favorited: true };
    }),

  libraryUpload: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(200),
      category: z.enum(["music", "jingle", "sfx"]),
      subcategory: z.enum(["station_id", "intro", "outro", "commercial", "transition", "applause"]).optional(),
      fileUrl: z.string().url(),
      durationSeconds: z.number().int().positive().optional(),
      licenseAcknowledged: z.boolean().default(false),
      platformWide: z.boolean().default(false),
      // Copyright metadata — required for every upload, platform-curated
      // included. For a platform upload this doubles as the actual review
      // step (an admin previously bypassed any diligence check entirely).
      rightsHolder: z.string().min(1).max(200),
      licenseType: z.enum(["royalty_free", "creative_commons", "purchased", "original", "other"]),
      licenseDocumentUrl: z.string().url().optional(),
      allowedUsage: z.string().max(500).optional(),
      // Social Broadcast Rights (§16). Optional: left unset they mean "not
      // stated", which the warning-first policy treats as not cleared for
      // Facebook/YouTube — a warning to the RJ and an audit entry, never a
      // block in this phase.
      socialRights: z
        .object({
          app: z.boolean().optional(),
          website: z.boolean().optional(),
          facebook: z.boolean().optional(),
          youtube: z.boolean().optional(),
          other: z.boolean().optional(),
        })
        .optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await getRadioSettingBool("radio_mixer_enabled"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "The mixer feature is currently disabled" });
      }
      let isAdmin = false;
      if (input.platformWide) {
        const role = await prisma.userRole.findFirst({ where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } } });
        if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can add to the platform library" });
        isAdmin = true;
      } else {
        if (!(await getRadioSettingBool("radio_mixer_rj_upload_enabled"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Self-uploads to the mixer library are currently disabled" });
        }
        if (!input.licenseAcknowledged) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You must confirm you own or are licensed to use this audio" });
        }
      }

      const allowedFormats = (await getRadioSetting("radio_mixer_allowed_formats")).split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);
      const ext = input.fileUrl.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase();
      if (allowedFormats.length && (!ext || !allowedFormats.includes(ext))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported file format — allowed: ${allowedFormats.join(", ")}` });
      }

      const maxSizeMb = await getRadioSettingNumber("radio_mixer_max_file_size_mb");
      if (maxSizeMb) {
        try {
          const head = await fetch(input.fileUrl, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
          const lengthHeader = head.headers.get("content-length");
          const sizeMb = lengthHeader ? Number(lengthHeader) / 1024 ** 2 : null;
          if (sizeMb && sizeMb > maxSizeMb) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `File is ${Math.round(sizeMb)}MB — the mixer library limit is ${maxSizeMb}MB` });
          }
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          // HEAD failed for a reason unrelated to size (network hiccup,
          // server doesn't send content-length) — don't block the upload
          // over an inconclusive check.
        }
      }

      const requiresApproval = !isAdmin && (await getRadioSettingBool("radio_mixer_require_approval"));

      return prisma.studioAudioAsset.create({
        data: {
          owner_user_id: input.platformWide ? null : ctx.userId,
          category: input.category,
          subcategory: input.category === "music" ? null : (input.subcategory ?? null),
          status: requiresApproval ? "pending" : "approved",
          title: input.title,
          file_url: input.fileUrl,
          duration_seconds: input.durationSeconds ?? null,
          license_acknowledged_at: input.platformWide ? null : new Date(),
          rights_holder: input.rightsHolder,
          license_type: input.licenseType,
          license_document_url: input.licenseDocumentUrl ?? null,
          allowed_usage: input.allowedUsage ?? null,
          social_rights_app: input.socialRights?.app ?? null,
          social_rights_website: input.socialRights?.website ?? null,
          social_rights_facebook: input.socialRights?.facebook ?? null,
          social_rights_youtube: input.socialRights?.youtube ?? null,
          social_rights_other: input.socialRights?.other ?? null,
        },
      });
    }),

  /**
   * Which tracks in a broadcast's queue are not cleared for the platforms it
   * is going out on (§16).
   *
   * Warning-first by design: this reports, it does not block. Facebook and
   * YouTube run automated content matching, so an uncleared track can mute a
   * video or put a strike on the Page — but silently refusing to play an
   * RJ's music mid-show would be a worse failure than warning them. Every
   * warning is written to the audit trail, so a later decision to start
   * enforcing has evidence behind it.
   */
  socialRightsWarnings: protectedProcedure
    .input(z.object({ assetIds: z.array(z.string()).max(200), platforms: z.array(z.enum(["facebook", "youtube"])).min(1) }))
    .query(async ({ ctx, input }) => {
      if (!input.assetIds.length) return { warnings: [] as { assetId: string; title: string; missing: string[] }[] };
      const assets = await prisma.studioAudioAsset.findMany({
        where: { id: { in: input.assetIds } },
        select: {
          id: true, title: true, rights_holder: true,
          social_rights_facebook: true, social_rights_youtube: true,
        },
      });
      const warnings = assets
        .map((a) => {
          const missing: string[] = [];
          if (input.platforms.includes("facebook") && a.social_rights_facebook !== true) missing.push("Facebook");
          if (input.platforms.includes("youtube") && a.social_rights_youtube !== true) missing.push("YouTube");
          return { assetId: a.id, title: a.title, missing };
        })
        .filter((w) => w.missing.length > 0);

      if (warnings.length) {
        await logRadioAction(ctx.userId!, "social_rights_warning_shown", {
          platforms: input.platforms,
          uncleared: warnings.length,
          assetIds: warnings.map((w) => w.assetId).slice(0, 50),
        });
      }
      return { warnings };
    }),

  // Admin review queue for RJ self-uploads awaiting approval.
  libraryModeration: protectedProcedure.query(async ({ ctx }) => {
    const role = await prisma.userRole.findFirst({ where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } } });
    if (!role) throw new TRPCError({ code: "FORBIDDEN" });
    const pending = await prisma.studioAudioAsset.findMany({ where: { status: "pending" }, orderBy: { created_at: "asc" } });
    return Promise.all(pending.map(withPlayableUrl));
  }),

  moderateLibraryAsset: protectedProcedure
    .input(z.object({ assetId: z.string(), action: z.enum(["approve", "reject", "publish", "unpublish"]) }))
    .mutation(async ({ ctx, input }) => {
      const role = await prisma.userRole.findFirst({ where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } } });
      if (!role) throw new TRPCError({ code: "FORBIDDEN" });
      const status = input.action === "approve" || input.action === "publish" ? "approved"
        : input.action === "reject" ? "rejected" : "unpublished";
      await prisma.studioAudioAsset.update({ where: { id: input.assetId }, data: { status } });
      await logRadioAction(ctx.userId!, "mixer_asset_moderated", { assetId: input.assetId, action: input.action });
      return { status };
    }),

  libraryDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await prisma.studioAudioAsset.findUnique({ where: { id: input.id } });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
      if (asset.owner_user_id !== ctx.userId) {
        const role = await prisma.userRole.findFirst({ where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } } });
        if (!role) throw new TRPCError({ code: "FORBIDDEN" });
      }
      await prisma.studioAudioAsset.delete({ where: { id: input.id } });
      return { deleted: true };
    }),

  // ── §14 Mixer: live playlist queue ──────────────────────────────────────
  playlist: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertModerator(input.sessionId, ctx.userId!);
      // The mixer plays straight from this list, so each item's asset needs a
      // playable (presigned) URL — the stored one points into the private
      // audio/ prefix and 403s on its own.
      const items = await prisma.studioPlaylistItem.findMany({
        where: { studio_session_id: input.sessionId },
        include: { asset: true },
        orderBy: { position: "asc" },
      });
      return Promise.all(
        items.map(async (item) => ({ ...item, asset: await withPlayableUrl(item.asset) }))
      );
    }),

  addToPlaylist: protectedProcedure
    .input(z.object({ sessionId: z.string(), audioAssetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertModerator(input.sessionId, ctx.userId!);
      const maxLength = await getRadioSettingNumber("radio_mixer_max_playlist_length");
      if (maxLength) {
        const queueCount = await prisma.studioPlaylistItem.count({ where: { studio_session_id: input.sessionId, played_at: null } });
        if (queueCount >= maxLength) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Queue is at the ${maxLength}-track limit — remove something first` });
        }
      }
      const last = await prisma.studioPlaylistItem.findFirst({
        where: { studio_session_id: input.sessionId },
        orderBy: { position: "desc" },
      });
      return prisma.studioPlaylistItem.create({
        data: { studio_session_id: input.sessionId, audio_asset_id: input.audioAssetId, position: (last?.position ?? -1) + 1 },
      });
    }),

  removeFromPlaylist: protectedProcedure
    .input(z.object({ sessionId: z.string(), itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertModerator(input.sessionId, ctx.userId!);
      await prisma.studioPlaylistItem.deleteMany({ where: { id: input.itemId, studio_session_id: input.sessionId } });
      return { removed: true };
    }),

  // Swaps position with the adjacent neighbor — same pattern as
  // song_request:reorder in realtime/socket.ts.
  reorderPlaylistItem: protectedProcedure
    .input(z.object({ sessionId: z.string(), itemId: z.string(), direction: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      await assertModerator(input.sessionId, ctx.userId!);
      const items = await prisma.studioPlaylistItem.findMany({
        where: { studio_session_id: input.sessionId, played_at: null },
        orderBy: { position: "asc" },
      });
      const idx = items.findIndex((i) => i.id === input.itemId);
      if (idx === -1) return { reordered: false };
      const neighborIdx = input.direction === "up" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= items.length) return { reordered: false };
      const current = items[idx];
      const neighbor = items[neighborIdx];
      await prisma.$transaction([
        prisma.studioPlaylistItem.update({ where: { id: current.id }, data: { position: neighbor.position } }),
        prisma.studioPlaylistItem.update({ where: { id: neighbor.id }, data: { position: current.position } }),
      ]);
      return { reordered: true };
    }),

  // Randomizes the up-next order once (Fisher-Yates over unplayed items) —
  // a real "shuffle" button, distinct from the client picking a random
  // track ad-hoc, so a page refresh still resumes the shuffled order.
  shufflePlaylist: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertModerator(input.sessionId, ctx.userId!);
      const items = await prisma.studioPlaylistItem.findMany({
        where: { studio_session_id: input.sessionId, played_at: null },
      });
      const positions = items.map((i) => i.position);
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      await prisma.$transaction(items.map((item, i) => prisma.studioPlaylistItem.update({ where: { id: item.id }, data: { position: positions[i] } })));
      return { shuffled: true };
    }),

  // Marks the current queue head played and returns whatever's next — called
  // by the mixer's onended handler so a page refresh resumes at the right
  // queue position instead of silently losing playback state.
  advancePlaylist: protectedProcedure
    .input(z.object({ sessionId: z.string(), itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertModerator(input.sessionId, ctx.userId!);
      await prisma.studioPlaylistItem.updateMany({
        where: { id: input.itemId, studio_session_id: input.sessionId },
        data: { played_at: new Date() },
      });
      return prisma.studioPlaylistItem.findFirst({
        where: { studio_session_id: input.sessionId, played_at: null },
        include: { asset: true },
        orderBy: { position: "asc" },
      });
    }),
});

export { mintToken, DEFAULT_CAN_PUBLISH, getSession };
