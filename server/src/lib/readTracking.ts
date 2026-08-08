import { prisma } from "./prisma.js";

const MIN_SECONDS = 60;
const MIN_PAGES = 3;

/**
 * Records a unique "read" for this user/book once, in the current reading
 * session, they've spent at least 60s reading OR advanced at least 3 pages —
 * whichever comes first. Mirrors listenTracking.ts: safe to call on every
 * progress save, since the unique (user_id, book_id) constraint on BookRead
 * makes it idempotent (a P2002 violation just means it was already recorded
 * for this user/book — the reader may switch devices, but the lifetime count
 * stays per-user, not per-device).
 *
 * Returns true only the first time this fires for a given user+book — callers
 * use that to award "read session" gamification points exactly once per book
 * rather than on every progress save.
 */
export async function maybeRecordRead(
  userId: string | null | undefined,
  bookId: string | null | undefined,
  sessionSeconds: number | null | undefined,
  sessionPagesRead: number | null | undefined
): Promise<boolean> {
  if (!userId || !bookId) return false;

  const seconds = Number(sessionSeconds) || 0;
  const pages = Number(sessionPagesRead) || 0;

  if (seconds < MIN_SECONDS && pages < MIN_PAGES) return false;

  try {
    await prisma.bookRead.create({ data: { user_id: userId, book_id: bookId } });
    await prisma.book.update({ where: { id: bookId }, data: { total_reads: { increment: 1 } } });
    return true;
  } catch (err: any) {
    // P2002 = already recorded for this user (idempotent no-op).
    // P2003 = the book was deleted between load and this call landing.
    if (err?.code !== "P2002" && err?.code !== "P2003") throw err;
    return false;
  }
}
