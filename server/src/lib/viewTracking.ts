import { prisma } from "./prisma.js";

const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Records a Book Details page view, counted at most once per 24h per viewer
 * — user_id when logged in, device_id fallback for anonymous visitors (never
 * both on the same row, so a logged-in user's view count doesn't fragment
 * across their devices). Unlike listen/read tracking this isn't a lifetime
 * unique: a viewer returning after the 24h window is a genuine new view, so
 * last_viewed_at is checked and only advanced once the window has elapsed —
 * repeated refreshes/opens within the window are no-ops.
 */
export async function maybeRecordView(
  userId: string | null | undefined,
  deviceId: string | null | undefined,
  bookId: string | null | undefined
): Promise<void> {
  if (!bookId) return;

  const uid = userId || null;
  const did = uid ? null : deviceId || null;
  if (!uid && !did) return; // no identity to dedup against — skip rather than inflate

  const where = uid
    ? { book_id_user_id: { book_id: bookId, user_id: uid } }
    : { book_id_device_id: { book_id: bookId, device_id: did! } };

  const existing = await prisma.bookView.findUnique({ where: where as any });
  const now = new Date();
  if (existing && now.getTime() - existing.last_viewed_at.getTime() < VIEW_WINDOW_MS) {
    return; // already counted within the last 24h
  }

  try {
    await prisma.$transaction([
      prisma.bookView.upsert({
        where: where as any,
        create: { book_id: bookId, user_id: uid, device_id: did, last_viewed_at: now, view_count: 1 },
        update: { last_viewed_at: now, view_count: { increment: 1 } },
      }),
      prisma.book.update({ where: { id: bookId }, data: { total_views: { increment: 1 } } }),
    ]);
  } catch (err: any) {
    // P2003 = the book was deleted between the client loading it and this
    // call landing (a stale cached link, a tab left open, etc.) — nothing
    // to record against, not a real error.
    if (err?.code !== "P2003") throw err;
  }
}
