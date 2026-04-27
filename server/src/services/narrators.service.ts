import { prisma } from "../lib/prisma.js";

export const getAllNarrators = async () => {
  const narrators = await prisma.narrator.findMany({
    where: {
      status: "active",
    },
    orderBy: [
      {
        is_featured: "desc",
      },
      {
        is_trending: "desc",
      },
      {
        rating: "desc",
      },
      {
        created_at: "desc",
      },
    ],
    select: {
      id: true,
      name: true,
      name_en: true,
      avatar_url: true,
      bio: true,
      specialty: true,
      rating: true,
      is_featured: true,
      is_trending: true,
    },
  });

  return {
    narrators,
  };
};