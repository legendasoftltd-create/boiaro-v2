import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";

const MIN_SECONDS_FOR_SUMMARY = 300; // 5 min — skip users with negligible weekly activity

// Weekly cron: notify every user who read/listened at least a little this
// week that their report is ready. The report itself is computed on-demand
// when they open it (getUserWeeklyReport) — this job only decides who
// qualifies and sends the nudge.
export async function runWeeklySummary(): Promise<{ sent: number }> {
  const weekStart = new Date(Date.now() - 7 * 86400000);

  const activeUsers = await prisma.contentConsumptionTime.groupBy({
    by: ["user_id"],
    where: { created_at: { gte: weekStart } },
    _sum: { seconds: true },
  });
  const qualifying = activeUsers.filter((u) => (u._sum.seconds ?? 0) >= MIN_SECONDS_FOR_SUMMARY).map((u) => u.user_id);
  if (qualifying.length === 0) return { sent: 0 };

  const alreadySent = await prisma.notification.findMany({
    where: { type: "weekly_summary", target_user_id: { in: qualifying }, created_at: { gte: new Date(Date.now() - 6 * 86400000) } },
    select: { target_user_id: true },
  });
  const alertedSet = new Set(alreadySent.map((n) => n.target_user_id));

  let sent = 0;
  for (const userId of qualifying) {
    if (alertedSet.has(userId)) continue;
    await notifyUser(userId, {
      title: "আপনার সাপ্তাহিক রিডিং রিপোর্ট প্রস্তুত!",
      message: "এই সপ্তাহে আপনি কতটা পড়লেন ও শুনলেন — দেখে নিন আপনার Weekly Report।",
      type: "weekly_summary",
      link: "/profile?tab=weekly-report",
      preferenceKey: "reminder_enabled",
    }).catch(() => null);
    sent++;
  }
  return { sent };
}
