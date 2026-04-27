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
  getBookBookmarkStatus,
  getBookById,
  getBookBySlug,
  listBookCategories,
  listBookReviews,
  listBooks,
  toggleBookBookmark,
  upsertBookReview,
} from "../../services/books.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/auth.js";

export const booksRestRouter = Router();

booksRestRouter.get("/", async (req, res) => {
  try {
    const input = bookListSchema.parse(req.query);
    const result = await listBooks(input);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.get("/slug/:slug", async (req, res) => {
  try {
    const input = bookBySlugSchema.parse(req.params);
    const result = await getBookBySlug(input.slug);
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

booksRestRouter.get("/:id", async (req, res) => {
  try {
    const input = bookByIdSchema.parse(req.params);
    const result = await getBookById(input.id);
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
