import { prisma } from "../lib/prisma.js";

export interface WeeklyReport {
  totalSeconds: number;
  totalMinutes: number;
  bookCount: number;
  books: { id: string; title: string; cover_url: string | null }[];
  lastWeekSeconds: number;
  weekOverWeekPercent: number | null;
}

// A user's "week in reading/listening" — this week's total consumption time
// (across ebook + audiobook), distinct books touched, and the delta vs the
// prior 7-day window. Backs both the weekly-summary notification job and
// the end-user weekly report page/shareable card.
export async function getUserWeeklyReport(userId: string): Promise<WeeklyReport> {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const prevWeekStart = new Date(now.getTime() - 14 * 86400000);

  const [thisWeek, lastWeekAgg] = await Promise.all([
    prisma.contentConsumptionTime.findMany({
      where: { user_id: userId, created_at: { gte: weekStart } },
      select: { book_id: true, seconds: true },
    }),
    prisma.contentConsumptionTime.aggregate({
      where: { user_id: userId, created_at: { gte: prevWeekStart, lt: weekStart } },
      _sum: { seconds: true },
    }),
  ]);

  const totalSeconds = thisWeek.reduce((sum, r) => sum + r.seconds, 0);
  const bookIds = [...new Set(thisWeek.map((r) => r.book_id))];
  const books = bookIds.length
    ? await prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true, cover_url: true } })
    : [];

  const lastWeekSeconds = lastWeekAgg._sum.seconds ?? 0;
  const weekOverWeekPercent = lastWeekSeconds > 0 ? Math.round(((totalSeconds - lastWeekSeconds) / lastWeekSeconds) * 100) : null;

  return { totalSeconds, totalMinutes: Math.round(totalSeconds / 60), bookCount: bookIds.length, books, lastWeekSeconds, weekOverWeekPercent };
}
