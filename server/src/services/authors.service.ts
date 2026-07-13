// services/authors.service.ts

import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

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
          avatar_url: resolveFileUrl(author.avatar_url),
          followed: followedAuthorIds.has(author.id),
        })),
        total,
        limit: safeLimit,
        offset,
    };
};


export const getAuthorById = async (id: string, userId?: string | null) => {
    const [author, followers_count, books_count, followRow] = await Promise.all([
        prisma.author.findUnique({
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
        prisma.book.count({ where: { author_id: id, submission_status: "approved", is_active: true } }),
        userId
            ? prisma.follow.findFirst({ where: { follower_id: userId, followee_id: id }, select: { id: true } })
            : Promise.resolve(null),
    ]);

    if (!author) return { error: "Author not found" };

    return {
        ...author,
        avatar_url: resolveFileUrl(author.avatar_url),
        followers_count,
        books_count,
        is_following: !!followRow,
    };
};