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
import { sendMail } from "../../lib/mailer.js";

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
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await prisma.user.update({
        where: { id: user.id },
        data: { reset_otp: token, reset_otp_expires: expires },
      });
      const appUrl = (process.env.FRONTEND_URL || process.env.BASE_URL || "https://boiaro.com.bd").replace(/\/$/, "");
      const resetLink = `${appUrl}/reset-password?email=${encodeURIComponent(user.email)}&token=${token}`;
      await sendMail({
        to: email,
        subject: "Reset Your BoiAro Password",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#6d28d9">Reset Your Password</h2>
            <p>Click the button below to reset your BoiAro password. This link expires in <strong>1 hour</strong>.</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${resetLink}"
                 style="background:#6d28d9;color:#fff;text-decoration:none;padding:14px 32px;
                        border-radius:8px;font-size:15px;font-weight:600;display:inline-block">
                Reset Password
              </a>
            </div>
            <p style="color:#6b7280;font-size:13px">Or copy this link:<br>
              <a href="${resetLink}" style="color:#6d28d9;word-break:break-all">${resetLink}</a>
            </p>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">
              If you did not request a password reset, you can safely ignore this email.
            </p>
          </div>
        `,
        text: `Reset your BoiAro password by visiting:\n${resetLink}\n\nThis link expires in 1 hour.`,
      });
    }
    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/reset-password-confirm", async (req, res) => {
  try {
    const { email, token, otp, password } = req.body;
    const resetToken = token ?? otp; // accept both field names for compatibility
    if (!email || !resetToken || !password) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    if (password.length < 6) {
      res.status(422).json({ error: "Password must be at least 6 characters" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !user.reset_otp ||
      user.reset_otp !== resetToken.toString() ||
      !user.reset_otp_expires ||
      user.reset_otp_expires < new Date()
    ) {
      res.status(400).json({ error: "Invalid or expired reset link" });
      return;
    }
    const password_hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash, reset_otp: null, reset_otp_expires: null },
    });
    res.json({ message: "Password reset successfully" });
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

// ── Shared Google token verification ─────────────────────────────────────────
// Accepts id_token (preferred) or access_token (legacy).
// id_token: JWT from Google Identity Services — verified via tokeninfo, contains
//   email/name/picture directly, email_verified is a boolean.
// access_token: OAuth2 token — verified via tokeninfo + separate userinfo call,
//   email_verified comes back as the string "true".
async function verifyGoogleToken(body: Record<string, unknown>): Promise<{
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}> {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Server Google login is not configured (missing GOOGLE_CLIENT_ID).",
    });
  }

  const idToken =
    (body.id_token as string | undefined) ??
    (body.idToken as string | undefined);

  const accessToken =
    (body.access_token as string | undefined) ??
    (body.accessToken as string | undefined);

  if (!idToken && !accessToken) {
    throw Object.assign(new Error("Missing id_token or access_token"), { statusCode: 400 });
  }

  if (idToken) {
    // ── id_token path ──────────────────────────────────────────────────────
    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!tokenInfoRes.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Google ID token." });
    }
    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      picture?: string;
      error_description?: string;
    };
    if (tokenInfo.error_description) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: `Google: ${tokenInfo.error_description}` });
    }
    if (tokenInfo.aud !== googleClientId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Google token audience mismatch." });
    }
    if (!tokenInfo.email || !tokenInfo.email_verified) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Google email is not verified." });
    }
    return {
      email: tokenInfo.email.toLowerCase(),
      displayName: tokenInfo.name ?? null,
      avatarUrl: tokenInfo.picture ?? null,
    };
  }

  // ── access_token path (legacy) ────────────────────────────────────────────
  const tokenInfoRes = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken!)}`
  );
  if (!tokenInfoRes.ok) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Google access token." });
  }
  const tokenInfo = (await tokenInfoRes.json()) as {
    aud?: string;
    azp?: string;
    email?: string;
    email_verified?: boolean | string;
    error_description?: string;
  };
  if (tokenInfo.error_description) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: `Google: ${tokenInfo.error_description}` });
  }
  const clientMatch = tokenInfo.aud === googleClientId || tokenInfo.azp === googleClientId;
  if (!clientMatch) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Google token audience mismatch." });
  }
  const verified = tokenInfo.email_verified === true || tokenInfo.email_verified === "true";
  if (!tokenInfo.email || !verified) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Google email is not verified." });
  }

  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (userInfoRes.ok) {
    const userInfo = (await userInfoRes.json()) as { name?: string; picture?: string };
    displayName = userInfo.name ?? null;
    avatarUrl = userInfo.picture ?? null;
  }

  return { email: tokenInfo.email.toLowerCase(), displayName, avatarUrl };
}

async function handleGoogleLogin(req: import("express").Request, res: Response) {
  try {
    const { email, displayName, avatarUrl } = await verifyGoogleToken(req.body ?? {});

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
              display_name: displayName || email.split("@")[0],
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

    const { accessToken: jwtAccessToken, refreshToken: jwtRefreshToken } = signTokens(user.id, user.email);
    sendSocialLoginResponse(
      res,
      { id: user.id, email: user.email, roles: user.roles.map((r) => r.role), profile: user.profile },
      jwtAccessToken,
      jwtRefreshToken
    );
  } catch (error) {
    sendHttpError(res, error);
  }
}

authRestRouter.post("/social/google", handleGoogleLogin);

// Legacy alias for older clients
authRestRouter.post("/google", handleGoogleLogin);

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
