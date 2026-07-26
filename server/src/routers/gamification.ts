import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { checkAndAwardBadges, getDailyRewardSchedule, advanceStreakForToday, projectStreakDay } from "../services/gamification.service.js";
import { getUserWeeklyReport } from "../services/weeklyReport.service.js";
import { getCompetitionRanking } from "../services/competition.service.js";

export const gamificationRouter = router({
  streaks: protectedProcedure.query(({ ctx }) =>
    prisma.userStreak.findUnique({ where: { user_id: ctx.userId } })
  ),

  updateStreak: protectedProcedure.mutation(({ ctx }) => advanceStreakForToday(ctx.userId!)),

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

  // Home Screen leaderboard — separate from the points-based `leaderboard`
  // above. Rolling windows (daily=24h, weekly=7d, monthly=30d) rather than
  // calendar-aligned, matching the "Last N days" convention already used in
  // admin reading analytics.
  homeLeaderboard: publicProcedure
    .input(z.object({
      period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
      metric: z.enum(["reading", "listening", "coins"]).default("reading"),
    }))
    .query(async ({ input }) => {
      const visibility = await prisma.platformSetting.findUnique({ where: { key: "gamification_leaderboard_visible" } });
      if (visibility?.value === "false") return [];

      const days = input.period === "daily" ? 1 : input.period === "weekly" ? 7 : 30;
      const since = new Date(Date.now() - days * 86400000);

      let rows: { user_id: string; total: number }[];
      if (input.metric === "coins") {
        const agg = await prisma.coinTransaction.groupBy({
          by: ["user_id"],
          where: { created_at: { gte: since }, type: { in: ["earn", "bonus"] } },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
          take: 20,
        });
        rows = agg.map((a) => ({ user_id: a.user_id, total: a._sum.amount ?? 0 }));
      } else {
        const format = input.metric === "reading" ? "ebook" : "audiobook";
        const agg = await prisma.contentConsumptionTime.groupBy({
          by: ["user_id"],
          where: { created_at: { gte: since }, format },
          _sum: { seconds: true },
          orderBy: { _sum: { seconds: "desc" } },
          take: 20,
        });
        rows = agg.map((a) => ({ user_id: a.user_id, total: a._sum.seconds ?? 0 }));
      }
      if (rows.length === 0) return [];

      const profiles = await prisma.profile.findMany({
        where: { user_id: { in: rows.map((r) => r.user_id) } },
        select: { user_id: true, display_name: true, avatar_url: true },
      });
      const pMap = new Map(profiles.map((p) => [p.user_id, p]));
      return rows.map((r, i) => ({
        rank: i + 1,
        user_id: r.user_id,
        total: r.total,
        display_name: pMap.get(r.user_id)?.display_name ?? null,
        avatar_url: pMap.get(r.user_id)?.avatar_url ?? null,
      }));
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

  myWeeklyReport: protectedProcedure.query(({ ctx }) => getUserWeeklyReport(ctx.userId!)),

  logConsumptionTime: protectedProcedure
    .input(z.object({ bookId: z.string(), format: z.string(), seconds: z.number().int().min(1) }))
    .mutation(({ ctx, input }) =>
      prisma.contentConsumptionTime.create({
        data: { user_id: ctx.userId, book_id: input.bookId, format: input.format, seconds: input.seconds },
      })
    ),

  // Day 1-7 escalating reward info for the current user, without claiming —
  // used to render the dialog before the user taps "claim".
  dailyRewardStatus: protectedProcedure.query(async ({ ctx }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [existing, streak, schedule] = await Promise.all([
      prisma.coinTransaction.findFirst({ where: { user_id: ctx.userId, source: "daily_login", created_at: { gte: todayStart } } }),
      prisma.userStreak.findUnique({ where: { user_id: ctx.userId } }),
      getDailyRewardSchedule(),
    ]);
    const day = projectStreakDay(streak);
    return { claimed_today: !!existing, day, schedule, reward: schedule[day - 1] };
  }),

  claimDailyReward: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await prisma.coinTransaction.findFirst({
      where: { user_id: userId, source: "daily_login", created_at: { gte: todayStart } },
    });
    if (existing) return { success: false, reason: "already_claimed" };

    // Advance the streak for today's claim — this is the only place the
    // 7-day cycle position comes from, so it must run before computing `day`.
    const [streak, schedule] = await Promise.all([advanceStreakForToday(userId), getDailyRewardSchedule()]);
    const day = ((streak.current_streak ?? 1) - 1) % 7 + 1;
    const REWARD = schedule[day - 1] ?? schedule[schedule.length - 1];

    await prisma.$transaction([
      prisma.coinTransaction.create({
        data: { user_id: userId, amount: REWARD, type: "earn", description: `Daily login reward (day ${day})`, source: "daily_login" },
      }),
      prisma.userCoin.upsert({
        where: { user_id: userId },
        create: { user_id: userId, balance: REWARD, total_earned: REWARD, total_spent: 0 },
        update: { balance: { increment: REWARD }, total_earned: { increment: REWARD } },
      }),
    ]);
    checkAndAwardBadges(userId).catch(() => null);
    return { success: true, reward: REWARD, day, schedule, current_streak: streak.current_streak };
  }),

  checkBadges: protectedProcedure.mutation(async ({ ctx }) => {
    const awarded = await checkAndAwardBadges(ctx.userId!);
    return { awarded: awarded.map((b) => b.key) };
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

      checkAndAwardBadges(ctx.userId!).catch(() => null);
      return { success: true, reward: AD_REWARD, new_balance: wallet.balance };
    }),

  // ── Spin Wheel ──────────────────────────────────────────────────────────
  spinWheelStatus: protectedProcedure.query(async ({ ctx }) => {
    const config = await prisma.spinWheelConfig.findFirst({ where: { is_active: true }, orderBy: { created_at: "desc" } });
    if (!config) return { available: false, segments: [], spinsToday: 0, spinsPerDay: 0, canSpin: false };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const spinsToday = await prisma.spinResult.count({ where: { user_id: ctx.userId, config_id: config.id, created_at: { gte: todayStart } } });
    return { available: true, segments: config.segments as any[], spinsToday, spinsPerDay: config.spins_per_day, canSpin: spinsToday < config.spins_per_day };
  }),

  spinWheel: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId!;
    const config = await prisma.spinWheelConfig.findFirst({ where: { is_active: true }, orderBy: { created_at: "desc" } });
    if (!config) return { success: false, reason: "not_configured" };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const spinsToday = await prisma.spinResult.count({ where: { user_id: userId, config_id: config.id, created_at: { gte: todayStart } } });
    if (spinsToday >= config.spins_per_day) return { success: false, reason: "daily_limit_reached" };

    const segments = config.segments as { label: string; coin_reward: number; weight: number }[];
    if (!Array.isArray(segments) || segments.length === 0) return { success: false, reason: "not_configured" };

    const totalWeight = segments.reduce((sum, seg) => sum + (seg.weight || 1), 0);
    let r = Math.random() * totalWeight;
    let chosen = segments[0];
    let chosenIndex = 0;
    for (let i = 0; i < segments.length; i++) {
      r -= segments[i].weight || 1;
      if (r <= 0) { chosen = segments[i]; chosenIndex = i; break; }
    }

    const ops: any[] = [prisma.spinResult.create({ data: { user_id: userId, config_id: config.id, segment_label: chosen.label, coin_reward: chosen.coin_reward } })];
    if (chosen.coin_reward > 0) {
      ops.push(
        prisma.coinTransaction.create({ data: { user_id: userId, amount: chosen.coin_reward, type: "earn", description: `Spin wheel: ${chosen.label}`, source: "spin_wheel" } }),
        prisma.userCoin.upsert({
          where: { user_id: userId },
          create: { user_id: userId, balance: chosen.coin_reward, total_earned: chosen.coin_reward, total_spent: 0 },
          update: { balance: { increment: chosen.coin_reward }, total_earned: { increment: chosen.coin_reward } },
        })
      );
    }
    await prisma.$transaction(ops);
    checkAndAwardBadges(userId).catch(() => null);
    return { success: true, segment: chosen, segmentIndex: chosenIndex, segments };
  }),

  // ── Quiz ────────────────────────────────────────────────────────────────
  listActiveQuizzes: protectedProcedure.query(async ({ ctx }) => {
    const quizzes = await prisma.quiz.findMany({ where: { is_active: true }, select: { id: true, title: true, description: true, coin_reward: true, pass_percentage: true } });
    if (quizzes.length === 0) return [];
    const attempts = await prisma.quizAttempt.findMany({
      where: { user_id: ctx.userId, quiz_id: { in: quizzes.map((q) => q.id) } },
      select: { quiz_id: true, score: true, total: true, passed: true, coin_reward: true },
    });
    const attemptMap = new Map(attempts.map((a) => [a.quiz_id, a]));
    return quizzes.map((q) => ({ ...q, attempt: attemptMap.get(q.id) ?? null }));
  }),

  getQuiz: protectedProcedure.input(z.object({ quizId: z.string() })).query(async ({ input }) => {
    const quiz = await prisma.quiz.findUnique({
      where: { id: input.quizId },
      include: { questions: { orderBy: { sort_order: "asc" }, select: { id: true, question: true, options: true, sort_order: true } } },
    });
    if (!quiz || !quiz.is_active) throw new TRPCError({ code: "NOT_FOUND" });
    return quiz; // correct_index intentionally not selected — never sent to the client pre-submit
  }),

  submitQuiz: protectedProcedure
    .input(z.object({ quizId: z.string(), answers: z.array(z.number().int()) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId!;
      const quiz = await prisma.quiz.findUnique({ where: { id: input.quizId }, include: { questions: { orderBy: { sort_order: "asc" } } } });
      if (!quiz) throw new TRPCError({ code: "NOT_FOUND" });

      let score = 0;
      quiz.questions.forEach((q, i) => { if (input.answers[i] === q.correct_index) score++; });
      const total = quiz.questions.length;
      const percentage = total > 0 ? (score / total) * 100 : 0;
      const passed = percentage >= quiz.pass_percentage;
      const reward = passed ? quiz.coin_reward : 0;

      const attempt = await prisma.quizAttempt
        .create({ data: { user_id: userId, quiz_id: input.quizId, score, total, passed, coin_reward: reward } })
        .catch(() => null);
      if (!attempt) return { success: false, reason: "already_attempted" };

      if (reward > 0) {
        await prisma.$transaction([
          prisma.coinTransaction.create({ data: { user_id: userId, amount: reward, type: "earn", description: `Quiz: ${quiz.title}`, source: "quiz_reward" } }),
          prisma.userCoin.upsert({
            where: { user_id: userId },
            create: { user_id: userId, balance: reward, total_earned: reward, total_spent: 0 },
            update: { balance: { increment: reward }, total_earned: { increment: reward } },
          }),
        ]);
      }
      checkAndAwardBadges(userId).catch(() => null);
      return { success: true, score, total, passed, reward, correctIndexes: quiz.questions.map((q) => q.correct_index) };
    }),

  // ── Mega Competitions ───────────────────────────────────────────────────
  listCompetitions: publicProcedure.query(() =>
    prisma.competition.findMany({ where: { status: { in: ["active", "completed"] } }, orderBy: { start_at: "desc" }, take: 10 })
  ),

  competitionLeaderboard: publicProcedure
    .input(z.object({ competitionId: z.string() }))
    .query(async ({ input }) => {
      const comp = await prisma.competition.findUnique({ where: { id: input.competitionId } });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND" });
      return getCompetitionRanking(comp, 20);
    }),
});
