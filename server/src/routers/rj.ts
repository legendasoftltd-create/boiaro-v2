import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { getListenerCount } from "../realtime/socket.js";
import { notifyUser } from "../lib/notify.js";

async function assertHostOrModerator(userId: string, session: { rj_user_id: string }) {
  if (userId === session.rj_user_id) return;
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "Only the host or a moderator can do this" });
}

// "Follow" an RJ (via the generic Follow model, followee_id = rj_user_id)
// to get notified whenever they go live — no separate favorite-show model.
async function notifyFollowersOfGoLive(rjUserId: string, stageName: string, showTitle?: string): Promise<void> {
  const followers = await prisma.follow.findMany({ where: { followee_id: rjUserId }, select: { follower_id: true } });
  for (const f of followers) {
    await notifyUser(f.follower_id, {
      title: `🎙️ ${stageName} লাইভে এসেছেন!`,
      message: showTitle ? `"${showTitle}" এখনই শুনুন।` : "এখনই লাইভ শুনুন।",
      type: "rj_live",
      link: "/live",
      preferenceKey: "reminder_enabled",
    }).catch(() => null);
  }
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
    }))
    .mutation(({ ctx, input }) =>
      prisma.rjProfile.update({
        where: { user_id: ctx.userId },
        data: {
          stage_name: input.stageName,
          bio: input.bio ?? null,
          specialty: input.specialty ?? null,
        },
      })
    ),

  mySessions: protectedProcedure.query(({ ctx }) =>
    prisma.liveSession.findMany({
      where: { rj_user_id: ctx.userId },
      orderBy: { started_at: "desc" },
      take: 10,
    })
  ),

  // This platform doesn't record streams server-side — catch-up audio only
  // exists once the RJ (or admin) manually attaches a recording URL after
  // the show ends.
  attachRecording: protectedProcedure
    .input(z.object({ sessionId: z.string(), recordingUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.liveSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertHostOrModerator(ctx.userId!, session);
      return prisma.liveSession.update({ where: { id: input.sessionId }, data: { recording_url: input.recordingUrl } });
    }),

  // Public podcast-style archive — ended sessions with a recording attached.
  catchupSessions: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20), cursor: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const sessions = await prisma.liveSession.findMany({
        where: { status: "ended", recording_url: { not: null } },
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
    // linked), so the RJ's display info is fetched separately and merged —
    // the frontend has been expecting `rj_profile` on this response since
    // it was written, but it was never actually populated.
    current: publicProcedure.query(async () => {
      const session = await prisma.liveSession.findFirst({
        where: { status: "live" },
        include: { station: true },
        orderBy: { started_at: "desc" },
      });
      if (!session) return null;
      const rjProfile = await prisma.rjProfile.findUnique({ where: { user_id: session.rj_user_id } });
      return { ...session, rj_profile: rjProfile };
    }),

    start: protectedProcedure
      .input(z.object({
        streamUrl: z.string().min(1),
        showTitle: z.string().optional(),
        stationId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const profile = await prisma.rjProfile.findUnique({ where: { user_id: ctx.userId } });
        if (!profile || !profile.is_approved) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only approved RJs can start a live session" });
        }
        const session = await prisma.liveSession.create({
          data: {
            rj_user_id: ctx.userId,
            station_id: input.stationId ?? null,
            stream_url: input.streamUrl,
            show_title: input.showTitle ?? null,
            status: "live",
            started_at: new Date(),
          },
        });

        notifyFollowersOfGoLive(ctx.userId!, profile.stage_name, input.showTitle).catch(() => null);
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
        return prisma.liveSession.update({
          where: { id: input.sessionId },
          data: { status: "ended", ended_at: new Date() },
        });
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
          orderBy: { created_at: "desc" },
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
  }),

  profiles: publicProcedure.query(() =>
    prisma.rjProfile.findMany({
      where: { is_active: true, is_approved: true },
      orderBy: { created_at: "desc" },
    })
  ),

  profileById: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) =>
      prisma.rjProfile.findFirst({ where: { user_id: input.userId, is_active: true, is_approved: true } })
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
});
