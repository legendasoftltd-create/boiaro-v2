// services/authors.service.ts

import { prisma } from "../lib/prisma.js";

export const getAllAuthors = async (
  limit: number,
  offset: number,
  userId?: string | null
) => {
    const safeLimit = Math.min(limit, 50);

    const [authors, total] = await Promise.all([
        prisma.author.findMany({
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

        prisma.author.count({
            where: {
                status: "active",
            },
        }),
    ]);

    let followedAuthorIds = new Set<string>();
    if (userId && authors.length > 0) {
      const follows = await prisma.follow.findMany({
        where: {
          follower_id: userId,
          followee_id: { in: authors.map((author) => author.id) },
        },
        select: { followee_id: true },
      });
      followedAuthorIds = new Set(follows.map((follow) => follow.followee_id));
    }

    return {
        authors: authors.map((author) => ({
          ...author,
          followed: followedAuthorIds.has(author.id),
        })),
        total,
        limit: safeLimit,
        offset,
    };
};


export const getAuthorById = async (id: string) => {
    const author = await prisma.author.findUnique({
        where: {
            id,
        },
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
    });

    if (!author) {
        return ({
            error: "Author not found",
        });
    }

    return author;
};