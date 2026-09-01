import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router, type Response } from "express";
import { TRPCError } from "@trpc/server";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { refreshTokenSchema, signInSchema } from "../../schemas/auth.js";
import {
  deviceLimitError,
  getMe,
  refreshAuthTokens,
  revokeAllSessions,
  signInUser,
} from "../../services/auth.service.js";
import { resolveDeviceSessionOnLogin } from "../../services/deviceSession.service.js";
import type { DeviceLoginParams } from "../../services/deviceSession.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { findOrCreateUserByEmail } from "../../lib/findOrCreateUser.js";
import { signTokens, ACCESS_TOKEN_EXPIRES_IN_SECONDS } from "../../lib/auth.js";
import { sendMail } from "../../lib/mailer.js";
import { sendOtpSms, normalizeBdPhone } from "../../lib/sms.js";
import { verifyAppleIdToken, findOrCreateAppleUser } from "../../lib/appleAuth.js";
import { bustRevocationCache } from "../../lib/sessionRevocation.js";

export const authRestRouter = Router();

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// REST clients may send device fields in either snake_case (this file's own
// convention, e.g. display_name/referral_code) or camelCase — accept both.
function extractDeviceParams(body: Record<string, unknown>): DeviceLoginParams {
  return {
    deviceId: (body.device_id ?? body.deviceId) as string | undefined,
    deviceName: (body.device_name ?? body.deviceName) as string | undefined,
    platform: body.platform as string | undefined,
    revokeDeviceId: (body.revoke_device_id ?? body.revokeDeviceId) as string | undefined,
  };
}

// Throws sendHttpError-compatible TRPCError if the login should be blocked;
// otherwise resolves with nothing (session row already created/touched).
async function enforceDeviceLimitOrThrow(
  userId: string,
  body: Record<string, unknown>,
  req: { ip?: string; headers: Record<string, unknown> }
): Promise<void> {
  const result = await resolveDeviceSessionOnLogin(userId, {
    ...extractDeviceParams(body),
    ip: req.ip,
    userAgent: req.headers["user-agent"] as string | undefined,
  });
  if (result.allowed === false) throw deviceLimitError(result.limit, result.devices);
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
    expires_in: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
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
    const { email, password, display_name, referral_code: inputReferralCode } = req.body;
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
    const user = await prisma.user.create({
      data: {
        email,
        password_hash,
        profile: { create: { display_name: display_name || email.split("@")[0], referral_code } },
        roles: { create: { role: "user" } },
      },
    });

    // Record pending referral (coins granted on first login)
    if (inputReferralCode) {
      const code = String(inputReferralCode).trim().toUpperCase();
      const referrerProfile = await prisma.profile.findUnique({ where: { referral_code: code } });
      if (referrerProfile && referrerProfile.user_id !== user.id) {
        const signupRewardSetting = await prisma.platformSetting.findUnique({ where: { key: "referral_signup_reward" } });
        const signupReward = parseInt(signupRewardSetting?.value || "20", 10);
        await Promise.all([
          prisma.referral.create({
            data: { referral_code: code, referrer_id: referrerProfile.user_id, referred_user_id: user.id, reward_amount: signupReward, status: "pending", reward_status: "pending" },
          }),
          prisma.profile.update({ where: { user_id: user.id }, data: { referred_by: code } }),
        ]).catch(() => {});
      }
    }

    res.status(201).json({ message: "Signup successful. Please verify your email." });
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/login", async (req, res) => {
  try {
    const input = signInSchema.parse({ ...req.body, ...extractDeviceParams(req.body) });
    const result = await signInUser(input, { ip: req.ip, userAgent: req.headers["user-agent"] });
    res.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
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
    const input = refreshTokenSchema.parse({ refreshToken: refresh_token, ...extractDeviceParams(req.body) });
    const result = await refreshAuthTokens(input.refreshToken, input);
    res.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
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
      const appUrl = (process.env.FRONTEND_URL || process.env.BASE_URL || "https://boiaro.com").replace(/\/$/, "");
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
    const user = await prisma.user.findUnique({
      where: { email },
      omit: { reset_otp: false, reset_otp_expires: false },
    });
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
      data: {
        password_hash,
        reset_otp: null,
        reset_otp_expires: null,
        // A password reset ends every existing session — that is the point of
        // resetting it. Device rows are cleared alongside (revokeAllSessions).
        sessions_valid_from: new Date(),
      },
    });
    // The revoke must land on existing access tokens immediately, not
    // when the cached lookup lapses.
    bustRevocationCache(user.id);
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

    const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
    const referral_code = generateReferralCode();
    const user = await findOrCreateUserByEmail(email, {
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
    });

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    await enforceDeviceLimitOrThrow(user.id, req.body ?? {}, req);

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

    const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
    const referral_code = generateReferralCode();
    const user = await findOrCreateUserByEmail(email, {
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
    });

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    await enforceDeviceLimitOrThrow(user.id, req.body ?? {}, req);

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

async function handleAppleLogin(req: import("express").Request, res: Response) {
  try {
    const idToken = req.body?.id_token ?? req.body?.idToken;
    if (!idToken || typeof idToken !== "string") {
      res.status(400).json({ error: "Missing idToken" });
      return;
    }

    const identity = await verifyAppleIdToken(idToken);
    const firstname = req.body?.firstname as string | undefined;
    const lastname = req.body?.lastname as string | undefined;
    const username = req.body?.username as string | undefined;
    const fallbackName =
      [firstname, lastname].filter(Boolean).join(" ").trim() || username || null;

    const user = await findOrCreateAppleUser(identity, fallbackName);

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    await enforceDeviceLimitOrThrow(user.id, req.body ?? {}, req);

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

authRestRouter.post("/social/apple", handleAppleLogin);

// Legacy alias for older clients
authRestRouter.post("/apple", handleAppleLogin);

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

    const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
    const referral_code = generateReferralCode();
    const user = await findOrCreateUserByEmail(email, {
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
    });

    if (user.profile?.deleted_at) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
    }
    if (user.profile?.is_active === false) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
    }

    await enforceDeviceLimitOrThrow(user.id, req.body ?? {}, req);

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

// ── POST /api/v1/auth/logout-all ─────────────────────────────────────────────
// Ends every session for the signed-in user, on every device.
//
// Plain sign-out is deliberately NOT this: it just drops the tokens the client
// holds, so the user's other devices stay signed in. This is the explicit
// "Sign out from all devices" action, and it is also what a password change or
// a security revoke performs.
authRestRouter.post("/logout-all", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await revokeAllSessions(req.auth.userId!);
    res.json({ success: true, message: "Signed out from all devices" });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── Phone OTP login ───────────────────────────────────────────────────────────

/** Wrong guesses allowed against a single OTP before it is invalidated. */
const MAX_OTP_ATTEMPTS = 5;

authRestRouter.post("/phone/send-otp", async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    if (!rawPhone || typeof rawPhone !== "string") {
      res.status(400).json({ error: "phone is required" });
      return;
    }
    const phone = normalizeBdPhone(rawPhone);

    const recent = await prisma.phoneOtp.findFirst({
      where: { phone, created_at: { gte: new Date(Date.now() - 60_000) } },
      orderBy: { created_at: "desc" },
    });
    if (recent) {
      res.status(429).json({ error: "Please wait before requesting another OTP." });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otp_hash = await bcrypt.hash(otp, 10);
    await prisma.phoneOtp.create({ data: { phone, otp_hash, expires_at: new Date(Date.now() + 5 * 60 * 1000) } });

    const result = await sendOtpSms(phone, `Your BoiAro verification code is: ${otp}. Valid for 5 minutes.`);
    if (!result.success) {
      res.status(500).json({ error: result.error || "Failed to send OTP." });
      return;
    }
    res.json({ sent: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

authRestRouter.post("/phone/verify-otp", async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    const otp = req.body?.otp;
    if (!rawPhone || !otp) {
      res.status(400).json({ error: "phone and otp are required" });
      return;
    }
    const phone = normalizeBdPhone(rawPhone);

    const record = await prisma.phoneOtp.findFirst({
      where: { phone, used: false, expires_at: { gt: new Date() } },
      orderBy: { created_at: "desc" },
    });
    if (!record) {
      res.status(400).json({ error: "OTP expired or not found. Please request a new one." });
      return;
    }
    const valid = await bcrypt.compare(String(otp), record.otp_hash);
    if (!valid) {
      // Burn the code after a handful of wrong guesses. Previously the record
      // stayed usable for its full 5-minute window no matter how many times it
      // was guessed, with only the IP-scoped auth limiter slowing an attacker.
      const updated = await prisma.phoneOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      if (updated.attempts >= MAX_OTP_ATTEMPTS) {
        await prisma.phoneOtp.update({ where: { id: record.id }, data: { used: true } });
        res.status(400).json({ error: "Too many incorrect attempts. Please request a new code." });
        return;
      }
      res.status(400).json({
        error: "Incorrect OTP. Please try again.",
        attempts_remaining: MAX_OTP_ATTEMPTS - updated.attempts,
      });
      return;
    }
    await prisma.phoneOtp.update({ where: { id: record.id }, data: { used: true } });

    const existingProfile = await prisma.profile.findFirst({
      where: { phone },
      include: { user: { include: { roles: true } } },
    });

    let userId: string;
    let userEmail: string;
    let userRoles: string[];
    let userProfile: unknown;

    if (existingProfile?.user) {
      if (existingProfile.deleted_at) {
        res.status(403).json({ error: "Account deleted. Contact support." });
        return;
      }
      if (existingProfile.is_active === false) {
        res.status(403).json({ error: "Account deactivated. Contact support." });
        return;
      }
      userId = existingProfile.user.id;
      userEmail = existingProfile.user.email;
      userRoles = existingProfile.user.roles.map((r) => r.role);
      userProfile = existingProfile;
    } else {
      const email = `phone_${phone}@boiaro.local`;
      const referral_code = generateReferralCode();
      const u = await findOrCreateUserByEmail(email, {
        email,
        password_hash: await bcrypt.hash(crypto.randomUUID(), 12),
        email_verified: true,
        profile: { create: { display_name: phone, phone, referral_code } },
        roles: { create: { role: "user" } },
      });
      userId = u.id;
      userEmail = u.email;
      userRoles = u.roles.map((r) => r.role);
      userProfile = u.profile;
    }

    await enforceDeviceLimitOrThrow(userId, req.body ?? {}, req);

    const { accessToken, refreshToken } = signTokens(userId, userEmail);
    sendSocialLoginResponse(
      res,
      { id: userId, email: userEmail, roles: userRoles, profile: userProfile },
      accessToken,
      refreshToken
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
