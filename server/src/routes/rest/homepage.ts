import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getHomepageData } from "../../services/homepage.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export const homepageRestRouter = Router();

homepageRestRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const rawLimit = req.query.limit;
    const limit = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
    const userId = req.auth?.userId ?? undefined;
    const result = await getHomepageData(limit, userId);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});
