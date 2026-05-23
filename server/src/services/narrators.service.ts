import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

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
      avatar_url: resolveFileUrl(narrator.avatar_url),
      followed: followedNarratorIds.has(narrator.id),
    })),
  };
};

export const getNarratorById = async (id: string, userId?: string | null) => {
  const [narrator, followers_count, books_count, followRow] = await Promise.all([
    prisma.narrator.findUnique({
      where: { id },
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
    }),
    prisma.follow.count({ where: { followee_id: id } }),
    prisma.bookFormat.count({ where: { narrator_id: id } }),
    userId
      ? prisma.follow.findFirst({ where: { follower_id: userId, followee_id: id }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (!narrator) return { error: "Narrator not found" };

  return {
    ...narrator,
    avatar_url: resolveFileUrl(narrator.avatar_url),
    followers_count,
    books_count,
    is_following: !!followRow,
  };
};