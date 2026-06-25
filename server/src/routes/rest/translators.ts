import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllTranslators, getTranslatorById } from "../../services/translators.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/auth.js";
import { followProfile, unfollowProfile } from "../../services/follows.service.js";

export const translatorsRestRouter = Router();

translatorsRestRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const result = await getAllTranslators(limit, offset, req.auth?.userId);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

translatorsRestRouter.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await getTranslatorById(id, req.auth?.userId);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

translatorsRestRouter.post(
  "/:id/follow",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const profileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await followProfile(req.auth.userId!, profileId);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

translatorsRestRouter.post(
  "/:id/unfollow",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const profileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await unfollowProfile(req.auth.userId!, profileId);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);
