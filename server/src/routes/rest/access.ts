import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { checkMultiBookAccess, getPreviewEligibility } from "../../services/access.service.js";

export const accessRestRouter = Router();

accessRestRouter.post(
  "/check",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.auth.userId;

      const { book_id, format } = req.body;

      const result = await checkMultiBookAccess(userId, book_id, format);

      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

accessRestRouter.get("/preview-eligibility", async (req, res) => {
  try {
    const { book_id, format = "ebook" } = req.query;

    const result = await getPreviewEligibility(
      String(book_id),
      String(format)
    );

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});