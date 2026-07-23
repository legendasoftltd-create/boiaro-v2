// routes/rest/authors.router.ts

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllAuthors, getAuthorById } from "../../services/authors.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/auth.js";
import { followProfile, unfollowProfile } from "../../services/follows.service.js";

export const authorsRestRouter = Router();

authorsRestRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const rawSearch = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
    const search = typeof rawSearch === "string" && rawSearch.trim() ? rawSearch.trim() : undefined;

    const result = await getAllAuthors(limit, offset, req.auth?.userId, search);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

authorsRestRouter.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await getAuthorById(id, req.auth?.userId);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

authorsRestRouter.post(
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

authorsRestRouter.post(
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