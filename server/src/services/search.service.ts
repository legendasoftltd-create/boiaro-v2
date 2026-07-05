import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

export const searchBooks = async (q: string, limit = 20, offset = 0) => {
  const where = {
    submission_status: "approved",
    OR: [
      { title: { contains: q, mode: "insensitive" as const } },
      { title_en: { contains: q, mode: "insensitive" as const } },
    ],
  };

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { total_reads: "desc" },
      select: {
        id: true,
        title: true,
        title_en: true,
        slug: true,
        cover_url: true,
        rating: true,
        is_free: true,
        author: { select: { name: true } },
        translator: { select: { name: true } },
        formats: {
          where: { is_available: true },
          select: { format: true, price: true },
        },
      },
    }),
    prisma.book.count({ where }),
  ]);

  return {
    results: books.map((b) => ({ ...b, cover_url: resolveFileUrl(b.cover_url) })),
    total,
    limit,
    offset,
    has_more: offset + limit < total,
  };
};
