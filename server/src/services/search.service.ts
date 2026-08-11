import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

export type SearchBookFormat = "ebook" | "audiobook" | "hardcopy";

export const searchBooks = async (q: string, limit = 20, offset = 0, format?: SearchBookFormat) => {
  const where = {
    submission_status: "approved",
    is_active: true,
    OR: [
      { title: { contains: q, mode: "insensitive" as const } },
      { title_en: { contains: q, mode: "insensitive" as const } },
    ],
    // Matches the format filter's shape on every other list endpoint
    // (category-sections, /books, /categories/:id/books) — a book only
    // matches if it has an available, approved format row of this type.
    ...(format ? { formats: { some: { format, is_available: true, submission_status: "approved" } } } : {}),
  };

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }],
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
