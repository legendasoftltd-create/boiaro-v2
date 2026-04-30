import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import {
  bookByIdSchema,
  bookBySlugSchema,
  bookListSchema,
  bookReviewsQuerySchema,
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

booksRestRouter.get("/:book_id/tracks", async (req, res) => {
  try {
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id: req.params.book_id, format: "audiobook" },
      select: { id: true },
    });
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
        status: true,
      },
    });
    res.json({ tracks });
  } catch (error) {
    sendHttpError(res, error);
  }
});
