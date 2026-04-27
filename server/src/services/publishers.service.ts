import { prisma } from "../lib/prisma.js";

export const getAllPublishers = async () => {
  const publishers = await prisma.publisher.findMany({
    where: {
      status: "active",
    },
    orderBy: [
      {
        is_verified: "desc",
      },
      {
        is_featured: "desc",
      },
      {
        created_at: "desc",
      },
    ],
    select: {
      id: true,
      name: true,
      name_en: true,
      logo_url: true,
      description: true,
      is_verified: true,
      is_featured: true,
    },
  });

  return {
    publishers,
  };
};