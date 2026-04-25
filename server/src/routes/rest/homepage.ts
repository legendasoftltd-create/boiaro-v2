import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getHomepageData } from "../../services/homepage.service.js";
import { AuthenticatedRequest } from "../../middleware/auth.js";

export const homepageRestRouter = Router();

homepageRestRouter.get("/", async (req, res) => {
  try {
    const { limit } = req.query;
    const userId = req.headers.userid;
    const result = await getHomepageData(limit, userId);
    // Returns the parent level section keys as requested
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

