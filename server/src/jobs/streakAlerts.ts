import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";

// Fires once per day (evening run) for users whose streak is genuinely at
// risk: they were active yesterday (continuing a live streak) but haven't
// done anything yet today, so it lapses at midnight unless they act.
// Users whose last_activity_date is older than yesterday already have a
// stale/broken streak — not "ending today", so they're skipped here (that's
// an inactivity-alert case instead).
export async function runStreakAlerts(): Promise<{ sent: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const atRisk = await prisma.userStreak.findMany({
    where: { last_activity_date: yesterday, current_streak: { gt: 0 } },
  });
  if (atRisk.length === 0) return { sent: 0 };

  const userIds = atRisk.map((s) => s.user_id);
  const alertedToday = await prisma.notification.findMany({
    where: { type: "streak_alert", target_user_id: { in: userIds }, created_at: { gte: new Date(`${today}T00:00:00Z`) } },
    select: { target_user_id: true },
  });
  const alreadyAlerted = new Set(alertedToday.map((n) => n.target_user_id));

  let sent = 0;
  for (const streak of atRisk) {
    if (alreadyAlerted.has(streak.user_id)) continue;
    await notifyUser(streak.user_id, {
      title: "আপনার streak আজ শেষ হবে!",
      message: `আপনার ${streak.current_streak} দিনের streak আজ শেষ হবে! ৫ মিনিট পড়ুন ও স্ট্রিক বজায় রাখুন।`,
      type: "streak_alert",
      preferenceKey: "reminder_enabled",
    }).catch(() => null);
    sent++;
  }
  return { sent };
}
