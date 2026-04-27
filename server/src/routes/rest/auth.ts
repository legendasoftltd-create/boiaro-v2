import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { refreshTokenSchema, signInSchema } from "../../schemas/auth.js";
import {
  getMe,
  refreshAuthTokens,
  signInUser,
} from "../../services/auth.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export const authRestRouter = Router();

authRestRouter.post("/login", async (req, res) => {
  try {
    const input = signInSchema.parse(req.body);
    const result = await signInUser(input);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/refresh", async (req, res) => {
  try {
    const input = refreshTokenSchema.parse(req.body);
    const result = refreshAuthTokens(input.refreshToken);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.get(
  "/me",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getMe(req.auth.userId!);
      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);
