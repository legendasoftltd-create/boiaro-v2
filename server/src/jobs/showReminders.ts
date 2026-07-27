import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";

const REMINDER_WINDOW_MIN = 15;

// Runs every 5 minutes (see jobs/index.ts) — catches any show starting
// within the next 15 minutes and hasn't already had a reminder sent this
// run-window, notifying everyone who follows that RJ (see rj.ts's
// notifyFollowersOfGoLive for the same follow-to-favorite-show mechanic).
export async function runShowReminders(): Promise<{ sent: number }> {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sunday, matches JS Date convention

  const todaysShows = await prisma.showSchedule.findMany({
    where: { day_of_week: currentDay, is_active: true },
    include: { station: { select: { name: true } } },
  });
  if (todaysShows.length === 0) return { sent: 0 };

  let sent = 0;
  for (const show of todaysShows) {
    const [h, m] = show.start_time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    const showTime = new Date(now);
    showTime.setHours(h, m, 0, 0);
    const minsUntil = (showTime.getTime() - now.getTime()) / 60000;
    if (minsUntil < 0 || minsUntil > REMINDER_WINDOW_MIN) continue;

    const reminderLink = `/schedule#${show.id}`;
    const alreadySent = await prisma.notification.findFirst({
      where: { type: "show_reminder", link: reminderLink, created_at: { gte: new Date(Date.now() - 3600000) } },
    });
    if (alreadySent) continue;

    const followers = await prisma.follow.findMany({ where: { followee_id: show.rj_user_id }, select: { follower_id: true } });
    for (const f of followers) {
      await notifyUser(f.follower_id, {
        title: `⏰ "${show.show_title}" শীঘ্রই শুরু হবে!`,
        message: `${show.start_time}-এ ${show.station.name}-এ শুনুন।`,
        type: "show_reminder",
        link: reminderLink,
        preferenceKey: "reminder_enabled",
      }).catch(() => null);
      sent++;
    }
  }
  return { sent };
}
