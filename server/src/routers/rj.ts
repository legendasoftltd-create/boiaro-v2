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

  liveSession: router({
    current: publicProcedure.query(() =>
      prisma.liveSession.findFirst({
        where: { status: "live" },
        include: { station: true },
        orderBy: { started_at: "desc" },
      })
    ),

    start: protectedProcedure
      .input(z.object({ stationId: z.string() }))
      .mutation(({ ctx, input }) =>
        prisma.liveSession.create({
          data: {
            rj_user_id: ctx.userId,
            station_id: input.stationId,
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
