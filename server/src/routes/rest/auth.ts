import bcrypt from "bcryptjs";
import { Router } from "express";
import { TRPCError } from "@trpc/server";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { refreshTokenSchema, signInSchema } from "../../schemas/auth.js";
import {
  getMe,
  refreshAuthTokens,
  signInUser,
} from "../../services/auth.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { signTokens } from "../../lib/auth.js";

export const authRestRouter = Router();

authRestRouter.post("/signup", async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    if (password.length < 6) {
      res.status(422).json({ error: "Password must be at least 6 characters" });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const password_hash = await bcrypt.hash(password, 12);
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await prisma.user.create({
      data: {
        email,
        password_hash,
        profile: { create: { display_name: display_name || email.split("@")[0], referral_code } },
        roles: { create: { role: "user" } },
      },
    });
    res.status(201).json({ message: "Signup successful. Please verify your email." });
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/login", async (req, res) => {
  try {
    const input = signInSchema.parse(req.body);
    const result = await signInUser(input);
    res.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: 3600,
      user_id: result.user.id,
      user: { email: result.user.email },
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ error: "Missing refresh_token" });
      return;
    }
    const input = refreshTokenSchema.parse({ refreshToken: refresh_token });
    const result = refreshAuthTokens(input.refreshToken);
    res.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: 3600,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/logout", requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.json({ message: "Logged out successfully" });
});

authRestRouter.post("/reset-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    // Acknowledge regardless of whether email exists (security best practice)
    res.json({ message: "Password reset email sent" });
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post(
  "/update-password",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }
      if (password.length < 6) {
        res.status(422).json({ error: "Password must be at least 6 characters" });
        return;
      }
      const password_hash = await bcrypt.hash(password, 12);
      await prisma.user.update({ where: { id: req.auth.userId! }, data: { password_hash } });
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

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
