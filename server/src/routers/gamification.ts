import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const gamificationRouter = router({
  streaks: protectedProcedure.query(({ ctx }) =>
    prisma.userStreak.findUnique({ where: { user_id: ctx.userId } })
  ),

  updateStreak: protectedProcedure.mutation(async ({ ctx }) => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await prisma.userStreak.findUnique({ where: { user_id: ctx.userId } });

    if (!existing) {
      return prisma.userStreak.create({
        data: { user_id: ctx.userId, current_streak: 1, best_streak: 1, last_activity_date: today },
      });
    }

    const lastDate = existing.last_activity_date;
    if (lastDate === today) return existing;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = lastDate === yesterday ? (existing.current_streak ?? 0) + 1 : 1;
    const bestStreak = Math.max(newStreak, existing.best_streak ?? 0);

    return prisma.userStreak.update({
      where: { user_id: ctx.userId },
      data: { current_streak: newStreak, best_streak: bestStreak, last_activity_date: today },
    });
  }),

  addPoints: protectedProcedure
    .input(
      z.object({
        points: z.number().int().min(1),
        eventType: z.string(),
        referenceId: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.gamificationPoint.create({
        data: {
          user_id: ctx.userId,
          points: input.points,
          event_type: input.eventType,
          reference_id: input.referenceId,
        },
      })
    ),

  totalPoints: protectedProcedure.query(async ({ ctx }) => {
    const result = await prisma.gamificationPoint.aggregate({
      where: { user_id: ctx.userId },
      _sum: { points: true },
    });
    return { total: result._sum.points ?? 0 };
  }),

  badges: protectedProcedure.query(({ ctx }) =>
    prisma.userBadge.findMany({
      where: { user_id: ctx.userId },
      include: { badge: true },
      orderBy: { earned_at: "desc" },
    })
  ),

  badgeDefinitions: protectedProcedure.query(() =>
    prisma.badgeDefinition.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  goals: protectedProcedure.query(({ ctx }) =>
    prisma.userGoal.findMany({
      where: { user_id: ctx.userId },
      orderBy: { created_at: "desc" },
    })
  ),

  logActivity: protectedProcedure
    .input(
      z.object({
        action: z.string(),
        activityType: z.string().optional(),
        bookId: z.string().optional(),
        format: z.string().optional(),
        page: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.userActivityLog.create({
        data: {
          user_id: ctx.userId,
          action: input.action,
          activity_type: input.activityType,
          book_id: input.bookId,
          format: input.format,
          page: input.page,
          metadata: input.metadata as any,
        },
      })
    ),

  logConsumptionTime: protectedProcedure
    .input(z.object({ bookId: z.string(), format: z.string(), seconds: z.number().int().min(1) }))
    .mutation(({ ctx, input }) =>
      prisma.contentConsumptionTime.create({
        data: { user_id: ctx.userId, book_id: input.bookId, format: input.format, seconds: input.seconds },
      })
    ),

  claimDailyReward: protectedProcedure.mutation(async ({ ctx }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await prisma.coinTransaction.findFirst({
      where: { user_id: ctx.userId, source: "daily_login", created_at: { gte: todayStart } },
    });
    if (existing) return { success: false, reason: "already_claimed" };

    const DAILY_REWARD = 10;
    await prisma.$transaction([
      prisma.coinTransaction.create({
        data: { user_id: ctx.userId, amount: DAILY_REWARD, type: "earn", description: "Daily login reward", source: "daily_login" },
      }),
      prisma.userCoin.upsert({
        where: { user_id: ctx.userId },
        create: { user_id: ctx.userId, balance: DAILY_REWARD, total_earned: DAILY_REWARD, total_spent: 0 },
        update: { balance: { increment: DAILY_REWARD }, total_earned: { increment: DAILY_REWARD } },
      }),
    ]);
    return { success: true, reward: DAILY_REWARD };
  }),

  claimAdReward: protectedProcedure
    .input(z.object({ placement: z.string().default("general") }))
    .mutation(async ({ ctx, input }) => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const MAX_PER_DAY = 5;
      const AD_REWARD = 5;

      const todayCount = await prisma.coinTransaction.count({
        where: { user_id: ctx.userId, source: "ad_reward", created_at: { gte: todayStart } },
      });
      if (todayCount >= MAX_PER_DAY) return { success: false, reason: "daily_limit_reached" };

      await prisma.$transaction([
        prisma.coinTransaction.create({
          data: {
            user_id: ctx.userId,
            amount: AD_REWARD,
            type: "earn",
            description: `Ad reward - ${input.placement}`,
            source: "ad_reward",
            reference_id: input.placement,
          },
        }),
        prisma.userCoin.upsert({
          where: { user_id: ctx.userId },
          create: { user_id: ctx.userId, balance: AD_REWARD, total_earned: AD_REWARD, total_spent: 0 },
          update: { balance: { increment: AD_REWARD }, total_earned: { increment: AD_REWARD } },
        }),
      ]);
      return { success: true, reward: AD_REWARD };
    }),
});
