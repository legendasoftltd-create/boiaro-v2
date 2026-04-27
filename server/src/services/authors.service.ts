// services/authors.service.ts

import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import { response } from "express";

export const getAllAuthors = async (limit: number, offset: number) => {
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

    return {
        authors,
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