// routes/rest/profile-roles.router.ts

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { getUserRoles } from "../../services/profile-roles.service.js";

export const profileRolesRestRouter = Router();

profileRolesRestRouter.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.auth.userId;

      const result = await getUserRoles(userId);

      res.json(result);
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);