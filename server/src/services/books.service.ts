import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import type {
  bookListSchema,
  bookReviewsQuerySchema,
  postReviewSchema,
} from "../schemas/books.js";
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
    author,
    publisher,
    narrator,
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
      ...((authorId || author) && { author_id: authorId ?? author }),
      ...((publisherId || publisher) && { publisher_id: publisherId ?? publisher }),
      ...(narrator && {
        formats: {
          some: {
            narrator_id: narrator,
            submission_status: "approved",
            is_available: true,
          },
        },
      }),
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
        where: { submission_status: "approved", is_available: true },
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
          narrator: { select: { id: true, name: true, avatar_url: true } },
        },
      },
    },
  });

  let nextCursor: string | undefined;
  if (books.length > limit) {
    const next = books.pop();
    nextCursor = next!.id;
  }

  const booksWithNarrators = books.map((book) => ({
    ...book,
    formats: book.formats.map((format) => ({
      ...format,
      narrators: format.narrator ?? null,
    })),
  }));

  return { books: booksWithNarrators, nextCursor };
}

export async function getBookById(id: string) {
  const book = await prisma.book.findFirst({
    where: {
      id,
      submission_status: "approved",
    },
    include: {
      author: true,
      publisher: true,
      category: true,
      formats: {
        where: { submission_status: "approved", is_available: true },
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

function appendFollowedStatusToBookDetails(
  book: any,
  followedProfileIds: Set<string>
) {
  return {
    ...book,
    author: book.author
      ? { ...book.author, followed: followedProfileIds.has(book.author.id) }
      : null,
    publisher: book.publisher
      ? { ...book.publisher, followed: followedProfileIds.has(book.publisher.id) }
      : null,
    formats: book.formats.map((format: any) => ({
      ...format,
      narrator: format.narrator
        ? {
            ...format.narrator,
            followed: followedProfileIds.has(format.narrator.id),
          }
        : null,
    })),
  };
}

async function getFollowedProfileIdsForBookDetails(
  userId: string | null | undefined,
  book: any
) {
  if (!userId) return new Set<string>();

  const profileIds = new Set<string>();
  if (book.author?.id) profileIds.add(book.author.id);
  if (book.publisher?.id) profileIds.add(book.publisher.id);
  for (const format of book.formats) {
    if (format.narrator?.id) profileIds.add(format.narrator.id);
  }

  if (profileIds.size === 0) return new Set<string>();

  const follows = await prisma.follow.findMany({
    where: {
      follower_id: userId,
      followee_id: { in: Array.from(profileIds) },
    },
    select: { followee_id: true },
  });

  return new Set(follows.map((follow) => follow.followee_id));
}

export async function getBookByIdForRest(
  id: string,
  userId?: string | null
) {
  const book = await getBookById(id);
  const followedProfileIds = await getFollowedProfileIdsForBookDetails(
    userId,
    book
  );
  return appendFollowedStatusToBookDetails(book, followedProfileIds);
}

export async function getBookBySlug(slug: string) {
  const book = await prisma.book.findFirst({
    where: {
      slug,
      submission_status: "approved",
    },
    include: {
      author: true,
      publisher: true,
      category: true,
      formats: {
        where: { submission_status: "approved", is_available: true },
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

export async function getBookBySlugForRest(
  slug: string,
  userId?: string | null
) {
  const book = await getBookBySlug(slug);
  const followedProfileIds = await getFollowedProfileIdsForBookDetails(
    userId,
    book
  );
  return appendFollowedStatusToBookDetails(book, followedProfileIds);
}

export async function listBookCategories() {
  return prisma.category.findMany({
    where: { status: "active" },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });
}

export async function listBookReviews(
  bookId: string,
  input: z.infer<typeof bookReviewsQuerySchema>
) {
  const reviews = await prisma.review.findMany({
    where: { book_id: bookId, status: "approved" },
    orderBy: { created_at: "desc" },
    take: input.limit,
  });

  const userIds = [...new Set(reviews.map((review) => review.user_id))];
  const profiles =
    userIds.length > 0
      ? await prisma.profile.findMany({
          where: { user_id: { in: userIds } },
          select: { user_id: true, display_name: true },
        })
      : [];

  const profileMap = new Map(
    profiles.map((profile) => [profile.user_id, profile.display_name])
  );

  return reviews.map((review) => ({
    ...review,
    display_name: profileMap.get(review.user_id) ?? null,
  }));
}

export async function upsertBookReview(
  userId: string,
  bookId: string,
  input: z.infer<typeof postReviewSchema>
) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, submission_status: "approved" },
    select: { id: true },
  });
  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
  }

  const existing = await prisma.review.findFirst({
    where: { book_id: bookId, user_id: userId },
  });

  if (existing) {
    return prisma.review.update({
      where: { id: existing.id },
      data: {
        rating: input.rating,
        comment: input.comment,
        status: "pending",
      },
    });
  }

  return prisma.review.create({
    data: {
      book_id: bookId,
      user_id: userId,
      rating: input.rating,
      comment: input.comment,
      status: "pending",
    },
  });
}

export async function toggleBookBookmark(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, submission_status: "approved" },
    select: { id: true },
  });
  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
  }

  const existing = await prisma.bookmark.findFirst({
    where: { user_id: userId, book_id: bookId },
  });

  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  await prisma.bookmark.create({
    data: { user_id: userId, book_id: bookId },
  });

  return { bookmarked: true };
}

export async function getBookBookmarkStatus(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, submission_status: "approved" },
    select: { id: true },
  });
  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
  }

  const bookmark = await prisma.bookmark.findFirst({
    where: { user_id: userId, book_id: bookId },
  });

  return { bookmarked: !!bookmark };
}

export async function addBookBookmark(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, submission_status: "approved" },
    select: { id: true },
  });
  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
  }

  const existing = await prisma.bookmark.findFirst({
    where: { user_id: userId, book_id: bookId },
    select: { id: true },
  });
  if (!existing) {
    await prisma.bookmark.create({
      data: { user_id: userId, book_id: bookId },
    });
  }

  return { bookmarked: true };
}

export async function removeBookBookmark(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, submission_status: "approved" },
    select: { id: true },
  });
  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
  }

  await prisma.bookmark.deleteMany({
    where: { user_id: userId, book_id: bookId },
  });

  return { bookmarked: false };
}

export async function getUserBookmarks(userId: string) {
  return prisma.bookmark.findMany({
    where: { user_id: userId },
    include: {
      book: {
        include: {
          author: { select: { id: true, name: true } },
          formats: {
            where: { submission_status: "approved" },
            select: { id: true, format: true, price: true },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
  });
}
