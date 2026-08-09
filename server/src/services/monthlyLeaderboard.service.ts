import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";
import { dhakaMonthBounds, currentDhakaYearMonth } from "../lib/timezone.js";

export type LeaderboardMetric = "reading" | "listening" | "combined";

export interface MonthlyLeaderboardRow {
  id: string | null;
  rank: number;
  user_id: string;
  total_seconds: number;
  display_name: string | null;
  avatar_url: string | null;
  prize_type: string;
  prize_coins: number | null;
  prize_name: string | null;
  prize_status: string;
  winner_confirmed: boolean;
  confirmed_at: Date | null;
  locked_at: Date | null;
}

const LIMIT = 10;

/**
 * Live-computed ranking for a calendar month, same "groupBy over
 * ContentConsumptionTime filtered to a date window" approach already used
 * by the Home Screen leaderboard and competition ranking — just with Dhaka
 * calendar-month bounds instead of a rolling window or admin-chosen range.
 */
export async function computeMonthlyRanking(
  year: number,
  month: number,
  metric: LeaderboardMetric,
  limit = LIMIT
): Promise<Array<{ user_id: string; total_seconds: number }>> {
  const { start, end } = dhakaMonthBounds(year, month);
  const window = { gte: start, lte: end };

  if (metric === "combined") {
    const agg = await prisma.contentConsumptionTime.groupBy({
      by: ["user_id", "format"],
      where: { created_at: window },
      _sum: { seconds: true },
    });
    const totals = new Map<string, number>();
    for (const row of agg) {
      totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + (row._sum.seconds ?? 0));
    }
    return [...totals.entries()]
      .map(([user_id, total_seconds]) => ({ user_id, total_seconds }))
      .sort((a, b) => b.total_seconds - a.total_seconds)
      .slice(0, limit);
  }

  const format = metric === "reading" ? "ebook" : "audiobook";
  const agg = await prisma.contentConsumptionTime.groupBy({
    by: ["user_id"],
    where: { created_at: window, format },
    _sum: { seconds: true },
    orderBy: { _sum: { seconds: "desc" } },
    take: limit,
  });
  return agg.map((a) => ({ user_id: a.user_id, total_seconds: a._sum.seconds ?? 0 }));
}

async function withProfiles(rows: Array<{ user_id: string; total_seconds: number }>) {
  if (rows.length === 0) return [];
  const profiles = await prisma.profile.findMany({
    where: { user_id: { in: rows.map((r) => r.user_id) } },
    select: { user_id: true, display_name: true, avatar_url: true },
  });
  const pMap = new Map(profiles.map((p) => [p.user_id, p]));
  return rows.map((r) => ({ ...r, display_name: pMap.get(r.user_id)?.display_name ?? null, avatar_url: pMap.get(r.user_id)?.avatar_url ?? null }));
}

/**
 * Returns the Top 10 for a (year, month, metric): the locked archive if the
 * month has already been swept by lockEndedMonths(), otherwise a live
 * computation shaped identically (id/locked_at null, prize fields at
 * defaults) so callers don't need two response shapes.
 */
export async function getMonthlyLeaderboard(year: number, month: number, metric: LeaderboardMetric): Promise<MonthlyLeaderboardRow[]> {
  const locked = await prisma.monthlyLeaderboardEntry.findMany({
    where: { year, month, metric, locked_at: { not: null } },
    orderBy: { rank: "asc" },
  });
  if (locked.length > 0) {
    const withP = await withProfiles(locked.map((e) => ({ user_id: e.user_id, total_seconds: e.total_seconds })));
    return locked.map((e, i) => ({
      id: e.id,
      rank: e.rank,
      user_id: e.user_id,
      total_seconds: e.total_seconds,
      display_name: withP[i]?.display_name ?? null,
      avatar_url: withP[i]?.avatar_url ?? null,
      prize_type: e.prize_type,
      prize_coins: e.prize_coins,
      prize_name: e.prize_name,
      prize_status: e.prize_status,
      winner_confirmed: e.winner_confirmed,
      confirmed_at: e.confirmed_at,
      locked_at: e.locked_at,
    }));
  }

  // Not locked — merge live ranking with any draft prize config an admin
  // already set for this (year, month, metric) before the month ended.
  const [ranking, drafts] = await Promise.all([
    computeMonthlyRanking(year, month, metric),
    prisma.monthlyLeaderboardEntry.findMany({ where: { year, month, metric } }),
  ]);
  const draftByRank = new Map(drafts.map((d) => [d.rank, d]));
  const withP = await withProfiles(ranking);
  return withP.map((r, i) => {
    const rank = i + 1;
    const draft = draftByRank.get(rank);
    return {
      id: draft?.id ?? null,
      rank,
      user_id: r.user_id,
      total_seconds: r.total_seconds,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      prize_type: draft?.prize_type ?? "manual",
      prize_coins: draft?.prize_coins ?? null,
      prize_name: draft?.prize_name ?? null,
      prize_status: draft?.prize_status ?? "pending",
      winner_confirmed: draft?.winner_confirmed ?? false,
      confirmed_at: draft?.confirmed_at ?? null,
      locked_at: null,
    };
  });
}

/**
 * Recomputes the ranking and upserts the top-N rows for (year, month,
 * metric), overwriting only user_id/total_seconds per rank slot — prize
 * config already set for that rank is preserved (prizes are tied to the
 * rank, not the specific user, matching Competition's prize_coin_top1/2/3).
 * Never touches locked_at.
 */
export async function recalculateMonth(year: number, month: number, metric: LeaderboardMetric): Promise<void> {
  const ranking = await computeMonthlyRanking(year, month, metric);
  for (let i = 0; i < ranking.length; i++) {
    const rank = i + 1;
    const { user_id, total_seconds } = ranking[i];
    await prisma.monthlyLeaderboardEntry.upsert({
      where: { year_month_metric_rank: { year, month, metric, rank } },
      create: { year, month, metric, rank, user_id, total_seconds },
      update: { user_id, total_seconds },
    });
  }
}

/**
 * Lets an admin configure a prize for a rank at any point, even mid-month
 * before anything has been recalculated/locked — snapshots the current live
 * rank into a row first if one doesn't exist yet, then applies prize fields.
 */
export async function upsertPrizeConfig(
  year: number,
  month: number,
  metric: LeaderboardMetric,
  rank: number,
  prize: { prizeType: "auto" | "manual"; prizeCoins?: number | null; prizeName?: string | null }
) {
  const existing = await prisma.monthlyLeaderboardEntry.findUnique({
    where: { year_month_metric_rank: { year, month, metric, rank } },
  });

  let user_id = existing?.user_id;
  let total_seconds = existing?.total_seconds;
  if (!existing) {
    const ranking = await computeMonthlyRanking(year, month, metric, rank);
    const row = ranking[rank - 1];
    if (!row) throw new Error(`No activity yet for rank ${rank} in ${year}-${month} (${metric})`);
    user_id = row.user_id;
    total_seconds = row.total_seconds;
  }

  return prisma.monthlyLeaderboardEntry.upsert({
    where: { year_month_metric_rank: { year, month, metric, rank } },
    create: {
      year, month, metric, rank,
      user_id: user_id!, total_seconds: total_seconds!,
      prize_type: prize.prizeType,
      prize_coins: prize.prizeCoins ?? null,
      prize_name: prize.prizeName ?? null,
    },
    update: {
      prize_type: prize.prizeType,
      prize_coins: prize.prizeCoins ?? null,
      prize_name: prize.prizeName ?? null,
    },
  });
}

/**
 * Cron entry point. Finds the most recently fully-ended Dhaka month and, for
 * each metric not yet locked (idempotency guard, same shape as Competition's
 * winners_processed), recalculates + freezes it, then auto-pays any
 * prize_type: "auto" rows that haven't been paid yet. Manual-type rows are
 * left "pending" for the admin to mark delivered by hand.
 */
export async function lockEndedMonths(): Promise<{ locked: number }> {
  const { year: curYear, month: curMonth } = currentDhakaYearMonth();
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;

  const metrics: LeaderboardMetric[] = ["reading", "listening", "combined"];
  let locked = 0;

  for (const metric of metrics) {
    const alreadyLocked = await prisma.monthlyLeaderboardEntry.findFirst({
      where: { year: prevYear, month: prevMonth, metric, locked_at: { not: null } },
      select: { id: true },
    });
    if (alreadyLocked) continue;

    await recalculateMonth(prevYear, prevMonth, metric);
    const entries = await prisma.monthlyLeaderboardEntry.findMany({
      where: { year: prevYear, month: prevMonth, metric },
    });
    if (entries.length === 0) continue;

    await prisma.monthlyLeaderboardEntry.updateMany({
      where: { year: prevYear, month: prevMonth, metric },
      data: { locked_at: new Date() },
    });
    locked++;

    for (const entry of entries) {
      if (entry.prize_type !== "auto" || !entry.prize_coins || entry.prize_coins <= 0 || entry.prize_paid_at) continue;
      const prize = entry.prize_coins;
      await prisma.$transaction([
        prisma.coinTransaction.create({
          data: { user_id: entry.user_id, amount: prize, type: "bonus", description: `Monthly leaderboard prize: ${prevYear}-${String(prevMonth).padStart(2, "0")} (#${entry.rank})`, source: "monthly_leaderboard_prize", reference_id: entry.id },
        }),
        prisma.userCoin.upsert({
          where: { user_id: entry.user_id },
          create: { user_id: entry.user_id, balance: prize, total_earned: prize, total_spent: 0 },
          update: { balance: { increment: prize }, total_earned: { increment: prize } },
        }),
        prisma.monthlyLeaderboardEntry.update({
          where: { id: entry.id },
          data: { prize_status: "delivered", prize_paid_at: new Date() },
        }),
      ]);
      await notifyUser(entry.user_id, {
        title: "🏆 আপনি মাসিক লিডারবোর্ডে জিতেছেন!",
        message: `${prevYear}-${String(prevMonth).padStart(2, "0")} মাসের লিডারবোর্ডে আপনি #${entry.rank} স্থান পেয়েছেন এবং +${prize} কয়েন পুরস্কার পেয়েছেন!`,
        type: "monthly_leaderboard_won",
      }).catch(() => null);
    }
  }

  return { locked };
}
