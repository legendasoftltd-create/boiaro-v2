import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getUserProfile, updateUserProfile } from "../../services/profile.service.js";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth.js";

export const profileRestRouter = Router();

profileRestRouter.get("/",requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId;

    
    const result = await getUserProfile(userId);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

profileRestRouter.patch("/",requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId;
    const updateData = req.body;

    const result = await updateUserProfile(userId, updateData);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});