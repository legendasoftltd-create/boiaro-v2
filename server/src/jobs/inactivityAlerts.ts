import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";

const INACTIVITY_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Fires once per user per inactivity episode: exactly INACTIVITY_DAYS since
// their last reading/listening activity (a 1-day window so it triggers once
// as they cross the threshold, not every day after), and no inactivity
// alert already sent in that same window (checked via the Notification log
// itself rather than a new table).
export async function runInactivityAlerts(): Promise<{ sent: number }> {
  const [readingLatest, listeningLatest] = await Promise.all([
    prisma.readingProgress.groupBy({ by: ["user_id"], _max: { last_read_at: true } }),
    prisma.listeningProgress.groupBy({ by: ["user_id"], _max: { last_listened_at: true } }),
  ]);

  const lastActivity = new Map<string, Date>();
  for (const r of readingLatest) {
    if (r._max.last_read_at) lastActivity.set(r.user_id, r._max.last_read_at);
  }
  for (const l of listeningLatest) {
    if (l._max.last_listened_at) {
      const existing = lastActivity.get(l.user_id);
      if (!existing || l._max.last_listened_at > existing) lastActivity.set(l.user_id, l._max.last_listened_at);
    }
  }

  const now = Date.now();
  const candidates: string[] = [];
  for (const [userId, lastAt] of lastActivity) {
    const daysSince = Math.floor((now - lastAt.getTime()) / DAY_MS);
    if (daysSince === INACTIVITY_DAYS) candidates.push(userId);
  }
  if (candidates.length === 0) return { sent: 0 };

  const recentlyAlerted = await prisma.notification.findMany({
    where: {
      type: "inactivity_alert",
      target_user_id: { in: candidates },
      created_at: { gte: new Date(now - INACTIVITY_DAYS * DAY_MS) },
    },
    select: { target_user_id: true },
  });
  const alreadyAlerted = new Set(recentlyAlerted.map((n) => n.target_user_id));

  let sent = 0;
  for (const userId of candidates) {
    if (alreadyAlerted.has(userId)) continue;

    const [lastRead, lastListen] = await Promise.all([
      prisma.readingProgress.findFirst({ where: { user_id: userId }, orderBy: { last_read_at: "desc" }, include: { book: { select: { title: true, slug: true } } } }),
      prisma.listeningProgress.findFirst({ where: { user_id: userId }, orderBy: { last_listened_at: "desc" }, include: { book: { select: { title: true, slug: true } } } }),
    ]);
    const mostRecent = (lastRead?.last_read_at?.getTime() ?? 0) >= (lastListen?.last_listened_at?.getTime() ?? 0) ? lastRead : lastListen;
    if (!mostRecent?.book) continue;

    await notifyUser(userId, {
      title: "আপনাকে মিস করছি!",
      message: `আপনি ${INACTIVITY_DAYS} দিন পড়েননি! "${mostRecent.book.title}" এ আবার ফিরে আসুন।`,
      type: "inactivity_alert",
      link: `/book/${mostRecent.book.slug}`,
      preferenceKey: "reminder_enabled",
    }).catch(() => null);
    sent++;
  }
  return { sent };
}
