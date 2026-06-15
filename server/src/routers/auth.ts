import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { signTokens } from "../lib/auth.js";
import { refreshTokenSchema, signInSchema } from "../schemas/auth.js";
import {
  getMe,
  refreshAuthTokens,
  signInUser,
} from "../services/auth.service.js";
import { sendNotificationEmail } from "../lib/mailer.js";
import { sendOtpSms, normalizeBdPhone } from "../lib/sms.js";

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export const authRouter = router({
  signUp: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      displayName: z.string().optional(),
      referralCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });

      const password_hash = await bcrypt.hash(input.password, 12);
      const referral_code = generateReferralCode();

      const user = await prisma.user.create({
        data: {
          email: input.email,
          password_hash,
          profile: {
            create: {
              display_name: input.displayName || input.email.split("@")[0],
              referral_code,
            },
          },
          roles: { create: { role: "user" } },
        },
      });

      // Record referral as pending — coins granted only after email verification
      if (input.referralCode) {
        const code = input.referralCode.trim().toUpperCase();
        const referrerProfile = await prisma.profile.findUnique({ where: { referral_code: code } });
        if (referrerProfile && referrerProfile.user_id !== user.id) {
          const signupRewardSetting = await prisma.platformSetting.findUnique({ where: { key: "referral_signup_reward" } });
          const signupReward = parseInt(signupRewardSetting?.value || "20", 10);
          await Promise.all([
            prisma.referral.create({
              data: {
                referral_code: code,
                referrer_id: referrerProfile.user_id,
                referred_user_id: user.id,
                reward_amount: signupReward,
                status: "pending",       // stays pending until email verified
                reward_status: "pending",
              },
            }),
            prisma.profile.update({
              where: { user_id: user.id },
              data: { referred_by: code },
            }),
          ]).catch(() => {});
        }
      }

      sendNotificationEmail({
        to: user.email,
        subject: "Welcome to BoiAro!",
        templateType: "welcome",
        bodyHtml: `<h2 style="color:#6d28d9">Welcome to BoiAro, ${input.displayName || user.email.split("@")[0]}!</h2>
          <p>Your account has been created successfully. Start exploring thousands of books today.</p>
          <a href="https://boiaro.com" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none">Browse Books</a>`,
        text: `Welcome to BoiAro! Your account is ready.`,
      }).catch(() => {});

      return { user: { id: user.id, email: user.email } };
    }),

  signIn: publicProcedure
    .input(signInSchema)
    .mutation(async ({ input }) => signInUser(input)),

  signInWithGoogle: publicProcedure
    .input(
      z.object({
        // Accept id_token (preferred) or access_token (legacy)
        idToken: z.string().min(1).optional(),
        accessToken: z.string().min(1).optional(),
      }).refine((d) => d.idToken || d.accessToken, {
        message: "Either idToken or accessToken is required",
      })
    )
    .mutation(async ({ input }) => {
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Server Google login is not configured (missing GOOGLE_CLIENT_ID).",
        });
      }

      let email: string;
      let displayName: string | null = null;
      let avatarUrl: string | null = null;

      if (input.idToken) {
        // ── id_token path (preferred) ──────────────────────────────────────
        // tokeninfo validates the JWT signature and expiry server-side;
        // the payload contains email, name, picture directly.
        const tokenInfoRes = await fetch(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${encodeURIComponent(input.idToken)}`
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

        email = tokenInfo.email.toLowerCase();
        displayName = tokenInfo.name ?? null;
        avatarUrl = tokenInfo.picture ?? null;
      } else {
        // ── access_token path (legacy) ─────────────────────────────────────
        const tokenInfoRes = await fetch(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(input.accessToken!)}`
        );
        if (!tokenInfoRes.ok) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Google access token." });
        }

        const tokenInfo = (await tokenInfoRes.json()) as {
          aud?: string;
          azp?: string;
          email?: string;
          email_verified?: string | boolean;
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

        email = tokenInfo.email.toLowerCase();

        // Fetch name/picture from userinfo for access_token
        const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${input.accessToken}` },
        });
        if (userInfoRes.ok) {
          const userInfo = (await userInfoRes.json()) as { name?: string; picture?: string };
          displayName = userInfo.name ?? null;
          avatarUrl = userInfo.picture ?? null;
        }
      }

      // ── Find or create user ────────────────────────────────────────────────
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

      if (user.profile?.deleted_at) throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
      if (user.profile?.is_active === false) throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });

      const { accessToken, refreshToken } = signTokens(user.id, user.email);
      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          roles: user.roles.map((r) => r.role),
          profile: user.profile,
        },
      };
    }),

  signInWithFacebook: publicProcedure
    .input(z.object({ accessToken: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      if (!appId || !appSecret) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Facebook login is not configured on the server." });
      }

      // Verify the token is issued to our app
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(input.accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
      );
      if (!debugRes.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to verify Facebook token." });
      const debug = (await debugRes.json()) as { data?: { is_valid?: boolean; app_id?: string } };
      if (!debug.data?.is_valid || debug.data.app_id !== appId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Facebook access token." });
      }

      // Fetch user profile
      const meRes = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(input.accessToken)}`
      );
      if (!meRes.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Failed to fetch Facebook profile." });
      const me = (await meRes.json()) as { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } };

      // Facebook may not return email if user uses phone or hasn't granted it
      const email = me.email ? me.email.toLowerCase() : `fb_${me.id}@facebook.com`;
      const avatarUrl = me.picture?.data?.url || null;

      let user = await prisma.user.findUnique({ where: { email }, include: { profile: true, roles: true } });

      if (!user) {
        const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
        const referral_code = generateReferralCode();
        user = await prisma.user.create({
          data: {
            email,
            password_hash,
            email_verified: true,
            profile: { create: { display_name: me.name || email.split("@")[0], avatar_url: avatarUrl, referral_code } },
            roles: { create: { role: "user" } },
          },
          include: { profile: true, roles: true },
        });
      }

      if (user.profile?.deleted_at) throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
      if (user.profile?.is_active === false) throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });

      const { accessToken, refreshToken } = signTokens(user.id, user.email);
      return {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, roles: user.roles.map((r) => r.role), profile: user.profile },
      };
    }),

  refresh: publicProcedure
    .input(refreshTokenSchema)
    .mutation(async ({ input }) => refreshAuthTokens(input.refreshToken)),

  me: protectedProcedure.query(async ({ ctx }) => getMe(ctx.userId!)),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await prisma.user.update({
          where: { id: user.id },
          data: { reset_otp: token, reset_otp_expires: expires },
        });
        const appUrl = (process.env.FRONTEND_URL || process.env.BASE_URL || "https://boiaro.com").replace(/\/$/, "");
        const resetLink = `${appUrl}/reset-password?email=${encodeURIComponent(user.email)}&token=${token}`;
        sendNotificationEmail({
          to: user.email,
          subject: "Reset Your BoiAro Password",
          templateType: "password_reset",
          bodyHtml: `
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
            </p>`,
          text: `Reset your BoiAro password by visiting:\n${resetLink}\n\nThis link expires in 1 hour.`,
        }).catch(() => {});
      }
      return { message: "If that email is registered, a reset link has been sent." };
    }),

  confirmPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email(), otp: z.string(), password: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (
        !user ||
        !user.reset_otp ||
        user.reset_otp !== input.otp ||
        !user.reset_otp_expires ||
        user.reset_otp_expires < new Date()
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired OTP" });
      }
      const password_hash = await bcrypt.hash(input.password, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { password_hash, reset_otp: null, reset_otp_expires: null },
      });
      return { message: "Password reset successfully" };
    }),

  sendPhoneOtp: publicProcedure
    .input(z.object({ phone: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const phone = normalizeBdPhone(input.phone);

      // Rate-limit: no more than 1 OTP per minute per phone
      const recent = await prisma.phoneOtp.findFirst({
        where: {
          phone,
          created_at: { gte: new Date(Date.now() - 60_000) },
        },
        orderBy: { created_at: "desc" },
      });
      if (recent) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait before requesting another OTP." });
      }

      const otp = String(100000 + (crypto.randomInt(900000))); // 6-digit crypto-secure
      const otp_hash = await bcrypt.hash(otp, 10);
      const expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 min

      await prisma.phoneOtp.create({ data: { phone, otp_hash, expires_at } });

      const result = await sendOtpSms(phone, `Your BoiAro verification code is: ${otp}. Valid for 5 minutes.`);
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send OTP." });
      }

      return { sent: true };
    }),

  verifyPhoneOtp: publicProcedure
    .input(z.object({ phone: z.string().min(6), otp: z.string().length(6) }))
    .mutation(async ({ input }) => {
      const phone = normalizeBdPhone(input.phone);

      const record = await prisma.phoneOtp.findFirst({
        where: { phone, used: false, expires_at: { gt: new Date() } },
        orderBy: { created_at: "desc" },
      });

      if (!record) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "OTP expired or not found. Please request a new one." });
      }

      const valid = await bcrypt.compare(input.otp, record.otp_hash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect OTP. Please try again." });
      }

      // Mark used
      await prisma.phoneOtp.update({ where: { id: record.id }, data: { used: true } });

      // Find user by profile phone, or create one
      const existingProfile = await prisma.profile.findFirst({
        where: { phone },
        include: { user: { include: { roles: true } } },
      });

      let user: { id: string; email: string; roles: { role: string }[]; profile: any };

      if (existingProfile?.user) {
        const u = existingProfile.user;
        if (existingProfile.deleted_at) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Account deleted. Contact support." });
        }
        if (existingProfile.is_active === false) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Account deactivated. Contact support." });
        }
        user = { id: u.id, email: u.email, roles: u.roles, profile: existingProfile };
      } else {
        // New user — create account keyed to phone
        const email = `phone_${phone}@boiaro.local`;
        const existingByEmail = await prisma.user.findUnique({ where: { email } });
        if (existingByEmail) {
          const profile = await prisma.profile.findUnique({ where: { user_id: existingByEmail.id } });
          user = { id: existingByEmail.id, email: existingByEmail.email, roles: [], profile };
        } else {
          const referral_code = generateReferralCode();
          const newUser = await prisma.user.create({
            data: {
              email,
              password_hash: await bcrypt.hash(crypto.randomUUID(), 12),
              email_verified: true,
              profile: { create: { display_name: phone, phone, referral_code } },
              roles: { create: { role: "user" } },
            },
            include: { roles: true, profile: true },
          });
          user = { id: newUser.id, email: newUser.email, roles: newUser.roles, profile: newUser.profile };
        }
      }

      const { accessToken, refreshToken } = signTokens(user.id, user.email);
      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          roles: user.roles.map((r) => r.role),
          profile: user.profile,
        },
      };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      display_name: z.string().optional(),
      bio: z.string().optional(),
      avatar_url: z.string().optional(),
      phone: z.string().optional(),
      preferred_language: z.string().optional(),
      website_url: z.string().optional(),
      facebook_url: z.string().optional(),
      instagram_url: z.string().optional(),
      youtube_url: z.string().optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { email, ...profileData } = input;

      if (email) {
        const trimmed = email.toLowerCase().trim();
        if (trimmed.endsWith("@boiaro.local")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid email address" });
        }
        const conflict = await prisma.user.findUnique({ where: { email: trimmed } });
        if (conflict && conflict.id !== ctx.userId) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already in use by another account" });
        }
        if (!conflict || conflict.id !== ctx.userId) {
          await prisma.user.update({ where: { id: ctx.userId! }, data: { email: trimmed } });
        }
      }

      if (Object.keys(profileData).length > 0) {
        await prisma.profile.update({ where: { user_id: ctx.userId! }, data: profileData });
      }

      return { success: true };
    }),
});
