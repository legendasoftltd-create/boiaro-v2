import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllPublishers, getPublisherById } from "../../services/publishers.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/auth.js";
import { followProfile, unfollowProfile } from "../../services/follows.service.js";

export const publishersRestRouter = Router();

publishersRestRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const rawSearch = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
    const search = typeof rawSearch === "string" && rawSearch.trim() ? rawSearch.trim() : undefined;
    const result = await getAllPublishers(req.auth?.userId, search);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

publishersRestRouter.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await getPublisherById(id, req.auth?.userId);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

publishersRestRouter.post(
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

publishersRestRouter.post(
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