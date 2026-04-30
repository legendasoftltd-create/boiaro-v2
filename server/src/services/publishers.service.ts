import { prisma } from "../lib/prisma.js";

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
      followed: followedPublisherIds.has(publisher.id),
    })),
  };
};