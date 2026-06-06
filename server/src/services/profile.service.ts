import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import { resolveUrls } from "../lib/mediaUrl.js";
import type { profileUpdateSchema } from "../schemas/profile.js";
import type { z } from "zod";

export const getUserProfile = async (userId: string) => {
  const userProfile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      roles: { select: { role: true } },
      profile: true,
      created_at: true,
    },
  });

  if (!userProfile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
  }

  return {
    userProfile: {
      ...userProfile,
      profile: userProfile.profile ? resolveUrls(userProfile.profile) : null,
    },
  };
};

export async function updateUserProfile(
  userId: string,
  updateData: z.infer<typeof profileUpdateSchema>
) {
  const { email, ...profileData } = updateData;

  try {
    await prisma.$transaction(async (tx) => {
      if (email) {
        const trimmed = email.toLowerCase().trim();
        if (trimmed.endsWith("@boiaro.local")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid email address" });
        }
        const conflict = await tx.user.findUnique({ where: { email: trimmed } });
        if (conflict && conflict.id !== userId) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already in use by another account" });
        }
        if (!conflict || conflict.id !== userId) {
          await tx.user.update({ where: { id: userId }, data: { email: trimmed } });
        }
      }

      if (Object.keys(profileData).length > 0) {
        await tx.profile.update({ where: { user_id: userId }, data: profileData });
      }
    });

    return { success: true, message: "Profile updated" };
  } catch (error: any) {
    if (error instanceof TRPCError) throw error;
    if (error.code === "P2025") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Profile update failed" });
  }
}
