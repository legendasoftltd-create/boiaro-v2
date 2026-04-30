import { prisma } from "../lib/prisma.js";

export const getAllNarrators = async (userId?: string | null) => {
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

  let followedNarratorIds = new Set<string>();
  if (userId && narrators.length > 0) {
    const follows = await prisma.follow.findMany({
      where: {
        follower_id: userId,
        followee_id: { in: narrators.map((narrator) => narrator.id) },
      },
      select: { followee_id: true },
    });
    followedNarratorIds = new Set(follows.map((follow) => follow.followee_id));
  }

  return {
    narrators: narrators.map((narrator) => ({
      ...narrator,
      followed: followedNarratorIds.has(narrator.id),
    })),
  };
};