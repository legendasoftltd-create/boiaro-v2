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
      where: { user_id: ctx.userId, status: "active" },
      orderBy: { created_at: "desc" },
    })
  ),

  addGoal: protectedProcedure
    .input(z.object({ goalType: z.string(), targetValue: z.number().int().min(1), period: z.string().default("daily") }))
    .mutation(({ ctx, input }) =>
      prisma.userGoal.create({
        data: { user_id: ctx.userId, goal_type: input.goalType, target_value: input.targetValue, period: input.period, status: "active" },
      })
    ),

  leaderboard: protectedProcedure.query(async () => {
    const results = await prisma.gamificationPoint.groupBy({
      by: ["user_id"],
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 50,
    });
    if (results.length === 0) return [];
    const userIds = results.map((r) => r.user_id);
    const profiles = await prisma.profile.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, display_name: true },
    });
    const pMap = new Map(profiles.map((p) => [p.user_id, p.display_name]));
    return results.map((r) => ({
      user_id: r.user_id,
      total: r._sum.points ?? 0,
      display_name: pMap.get(r.user_id) ?? null,
    })).slice(0, 20);
  }),

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

    const setting = await prisma.platformSetting.findUnique({ where: { key: "coin_daily_login_reward" } });
    const DAILY_REWARD = parseInt(setting?.value || "10", 10);

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

  checkBadges: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId!;

    const [allBadges, earnedBadgeIds, streak, unlockCount, adCount, dailyCount, referralCount] = await Promise.all([
      prisma.badgeDefinition.findMany({ where: { is_active: true } }),
      prisma.userBadge.findMany({ where: { user_id: userId }, select: { badge_id: true } }).then(r => new Set(r.map(b => b.badge_id))),
      prisma.userStreak.findUnique({ where: { user_id: userId } }),
      prisma.contentUnlock.count({ where: { user_id: userId, status: "active" } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "ad_reward" } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "daily_login" } }),
      prisma.referral.count({ where: { referrer_id: userId, status: "completed" } }),
    ]);

    const awarded: string[] = [];

    for (const badge of allBadges) {
      if (earnedBadgeIds.has(badge.id)) continue;

      const threshold = badge.condition_value ?? 1;
      let earned = false;

      switch (badge.condition_type) {
        case "unlock_count": earned = unlockCount >= threshold; break;
        case "streak": earned = (streak?.current_streak ?? 0) >= threshold; break;
        case "ad_count": earned = adCount >= threshold; break;
        case "daily_login_count": earned = dailyCount >= threshold; break;
        case "referral_count": earned = referralCount >= threshold; break;
        case "first_unlock": earned = unlockCount >= 1; break;
        case "first_referral": earned = referralCount >= 1; break;
        default: break;
      }

      if (earned) {
        await prisma.userBadge.create({ data: { user_id: userId, badge_id: badge.id } }).catch(() => null);
        if (badge.coin_reward && badge.coin_reward > 0) {
          await prisma.$transaction([
            prisma.coinTransaction.create({
              data: { user_id: userId, amount: badge.coin_reward, type: "bonus", description: `ব্যাজ পুরস্কার: ${badge.title}`, source: "badge_reward" },
            }),
            prisma.userCoin.upsert({
              where: { user_id: userId },
              create: { user_id: userId, balance: badge.coin_reward, total_earned: badge.coin_reward, total_spent: 0 },
              update: { balance: { increment: badge.coin_reward }, total_earned: { increment: badge.coin_reward } },
            }),
          ]).catch(() => null);
        }
        awarded.push(badge.key);
      }
    }

    return { awarded };
  }),

  adRewardStatus: protectedProcedure.query(async ({ ctx }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [settings, todayCount, lastAd] = await Promise.all([
      prisma.platformSetting.findMany({ where: { key: { in: ["ad_max_per_day", "ad_rewarded_coins", "ad_cooldown_minutes"] } } }),
      prisma.coinTransaction.count({ where: { user_id: ctx.userId, source: "ad_reward", created_at: { gte: todayStart } } }),
      prisma.coinTransaction.findFirst({ where: { user_id: ctx.userId, source: "ad_reward" }, orderBy: { created_at: "desc" } }),
    ]);

    const sMap: Record<string, string> = {};
    settings.forEach(s => { sMap[s.key] = s.value; });
    const dailyLimit = parseInt(sMap["ad_max_per_day"] || "10", 10);
    const coinPerAd = parseInt(sMap["ad_rewarded_coins"] || "1", 10);
    const cooldownMinutes = parseInt(sMap["ad_cooldown_minutes"] || "5", 10);
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const lastAdAt = lastAd?.created_at ?? null;
    const cooldownEndsAt = lastAdAt ? new Date(lastAdAt.getTime() + cooldownMs) : null;
    const cooldownSecondsLeft = cooldownEndsAt && cooldownEndsAt > new Date()
      ? Math.ceil((cooldownEndsAt.getTime() - Date.now()) / 1000)
      : 0;

    return { todayCount, dailyLimit, coinPerAd, cooldownSecondsLeft };
  }),

  claimAdReward: protectedProcedure
    .input(z.object({ placement: z.string().default("general") }))
    .mutation(async ({ ctx, input }) => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [settings, todayCount, lastAd] = await Promise.all([
        prisma.platformSetting.findMany({ where: { key: { in: ["ad_max_per_day", "ad_rewarded_coins", "ad_cooldown_minutes"] } } }),
        prisma.coinTransaction.count({ where: { user_id: ctx.userId, source: "ad_reward", created_at: { gte: todayStart } } }),
        prisma.coinTransaction.findFirst({ where: { user_id: ctx.userId, source: "ad_reward" }, orderBy: { created_at: "desc" } }),
      ]);

      const sMap: Record<string, string> = {};
      settings.forEach(s => { sMap[s.key] = s.value; });
      const MAX_PER_DAY = parseInt(sMap["ad_max_per_day"] || "10", 10);
      const AD_REWARD = parseInt(sMap["ad_rewarded_coins"] || "1", 10);
      const cooldownMinutes = parseInt(sMap["ad_cooldown_minutes"] || "5", 10);

      if (todayCount >= MAX_PER_DAY) return { success: false, reason: "daily_limit_reached", new_balance: 0, reward: 0 };

      // Server-side cooldown check — skipped for quick_unlock placement to avoid blocking rapid session
      if (!input.placement.startsWith("quick_unlock") && cooldownMinutes > 0 && lastAd) {
        const cooldownMs = cooldownMinutes * 60 * 1000;
        if (Date.now() - lastAd.created_at.getTime() < cooldownMs) {
          return { success: false, reason: "cooldown", new_balance: 0, reward: 0 };
        }
      }

      const [, wallet] = await prisma.$transaction([
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

      // Log to RewardedAdLog for analytics
      await prisma.rewardedAdLog.create({
        data: { user_id: ctx.userId, ad_event_id: `${input.placement}_${Date.now()}`, placement_key: input.placement, coins_rewarded: AD_REWARD, status: "completed" },
      }).catch(() => null);

      return { success: true, reward: AD_REWARD, new_balance: wallet.balance };
    }),
});
