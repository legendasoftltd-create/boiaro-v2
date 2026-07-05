import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getUserBookmarks } from "../../services/books.service.js";

export const meRestRouter = Router();

// GET /me/bookmarks — user's bookmarked books
meRestRouter.get(
  "/bookmarks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);
      const result = await getUserBookmarks(req.auth.userId!, limit, offset);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

// GET /me/wishlist — alias for bookmarks (wishlisted books)
meRestRouter.get(
  "/wishlist",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);
      const result = await getUserBookmarks(req.auth.userId!, limit, offset);
      res.json({
        wishlist: result.bookmarks.map((b) => ({
          id: b.id,
          book_id: b.book_id,
          added_at: b.created_at,
          book: b.book,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        has_more: result.has_more,
      });
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);
