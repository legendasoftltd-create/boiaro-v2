// services/profile-roles.service.ts

import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";

export const getUserRoles = async (userId: string) => {
  const userRoles = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      roles: {
        select: {
          role: true,
        },
      },
    },
  });

  if (!userRoles) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User roles not found",
    });
  }

  return {
    roles: userRoles.roles.map((item) => item.role),
  };
};