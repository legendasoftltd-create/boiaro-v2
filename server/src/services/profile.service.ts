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


export async function updateUserProfile(userId: string, updateData: any) {
  try {
    
    const allowedFields = [
      "display_name",
      "full_name",
      "avatar_url",
      "bio",
      "preferred_language",
    ];

    const incomingFields = Object.keys(updateData);

    const invalidFields = incomingFields.filter(field => !allowedFields.includes(field));

    if (invalidFields.length > 0) {
      return { 
        success: false, 
        message: `Invalid fields: ${invalidFields.join(", ")}. Please only use allowed fields.` 
      };
    }

    const filteredData: any = {};
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });

   
    if (Object.keys(filteredData).length === 0) {
      return { success: false, message: "No data provided to update" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: filteredData,
        },
      },
    });

    return { success: true, message: "Profile updated" };

  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: "Profile not found" };
    }
    return { success: false, message: "Update failed: " + error.message };
  }
}