import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import type { profileUpdateSchema } from "../schemas/profile.js";
import type { z } from "zod";

export const getUserProfile = async (userId) => {
  const userProfile = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
    id: true,
    email: true,
    roles: {  
      select: {
        role: true
      }
    },
    profile: true,
    created_at: true
  }
  });

  if (!userProfile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Profile not found",
    });
  }

  return {
    userProfile
  };
};


export async function updateUserProfile(
  userId: string,
  updateData: z.infer<typeof profileUpdateSchema>
) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: updateData,
        },
      },
    });

    return { success: true, message: "Profile updated" };
  } catch (error: any) {
    if (error.code === "P2025") {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Profile not found",
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Profile update failed",
    });
  }
}
