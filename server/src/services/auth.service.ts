import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import { signTokens, verifyRefreshToken } from "../lib/auth.js";
import type { signInSchema } from "../schemas/auth.js";
import type { z } from "zod";

export async function signInUser(input: z.infer<typeof signInSchema>) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { profile: true, roles: true },
  });
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
  }

  if (user.profile?.deleted_at) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account deleted. Contact support.",
    });
  }
  if (user.profile?.is_active === false) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account deactivated. Contact support.",
    });
  }

  const { accessToken, refreshToken } = signTokens(user.id, user.email);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      roles: user.roles.map((role) => role.role),
      profile: user.profile,
    },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, roles: true },
  });

  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  return {
    id: user.id,
    email: user.email,
    roles: user.roles.map((role) => role.role),
    profile: user.profile,
  };
}

export function refreshAuthTokens(refreshToken: string) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    return signTokens(payload.sub, payload.email);
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid refresh token",
    });
  }
}
