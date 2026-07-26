import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";

export interface CompetitionRankRow {
  user_id: string;
  total: number;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Live-computed ranking for a competition — no separate entry table, the
 * metric is derived directly from existing data filtered to the
 * competition's [start_at, end_at] window, same approach as the Home Screen
 * leaderboard. Works both while a competition is running (for the live
 * leaderboard UI) and after it ends (for the payout sweep).
 */
export async function getCompetitionRanking(
  competition: { metric: string; start_at: Date; end_at: Date },
  limit = 20
): Promise<CompetitionRankRow[]> {
  const window = { gte: competition.start_at, lte: competition.end_at };
  let rows: { user_id: string; total: number }[];

  if (competition.metric === "reading_time" || competition.metric === "listening_time") {
    const format = competition.metric === "reading_time" ? "ebook" : "audiobook";
    const agg = await prisma.contentConsumptionTime.groupBy({
      by: ["user_id"], where: { created_at: window, format }, _sum: { seconds: true }, orderBy: { _sum: { seconds: "desc" } }, take: limit,
    });
    rows = agg.map((a) => ({ user_id: a.user_id, total: a._sum.seconds ?? 0 }));
  } else if (competition.metric === "purchases") {
    const agg = await prisma.order.groupBy({
      by: ["user_id"], where: { created_at: window, status: { in: ["confirmed", "delivered"] } }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: limit,
    });
    rows = agg.map((a) => ({ user_id: a.user_id, total: a._count.id }));
  } else {
    const agg = await prisma.referral.groupBy({
      by: ["referrer_id"], where: { created_at: window, status: "completed" }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: limit,
    });
    rows = agg.map((a) => ({ user_id: a.referrer_id, total: a._count.id }));
  }
  if (rows.length === 0) return [];

  const profiles = await prisma.profile.findMany({
    where: { user_id: { in: rows.map((r) => r.user_id) } },
    select: { user_id: true, display_name: true, avatar_url: true },
  });
  const pMap = new Map(profiles.map((p) => [p.user_id, p]));
  return rows.map((r) => ({
    user_id: r.user_id,
    total: r.total,
    display_name: pMap.get(r.user_id)?.display_name ?? null,
    avatar_url: pMap.get(r.user_id)?.avatar_url ?? null,
  }));
}

/**
 * Sweeps competitions that have ended but haven't paid out yet, credits the
 * top-3 prize coins, and marks them completed. winners_processed guards
 * against double-paying if the sweep runs more than once (e.g. after a
 * missed cron tick).
 */
export async function processEndedCompetitions(): Promise<{ processed: number }> {
  const ended = await prisma.competition.findMany({
    where: { status: "active", winners_processed: false, end_at: { lte: new Date() } },
  });
  if (ended.length === 0) return { processed: 0 };

  let processed = 0;
  for (const comp of ended) {
    const ranking = await getCompetitionRanking(comp, 3);
    const prizes = [comp.prize_coin_top1, comp.prize_coin_top2, comp.prize_coin_top3];

    for (let i = 0; i < ranking.length; i++) {
      const prize = prizes[i];
      if (!prize || prize <= 0) continue;
      const winner = ranking[i];
      await prisma.$transaction([
        prisma.coinTransaction.create({
          data: { user_id: winner.user_id, amount: prize, type: "bonus", description: `Competition prize: ${comp.title} (#${i + 1})`, source: "competition_prize", reference_id: comp.id },
        }),
        prisma.userCoin.upsert({
          where: { user_id: winner.user_id },
          create: { user_id: winner.user_id, balance: prize, total_earned: prize, total_spent: 0 },
          update: { balance: { increment: prize }, total_earned: { increment: prize } },
        }),
      ]);
      await notifyUser(winner.user_id, {
        title: "🏆 আপনি প্রতিযোগিতায় জিতেছেন!",
        message: `"${comp.title}" প্রতিযোগিতায় আপনি #${i + 1} স্থান পেয়েছেন এবং +${prize} কয়েন পুরস্কার পেয়েছেন!`,
        type: "competition_won",
        preferenceKey: "promotional_enabled",
      }).catch(() => null);
    }

    await prisma.competition.update({ where: { id: comp.id }, data: { status: "completed", winners_processed: true } });
    processed++;
  }
  return { processed };
}
