import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const followsRouter = router({
  isFollowing: protectedProcedure
    .input(z.object({ profileId: z.string() }))
    .query(async ({ ctx, input }) => {
      const f = await prisma.follow.findFirst({
        where: { follower_id: ctx.userId, followee_id: input.profileId },
      });
      return { following: !!f };
    }),

  countFor: publicProcedure
    .input(z.object({ profileId: z.string() }))
    .query(({ input }) =>
      prisma.follow.count({ where: { followee_id: input.profileId } })
    ),

  toggle: protectedProcedure
    .input(z.object({ profileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.follow.findFirst({
        where: { follower_id: ctx.userId, followee_id: input.profileId },
      });

      if (existing) {
        await prisma.follow.delete({ where: { id: existing.id } });
      } else {
        await prisma.follow.create({
          data: { follower_id: ctx.userId, followee_id: input.profileId },
        });
      }

      const count = await prisma.follow.count({ where: { followee_id: input.profileId } });
      return { following: !existing, count };
    }),
});
