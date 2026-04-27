import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

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

  liveSession: router({
    current: publicProcedure.query(() =>
      prisma.liveSession.findFirst({
        where: { status: "live" },
        include: { station: true },
        orderBy: { started_at: "desc" },
      })
    ),

    start: protectedProcedure
      .input(z.object({
        streamUrl: z.string().min(1),
        showTitle: z.string().optional(),
        stationId: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        prisma.liveSession.create({
          data: {
            rj_user_id: ctx.userId,
            station_id: input.stationId ?? null,
            stream_url: input.streamUrl,
            show_title: input.showTitle ?? null,
            status: "live",
            started_at: new Date(),
          },
        })
      ),

    end: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(({ input }) =>
        prisma.liveSession.update({
          where: { id: input.sessionId },
          data: { status: "ended", ended_at: new Date() },
        })
      ),
  }),

  profiles: publicProcedure.query(() =>
    prisma.rjProfile.findMany({
      where: { is_active: true, is_approved: true },
      orderBy: { created_at: "desc" },
    })
  ),
});
