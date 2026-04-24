import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import type { bookListSchema } from "../schemas/books.js";
import type { z } from "zod";

export async function listBooks(input: z.infer<typeof bookListSchema>) {
  const {
    limit,
    cursor,
    categoryId,
    search,
    isFeatured,
    isBestseller,
    isFree,
    language,
    authorId,
    publisherId,
  } = input;

  const books = await prisma.book.findMany({
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    where: {
      submission_status: "approved",
      ...(categoryId && { category_id: categoryId }),
      ...(isFeatured !== undefined && { is_featured: isFeatured }),
      ...(isBestseller !== undefined && { is_bestseller: isBestseller }),
      ...(isFree !== undefined && { is_free: isFree }),
      ...(language && { language }),
      ...(authorId && { author_id: authorId }),
      ...(publisherId && { publisher_id: publisherId }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { title_en: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { created_at: "desc" },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          name_en: true,
          avatar_url: true,
          bio: true,
          genre: true,
          is_featured: true,
        },
      },
      publisher: {
        select: {
          id: true,
          name: true,
          name_en: true,
          logo_url: true,
          description: true,
          is_verified: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          name_bn: true,
          slug: true,
          icon: true,
          color: true,
        },
      },
      formats: {
        where: { submission_status: "approved" },
        select: {
          id: true,
          format: true,
          price: true,
          original_price: true,
          discount: true,
          coin_price: true,
          pages: true,
          duration: true,
          in_stock: true,
          is_available: true,
          narrator_id: true,
          binding: true,
          audio_quality: true,
          file_size: true,
          chapters_count: true,
          preview_chapters: true,
          dimensions: true,
          weight: true,
          delivery_days: true,
          stock_count: true,
        },
      },
    },
  });

  let nextCursor: string | undefined;
  if (books.length > limit) {
    const next = books.pop();
    nextCursor = next!.id;
  }

  return { books, nextCursor };
}

export async function getBookById(id: string) {
  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      author: true,
      publisher: true,
      category: true,
      formats: {
        include: {
          narrator: { select: { id: true, name: true, avatar_url: true } },
        },
      },
    },
  });

  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return book;
}
