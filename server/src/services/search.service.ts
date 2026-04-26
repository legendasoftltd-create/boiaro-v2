import { prisma } from "../lib/prisma.js";

export const searchBooks = async (q: string) => {
  const books = await prisma.book.findMany({
    where: {
      submission_status: "approved",
      title: {
        contains: q,
        mode: "insensitive",
      },
    },
    take: 20,
    orderBy: {
      total_reads: "desc",
    },
    select: {
      id: true,
      title: true,
      title_en: true,
      slug: true,
      cover_url: true,
      rating: true,
      is_free: true,
      author: {
        select: {
          name: true,
        },
      },
    },
  });

  return {
    results: books,
  };
};