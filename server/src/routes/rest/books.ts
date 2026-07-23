import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import {
  bookByIdSchema,
  bookBySlugSchema,
  bookListSchema,
  bookReviewsQuerySchema,
  bookTagsQuerySchema,
  postReviewSchema,
} from "../../schemas/books.js";
import {
  addBookBookmark,
  getBookBookmarkStatus,
  getBookByIdForRest,
  getBookBySlugForRest,
  listBookCategories,
  listBookReviews,
  listBooks,
  listBookTags,
  removeBookBookmark,
  toggleBookBookmark,
  upsertBookReview,
} from "../../services/books.service.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/auth.js";

export const booksRestRouter = Router();
const getOptionalUserId = (req: AuthenticatedRequest) => req.auth?.userId ?? null;

booksRestRouter.get("/", async (req, res) => {
  try {
    const input = bookListSchema.parse(req.query);
    const result = await listBooks(input);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.get("/slug/:slug", async (req: AuthenticatedRequest, res) => {
  try {
    const input = bookBySlugSchema.parse(req.params);
    const result = await getBookBySlugForRest(
      input.slug,
      getOptionalUserId(req)
    );
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.get("/categories/list", async (_req, res) => {
  try {
    const result = await listBookCategories();
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /api/v1/books/tags/list?search=... — distinct tags across approved/active
// books with usage counts, sorted most-used first. Mirrors /categories/list.
booksRestRouter.get("/tags/list", async (req, res) => {
  try {
    const input = bookTagsQuerySchema.parse(req.query);
    const result = await listBookTags(input);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const input = bookByIdSchema.parse(req.params);
    const result = await getBookByIdForRest(
      input.id,
      getOptionalUserId(req)
    );
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.get("/:id/reviews", async (req, res) => {
  try {
    const params = bookByIdSchema.parse(req.params);
    const query = bookReviewsQuerySchema.parse(req.query);
    const result = await listBookReviews(params.id, query);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.post(
  "/:id/reviews",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = bookByIdSchema.parse(req.params);
      const body = postReviewSchema.parse(req.body);
      const result = await upsertBookReview(req.auth.userId!, params.id, body);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

booksRestRouter.get(
  "/:id/bookmark",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = bookByIdSchema.parse(req.params);
      const result = await getBookBookmarkStatus(req.auth.userId!, params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

booksRestRouter.post(
  "/:id/bookmark",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = bookByIdSchema.parse(req.params);
      const result = await toggleBookBookmark(req.auth.userId!, params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

booksRestRouter.get(
  "/:id/bookmarks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = bookByIdSchema.parse(req.params);
      const result = await getBookBookmarkStatus(req.auth.userId!, params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

booksRestRouter.post(
  "/:id/bookmarks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = bookByIdSchema.parse(req.params);
      const result = await addBookBookmark(req.auth.userId!, params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

booksRestRouter.delete(
  "/:id/bookmarks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = bookByIdSchema.parse(req.params);
      const result = await removeBookBookmark(req.auth.userId!, params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

// Mobile app calls this to register a book view/read (mirrors tRPC books.incrementRead)
booksRestRouter.post("/:id/read", async (req: AuthenticatedRequest, res) => {
  try {
    const bookId = String(req.params.id);
    const userId = req.auth?.userId ?? null;
    await Promise.all([
      prisma.book.update({ where: { id: bookId }, data: { total_reads: { increment: 1 } } }),
      userId ? prisma.bookRead.create({ data: { user_id: userId, book_id: bookId } }).catch(() => {}) : Promise.resolve(),
    ]);
    const count = await prisma.bookRead.count({ where: { book_id: bookId } });
    res.json({ success: true, total_reads: count });
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.get("/:book_id/tracks", async (req, res) => {
  try {
    const bookId = req.params.book_id;
    const [book, bookFormat] = await Promise.all([
      prisma.book.findUnique({ where: { id: bookId }, select: { is_free: true } }),
      prisma.bookFormat.findFirst({
        where: { book_id: bookId, format: "audiobook" },
        select: { id: true, price: true },
      }),
    ]);
    if (!bookFormat) {
      res.json({ tracks: [] });
      return;
    }

    const tracks = await prisma.audiobookTrack.findMany({
      where: { book_format_id: bookFormat.id, status: "active" },
      orderBy: { track_number: "asc" },
      select: {
        id: true,
        track_number: true,
        title: true,
        duration: true,
        is_preview: true,
        media_type: true,
        chapter_price: true,
        chapter_taka_price: true,
        status: true,
      },
    });

    // Per-chapter pricing (coin OR taka) means the whole-book price being 0
    // is just how that mode is signaled — it does NOT mean the book is free.
    const hasPerChapterPricing = tracks.some(t => (t.chapter_price ?? 0) > 0 || (t.chapter_taka_price ?? 0) > 0);
    const isBookFree = Boolean(book?.is_free) || (!hasPerChapterPricing && Number(bookFormat.price ?? 0) <= 0);

    // When the book is free, all chapters are free — override is_preview and chapter_price
    // so the already-published mobile app (which relies on is_preview) needs no update.
    const result = isBookFree
      ? tracks.map(t => ({ ...t, is_preview: true, chapter_price: null, chapter_taka_price: null }))
      : tracks;

    res.json({ tracks: result });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// PATCH /api/v1/books/:id/subscriber-access — admin toggle (admin/moderator only)
// Body: { subscriber_access: boolean }
booksRestRouter.patch("/:id/subscriber-access", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const userRole = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
    if (!userRole) { res.status(403).json({ error: "Admin access required" }); return; }

    const bookId = String(req.params.id);
    const { subscriber_access } = req.body;
    if (typeof subscriber_access !== "boolean") {
      res.status(400).json({ error: "subscriber_access must be a boolean" });
      return;
    }

    const updated = await prisma.book.update({
      where: { id: bookId },
      data: { subscriber_access },
      select: { id: true, title: true, subscriber_access: true },
    });

    res.json({ success: true, book: updated });
  } catch (error) {
    sendHttpError(res, error);
  }
});
