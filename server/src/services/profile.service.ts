import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";

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