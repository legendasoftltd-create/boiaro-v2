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

    const result = await getAllAuthors(limit, offset, req.auth?.userId);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

authorsRestRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getAuthorById(id);

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
      const result = await followProfile(req.auth.userId!, req.params.id);
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
      const result = await unfollowProfile(req.auth.userId!, req.params.id);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);