import { prisma } from "../lib/prisma.js";

export interface AwardedBadge {
  key: string;
  title: string;
  coin_reward: number | null;
}

// Point values shown (statically) on the admin Gamification Settings page's
// "Points per Activity" card — those numbers were never actually wired up to
// real events until now; this is where they're applied.
export const POINTS = {
  READ_SESSION: 5,
  LISTEN_SESSION: 5,
  BADGE_UNLOCK: 10,
  STREAK_MILESTONE: 50,
  REFERRAL_SUCCESS: 30,
  GOAL_COMPLETE: 20,
} as const;

/** Records a GamificationPoint row. Fire-and-forget — never throws. */
export async function awardPoints(
  userId: string,
  points: number,
  eventType: string,
  referenceId?: string | null
): Promise<void> {
  try {
    await prisma.gamificationPoint.create({
      data: { user_id: userId, points, event_type: eventType, reference_id: referenceId ?? undefined },
    });
  } catch (err) {
    console.error("[gamification] awardPoints failed:", err);
  }
}

// Longest gap between two progress saves that still counts as continuous
// activity — beyond this (tab backgrounded, app closed and reopened hours
// later) the gap is dropped rather than credited, so resuming a stale
// session doesn't hand out free goal progress.
const GOAL_ACTIVITY_CAP_SECONDS = 300;

function periodStartFor(period: string, now: Date): Date {
  const d = new Date(now);
  if (period === "weekly") {
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "monthly") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // "daily" and any unrecognized value both fall back to a calendar-day window.
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Adds `amount` whole units (e.g. 1 completed book) to every active goal of
 * `goalType` for this user, handling the daily/weekly/monthly period reset
 * (a goal's progress only counts within its own current period — crossing
 * into a new one starts that goal fresh) and one-time completion points.
 */
export async function bumpGoalProgress(userId: string, goalType: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const goals = await prisma.userGoal.findMany({ where: { user_id: userId, goal_type: goalType, status: "active" } });
    const now = new Date();
    for (const goal of goals) {
      const periodStart = periodStartFor(goal.period, now);
      const inCurrentPeriod = goal.started_at != null && goal.started_at >= periodStart;
      const previousValue = inCurrentPeriod ? goal.current_value ?? 0 : 0;
      const wasCompleted = inCurrentPeriod && previousValue >= goal.target_value;
      const newValue = previousValue + amount;
      const nowCompleted = newValue >= goal.target_value;

      await prisma.userGoal.update({
        where: { id: goal.id },
        data: {
          current_value: newValue,
          started_at: inCurrentPeriod ? goal.started_at! : now,
          completed_at: nowCompleted ? (wasCompleted ? goal.completed_at : now) : null,
        },
      });

      if (nowCompleted && !wasCompleted) {
        awardPoints(userId, POINTS.GOAL_COMPLETE, "goal_complete", goal.id).catch(() => null);
      }
    }
  } catch (err) {
    console.error("[gamification] bumpGoalProgress failed:", err);
  }
}

/**
 * Same as bumpGoalProgress, but for minute-based goals (read_minutes,
 * listen_minutes) fed by short, frequent activity bursts (page-turn
 * debounce, 15s audio ticks) that are mostly under a minute each. Carries
 * the sub-minute remainder in `progress_seconds` so those bursts still add
 * up instead of rounding down to 0 every time.
 */
export async function bumpGoalMinutes(userId: string, goalType: string, deltaSeconds: number): Promise<void> {
  const seconds = Math.min(Math.max(deltaSeconds, 0), GOAL_ACTIVITY_CAP_SECONDS);
  if (seconds <= 0) return;
  try {
    const goals = await prisma.userGoal.findMany({ where: { user_id: userId, goal_type: goalType, status: "active" } });
    const now = new Date();
    for (const goal of goals) {
      const periodStart = periodStartFor(goal.period, now);
      const inCurrentPeriod = goal.started_at != null && goal.started_at >= periodStart;
      const previousValue = inCurrentPeriod ? goal.current_value ?? 0 : 0;
      const previousSeconds = inCurrentPeriod ? goal.progress_seconds : 0;
      const wasCompleted = inCurrentPeriod && previousValue >= goal.target_value;

      const totalSeconds = previousSeconds + seconds;
      const wholeMinutes = Math.floor(totalSeconds / 60);
      const remainderSeconds = totalSeconds - wholeMinutes * 60;
      const newValue = previousValue + wholeMinutes;
      const nowCompleted = newValue >= goal.target_value;

      await prisma.userGoal.update({
        where: { id: goal.id },
        data: {
          current_value: newValue,
          progress_seconds: remainderSeconds,
          started_at: inCurrentPeriod ? goal.started_at! : now,
          completed_at: nowCompleted ? (wasCompleted ? goal.completed_at : now) : null,
        },
      });

      if (nowCompleted && !wasCompleted) {
        awardPoints(userId, POINTS.GOAL_COMPLETE, "goal_complete", goal.id).catch(() => null);
      }
    }
  } catch (err) {
    console.error("[gamification] bumpGoalMinutes failed:", err);
  }
}

const DEFAULT_DAILY_REWARD_SCHEDULE = [5, 10, 15, 20, 25, 30, 50];

// Admin-configurable via platform_settings key "daily_reward_schedule" — a
// comma-separated list of exactly 7 coin amounts, one per day of the cycle
// (same convention as ad_country_targeting/allowed_countries_ios elsewhere
// in this codebase, rather than raw JSON, since admins edit it by hand).
export async function getDailyRewardSchedule(): Promise<number[]> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: "daily_reward_schedule" } });
  if (setting?.value) {
    const parsed = setting.value.split(",").map((s) => Number(s.trim()));
    if (parsed.length === 7 && parsed.every((n) => Number.isFinite(n))) return parsed;
  }
  return DEFAULT_DAILY_REWARD_SCHEDULE;
}

type StreakRow = { current_streak: number | null; last_activity_date: string | null } | null;

// Where in the 7-day cycle *today* falls, without mutating anything — used
// to preview the reward dialog before the user claims.
export function projectStreakDay(streak: StreakRow): number {
  const today = new Date().toISOString().slice(0, 10);
  if (!streak) return 1;
  if (streak.last_activity_date === today) return ((streak.current_streak ?? 1) - 1) % 7 + 1;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const projected = streak.last_activity_date === yesterday ? (streak.current_streak ?? 0) + 1 : 1;
  return ((projected - 1) % 7) + 1;
}

/**
 * Advances (or starts) the user's login streak for today — consecutive
 * calendar day = +1, a gap of >1 day resets to 1, calling again same day is
 * a no-op. Shared by the standalone streak-update endpoint and
 * claimDailyReward (which needs the resulting current_streak to compute the
 * 7-day cycle position).
 */
export async function advanceStreakForToday(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await prisma.userStreak.findUnique({ where: { user_id: userId } });

  if (!existing) {
    return prisma.userStreak.create({
      data: { user_id: userId, current_streak: 1, best_streak: 1, last_activity_date: today },
    });
  }
  if (existing.last_activity_date === today) return existing;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = existing.last_activity_date === yesterday ? (existing.current_streak ?? 0) + 1 : 1;
  const bestStreak = Math.max(newStreak, existing.best_streak ?? 0);

  return prisma.userStreak.update({
    where: { user_id: userId },
    data: { current_streak: newStreak, best_streak: bestStreak, last_activity_date: today },
  });
}

// A book counts as "completed" once either its ebook or audiobook progress
// hits 100% — counted once per distinct book_id even if both formats were
// finished. This is the trigger source for the book_completion badges
// (First Book / Reader / Bookworm); no separate counter column exists, so
// it's derived from ReadingProgress/ListeningProgress on every check.
async function countCompletedBooks(userId: string): Promise<number> {
  const [read, listened] = await Promise.all([
    prisma.readingProgress.findMany({ where: { user_id: userId, percentage: { gte: 100 } }, select: { book_id: true } }),
    prisma.listeningProgress.findMany({ where: { user_id: userId, percentage: { gte: 100 } }, select: { book_id: true } }),
  ]);
  return new Set([...read.map((r) => r.book_id), ...listened.map((l) => l.book_id)]).size;
}

/**
 * Evaluates every active badge's condition for this user and awards any
 * newly-earned ones (unique per user+badge, coin reward credited via the
 * same CoinTransaction/UserCoin pattern used everywhere else). Safe to call
 * on every reading/listening/reward-claim event — already-earned badges are
 * skipped via the userBadge unique constraint, so redundant calls are cheap
 * no-ops. This function used to exist duplicated (and unused) in both
 * gamification.ts and rest/gamification.ts; both now call this instead.
 */
export async function checkAndAwardBadges(userId: string): Promise<AwardedBadge[]> {
  const [allBadges, earnedBadgeIds, streak, unlockCount, adCount, dailyCount, referralCount, readCount, listenCount, wallet, completedBooks] =
    await Promise.all([
      prisma.badgeDefinition.findMany({ where: { is_active: true } }),
      prisma.userBadge.findMany({ where: { user_id: userId }, select: { badge_id: true } }).then((r) => new Set(r.map((b) => b.badge_id))),
      prisma.userStreak.findUnique({ where: { user_id: userId } }),
      prisma.contentUnlock.count({ where: { user_id: userId, status: "active" } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "ad_reward" } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "daily_login" } }),
      prisma.referral.count({ where: { referrer_id: userId, status: "completed" } }),
      prisma.bookRead.count({ where: { user_id: userId } }),
      prisma.bookListen.count({ where: { user_id: userId } }),
      prisma.userCoin.findUnique({ where: { user_id: userId } }),
      countCompletedBooks(userId),
    ]);

  const awarded: AwardedBadge[] = [];

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
      case "book_completion": earned = completedBooks >= threshold; break;
      case "read_count": earned = readCount >= threshold; break;
      case "listen_count": earned = listenCount >= threshold; break;
      case "coins_earned": earned = (wallet?.total_earned ?? 0) >= threshold; break;
      default: break;
    }

    if (!earned) continue;

    const created = await prisma.userBadge.create({ data: { user_id: userId, badge_id: badge.id } }).catch(() => null);
    if (!created) continue; // race with another concurrent check — already awarded

    if (badge.coin_reward && badge.coin_reward > 0) {
      await prisma.$transaction([
        prisma.coinTransaction.create({
          data: { user_id: userId, amount: badge.coin_reward, type: "bonus", description: `Badge reward: ${badge.title}`, source: "badge_reward" },
        }),
        prisma.userCoin.upsert({
          where: { user_id: userId },
          create: { user_id: userId, balance: badge.coin_reward, total_earned: badge.coin_reward, total_spent: 0 },
          update: { balance: { increment: badge.coin_reward }, total_earned: { increment: badge.coin_reward } },
        }),
      ]);
    }
    const isStreakBadge = badge.condition_type === "streak";
    awardPoints(
      userId,
      isStreakBadge ? POINTS.STREAK_MILESTONE : POINTS.BADGE_UNLOCK,
      isStreakBadge ? "streak_milestone" : "badge_unlock",
      badge.id
    ).catch(() => null);

    awarded.push({ key: badge.key, title: badge.title, coin_reward: badge.coin_reward ?? null });
  }

  return awarded;
}
