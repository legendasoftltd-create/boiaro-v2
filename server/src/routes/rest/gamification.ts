import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";

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
    const userId = req.auth.userId!;
    const today = new Date().toISOString().slice(0, 10);
    const existing = await prisma.userStreak.findUnique({ where: { user_id: userId } });
    if (!existing) {
      const created = await prisma.userStreak.create({
        data: { user_id: userId, current_streak: 1, best_streak: 1, last_activity_date: today },
      });
      res.json(created);
      return;
    }
    if (existing.last_activity_date === today) { res.json(existing); return; }
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = existing.last_activity_date === yesterday ? (existing.current_streak ?? 0) + 1 : 1;
    const bestStreak = Math.max(newStreak, existing.best_streak ?? 0);
    const updated = await prisma.userStreak.update({
      where: { user_id: userId },
      data: { current_streak: newStreak, best_streak: bestStreak, last_activity_date: today },
    });
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
    const userId = req.auth.userId!;
    const [allBadges, earnedSet, streak, unlockCount, adCount, dailyCount, referralCount] = await Promise.all([
      prisma.badgeDefinition.findMany({ where: { is_active: true } }),
      prisma.userBadge.findMany({ where: { user_id: userId }, select: { badge_id: true } }).then(r => new Set(r.map(b => b.badge_id))),
      prisma.userStreak.findUnique({ where: { user_id: userId } }),
      prisma.contentUnlock.count({ where: { user_id: userId, status: "active" } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "ad_reward" } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "daily_login" } }),
      prisma.referral.count({ where: { referrer_id: userId, status: "completed" } }),
    ]);

    const awarded: Array<{ key: string; title: string; coin_reward: number | null }> = [];
    for (const badge of allBadges) {
      if (earnedSet.has(badge.id)) continue;
      const threshold = badge.condition_value ?? 1;
      let earned = false;
      switch (badge.condition_type) {
        case "unlock_count":       earned = unlockCount >= threshold; break;
        case "streak":             earned = (streak?.current_streak ?? 0) >= threshold; break;
        case "ad_count":           earned = adCount >= threshold; break;
        case "daily_login_count":  earned = dailyCount >= threshold; break;
        case "referral_count":     earned = referralCount >= threshold; break;
        case "first_unlock":       earned = unlockCount >= 1; break;
        case "first_referral":     earned = referralCount >= 1; break;
      }
      if (earned) {
        await prisma.userBadge.create({ data: { user_id: userId, badge_id: badge.id } }).catch(() => null);
        if (badge.coin_reward && badge.coin_reward > 0) {
          await prisma.$transaction([
            prisma.coinTransaction.create({ data: { user_id: userId, amount: badge.coin_reward, type: "bonus", description: `Badge reward: ${badge.title}`, source: "badge_reward" } }),
            prisma.userCoin.upsert({ where: { user_id: userId }, create: { user_id: userId, balance: badge.coin_reward, total_earned: badge.coin_reward, total_spent: 0 }, update: { balance: { increment: badge.coin_reward }, total_earned: { increment: badge.coin_reward } } }),
          ]).catch(() => null);
        }
        awarded.push({ key: badge.key, title: badge.title, coin_reward: badge.coin_reward ?? null });
      }
    }
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
      data: { user_id: req.auth.userId!, goal_type: input.goal_type, target_value: input.target_value, period: input.period, status: "active" },
    });
    res.json(goal);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/gamification/daily-reward ───────────────────────────────────
// Claim daily login coin reward. Once per calendar day.
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
    const setting = await prisma.platformSetting.findUnique({ where: { key: "coin_daily_login_reward" } });
    const DAILY_REWARD = parseInt(setting?.value || "10", 10);
    const [, wallet] = await prisma.$transaction([
      prisma.coinTransaction.create({ data: { user_id: userId, amount: DAILY_REWARD, type: "earn", description: "Daily login reward", source: "daily_login" } }),
      prisma.userCoin.upsert({ where: { user_id: userId }, create: { user_id: userId, balance: DAILY_REWARD, total_earned: DAILY_REWARD, total_spent: 0 }, update: { balance: { increment: DAILY_REWARD }, total_earned: { increment: DAILY_REWARD } } }),
    ]);
    res.json({ success: true, reward: DAILY_REWARD, new_balance: wallet.balance });
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
