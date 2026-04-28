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

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const authRouter = router({
  signUp: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      displayName: z.string().optional(),
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

      return { user: { id: user.id, email: user.email } };
    }),

  signIn: publicProcedure
    .input(signInSchema)
    .mutation(async ({ input }) => signInUser(input)),

  signInWithGoogle: publicProcedure
    .input(
      z.object({
        accessToken: z.string().min(1),
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

      const tokenInfoRes = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(input.accessToken)}`
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
        headers: { Authorization: `Bearer ${input.accessToken}` },
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
    }))
    .mutation(async ({ ctx, input }) => {
      await prisma.profile.update({
        where: { user_id: ctx.userId! },
        data: input,
      });
      return { success: true };
    }),
});
