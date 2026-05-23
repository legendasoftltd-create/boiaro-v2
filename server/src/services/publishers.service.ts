import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

export const getAllPublishers = async (userId?: string | null) => {
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

  let followedPublisherIds = new Set<string>();
  if (userId && publishers.length > 0) {
    const follows = await prisma.follow.findMany({
      where: {
        follower_id: userId,
        followee_id: { in: publishers.map((publisher) => publisher.id) },
      },
      select: { followee_id: true },
    });
    followedPublisherIds = new Set(follows.map((follow) => follow.followee_id));
  }

  return {
    publishers: publishers.map((publisher) => ({
      ...publisher,
      logo_url: resolveFileUrl(publisher.logo_url),
      followed: followedPublisherIds.has(publisher.id),
    })),
  };
};

export const getPublisherById = async (id: string, userId?: string | null) => {
  const [publisher, followers_count, books_count, followRow] = await Promise.all([
    prisma.publisher.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        name_en: true,
        logo_url: true,
        description: true,
        is_verified: true,
        is_featured: true,
      },
    }),
    prisma.follow.count({ where: { followee_id: id } }),
    prisma.book.count({ where: { publisher_id: id } }),
    userId
      ? prisma.follow.findFirst({ where: { follower_id: userId, followee_id: id }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (!publisher) return { error: "Publisher not found" };

  return {
    ...publisher,
    logo_url: resolveFileUrl(publisher.logo_url),
    followers_count,
    books_count,
    is_following: !!followRow,
  };
};