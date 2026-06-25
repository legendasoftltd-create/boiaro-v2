import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

export const getAllTranslators = async (
  limit: number,
  offset: number,
  userId?: string | null
) => {
  const safeLimit = Math.min(limit, 50);

  const [translators, total] = await Promise.all([
    prisma.translator.findMany({
      where: {
        status: "active",
      },
      orderBy: [
        {
          priority: "asc",
        },
        {
          created_at: "desc",
        },
      ],
      skip: offset,
      take: safeLimit,
      select: {
        id: true,
        name: true,
        name_en: true,
        avatar_url: true,
        bio: true,
        genre: true,
        is_featured: true,
        is_trending: true,
        priority: true,
      },
    }),

    prisma.translator.count({
      where: {
        status: "active",
      },
    }),
  ]);

  let followedTranslatorIds = new Set<string>();
  if (userId && translators.length > 0) {
    const follows = await prisma.follow.findMany({
      where: {
        follower_id: userId,
        followee_id: { in: translators.map((translator) => translator.id) },
      },
      select: { followee_id: true },
    });
    followedTranslatorIds = new Set(follows.map((follow) => follow.followee_id));
  }

  return {
    translators: translators.map((translator) => ({
      ...translator,
      avatar_url: resolveFileUrl(translator.avatar_url),
      followed: followedTranslatorIds.has(translator.id),
    })),
    total,
    limit: safeLimit,
    offset,
  };
};

export const getTranslatorById = async (id: string, userId?: string | null) => {
  const [translator, followers_count, books_count, followRow] = await Promise.all([
    prisma.translator.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        name_en: true,
        avatar_url: true,
        bio: true,
        genre: true,
        is_featured: true,
        is_trending: true,
      },
    }),
    prisma.follow.count({ where: { followee_id: id } }),
    prisma.book.count({ where: { translator_id: id } }),
    userId
      ? prisma.follow.findFirst({ where: { follower_id: userId, followee_id: id }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (!translator) return { error: "Translator not found" };

  return {
    ...translator,
    avatar_url: resolveFileUrl(translator.avatar_url),
    followers_count,
    books_count,
    is_following: !!followRow,
  };
};
