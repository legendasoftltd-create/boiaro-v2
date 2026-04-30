import { prisma } from "../lib/prisma.js";

export async function followProfile(userId: string, profileId: string) {
  const existing = await prisma.follow.findFirst({
    where: { follower_id: userId, followee_id: profileId },
  });

  if (!existing) {
    await prisma.follow.create({
      data: { follower_id: userId, followee_id: profileId },
    });
  }

  const count = await prisma.follow.count({ where: { followee_id: profileId } });
  return { following: true, count };
}

export async function unfollowProfile(userId: string, profileId: string) {
  const existing = await prisma.follow.findFirst({
    where: { follower_id: userId, followee_id: profileId },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
  }

  const count = await prisma.follow.count({ where: { followee_id: profileId } });
  return { following: false, count };
}
