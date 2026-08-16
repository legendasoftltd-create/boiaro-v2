import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { getListenerCount, emitToSession, kickUserFromSession, emitToUserInSession } from "../realtime/socket.js";
import { generateBroadcastToken, verifyBroadcastToken } from "../lib/broadcastToken.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { getRadioSetting, getRadioSettingBool, getRadioSettingNumber } from "../lib/radioSettings.js";
import { startRecording, stopRecording, shouldAutoRecord } from "../lib/liveRecorder.js";
import { notifyFollowersOfGoLive, notifyFollowersOfCatchupPublished, notifyFollowersOfSpecialAnnouncement } from "../lib/radioNotify.js";
import { deleteFromS3 } from "../lib/s3.js";
import { getCallInIceServers } from "../lib/turnCredentials.js";
import { PUBLIC_RJ_PROFILE_SELECT } from "../lib/rjProfile.js";
import { computeRadioAnalytics } from "../lib/radioAnalytics.js";
import { isCallinAllowedForBroadcast } from "../lib/callinPolicy.js";
import { dhakaWallClock, fromDhakaShifted } from "../lib/timezone.js";

async function assertHostOrModerator(userId: string, session: { rj_user_id: string }) {
  if (userId === session.rj_user_id) return;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "Only the host or a moderator can do this" });
}

export const rjRouter = router({
  radioStation: publicProcedure.query(() =>
    prisma.radioStation.findFirst({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  radioStations: publicProcedure.query(() =>
    prisma.radioStation.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  myProfile: protectedProcedure.query(({ ctx }) =>
    prisma.rjProfile.findUnique({ where: { user_id: ctx.userId } })
  ),

  // Whether call-in can actually be turned on for this broadcast — platform,
  // station, and RJ gates combined (see lib/callinPolicy.ts). The Go Live
  // form's call-in switch is only meaningful to show/enable when this is
  // true, since the start mutation rejects callinEnabled:true otherwise.
  callinAvailable: protectedProcedure
    .input(z.object({ stationId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => ({
      enabled: await isCallinAllowedForBroadcast(input?.stationId, ctx.userId!),
    })),

  createProfile: protectedProcedure
    .input(z.object({ stageName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.rjProfile.findUnique({ where: { user_id: ctx.userId } });
      if (existing) return existing;
      return prisma.rjProfile.create({
        data: { user_id: ctx.userId, stage_name: input.stageName },
      });
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      stageName: z.string().min(1),
      bio: z.string().optional(),
      specialty: z.string().optional(),
      avatarUrl: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      prisma.rjProfile.update({
        where: { user_id: ctx.userId },
        data: {
          stage_name: input.stageName,
          bio: input.bio ?? null,
          specialty: input.specialty ?? null,
          avatar_url: input.avatarUrl ?? null,
        },
      })
    ),

  // ── Broadcast credential ────────────────────────────────────────────────
  // A secret distinct from the RJ's login session, required to start a live
  // session. Shown in plaintext once, at generation time — only the hash is
  // ever stored. Suspending/deactivating/rejecting an RJ (admin.ts) revokes
  // it immediately.
  broadcastTokenStatus: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.rjProfile.findUnique({ where: { user_id: ctx.userId } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    return {
      hasToken: !!profile.broadcast_token_hash && !profile.broadcast_token_revoked_at,
      createdAt: profile.broadcast_token_created_at,
      revokedAt: profile.broadcast_token_revoked_at,
    };
  }),

  regenerateBroadcastToken: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await prisma.rjProfile.findUnique({ where: { user_id: ctx.userId } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    if (!profile.is_approved || !profile.is_active) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only approved, active RJs can generate a broadcast token" });
    }
    const { token, hash } = generateBroadcastToken();
    await prisma.rjProfile.update({
      where: { user_id: ctx.userId },
      data: { broadcast_token_hash: hash, broadcast_token_created_at: new Date(), broadcast_token_revoked_at: null },
    });
    await logRadioAction(ctx.userId!, "broadcast_token_regenerated");
    // Plaintext returned exactly once — the client must show/copy it now.
    return { token };
  }),

  revokeBroadcastToken: protectedProcedure.mutation(async ({ ctx }) => {
    await prisma.rjProfile.update({
      where: { user_id: ctx.userId },
      data: { broadcast_token_revoked_at: new Date() },
    });
    await logRadioAction(ctx.userId!, "broadcast_token_revoked");
    return { revoked: true };
  }),

  // ── Terms / copyright acceptance ────────────────────────────────────────
  termsStatus: protectedProcedure.query(async ({ ctx }) => {
    const [profile, currentVersion] = await Promise.all([
      prisma.rjProfile.findUnique({ where: { user_id: ctx.userId } }),
      getRadioSetting("radio_terms_version"),
    ]);
    return {
      currentVersion,
      acceptedVersion: profile?.terms_accepted_version ?? null,
      acceptedAt: profile?.terms_accepted_at ?? null,
      needsAcceptance: profile?.terms_accepted_version !== currentVersion,
    };
  }),

  acceptTerms: protectedProcedure.mutation(async ({ ctx }) => {
    const version = await getRadioSetting("radio_terms_version");
    await prisma.rjProfile.update({
      where: { user_id: ctx.userId },
      data: { terms_accepted_at: new Date(), terms_accepted_version: version },
    });
    return { accepted: true, version };
  }),

  // Self-service version of admin.radioAnalytics — same computation, but
  // rj_user_id is locked to ctx.userId server-side (never client-supplied)
  // so an RJ can only ever see their own numbers.
  myAnalytics: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      groupBy: z.enum(["none", "show"]).default("none"),
    }))
    .query(({ ctx, input }) => computeRadioAnalytics({ ...input, rjUserId: ctx.userId! })),

  // Manual "special live announcement" to an RJ's own followers — for
  // anything outside the automatic triggers (go-live, schedule change,
  // catch-up published): a surprise show, a special guest, etc. An RJ can
  // only ever send to their own followers; admin/moderator can send on
  // behalf of any RJ (e.g. helping promote a show).
  sendSpecialAnnouncement: protectedProcedure
    .input(z.object({
      rjUserId: z.string().optional(),
      title: z.string().min(1).max(100),
      message: z.string().min(1).max(500),
      link: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetRjUserId = input.rjUserId ?? ctx.userId!;
      if (targetRjUserId !== ctx.userId) {
        const role = await prisma.userRole.findFirst({ where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } } });
        if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "Only the RJ themself or a moderator can send this" });
      }
      notifyFollowersOfSpecialAnnouncement(targetRjUserId, input.title, input.message, input.link).catch(() => null);
      await logRadioAction(ctx.userId!, "special_announcement_sent", { rjUserId: targetRjUserId, title: input.title });
      return { sent: true };
    }),

  mySessions: protectedProcedure.query(({ ctx }) =>
    prisma.liveSession.findMany({
      where: { rj_user_id: ctx.userId },
      orderBy: { started_at: "desc" },
      take: 10,
    })
  ),

  approvalHistory: protectedProcedure.query(({ ctx }) =>
    prisma.rjApprovalLog.findMany({
      where: { rj_user_id: ctx.userId },
      orderBy: { created_at: "desc" },
    })
  ),

  // This platform doesn't record streams server-side — catch-up audio only
  // exists once the RJ (or admin) manually attaches a recording URL after
  // the show ends (either by pasting an external URL or uploading the audio
  // file through the normal /upload/media endpoint first).
  // Manual attach (paste a URL, or upload via /upload/media first and paste
  // the returned URL here) — goes straight to published, unlike an automatic
  // capture which starts as a draft awaiting review.
  attachRecording: protectedProcedure
    .input(z.object({ sessionId: z.string(), recordingUrl: z.string().url().regex(/^https:\/\//i, "Must be an https URL") }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      const updated = await prisma.liveSession.update({
        where: { id: input.sessionId },
        data: {
          recording_url: input.recordingUrl,
          recording_status: "published",
          recording_source: "manual",
          recording_published_at: new Date(),
        },
      });
      await logRadioAction(ctx.userId!, "recording_attached", { sessionId: input.sessionId });
      return updated;
    }),

  // Draft recordings pending review — host's own, or (via assertHostOrModerator) any for an admin.
  pendingRecordings: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = await prisma.userRole.findFirst({ where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } } });
    const sessions = await prisma.liveSession.findMany({
      where: {
        recording_status: { in: ["draft", "rejected"] },
        ...(isAdmin ? {} : { rj_user_id: ctx.userId }),
      },
      orderBy: { ended_at: "desc" },
      take: 50,
    });
    return sessions;
  }),

  approveRecording: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      const updated = await prisma.liveSession.update({
        where: { id: input.sessionId },
        data: { recording_approved_by: ctx.userId, recording_approved_at: new Date() },
      });
      await logRadioAction(ctx.userId!, "recording_approved", { sessionId: input.sessionId });
      return updated;
    }),

  rejectRecording: protectedProcedure
    .input(z.object({ sessionId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      const updated = await prisma.liveSession.update({ where: { id: input.sessionId }, data: { recording_status: "rejected" } });
      await logRadioAction(ctx.userId!, "recording_rejected", { sessionId: input.sessionId, reason: input.reason });
      return updated;
    }),

  publishRecording: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (!session.recording_url) throw new TRPCError({ code: "BAD_REQUEST", message: "No recording to publish" });
      await assertHostOrModerator(ctx.userId!, session);
      const updated = await prisma.liveSession.update({
        where: { id: input.sessionId },
        data: { recording_status: "published", recording_published_at: new Date() },
      });
      await logRadioAction(ctx.userId!, "recording_published", { sessionId: input.sessionId });
      notifyFollowersOfCatchupPublished(session.rj_user_id, session.show_title).catch(() => null);
      return updated;
    }),

  unpublishRecording: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      const updated = await prisma.liveSession.update({ where: { id: input.sessionId }, data: { recording_status: "draft" } });
      await logRadioAction(ctx.userId!, "recording_unpublished", { sessionId: input.sessionId });
      return updated;
    }),

  // Edit the display metadata of a recording (title/description/cover/URL)
  // without touching recording_status — distinct from attachRecording,
  // which force-publishes, and unpublishRecording, which only flips status.
  updateRecordingDetails: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      showTitle: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      coverImageUrl: z.string().url().nullable().optional(),
      recordingUrl: z.string().url().regex(/^https:\/\//i, "Must be an https URL").optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      const updated = await prisma.liveSession.update({
        where: { id: input.sessionId },
        data: {
          ...(input.showTitle !== undefined ? { show_title: input.showTitle } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.coverImageUrl !== undefined ? { cover_image_url: input.coverImageUrl } : {}),
          ...(input.recordingUrl !== undefined ? { recording_url: input.recordingUrl, recording_source: "manual" } : {}),
        },
      });
      await logRadioAction(ctx.userId!, "recording_details_updated", { sessionId: input.sessionId });
      return updated;
    }),

  // Per-recording stats — distinct from the platform-wide aggregate in
  // radioAnalytics.ts, this is scoped to one session for display on its card.
  recordingStats: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      const progress = await prisma.catchupProgress.findMany({
        where: { live_session_id: input.sessionId },
        select: { completed: true, total_plays: true },
      });
      const uniqueListeners = progress.length;
      const completedCount = progress.filter((p) => p.completed).length;
      const completionRatePct = uniqueListeners > 0 ? Math.round((completedCount / uniqueListeners) * 100) : 0;
      return {
        totalPlays: session.catchup_play_count,
        uniqueListeners,
        completionRatePct,
      };
    }),

  deleteRecording: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      if (session.recording_url) {
        await deleteFromS3(session.recording_url).catch((err) => console.error("[deleteRecording] S3 delete failed:", err?.message));
      }
      const updated = await prisma.liveSession.update({
        where: { id: input.sessionId },
        data: {
          recording_url: null, recording_status: "deleted", recording_file_size_bytes: null,
          recording_duration_seconds: null,
        },
      });
      await logRadioAction(ctx.userId!, "recording_deleted", { sessionId: input.sessionId });
      return updated;
    }),

  // Public podcast-style archive — ended sessions with a recording attached.
  catchupSessions: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20), cursor: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (!(await getRadioSettingBool("radio_catchup_enabled"))) return { sessions: [], nextCursor: null };
      const limit = input?.limit ?? 20;
      const sessions = await prisma.liveSession.findMany({
        where: { status: "ended", recording_url: { not: null }, recording_status: "published", is_test: false },
        include: { station: { select: { id: true, name: true, artwork_url: true } } },
        orderBy: { started_at: "desc" },
        take: limit + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const hasMore = sessions.length > limit;
      const page = hasMore ? sessions.slice(0, limit) : sessions;
      const rjIds = [...new Set(page.map((s) => s.rj_user_id))];
      const profiles = rjIds.length
        ? await prisma.rjProfile.findMany({ where: { user_id: { in: rjIds } }, select: { user_id: true, stage_name: true, avatar_url: true } })
        : [];
      const pMap = new Map(profiles.map((p) => [p.user_id, p]));
      return {
        sessions: page.map((s) => ({ ...s, rj_stage_name: pMap.get(s.rj_user_id)?.stage_name ?? null, rj_avatar_url: pMap.get(s.rj_user_id)?.avatar_url ?? null })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
      };
    }),

  liveSession: router({
    // No direct Prisma relation between LiveSession.rj_user_id and
    // RjProfile.user_id (RjProfile predates LiveSession and was never
    // linked), so the RJ's display info is fetched separately and merged.
    // Test broadcasts never appear here — only a real public "live" session.
    current: publicProcedure.query(async () => {
      const session = await prisma.liveSession.findFirst({
        where: { status: { in: ["live", "reconnecting"] }, is_test: false },
        include: { station: true },
        orderBy: { started_at: "desc" },
      });
      if (!session) return null;
      const rjProfile = await prisma.rjProfile.findUnique({ where: { user_id: session.rj_user_id }, select: PUBLIC_RJ_PROFILE_SELECT });
      return { ...session, rj_profile: rjProfile };
    }),

    // Every currently-live (real, non-test) session across every station —
    // `current` above only ever surfaces one (the platform's single most-
    // recently-started), which can't represent several stations being live
    // at once. Used to list all of them (homepage) and to deep-link into a
    // specific one (see byId below).
    allCurrent: publicProcedure.query(async () => {
      const sessions = await prisma.liveSession.findMany({
        where: { status: { in: ["live", "reconnecting"] }, is_test: false },
        include: { station: true },
        orderBy: { started_at: "asc" },
      });
      if (!sessions.length) return [];
      const rjProfiles = await prisma.rjProfile.findMany({
        where: { user_id: { in: [...new Set(sessions.map((s) => s.rj_user_id))] } },
        select: PUBLIC_RJ_PROFILE_SELECT,
      });
      const profileMap = new Map(rjProfiles.map((p) => [p.user_id, p]));
      return sessions.map((s) => ({ ...s, rj_profile: profileMap.get(s.rj_user_id) ?? null }));
    }),

    // Fetch one specific session by id, live or already ended — for
    // deep links (go-live notifications, shared /live/:sessionId URLs)
    // that must keep pointing at the broadcast they were sent for, not
    // whichever session happens to be live by the time they're opened.
    byId: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ input }) => {
        const session = await prisma.liveSession.findUnique({
          where: { id: input.sessionId },
          include: { station: true },
        });
        if (!session || session.is_test) return null;
        const rjProfile = await prisma.rjProfile.findUnique({ where: { user_id: session.rj_user_id }, select: PUBLIC_RJ_PROFILE_SELECT });
        return { ...session, rj_profile: rjProfile };
      }),

    // Soonest upcoming show on a station — combines one-time and recurring
    // schedules, computed in Dhaka wall-clock (see lib/timezone.ts) so it
    // doesn't depend on the server process's own OS timezone. Used by the
    // homepage/live-room "next show" display when nobody's currently live.
    nextShowForStation: publicProcedure
      .input(z.object({ stationId: z.string() }))
      .query(async ({ input }) => {
        const schedules = await prisma.showSchedule.findMany({
          where: { station_id: input.stationId, is_active: true, status: "active" },
        });
        if (!schedules.length) return null;

        const dhakaNow = dhakaWallClock();
        let best: { schedule: (typeof schedules)[number]; atDhaka: Date } | null = null;

        for (const s of schedules) {
          const [h, m] = s.start_time.split(":").map(Number);
          if (!Number.isFinite(h) || !Number.isFinite(m)) continue;

          let atDhaka: Date;
          if (s.schedule_type === "one_time" && s.specific_date) {
            // specific_date is stored as UTC midnight representing the
            // intended Dhaka calendar date (see AdminRadioSchedule.tsx) —
            // safe to read its UTC fields directly as the Dhaka date.
            atDhaka = new Date(Date.UTC(s.specific_date.getUTCFullYear(), s.specific_date.getUTCMonth(), s.specific_date.getUTCDate(), h, m, 0, 0));
          } else {
            const daysAhead = (s.day_of_week - dhakaNow.getUTCDay() + 7) % 7;
            atDhaka = new Date(dhakaNow);
            atDhaka.setUTCDate(dhakaNow.getUTCDate() + daysAhead);
            atDhaka.setUTCHours(h, m, 0, 0);
            if (atDhaka.getTime() <= dhakaNow.getTime()) atDhaka.setUTCDate(atDhaka.getUTCDate() + 7);
          }
          if (atDhaka.getTime() <= dhakaNow.getTime()) continue; // one_time already passed
          if (!best || atDhaka.getTime() < best.atDhaka.getTime()) best = { schedule: s, atDhaka };
        }
        if (!best) return null;

        const rjProfile = await prisma.rjProfile.findUnique({ where: { user_id: best.schedule.rj_user_id }, select: PUBLIC_RJ_PROFILE_SELECT });
        return {
          ...best.schedule,
          next_occurrence_at: fromDhakaShifted(best.atDhaka),
          rj_profile: rjProfile,
        };
      }),

    // The host's own private test broadcast, if one is running — not visible
    // to anyone else. Lets the Go Live UI show test status without exposing it.
    myTestSession: protectedProcedure.query(({ ctx }) =>
      prisma.liveSession.findFirst({
        where: { rj_user_id: ctx.userId, is_test: true, status: { in: ["live", "reconnecting"] } },
        orderBy: { started_at: "desc" },
      })
    ),

    // The host's own currently-live (real, non-test) session, if any —
    // unlike `current` (the platform's single global-most-recent live
    // session), this is correct even when another RJ is live at the same
    // time, which `current` alone can't distinguish for dashboard purposes.
    myActiveSession: protectedProcedure.query(({ ctx }) =>
      prisma.liveSession.findFirst({
        where: { rj_user_id: ctx.userId, is_test: false, status: { in: ["live", "reconnecting"] } },
        orderBy: { started_at: "desc" },
      })
    ),

    start: protectedProcedure
      .input(z.object({
        streamUrl: z.string().min(1),
        showTitle: z.string().optional(),
        description: z.string().optional(),
        coverImageUrl: z.string().optional(),
        stationId: z.string().optional(),
        category: z.string().optional(),
        broadcastToken: z.string().min(1),
        isTest: z.boolean().default(false),
        chatEnabled: z.boolean().default(true),
        requestsEnabled: z.boolean().default(true),
        recordingEnabled: z.boolean().default(true),
        callinEnabled: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const profile = await prisma.rjProfile.findUnique({ where: { user_id: ctx.userId } });
        if (!profile || !profile.is_approved) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only approved RJs can start a live session" });
        }
        if (!profile.is_active) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Your RJ account is suspended or deactivated" });
        }
        if (!profile.broadcast_token_hash || profile.broadcast_token_revoked_at) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No active broadcast token — generate one from your dashboard first" });
        }
        if (!verifyBroadcastToken(input.broadcastToken, profile.broadcast_token_hash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid broadcast token" });
        }

        const currentTermsVersion = await getRadioSetting("radio_terms_version");
        if (profile.terms_accepted_version !== currentTermsVersion) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You must accept the current broadcaster terms before going live" });
        }

        // Real (non-test) broadcasts: no two RJs live on the same station at once.
        if (!input.isTest && input.stationId) {
          const clash = await prisma.liveSession.findFirst({
            where: { station_id: input.stationId, is_test: false, status: { in: ["live", "reconnecting"] } },
          });
          if (clash) throw new TRPCError({ code: "CONFLICT", message: "Another host is already live on this station" });
        }

        if (input.callinEnabled && !(await isCallinAllowedForBroadcast(input.stationId, ctx.userId!))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Call-in is not enabled for this station/RJ" });
        }

        const session = await prisma.liveSession.create({
          data: {
            rj_user_id: ctx.userId,
            station_id: input.stationId ?? null,
            stream_url: input.streamUrl,
            show_title: input.showTitle ?? null,
            description: input.description ?? null,
            cover_image_url: input.coverImageUrl ?? null,
            category: input.category ?? null,
            status: "live",
            started_at: new Date(),
            last_heartbeat_at: new Date(),
            is_test: input.isTest,
            chat_enabled: input.chatEnabled,
            requests_enabled: input.requestsEnabled,
            recording_enabled: input.recordingEnabled,
            callin_enabled: input.callinEnabled,
          },
        });

        if (!input.isTest) {
          notifyFollowersOfGoLive(ctx.userId!, profile.stage_name, input.showTitle, session.id).catch(() => null);
        }
        if (!input.isTest && (await shouldAutoRecord(input.stationId, input.recordingEnabled))) {
          startRecording(session.id, input.streamUrl);
        }
        await logRadioAction(ctx.userId!, input.isTest ? "test_broadcast_started" : "live_session_started", { sessionId: session.id });
        return session;
      }),

    end: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        if (session.rj_user_id !== ctx.userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only end your own live session" });
        }
        stopRecording(input.sessionId);
        const updated = await prisma.liveSession.update({
          where: { id: input.sessionId },
          data: { status: "ended", ended_at: new Date() },
        });
        await logRadioAction(ctx.userId!, session.is_test ? "test_broadcast_ended" : "live_session_ended", { sessionId: input.sessionId });
        return updated;
      }),

    // RJ client pings this every ~20s while live — a stale heartbeat is how
    // jobs/streamReconnect.ts detects a dropped connection and starts the
    // grace-period countdown before auto-ending the session.
    heartbeat: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId }, select: { rj_user_id: true, status: true } });
        if (!session || session.rj_user_id !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" });
        const data: { last_heartbeat_at: Date; status?: string } = { last_heartbeat_at: new Date() };
        if (session.status === "reconnecting") data.status = "live"; // recovered before the grace period expired
        return prisma.liveSession.update({ where: { id: input.sessionId }, data });
      }),

    // Recent chat history for late joiners — live messages after that come
    // over the socket (`chat:new`).
    chatHistory: publicProcedure
      .input(z.object({ sessionId: z.string(), limit: z.number().int().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const messages = await prisma.liveChatMessage.findMany({
          where: { live_session_id: input.sessionId },
          orderBy: { created_at: "desc" },
          take: input.limit,
        });
        const userIds = [...new Set(messages.map((m) => m.user_id))];
        const profiles = userIds.length
          ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true, avatar_url: true } })
          : [];
        const pMap = new Map(profiles.map((p) => [p.user_id, p]));
        return messages.reverse().map((m) => ({
          id: m.id, user_id: m.user_id, message: m.message, created_at: m.created_at,
          display_name: pMap.get(m.user_id)?.display_name ?? null,
          avatar_url: pMap.get(m.user_id)?.avatar_url ?? null,
        }));
      }),

    // Host/moderator-only queue view — for the host dashboard's initial
    // render, before any new `song_request:new` socket events arrive.
    songRequests: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ ctx, input }) => {
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId }, select: { rj_user_id: true } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, session);
        const requests = await prisma.songRequest.findMany({
          where: { live_session_id: input.sessionId },
          orderBy: { position: "asc" },
          take: 100,
        });
        const userIds = [...new Set(requests.map((r) => r.user_id))];
        const profiles = userIds.length
          ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } })
          : [];
        const pMap = new Map(profiles.map((p) => [p.user_id, p.display_name]));
        return requests.map((r) => ({ ...r, display_name: pMap.get(r.user_id) ?? null }));
      }),

    listenerCount: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(({ input }) => ({ sessionId: input.sessionId, count: getListenerCount(input.sessionId) })),

    // ── Moderation ─────────────────────────────────────────────────────────
    mutedUsers: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ ctx, input }) => {
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId }, select: { rj_user_id: true } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, session);
        return prisma.radioMute.findMany({
          where: { live_session_id: input.sessionId, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] },
          orderBy: { created_at: "desc" },
        });
      }),

    muteUser: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        userId: z.string(),
        reason: z.string().optional(),
        durationMinutes: z.number().int().positive().optional(),
        type: z.enum(["mute", "ban"]).default("mute"),
      }))
      .mutation(async ({ ctx, input }) => {
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId }, select: { rj_user_id: true } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, session);
        const mute = await prisma.radioMute.create({
          data: {
            live_session_id: input.sessionId,
            user_id: input.userId,
            muted_by: ctx.userId!,
            reason: input.reason,
            type: input.type,
            expires_at: input.durationMinutes ? new Date(Date.now() + input.durationMinutes * 60_000) : null,
          },
        });
        if (input.type === "ban") {
          kickUserFromSession(input.sessionId, input.userId, "You've been banned from this room");
        }
        await logRadioAction(ctx.userId!, input.type === "ban" ? "user_banned" : "user_muted", { sessionId: input.sessionId, userId: input.userId, permanent: !input.durationMinutes });
        return mute;
      }),

    unmuteUser: protectedProcedure
      .input(z.object({ sessionId: z.string(), userId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId }, select: { rj_user_id: true } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, session);
        await prisma.radioMute.deleteMany({ where: { live_session_id: input.sessionId, user_id: input.userId } });
        await logRadioAction(ctx.userId!, "user_unmuted", { sessionId: input.sessionId, userId: input.userId });
        return { unmuted: true };
      }),

    reportContent: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        targetType: z.enum(["chat_message", "song_request", "call_in"]),
        targetId: z.string(),
        reason: z.string().min(1).max(500),
      }))
      .mutation(({ ctx, input }) =>
        prisma.liveReport.create({
          data: {
            live_session_id: input.sessionId,
            reporter_id: ctx.userId!,
            target_type: input.targetType,
            target_id: input.targetId,
            reason: input.reason,
          },
        })
      ),
  }),

  // ── Listener call-in ───────────────────────────────────────────────────
  // State machine only — no audio transport is implemented in this pass.
  // Disabled platform-wide by default (radio_callin_enabled) and per-session
  // (LiveSession.callin_enabled), both enforced here.
  callIn: router({
    // STUN + (on production) time-limited TURN credentials for the peer
    // connection. Fetch right before creating the RTCPeerConnection — the
    // TURN credential expires after an hour.
    iceServers: protectedProcedure.query(({ ctx }) => ({
      iceServers: getCallInIceServers(ctx.userId),
    })),

    request: protectedProcedure
      .input(z.object({ sessionId: z.string(), consentGiven: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (!(await getRadioSettingBool("radio_callin_enabled"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Call-in is not enabled on this platform" });
        }
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
        if (!session || session.status === "ended") throw new TRPCError({ code: "NOT_FOUND" });
        if (!session.callin_enabled) throw new TRPCError({ code: "FORBIDDEN", message: "Call-in is off for this show" });
        if (!input.consentGiven) throw new TRPCError({ code: "BAD_REQUEST", message: "Recording consent is required to request to speak" });

        const existing = await prisma.callInRequest.findFirst({
          where: { live_session_id: input.sessionId, user_id: ctx.userId, status: { in: ["requested", "waiting", "accepted", "previewing", "on_air", "muted"] } },
        });
        if (existing) return existing;

        return prisma.callInRequest.create({
          data: { live_session_id: input.sessionId, user_id: ctx.userId!, consent_given_at: new Date() },
        });
      }),

    myStatus: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(({ ctx, input }) =>
        prisma.callInRequest.findFirst({
          where: { live_session_id: input.sessionId, user_id: ctx.userId },
          orderBy: { created_at: "desc" },
        })
      ),

    queue: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ ctx, input }) => {
        const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId }, select: { rj_user_id: true } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, session);
        const calls = await prisma.callInRequest.findMany({
          where: { live_session_id: input.sessionId, status: { in: ["requested", "waiting", "accepted", "previewing", "on_air", "muted"] } },
          orderBy: { requested_at: "asc" },
        });
        const userIds = [...new Set(calls.map((c) => c.user_id))];
        const profiles = userIds.length
          ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true, avatar_url: true } })
          : [];
        const pMap = new Map(profiles.map((p) => [p.user_id, p]));
        return calls.map((c) => ({ ...c, display_name: pMap.get(c.user_id)?.display_name ?? null, avatar_url: pMap.get(c.user_id)?.avatar_url ?? null }));
      }),

    accept: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const call = await prisma.callInRequest.findUnique({ where: { id: input.callId }, include: { session: { select: { rj_user_id: true, id: true } } } });
        if (!call) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, call.session);
        const updated = await prisma.callInRequest.update({ where: { id: input.callId }, data: { status: "waiting", responded_at: new Date() } });
        emitToUserInSession(call.session.id, call.user_id, "callin:status", { callId: call.id, status: "waiting" });
        return updated;
      }),

    reject: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const call = await prisma.callInRequest.findUnique({ where: { id: input.callId }, include: { session: { select: { rj_user_id: true, id: true } } } });
        if (!call) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, call.session);
        const updated = await prisma.callInRequest.update({ where: { id: input.callId }, data: { status: "rejected", responded_at: new Date() } });
        emitToUserInSession(call.session.id, call.user_id, "callin:status", { callId: call.id, status: "rejected" });
        return updated;
      }),

    // Signals the caller's browser to begin the WebRTC handshake (send an
    // offer) so the host can listen before deciding whether to send the
    // caller to air — same handshake trigger as goOnAir below, just under a
    // status that doesn't count toward radio_callin_max_concurrent and that
    // the frontend labels "previewing (not on air)" rather than live.
    // NOTE: this app has no server-side audio mixing — the broadcast itself
    // is produced by whatever encoder software the RJ runs outside this app
    // (see RjDashboard's "Broadcast Setup" card). Whether a preview is truly
    // inaudible to listeners depends on the RJ routing this preview audio to
    // a device their encoder isn't capturing — the frontend must make that
    // caveat explicit, since the backend cannot enforce it.
    previewCall: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const call = await prisma.callInRequest.findUnique({ where: { id: input.callId }, include: { session: { select: { rj_user_id: true, id: true } } } });
        if (!call) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, call.session);
        const updated = await prisma.callInRequest.update({ where: { id: input.callId }, data: { status: "previewing", responded_at: new Date() } });
        emitToUserInSession(call.session.id, call.user_id, "callin:status", { callId: call.id, status: "previewing", hostUserId: call.session.rj_user_id });
        return updated;
      }),

    // Signals the caller's browser to begin the WebRTC handshake (send an
    // offer) if it hasn't already during a preview — going "on air" is the
    // moment audio is meant to be live in the broadcast, not just a
    // queue-position label like the earlier statuses.
    goOnAir: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const call = await prisma.callInRequest.findUnique({ where: { id: input.callId }, include: { session: { select: { rj_user_id: true, id: true } } } });
        if (!call) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, call.session);
        const maxConcurrent = (await getRadioSettingNumber("radio_callin_max_concurrent")) ?? 1;
        const onAirCount = await prisma.callInRequest.count({ where: { live_session_id: call.session.id, status: "on_air" } });
        if (onAirCount >= maxConcurrent) {
          throw new TRPCError({ code: "CONFLICT", message: `Maximum ${maxConcurrent} caller(s) on air already` });
        }
        const updated = await prisma.callInRequest.update({ where: { id: input.callId }, data: { status: "on_air", on_air_at: new Date() } });
        emitToUserInSession(call.session.id, call.user_id, "callin:status", { callId: call.id, status: "on_air", hostUserId: call.session.rj_user_id });
        await logRadioAction(ctx.userId!, "callin_on_air", { sessionId: call.session.id, userId: call.user_id });
        return updated;
      }),

    muteCaller: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const call = await prisma.callInRequest.findUnique({ where: { id: input.callId }, include: { session: { select: { rj_user_id: true, id: true } } } });
        if (!call) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, call.session);
        const updated = await prisma.callInRequest.update({ where: { id: input.callId }, data: { status: "muted" } });
        // Tells the caller's own browser to disable its outgoing mic track —
        // the server never touches the audio itself.
        emitToUserInSession(call.session.id, call.user_id, "callin:mute", { callId: call.id });
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const call = await prisma.callInRequest.findUnique({ where: { id: input.callId }, include: { session: { select: { rj_user_id: true, id: true } } } });
        if (!call) throw new TRPCError({ code: "NOT_FOUND" });
        await assertHostOrModerator(ctx.userId!, call.session);
        const updated = await prisma.callInRequest.update({ where: { id: input.callId }, data: { status: "removed", ended_at: new Date() } });
        emitToUserInSession(call.session.id, call.user_id, "callin:hangup", { callId: call.id, reason: "removed" });
        await logRadioAction(ctx.userId!, "callin_removed", { sessionId: call.session.id, userId: call.user_id });
        return updated;
      }),

    end: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const call = await prisma.callInRequest.findUnique({ where: { id: input.callId } });
        if (!call) throw new TRPCError({ code: "NOT_FOUND" });
        if (call.user_id !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" });
        const updated = await prisma.callInRequest.update({ where: { id: input.callId }, data: { status: "ended", ended_at: new Date() } });
        // Let the host know their caller hung up their end.
        const session = await prisma.liveSession.findUnique({ where: { id: call.live_session_id }, select: { rj_user_id: true } });
        if (session) emitToUserInSession(call.live_session_id, session.rj_user_id, "callin:hangup", { callId: call.id, reason: "caller_ended" });
        return updated;
      }),
  }),

  profiles: publicProcedure.query(() =>
    prisma.rjProfile.findMany({
      where: { is_active: true, is_approved: true },
      orderBy: { created_at: "desc" },
      select: PUBLIC_RJ_PROFILE_SELECT,
    })
  ),

  profileById: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) =>
      prisma.rjProfile.findFirst({
        where: { user_id: input.userId, is_active: true, is_approved: true },
        select: PUBLIC_RJ_PROFILE_SELECT,
      })
    ),

  // Public weekly EPG — every active slot, grouped by day on the client.
  showSchedules: publicProcedure.query(async () => {
    const schedules = await prisma.showSchedule.findMany({
      where: { is_active: true },
      include: { station: { select: { id: true, name: true } } },
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
    });
    const rjIds = [...new Set(schedules.map((s) => s.rj_user_id))];
    const profiles = rjIds.length
      ? await prisma.rjProfile.findMany({ where: { user_id: { in: rjIds } }, select: { user_id: true, stage_name: true, avatar_url: true } })
      : [];
    const pMap = new Map(profiles.map((p) => [p.user_id, p]));
    return schedules.map((s) => ({
      ...s,
      rj_stage_name: pMap.get(s.rj_user_id)?.stage_name ?? null,
      rj_avatar_url: pMap.get(s.rj_user_id)?.avatar_url ?? null,
    }));
  }),

  // An approved RJ's own slots, assigned by admin — read-only from the RJ's
  // side (per the spec, admin owns scheduling; RJs "coordinate with admin").
  myShowSchedules: protectedProcedure.query(({ ctx }) =>
    prisma.showSchedule.findMany({
      where: { rj_user_id: ctx.userId, is_active: true },
      include: { station: { select: { id: true, name: true } } },
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
    })
  ),

  // RJs can't edit their own slots directly — admin owns the schedule — but
  // they can propose a cancel or reschedule, which admin then approves or
  // rejects (reviewScheduleChangeRequest in admin.ts).
  requestScheduleChange: protectedProcedure
    .input(z.object({
      scheduleId: z.string(),
      requestType: z.enum(["cancel", "reschedule"]),
      proposedDayOfWeek: z.number().int().min(0).max(6).optional(),
      proposedStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      proposedEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      proposedSpecificDate: z.string().datetime().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await prisma.showSchedule.findUnique({ where: { id: input.scheduleId } });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND" });
      if (schedule.rj_user_id !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" });
      const existing = await prisma.scheduleChangeRequest.findFirst({ where: { schedule_id: input.scheduleId, status: "pending" } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A change request for this show is already pending" });
      return prisma.scheduleChangeRequest.create({
        data: {
          schedule_id: input.scheduleId,
          rj_user_id: ctx.userId!,
          request_type: input.requestType,
          proposed_day_of_week: input.proposedDayOfWeek,
          proposed_start_time: input.proposedStartTime,
          proposed_end_time: input.proposedEndTime,
          proposed_specific_date: input.proposedSpecificDate ? new Date(input.proposedSpecificDate) : undefined,
          reason: input.reason,
        },
      });
    }),

  myScheduleChangeRequests: protectedProcedure.query(({ ctx }) =>
    prisma.scheduleChangeRequest.findMany({
      where: { rj_user_id: ctx.userId },
      include: { schedule: { select: { show_title: true, start_time: true, end_time: true, day_of_week: true } } },
      orderBy: { created_at: "desc" },
    })
  ),

  // ── Catch-up playback tracking ──────────────────────────────────────────
  myCatchupProgress: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) =>
      prisma.catchupProgress.findUnique({
        where: { user_id_live_session_id: { user_id: ctx.userId!, live_session_id: input.sessionId } },
      })
    ),

  // Call once when playback actually starts (not on every progress tick) —
  // bumps the session's total-plays counter and this listener's own count.
  recordCatchupPlay: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.liveSession.update({ where: { id: input.sessionId }, data: { catchup_play_count: { increment: 1 } } }).catch(() => null);
      return prisma.catchupProgress.upsert({
        where: { user_id_live_session_id: { user_id: ctx.userId!, live_session_id: input.sessionId } },
        create: { user_id: ctx.userId!, live_session_id: input.sessionId },
        update: { total_plays: { increment: 1 }, last_played_at: new Date() },
      });
    }),

  // Call periodically (e.g. every 15s) and on pause/unmount — this is what
  // "resume where you left off" reads back from.
  saveCatchupProgress: protectedProcedure
    .input(z.object({ sessionId: z.string(), positionSeconds: z.number().int().min(0), durationSeconds: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      const completed = !!input.durationSeconds && input.positionSeconds / input.durationSeconds >= 0.95;
      return prisma.catchupProgress.upsert({
        where: { user_id_live_session_id: { user_id: ctx.userId!, live_session_id: input.sessionId } },
        create: {
          user_id: ctx.userId!, live_session_id: input.sessionId,
          position_seconds: input.positionSeconds, duration_seconds: input.durationSeconds ?? null, completed,
        },
        update: {
          position_seconds: input.positionSeconds,
          duration_seconds: input.durationSeconds ?? undefined,
          completed,
          last_played_at: new Date(),
        },
      });
    }),

  // Listener's own catch-up history, most recently played first.
  myCatchupHistory: protectedProcedure.query(async ({ ctx }) => {
    const rows = await prisma.catchupProgress.findMany({
      where: { user_id: ctx.userId },
      orderBy: { last_played_at: "desc" },
      take: 50,
      include: { session: { select: { id: true, show_title: true, started_at: true, recording_url: true } } },
    });
    return rows;
  }),
});
