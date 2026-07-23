import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import { resolveBookUrls } from "../lib/mediaUrl.js";
import { isS3Url, createPresignedGetUrl } from "../lib/s3.js";
import type {
  bookListSchema,
  bookReviewsQuerySchema,
  bookTagsQuerySchema,
  postReviewSchema,
} from "../schemas/books.js";
import type { z } from "zod";

export async function listBooks(input: z.infer<typeof bookListSchema>) {
  const {
    limit,
    cursor,
    categoryId,
    tag,
    search,
    isFeatured,
    isBestseller,
    isFree,
    isNew,
    format,
    language,
    author,
    publisher,
    narrator,
    translator,
    authorId,
    publisherId,
    translatorId,
  } = input;

  // `narrator` and `format` both constrain via the `formats` relation — merged into one
  // `some` clause (rather than two separate `formats` keys, which Prisma can't express)
  // so a caller can combine them, e.g. "audiobooks narrated by X".
  const formatsSome: Record<string, unknown> | undefined =
    narrator || format
      ? {
          ...(narrator ? { OR: [{ narrator_id: narrator }, { narrator_ids: { has: narrator } }] } : {}),
          ...(format ? { format } : {}),
          submission_status: "approved",
          is_available: true,
        }
      : undefined;

  const books = await prisma.book.findMany({
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    where: {
      submission_status: "approved",
      is_active: true,
      ...(categoryId && { category_id: categoryId }),
      ...(tag && { tags: { has: tag } }),
      ...(isFeatured !== undefined && { is_featured: isFeatured }),
      ...(isBestseller !== undefined && { is_bestseller: isBestseller }),
      ...(isFree !== undefined && { is_free: isFree }),
      ...(isNew !== undefined && { is_new: isNew }),
      ...(language && { language }),
      ...((authorId || author) && { author_id: authorId ?? author }),
      ...((translatorId || translator) && { translator_id: translatorId ?? translator }),
      ...((publisherId || publisher) && { publisher_id: publisherId ?? publisher }),
      ...(formatsSome && { formats: { some: formatsSome } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { title_en: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
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
      translator: {
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
          narrator: { select: { id: true, name: true, name_en: true, avatar_url: true, user_id: true } },
        },
      },
    },
  });

  let nextCursor: string | undefined;
  if (books.length > limit) {
    const next = books.pop();
    nextCursor = next!.id;
  }

  const resolved = books.map((book) =>
    resolveBookUrls({
      ...book,
      formats: book.formats.map((format) => ({
        ...format,
        narrators: format.narrator ?? null,
      })),
    })
  );

  return { books: resolved, nextCursor };
}

/** Compute live rating, reviews_count, total_reads, and total_listens directly from DB rows. */
async function computeLiveBookStats(bookId: string) {
  const [reviewStats, readsCount, listensCount] = await Promise.all([
    prisma.review.aggregate({
      where: { book_id: bookId, status: "approved" },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.bookRead.count({ where: { book_id: bookId } }),
    prisma.bookListen.count({ where: { book_id: bookId } }),
  ]);
  return {
    rating: Number((reviewStats._avg.rating ?? 0).toFixed(1)),
    reviews_count: reviewStats._count,
    total_reads: readsCount,
    total_listens: listensCount,
  };
}

export async function getBookById(id: string) {
  const [book, liveStats] = await Promise.all([
    prisma.book.findFirst({
      where: { id, submission_status: "approved", is_active: true },
      include: {
        author: true,
        translator: true,
        publisher: true,
        category: true,
        formats: {
          where: { submission_status: "approved", is_available: true },
          include: {
            narrator: { select: { id: true, name: true, name_en: true, avatar_url: true, user_id: true } },
            audiobook_tracks: {
              where: { status: "active" },
              orderBy: { track_number: "asc" as const },
            },
          },
        },
      },
    }),
    computeLiveBookStats(id),
  ]);

  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return resolveBookUrls({ ...book, ...liveStats });
}

async function appendFollowedStatusToBookDetails(
  book: any,
  followedProfileIds: Set<string>
) {
  const formats = await Promise.all(
    book.formats.map(async (format: any) => {
      let file_url: string | null = format.file_url ?? null;
      if (format.format === "ebook" && format.file_url && isS3Url(format.file_url)) {
        try {
          file_url = await createPresignedGetUrl(format.file_url, 3600);
        } catch (err) {
          console.error("[books] Failed to presign ebook URL, returning raw:", err);
          file_url = format.file_url;
        }
      }
      return {
        ...format,
        file_url,
        narrator: format.narrator
          ? { ...format.narrator, followed: followedProfileIds.has(format.narrator.id) }
          : null,
      };
    })
  );

  return {
    ...book,
    author: book.author
      ? { ...book.author, followed: followedProfileIds.has(book.author.id) }
      : null,
    translator: book.translator
      ? { ...book.translator, followed: followedProfileIds.has(book.translator.id) }
      : null,
    publisher: book.publisher
      ? { ...book.publisher, followed: followedProfileIds.has(book.publisher.id) }
      : null,
    formats,
  };
}

async function getFollowedProfileIdsForBookDetails(
  userId: string | null | undefined,
  book: any
) {
  if (!userId) return new Set<string>();

  const profileIds = new Set<string>();
  if (book.author?.id) profileIds.add(book.author.id);
  if (book.translator?.id) profileIds.add(book.translator.id);
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

  return new Set<string>(follows.map((follow) => follow.followee_id as string));
}

export async function getBookByIdForRest(
  id: string,
  userId?: string | null
) {
  const book = await getBookById(id);
  const followedProfileIds = await getFollowedProfileIdsForBookDetails(userId, book);
  return appendFollowedStatusToBookDetails(book, followedProfileIds);
}

export async function getBookBySlug(slug: string) {
  const book = await prisma.book.findFirst({
    where: { slug, submission_status: "approved", is_active: true },
    include: {
      author: true,
      translator: true,
      publisher: true,
      category: true,
      formats: {
        where: { submission_status: "approved", is_available: true },
        include: {
          narrator: { select: { id: true, name: true, name_en: true, avatar_url: true, user_id: true } },
          audiobook_tracks: {
            where: { status: "active" },
            orderBy: { track_number: "asc" as const },
          },
        },
      },
    },
  });

  if (!book) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const liveStats = await computeLiveBookStats(book.id);
  return resolveBookUrls({ ...book, ...liveStats });
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

export async function listBookTags(input: z.infer<typeof bookTagsQuerySchema>) {
  const rows = await prisma.book.findMany({
    where: { submission_status: "approved", is_active: true, tags: { isEmpty: false } },
    select: { tags: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const t of row.tags) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }

  const search = input.search?.trim().toLowerCase();
  return Array.from(counts.entries())
    .filter(([t]) => !search || t.toLowerCase().includes(search))
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

export async function listBookReviews(
  bookId: string,
  input: z.infer<typeof bookReviewsQuerySchema>
) {
  const where = { book_id: bookId, status: "approved" };
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: input.offset,
      take: input.limit,
    }),
    prisma.review.count({ where }),
  ]);

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

  return {
    reviews: reviews.map((review) => ({
      ...review,
      display_name: profileMap.get(review.user_id) ?? null,
    })),
    total,
    limit: input.limit,
    offset: input.offset,
    has_more: input.offset + input.limit < total,
  };
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

export async function getUserBookmarks(userId: string, limit = 20, offset = 0) {
  const where = { user_id: userId, book: { submission_status: "approved", is_active: true } };
  const [bookmarks, total] = await Promise.all([
    prisma.bookmark.findMany({
      where,
      include: {
        book: {
          include: {
            author: { select: { id: true, name: true } },
            translator: { select: { id: true, name: true } },
            formats: {
              where: { submission_status: "approved" },
              select: { id: true, format: true, price: true },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.bookmark.count({ where }),
  ]);
  return {
    bookmarks: bookmarks.map((bm) => ({
      ...bm,
      book: bm.book ? resolveBookUrls(bm.book) : null,
    })),
    total,
    limit,
    offset,
    has_more: offset + limit < total,
  };
}

// Real "Because You Read" personalization, shared by the web tRPC procedure and both
// mobile REST surfaces (homepage snapshot + paginated section) so all three agree.
// Source signal is the user's actual reading/listening progress and book-view activity —
// NOT a generic popular-books list (which is what this section silently fell back to
// everywhere before, even for guests). Returns an empty result (section hidden) when the
// user has no history, or when fewer than 3 related books can be found — a single or pair
// of recommendations isn't a usable carousel.
export async function getBecauseYouReadRecommendations(
  userId: string,
  limit = 10,
  format?: "ebook" | "audiobook" | "hardcopy",
  search?: string
) {
  const [readingRows, listeningRows, viewRows] = await Promise.all([
    prisma.readingProgress.findMany({
      where: { user_id: userId },
      orderBy: { updated_at: "desc" },
      take: 10,
      select: { book_id: true, updated_at: true },
    }),
    prisma.listeningProgress.findMany({
      where: { user_id: userId },
      orderBy: { updated_at: "desc" },
      take: 10,
      select: { book_id: true, updated_at: true },
    }),
    prisma.userActivityLog.findMany({
      where: { user_id: userId, action: "book_view", book_id: { not: null } },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { book_id: true, created_at: true },
    }),
  ]);

  const merged = [
    ...readingRows.map((r) => ({ book_id: r.book_id, at: r.updated_at })),
    ...listeningRows.map((r) => ({ book_id: r.book_id, at: r.updated_at })),
    ...viewRows.map((r) => ({ book_id: r.book_id as string, at: r.created_at })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const seen = new Set<string>();
  const sourceBookIds: string[] = [];
  for (const row of merged) {
    if (!seen.has(row.book_id)) {
      seen.add(row.book_id);
      sourceBookIds.push(row.book_id);
    }
    if (sourceBookIds.length >= 8) break;
  }

  if (sourceBookIds.length === 0) {
    return { sourceBook: null, books: [] as any[] };
  }

  const sourceBooks = await prisma.book.findMany({
    where: { id: { in: sourceBookIds } },
    select: { id: true, title: true, category_id: true, author_id: true },
  });
  if (sourceBooks.length === 0) {
    return { sourceBook: null, books: [] as any[] };
  }

  const categoryIds = [...new Set(sourceBooks.map((b) => b.category_id).filter(Boolean))] as string[];
  const authorIds = [...new Set(sourceBooks.map((b) => b.author_id).filter(Boolean))] as string[];
  if (categoryIds.length === 0 && authorIds.length === 0) {
    return { sourceBook: null, books: [] as any[] };
  }

  const candidates = await prisma.book.findMany({
    where: {
      id: { notIn: sourceBookIds },
      submission_status: "approved",
      is_active: true,
      OR: [
        ...(categoryIds.length > 0 ? [{ category_id: { in: categoryIds } }] : []),
        ...(authorIds.length > 0 ? [{ author_id: { in: authorIds } }] : []),
      ],
      ...(format ? { formats: { some: { format, is_available: true, submission_status: "approved" as const } } } : {}),
      ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
    },
    take: limit,
    orderBy: { total_reads: "desc" },
    include: {
      author: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, genre: true, is_featured: true } },
      translator: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, genre: true, is_featured: true } },
      publisher: { select: { id: true, name: true, name_en: true, logo_url: true, description: true, is_verified: true } },
      category: { select: { id: true, name: true, name_bn: true, slug: true, icon: true, color: true } },
      formats: {
        where: { submission_status: "approved", is_available: true },
        include: {
          narrator: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, specialty: true, rating: true, is_featured: true, user_id: true } },
        },
      },
    },
  });

  // Fewer than 3 usable recommendations isn't a meaningful carousel — hide the section.
  if (candidates.length < 3) {
    return { sourceBook: null, books: [] as any[] };
  }

  const allNarratorIds = [...new Set(candidates.flatMap((b) => b.formats.flatMap((f: any) => f.narrator_ids || [])))];
  const narratorRows = allNarratorIds.length > 0
    ? await prisma.narrator.findMany({
        where: { id: { in: allNarratorIds } },
        select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, specialty: true, rating: true, is_featured: true, user_id: true },
      })
    : [];
  const narratorById = new Map(narratorRows.map((n) => [n.id, n]));
  const booksWithNarrators = candidates.map((b) => ({
    ...b,
    formats: b.formats.map((f: any) => ({
      ...f,
      narrators: (f.narrator_ids || []).map((nid: string) => narratorById.get(nid)).filter(Boolean),
    })),
  }));

  const primarySource = sourceBooks.find((b) => b.id === sourceBookIds[0]) ?? sourceBooks[0];

  return {
    sourceBook: { id: primarySource.id, title: primarySource.title },
    books: booksWithNarrators.map(resolveBookUrls),
  };
}
