import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";
import { checkAndAwardBadges, getDailyRewardSchedule, advanceStreakForToday, projectStreakDay } from "../../services/gamification.service.js";
import { getUserWeeklyReport } from "../../services/weeklyReport.service.js";
import { getCompetitionRanking } from "../../services/competition.service.js";
import { dhakaPeriodBounds } from "../../lib/timezone.js";

export const gamificationRestRouter = Router();

// ── GET /api/v1/gamification/summary ────────────────────────────────────────
// Auth required. One-shot summary: streak + points + badges + wallet.
gamificationRestRouter.get("/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const [streak, pointsAgg, badges, wallet] = await Promise.all([
      prisma.userStreak.findUnique({ where: { user_id: userId } }),
      prisma.gamificationPoint.aggregate({ where: { user_id: userId }, _sum: { points: true } }),
      prisma.userBadge.findMany({ where: { user_id: userId }, include: { badge: true }, orderBy: { earned_at: "desc" } }),
      prisma.userCoin.findUnique({ where: { user_id: userId } }),
    ]);
    res.json({
      streak: {
        current: streak?.current_streak ?? 0,
        best: streak?.best_streak ?? 0,
        last_activity_date: streak?.last_activity_date ?? null,
      },
      total_points: pointsAgg._sum.points ?? 0,
      badge_count: badges.length,
      badges: badges.map(b => ({ id: b.badge.id, key: b.badge.key, title: b.badge.title, earned_at: b.earned_at })),
      wallet: { balance: wallet?.balance ?? 0, total_earned: wallet?.total_earned ?? 0, total_spent: wallet?.total_spent ?? 0 },
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/streak ─────────────────────────────────────────
gamificationRestRouter.get("/streak", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const streak = await prisma.userStreak.findUnique({ where: { user_id: req.auth.userId! } });
    res.json(streak ?? { current_streak: 0, best_streak: 0, last_activity_date: null });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/streak/update ──────────────────────────────────
// Call once per day on app open. Increments streak if consecutive, resets otherwise.
gamificationRestRouter.post("/streak/update", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await advanceStreakForToday(req.auth.userId!);
    res.json(updated);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/points ──────────────────────────────────────────
gamificationRestRouter.get("/points", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const [agg, history] = await Promise.all([
      prisma.gamificationPoint.aggregate({ where: { user_id: req.auth.userId! }, _sum: { points: true } }),
      prisma.gamificationPoint.findMany({
        where: { user_id: req.auth.userId! },
        orderBy: { created_at: "desc" },
        take: limit,
      }),
    ]);
    res.json({ total: agg._sum.points ?? 0, history });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/points ─────────────────────────────────────────
// Body: { points: number, event_type: string, reference_id?: string }
gamificationRestRouter.post("/points", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({ points: z.number().int().min(1), event_type: z.string(), reference_id: z.string().optional() });
    const input = schema.parse(req.body);
    const record = await prisma.gamificationPoint.create({
      data: { user_id: req.auth.userId!, points: input.points, event_type: input.event_type, reference_id: input.reference_id },
    });
    res.json(record);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/leaderboard ────────────────────────────────────
gamificationRestRouter.get("/leaderboard", requireAuth, async (_req, res) => {
  try {
    const results = await prisma.gamificationPoint.groupBy({
      by: ["user_id"],
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 50,
    });
    if (results.length === 0) { res.json({ leaderboard: [] }); return; }
    const profiles = await prisma.profile.findMany({
      where: { user_id: { in: results.map(r => r.user_id) } },
      select: { user_id: true, display_name: true, avatar_url: true },
    });
    const pMap = new Map(profiles.map(p => [p.user_id, p]));
    res.json({
      leaderboard: results.slice(0, 20).map((r, i) => ({
        rank: i + 1,
        user_id: r.user_id,
        total_points: r._sum.points ?? 0,
        display_name: pMap.get(r.user_id)?.display_name ?? null,
        avatar_url: pMap.get(r.user_id)?.avatar_url ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/leaderboard/home ─────────────────────────────────
// Public. Home Screen leaderboard — ?period=daily|weekly|monthly&metric=reading|listening|coins
gamificationRestRouter.get("/leaderboard/home", async (req, res) => {
  try {
    const visibility = await prisma.platformSetting.findUnique({ where: { key: "gamification_leaderboard_visible" } });
    if (visibility?.value === "false") { res.json({ leaderboard: [] }); return; }

    const period = (["daily", "weekly", "monthly"].includes(String(req.query.period)) ? String(req.query.period) : "weekly") as "daily" | "weekly" | "monthly";
    const metric = ["reading", "listening", "coins"].includes(String(req.query.metric)) ? String(req.query.metric) : "reading";
    const { start, end } = dhakaPeriodBounds(period);

    let rows: { user_id: string; total: number }[];
    if (metric === "coins") {
      const agg = await prisma.coinTransaction.groupBy({
        by: ["user_id"],
        where: { created_at: { gte: start, lte: end }, type: { in: ["earn", "bonus"] } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 20,
      });
      rows = agg.map((a) => ({ user_id: a.user_id, total: a._sum.amount ?? 0 }));
    } else {
      const format = metric === "reading" ? "ebook" : "audiobook";
      const agg = await prisma.contentConsumptionTime.groupBy({
        by: ["user_id"],
        where: { created_at: { gte: start, lte: end }, format },
        _sum: { seconds: true },
        orderBy: { _sum: { seconds: "desc" } },
        take: 20,
      });
      rows = agg.map((a) => ({ user_id: a.user_id, total: a._sum.seconds ?? 0 }));
    }
    if (rows.length === 0) { res.json({ leaderboard: [] }); return; }

    const profiles = await prisma.profile.findMany({
      where: { user_id: { in: rows.map((r) => r.user_id) } },
      select: { user_id: true, display_name: true, avatar_url: true },
    });
    const pMap = new Map(profiles.map((p) => [p.user_id, p]));
    res.json({
      leaderboard: rows.map((r, i) => ({
        rank: i + 1,
        user_id: r.user_id,
        total: r.total,
        display_name: pMap.get(r.user_id)?.display_name ?? null,
        avatar_url: pMap.get(r.user_id)?.avatar_url ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/badges ─────────────────────────────────────────
// Returns user's earned badges.
gamificationRestRouter.get("/badges", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const badges = await prisma.userBadge.findMany({
      where: { user_id: req.auth.userId! },
      include: { badge: true },
      orderBy: { earned_at: "desc" },
    });
    res.json({ badges: badges.map(b => ({ ...b.badge, earned_at: b.earned_at })) });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/badges/definitions ───────────────────────────────
// Public-ish. Returns all badge definitions (what badges exist and how to earn them).
gamificationRestRouter.get("/badges/definitions", requireAuth, async (_req, res) => {
  try {
    const definitions = await prisma.badgeDefinition.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
    res.json({ definitions });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/badges/check ───────────────────────────────────
// Evaluates all badge conditions for the current user and auto-awards earned ones.
gamificationRestRouter.post("/badges/check", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const awarded = await checkAndAwardBadges(req.auth.userId!);
    res.json({ awarded, awarded_count: awarded.length });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/goals ──────────────────────────────────────────
gamificationRestRouter.get("/goals", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const goals = await prisma.userGoal.findMany({
      where: { user_id: req.auth.userId!, status: "active" },
      orderBy: { created_at: "desc" },
    });
    res.json({ goals });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/goals ─────────────────────────────────────────
// Body: { goal_type: string, target_value: number, period?: "daily"|"weekly"|"monthly" }
gamificationRestRouter.post("/goals", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({ goal_type: z.string(), target_value: z.number().int().min(1), period: z.enum(["daily", "weekly", "monthly"]).default("daily") });
    const input = schema.parse(req.body);
    const goal = await prisma.userGoal.create({
      data: { user_id: req.auth.userId!, goal_type: input.goal_type, target_value: input.target_value, period: input.period, status: "active", started_at: new Date() },
    });
    res.json(goal);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/daily-reward/status ─────────────────────────────
// Day 1-7 escalating reward preview, without claiming.
gamificationRestRouter.get("/daily-reward/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [existing, streak, schedule] = await Promise.all([
      prisma.coinTransaction.findFirst({ where: { user_id: userId, source: "daily_login", created_at: { gte: todayStart } } }),
      prisma.userStreak.findUnique({ where: { user_id: userId } }),
      getDailyRewardSchedule(),
    ]);
    const day = projectStreakDay(streak);
    res.json({ claimed_today: !!existing, day, schedule, reward: schedule[day - 1] });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/daily-reward ───────────────────────────────────
// Claim the day's escalating (Day 1-7) login reward. Once per calendar day.
gamificationRestRouter.post("/daily-reward", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existing = await prisma.coinTransaction.findFirst({
      where: { user_id: userId, source: "daily_login", created_at: { gte: todayStart } },
    });
    if (existing) {
      res.status(400).json({ success: false, reason: "already_claimed", message: "Daily reward already claimed today" });
      return;
    }
    const [streak, schedule] = await Promise.all([advanceStreakForToday(userId), getDailyRewardSchedule()]);
    const day = ((streak.current_streak ?? 1) - 1) % 7 + 1;
    const REWARD = schedule[day - 1] ?? schedule[schedule.length - 1];
    const [, wallet] = await prisma.$transaction([
      prisma.coinTransaction.create({ data: { user_id: userId, amount: REWARD, type: "earn", description: `Daily login reward (day ${day})`, source: "daily_login" } }),
      prisma.userCoin.upsert({ where: { user_id: userId }, create: { user_id: userId, balance: REWARD, total_earned: REWARD, total_spent: 0 }, update: { balance: { increment: REWARD }, total_earned: { increment: REWARD } } }),
    ]);
    checkAndAwardBadges(userId).catch(() => null);
    res.json({ success: true, reward: REWARD, day, schedule, current_streak: streak.current_streak, new_balance: wallet.balance });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/activity ───────────────────────────────────────
// Body: { action, activity_type?, book_id?, format?, page?, metadata? }
gamificationRestRouter.post("/activity", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      action: z.string(),
      activity_type: z.string().optional(),
      book_id: z.string().optional(),
      format: z.string().optional(),
      page: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const input = schema.parse(req.body);
    const record = await prisma.userActivityLog.create({
      data: { user_id: req.auth.userId!, action: input.action, activity_type: input.activity_type, book_id: input.book_id, format: input.format, page: input.page, metadata: input.metadata as any },
    });
    res.json({ recorded: true, id: record.id });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/weekly-report ────────────────────────────────────
gamificationRestRouter.get("/weekly-report", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const report = await getUserWeeklyReport(req.auth.userId!);
    res.json(report);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/consumption-time ───────────────────────────────
// Body: { book_id, format, seconds }
gamificationRestRouter.post("/consumption-time", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({ book_id: z.string(), format: z.string(), seconds: z.number().int().min(1) });
    const input = schema.parse(req.body);
    await prisma.contentConsumptionTime.create({
      data: { user_id: req.auth.userId!, book_id: input.book_id, format: input.format, seconds: input.seconds },
    });
    res.json({ recorded: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/spin-wheel/status ────────────────────────────────
gamificationRestRouter.get("/spin-wheel/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const config = await prisma.spinWheelConfig.findFirst({ where: { is_active: true }, orderBy: { created_at: "desc" } });
    if (!config) { res.json({ available: false, segments: [], spinsToday: 0, spinsPerDay: 0, canSpin: false }); return; }
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const spinsToday = await prisma.spinResult.count({ where: { user_id: userId, config_id: config.id, created_at: { gte: todayStart } } });
    res.json({ available: true, segments: config.segments, spinsToday, spinsPerDay: config.spins_per_day, canSpin: spinsToday < config.spins_per_day });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/spin-wheel/spin ─────────────────────────────────
gamificationRestRouter.post("/spin-wheel/spin", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const config = await prisma.spinWheelConfig.findFirst({ where: { is_active: true }, orderBy: { created_at: "desc" } });
    if (!config) { res.json({ success: false, reason: "not_configured" }); return; }

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const spinsToday = await prisma.spinResult.count({ where: { user_id: userId, config_id: config.id, created_at: { gte: todayStart } } });
    if (spinsToday >= config.spins_per_day) { res.json({ success: false, reason: "daily_limit_reached" }); return; }

    const segments = config.segments as { label: string; coin_reward: number; weight: number }[];
    if (!Array.isArray(segments) || segments.length === 0) { res.json({ success: false, reason: "not_configured" }); return; }

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
    res.json({ success: true, segment: chosen, segmentIndex: chosenIndex, segments });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/quizzes ──────────────────────────────────────────
gamificationRestRouter.get("/quizzes", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const quizzes = await prisma.quiz.findMany({ where: { is_active: true }, select: { id: true, title: true, description: true, coin_reward: true, pass_percentage: true } });
    const attempts = quizzes.length
      ? await prisma.quizAttempt.findMany({ where: { user_id: req.auth.userId!, quiz_id: { in: quizzes.map(q => q.id) } }, select: { quiz_id: true, score: true, total: true, passed: true, coin_reward: true } })
      : [];
    const attemptMap = new Map(attempts.map(a => [a.quiz_id, a]));
    res.json({ quizzes: quizzes.map(q => ({ ...q, attempt: attemptMap.get(q.id) ?? null })) });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/quizzes/:id ──────────────────────────────────────
gamificationRestRouter.get("/quizzes/:id", requireAuth, async (req, res) => {
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: String(req.params.id) },
      include: { questions: { orderBy: { sort_order: "asc" }, select: { id: true, question: true, options: true, sort_order: true } } },
    });
    if (!quiz || !quiz.is_active) { res.status(404).json({ error: "Quiz not found" }); return; }
    res.json(quiz);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/quizzes/:id/submit ──────────────────────────────
// Body: { answers: number[] }
gamificationRestRouter.post("/quizzes/:id/submit", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const quizId = String(req.params.id);
    const answers: number[] = Array.isArray(req.body?.answers) ? req.body.answers : [];

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: { orderBy: { sort_order: "asc" } } } });
    if (!quiz) { res.status(404).json({ error: "Quiz not found" }); return; }

    let score = 0;
    quiz.questions.forEach((q, i) => { if (answers[i] === q.correct_index) score++; });
    const total = quiz.questions.length;
    const percentage = total > 0 ? (score / total) * 100 : 0;
    const passed = percentage >= quiz.pass_percentage;
    const reward = passed ? quiz.coin_reward : 0;

    const attempt = await prisma.quizAttempt.create({ data: { user_id: userId, quiz_id: quizId, score, total, passed, coin_reward: reward } }).catch(() => null);
    if (!attempt) { res.json({ success: false, reason: "already_attempted" }); return; }

    if (reward > 0) {
      await prisma.$transaction([
        prisma.coinTransaction.create({ data: { user_id: userId, amount: reward, type: "earn", description: `Quiz: ${quiz.title}`, source: "quiz_reward" } }),
        prisma.userCoin.upsert({ where: { user_id: userId }, create: { user_id: userId, balance: reward, total_earned: reward, total_spent: 0 }, update: { balance: { increment: reward }, total_earned: { increment: reward } } }),
      ]);
    }
    checkAndAwardBadges(userId).catch(() => null);
    res.json({ success: true, score, total, passed, reward, correctIndexes: quiz.questions.map(q => q.correct_index) });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/competitions ──────────────────────────────────────
gamificationRestRouter.get("/competitions", async (_req, res) => {
  try {
    const competitions = await prisma.competition.findMany({ where: { status: { in: ["active", "completed"] } }, orderBy: { start_at: "desc" }, take: 10 });
    res.json({ competitions });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/gamification/competitions/:id/leaderboard ──────────────────────
gamificationRestRouter.get("/competitions/:id/leaderboard", async (req, res) => {
  try {
    const comp = await prisma.competition.findUnique({ where: { id: String(req.params.id) } });
    if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }
    const leaderboard = await getCompetitionRanking(comp, 20);
    res.json({ leaderboard });
  } catch (error) {
    sendHttpError(res, error);
  }
});
