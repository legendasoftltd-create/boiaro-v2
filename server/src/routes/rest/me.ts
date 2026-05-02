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
      const result = await getUserBookmarks(req.auth.userId!);
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
      const bookmarks = await getUserBookmarks(req.auth.userId!);
      res.json({
        wishlist: bookmarks.map((b) => ({
          id: b.id,
          book_id: b.book_id,
          added_at: b.created_at,
          book: b.book,
        })),
        total: bookmarks.length,
      });
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);
