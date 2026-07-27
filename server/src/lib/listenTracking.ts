import { prisma } from "./prisma.js";

const MIN_SECONDS = 60;
const MIN_PERCENTAGE = 30;

/**
 * Records a unique "listen" for this user/book the first time their audiobook
 * progress crosses 60 seconds OR 30% of the total duration — whichever comes
 * first. Safe to call on every progress update: the unique (user_id, book_id)
 * constraint on BookListen makes this idempotent, so repeat plays by the same
 * user never increment Book.total_listens more than once.
 */
export async function maybeRecordListen(
  userId: string | null | undefined,
  bookId: string | null | undefined,
  positionSeconds: number | null | undefined,
  totalSeconds: number | null | undefined
): Promise<void> {
  if (!userId || !bookId) return;

  const position = Number(positionSeconds) || 0;
  const total = Number(totalSeconds) || 0;
  const percentage = total > 0 ? (position / total) * 100 : 0;

  if (position < MIN_SECONDS && percentage < MIN_PERCENTAGE) return;

  try {
    await prisma.bookListen.create({ data: { user_id: userId, book_id: bookId } });
    await prisma.book.update({ where: { id: bookId }, data: { total_listens: { increment: 1 } } });
  } catch (err: any) {
    // P2002 = already recorded for this user (idempotent no-op).
    // P2003 = the book was deleted between load and this call landing.
    if (err?.code !== "P2002" && err?.code !== "P2003") throw err;
  }
}
