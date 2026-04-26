import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getUserBookmarks } from "../../services/books.service.js";

export const meRestRouter = Router();

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
