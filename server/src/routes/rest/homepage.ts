import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getHomepageData } from "../../services/homepage.service.js";
import { AuthenticatedRequest } from "../../middleware/auth.js";

export const homepageRestRouter = Router();

homepageRestRouter.get("/", async (req, res) => {
  try {
    const rawLimit = req.query.limit;
    const limit = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
    const rawUserId = req.headers.userid;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    const result = await getHomepageData(limit, userId);
    // Returns the parent level section keys as requested
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

