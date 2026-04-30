import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router, type Response } from "express";
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

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sendSocialLoginResponse(
  res: Response,
  user: {
    id: string;
    email: string;
    roles: string[];
    profile: unknown;
  },
  accessToken: string,
  refreshToken: string
) {
  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    user_id: user.id,
    user: {
      id: user.id,
      email: user.email,
      roles: user.roles,
      profile: user.profile,
    },
  });
}

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
    const referral_code = generateReferralCode();
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

authRestRouter.post("/social/google", async (req, res) => {
  try {
    const accessToken = req.body?.access_token ?? req.body?.accessToken;
    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "Missing access_token" });
      return;
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server Google login is not configured (missing GOOGLE_CLIENT_ID).",
      });
    }

    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!tokenInfoRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Google access token." });
    }

    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      email?: string;
      email_verified?: string;
    };
    if (tokenInfo.aud !== googleClientId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Google token audience mismatch." });
    }
    if (!tokenInfo.email || tokenInfo.email_verified !== "true") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Google email is not verified." });
    }

    const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to fetch Google user profile." });
    }

    const userInfo = (await userInfoRes.json()) as {
      email?: string;
      name?: string;
      picture?: string;
    };
    const email = (userInfo.email || tokenInfo.email).toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, roles: true },
    });

    if (!user) {
      const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
      const referral_code = generateReferralCode();
      user = await prisma.user.create({
        data: {
          email,
          password_hash,
          email_verified: true,
          profile: {
            create: {
              display_name: userInfo.name || email.split("@")[0],
              avatar_url: userInfo.picture || null,
              referral_code,
            },
          },
          roles: { create: { role: "user" } },
        },
        include: { profile: true, roles: true },
      });
    }

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    const { accessToken: jwtAccessToken, refreshToken: jwtRefreshToken } = signTokens(
      user.id,
      user.email
    );
    sendSocialLoginResponse(
      res,
      {
        id: user.id,
        email: user.email,
        roles: user.roles.map((role) => role.role),
        profile: user.profile,
      },
      jwtAccessToken,
      jwtRefreshToken
    );
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/google", async (req, res) => {
  try {
    const accessToken = req.body?.access_token ?? req.body?.accessToken;
    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "Missing access_token" });
      return;
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server Google login is not configured (missing GOOGLE_CLIENT_ID).",
      });
    }

    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!tokenInfoRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Google access token." });
    }

    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      email?: string;
      email_verified?: string;
    };
    if (tokenInfo.aud !== googleClientId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Google token audience mismatch." });
    }
    if (!tokenInfo.email || tokenInfo.email_verified !== "true") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Google email is not verified." });
    }

    const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to fetch Google user profile." });
    }

    const userInfo = (await userInfoRes.json()) as {
      email?: string;
      name?: string;
      picture?: string;
    };
    const email = (userInfo.email || tokenInfo.email).toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, roles: true },
    });

    if (!user) {
      const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
      const referral_code = generateReferralCode();
      user = await prisma.user.create({
        data: {
          email,
          password_hash,
          email_verified: true,
          profile: {
            create: {
              display_name: userInfo.name || email.split("@")[0],
              avatar_url: userInfo.picture || null,
              referral_code,
            },
          },
          roles: { create: { role: "user" } },
        },
        include: { profile: true, roles: true },
      });
    }

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    const { accessToken: jwtAccessToken, refreshToken: jwtRefreshToken } = signTokens(
      user.id,
      user.email
    );
    sendSocialLoginResponse(
      res,
      {
        id: user.id,
        email: user.email,
        roles: user.roles.map((role) => role.role),
        profile: user.profile,
      },
      jwtAccessToken,
      jwtRefreshToken
    );
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/social/facebook", async (req, res) => {
  try {
    const accessToken = req.body?.access_token ?? req.body?.accessToken;
    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "Missing access_token" });
      return;
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Facebook login is not configured on the server.",
      });
    }

    const debugRes = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
    );
    if (!debugRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to verify Facebook token." });
    }

    const debug = (await debugRes.json()) as { data?: { is_valid?: boolean; app_id?: string } };
    if (!debug.data?.is_valid || debug.data.app_id !== appId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Facebook access token." });
    }

    const meRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!meRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to fetch Facebook profile." });
    }
    const me = (await meRes.json()) as {
      id?: string;
      name?: string;
      email?: string;
      picture?: { data?: { url?: string } };
    };

    const email = me.email ? me.email.toLowerCase() : `fb_${me.id}@facebook.com`;
    const avatarUrl = me.picture?.data?.url || null;

    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, roles: true },
    });

    if (!user) {
      const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
      const referral_code = generateReferralCode();
      user = await prisma.user.create({
        data: {
          email,
          password_hash,
          email_verified: true,
          profile: {
            create: {
              display_name: me.name || email.split("@")[0],
              avatar_url: avatarUrl,
              referral_code,
            },
          },
          roles: { create: { role: "user" } },
        },
        include: { profile: true, roles: true },
      });
    }

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    const { accessToken: jwtAccessToken, refreshToken: jwtRefreshToken } = signTokens(
      user.id,
      user.email
    );
    sendSocialLoginResponse(
      res,
      {
        id: user.id,
        email: user.email,
        roles: user.roles.map((role) => role.role),
        profile: user.profile,
      },
      jwtAccessToken,
      jwtRefreshToken
    );
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/facebook", async (req, res) => {
  try {
    const accessToken = req.body?.access_token ?? req.body?.accessToken;
    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "Missing access_token" });
      return;
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Facebook login is not configured on the server.",
      });
    }

    const debugRes = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
    );
    if (!debugRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to verify Facebook token." });
    }

    const debug = (await debugRes.json()) as { data?: { is_valid?: boolean; app_id?: string } };
    if (!debug.data?.is_valid || debug.data.app_id !== appId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Facebook access token." });
    }

    const meRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!meRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to fetch Facebook profile." });
    }
    const me = (await meRes.json()) as {
      id?: string;
      name?: string;
      email?: string;
      picture?: { data?: { url?: string } };
    };

    const email = me.email ? me.email.toLowerCase() : `fb_${me.id}@facebook.com`;
    const avatarUrl = me.picture?.data?.url || null;

    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, roles: true },
    });

    if (!user) {
      const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
      const referral_code = generateReferralCode();
      user = await prisma.user.create({
        data: {
          email,
          password_hash,
          email_verified: true,
          profile: {
            create: {
              display_name: me.name || email.split("@")[0],
              avatar_url: avatarUrl,
              referral_code,
            },
          },
          roles: { create: { role: "user" } },
        },
        include: { profile: true, roles: true },
      });
    }

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    const { accessToken: jwtAccessToken, refreshToken: jwtRefreshToken } = signTokens(
      user.id,
      user.email
    );
    sendSocialLoginResponse(
      res,
      {
        id: user.id,
        email: user.email,
        roles: user.roles.map((role) => role.role),
        profile: user.profile,
      },
      jwtAccessToken,
      jwtRefreshToken
    );
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
