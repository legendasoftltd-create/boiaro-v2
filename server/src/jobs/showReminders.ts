import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";

// Two distinct reminder windows (spec requires both a 30-min heads-up and a
// 10-min "starting soon" nudge). Each window has its own notification type
// so a show gets exactly one of each, not a single blended reminder.
const WINDOWS: { minutes: number; type: string; toleranceMin: number }[] = [
  { minutes: 30, type: "show_reminder_30", toleranceMin: 5 },
  { minutes: 10, type: "show_reminder_10", toleranceMin: 5 },
];

// Runs every 5 minutes (see jobs/index.ts) — catches any active show
// starting within each window and hasn't already had that window's
// reminder sent, notifying everyone who follows that RJ.
export async function runShowReminders(): Promise<{ sent: number }> {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sunday, matches JS Date convention
  const todayStr = now.toISOString().slice(0, 10);

  const candidateShows = await prisma.showSchedule.findMany({
    where: {
      status: "active",
      is_active: true,
      OR: [
        { schedule_type: "recurring", day_of_week: currentDay },
        { schedule_type: "one_time", specific_date: { gte: new Date(`${todayStr}T00:00:00.000Z`), lt: new Date(`${todayStr}T23:59:59.999Z`) } },
      ],
    },
    include: { station: { select: { name: true } } },
  });
  if (candidateShows.length === 0) return { sent: 0 };

  let sent = 0;
  for (const show of candidateShows) {
    const [h, m] = show.start_time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    const showTime = new Date(now);
    showTime.setHours(h, m, 0, 0);
    const minsUntil = (showTime.getTime() - now.getTime()) / 60000;

    for (const window of WINDOWS) {
      if (minsUntil < window.minutes - window.toleranceMin || minsUntil > window.minutes) continue;

      const reminderLink = `/schedule#${show.id}`;
      const alreadySent = await prisma.notification.findFirst({
        where: { type: window.type, link: reminderLink, created_at: { gte: new Date(Date.now() - 3600000) } },
      });
      if (alreadySent) continue;

      const followers = await prisma.follow.findMany({ where: { followee_id: show.rj_user_id }, select: { follower_id: true } });
      for (const f of followers) {
        await notifyUser(f.follower_id, {
          title: window.minutes === 30 ? `⏰ "${show.show_title}" ৩০ মিনিটে শুরু হবে!` : `🔔 "${show.show_title}" এখনই শুরু হচ্ছে!`,
          message: `${show.start_time}-এ ${show.station.name}-এ শুনুন।`,
          type: window.type,
          link: reminderLink,
          preferenceKey: "reminder_enabled",
        }).catch(() => null);
        sent++;
      }
    }
  }
  return { sent };
}
