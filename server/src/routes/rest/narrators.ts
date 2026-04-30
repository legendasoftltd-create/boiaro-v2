import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllNarrators } from "../../services/narrators.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/auth.js";
import { followProfile, unfollowProfile } from "../../services/follows.service.js";

export const narratorsRestRouter = Router();

narratorsRestRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const result = await getAllNarrators(req.auth?.userId);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

narratorsRestRouter.post(
  "/:id/follow",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await followProfile(req.auth.userId!, req.params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

narratorsRestRouter.post(
  "/:id/unfollow",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await unfollowProfile(req.auth.userId!, req.params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);