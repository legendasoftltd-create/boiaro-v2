import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function signTokens(userId: string, email: string) {
  const accessToken = jwt.sign(
    { sub: userId, email },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" }
  );
  const refreshToken = jwt.sign(
    { sub: userId, email },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "30d" }
  );
  return { accessToken, refreshToken };
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
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .mutation(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { email: input.email },
        include: { profile: true, roles: true },
      });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });

      const valid = await bcrypt.compare(input.password, user.password_hash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });

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

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      let payload: { sub: string; email: string };
      try {
        payload = jwt.verify(input.refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid refresh token" });
      }
      const { accessToken, refreshToken } = signTokens(payload.sub, payload.email);
      return { accessToken, refreshToken };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { profile: true, roles: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role),
      profile: user.profile,
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
    }))
    .mutation(async ({ ctx, input }) => {
      await prisma.profile.update({
        where: { user_id: ctx.userId! },
        data: input,
      });
      return { success: true };
    }),
});
