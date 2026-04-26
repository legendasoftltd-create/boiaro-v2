import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth.js";
import { getEbookSignedUrl } from "../../services/content.service.js";


export const contentRestRouter = Router();

contentRestRouter.post("/ebook-url", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId;
    const { book_id } = req.body;

    const result = await getEbookSignedUrl(userId, book_id);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});