import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const booksRouter = router({
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        categoryId: z.string().optional(),
        search: z.string().optional(),
        isFeatured: z.boolean().optional(),
        isBestseller: z.boolean().optional(),
        isFree: z.boolean().optional(),
        language: z.string().optional(),
        authorId: z.string().optional(),
        publisherId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { limit, cursor, categoryId, search, isFeatured, isBestseller, isFree, language, authorId, publisherId } = input;

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
          author: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, genre: true, is_featured: true } },
          publisher: { select: { id: true, name: true, name_en: true, logo_url: true, description: true, is_verified: true } },
          category: { select: { id: true, name: true, name_bn: true, slug: true, icon: true, color: true } },
          formats: {
            where: { submission_status: "approved" },
            select: {
              id: true, format: true, price: true, original_price: true, discount: true,
              coin_price: true, pages: true, duration: true, in_stock: true, is_available: true,
              narrator_id: true, binding: true, audio_quality: true, file_size: true,
              chapters_count: true, preview_chapters: true, dimensions: true, weight: true,
              delivery_days: true, stock_count: true,
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
    }),

  browseBooks: publicProcedure
    .input(
      z.object({
        page: z.number().min(0).default(0),
        pageSize: z.number().min(1).max(100).default(30),
        format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
        categoryId: z.string().optional(),
        filter: z.enum(["free", "new", "bestseller", "trending"]).optional(),
        query: z.string().optional(),
        sort: z.enum(["newest", "rating", "popular"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { page, pageSize, format, categoryId, filter, query, sort } = input;

      let formatBookIds: string[] | undefined;
      if (format) {
        const formatRecords = await prisma.bookFormat.findMany({
          where: { format: format as any, is_available: true, submission_status: "approved" },
          select: { book_id: true },
        });
        formatBookIds = formatRecords.map((f) => f.book_id);
        if (formatBookIds.length === 0) return { books: [], total: 0 };
      }

      const where: any = {
        submission_status: "approved",
        ...(formatBookIds && { id: { in: formatBookIds } }),
        ...(categoryId && { category_id: categoryId }),
        ...(filter === "free" && { is_free: true }),
        ...(filter === "new" && { is_new: true }),
        ...(filter === "bestseller" && { is_bestseller: true }),
        ...(filter === "trending" && { OR: [{ is_bestseller: true }, { is_featured: true }] }),
        ...(query && {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { title_en: { contains: query, mode: "insensitive" } },
          ],
        }),
      };

      const orderBy: any =
        sort === "newest" ? { published_date: "desc" }
        : sort === "rating" ? { rating: "desc" }
        : sort === "popular" ? { total_reads: "desc" }
        : { created_at: "desc" };

      const [books, total] = await Promise.all([
        prisma.book.findMany({
          where,
          skip: page * pageSize,
          take: pageSize,
          orderBy,
          include: {
            author: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, genre: true, is_featured: true } },
            publisher: { select: { id: true, name: true, name_en: true, logo_url: true, description: true, is_verified: true } },
            category: { select: { id: true, name: true, name_bn: true, slug: true, icon: true, color: true } },
            formats: {
              where: { submission_status: "approved" },
              include: {
                narrator: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, specialty: true, rating: true, is_featured: true } },
              },
            },
          },
        }),
        prisma.book.count({ where }),
      ]);

      return { books, total };
    }),

  trending: publicProcedure
    .input(z.object({ periodDays: z.number().default(7) }))
    .query(async ({ input }) => {
      const since = new Date(Date.now() - input.periodDays * 24 * 60 * 60 * 1000);
      const activityData = await prisma.userActivityLog.findMany({
        where: {
          action: { in: ["book_view", "book_read", "book_purchase"] },
          created_at: { gte: since },
          book_id: { not: null },
        },
        select: { book_id: true },
      });

      const scores: Record<string, number> = {};
      activityData.forEach((row) => {
        if (row.book_id) scores[row.book_id] = (scores[row.book_id] || 0) + 1;
      });

      return Object.entries(scores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([id]) => id);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const book = await prisma.book.findUnique({
        where: { id: input.id },
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
      if (!book) throw new TRPCError({ code: "NOT_FOUND" });
      return book;
    }),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const book = await prisma.book.findUnique({
        where: { slug: input.slug },
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
      if (!book) throw new TRPCError({ code: "NOT_FOUND" });
      return book;
    }),

  categories: publicProcedure.query(() =>
    prisma.category.findMany({
      where: { status: "active" },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    })
  ),

  heroBanners: publicProcedure.query(() =>
    prisma.heroBanner.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  reviews: publicProcedure
    .input(z.object({ bookId: z.string(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const reviews = await prisma.review.findMany({
        where: { book_id: input.bookId, status: "approved" },
        orderBy: { created_at: "desc" },
        take: input.limit,
      });
      const userIds = [...new Set(reviews.map(r => r.user_id))];
      const profiles = userIds.length > 0
        ? await prisma.profile.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, display_name: true },
          })
        : [];
      const profileMap = new Map(profiles.map(p => [p.user_id, p.display_name]));
      return reviews.map(r => ({ ...r, display_name: profileMap.get(r.user_id) ?? null }));
    }),

  postReview: protectedProcedure
    .input(z.object({ bookId: z.string(), rating: z.number().min(1).max(5), comment: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.review.findFirst({
        where: { book_id: input.bookId, user_id: ctx.userId },
      });
      if (existing) {
        return prisma.review.update({
          where: { id: existing.id },
          data: { rating: input.rating, comment: input.comment, status: "pending" },
        });
      }
      return prisma.review.create({
        data: { book_id: input.bookId, user_id: ctx.userId, rating: input.rating, comment: input.comment, status: "pending" },
      });
    }),

  deleteReview: protectedProcedure
    .input(z.object({ reviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.review.deleteMany({
        where: { id: input.reviewId, user_id: ctx.userId },
      });
      return { success: true };
    }),

  bookmark: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.bookmark.findFirst({
        where: { user_id: ctx.userId, book_id: input.bookId },
      });
      if (existing) {
        await prisma.bookmark.delete({ where: { id: existing.id } });
        return { bookmarked: false };
      }
      await prisma.bookmark.create({ data: { user_id: ctx.userId, book_id: input.bookId } });
      return { bookmarked: true };
    }),

  isBookmarked: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      const b = await prisma.bookmark.findFirst({
        where: { user_id: ctx.userId, book_id: input.bookId },
      });
      return { bookmarked: !!b };
    }),

  userBookmarks: protectedProcedure.query(({ ctx }) =>
    prisma.bookmark.findMany({
      where: { user_id: ctx.userId },
      include: {
        book: {
          include: {
            author: { select: { id: true, name: true } },
            formats: { select: { id: true, format: true, price: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    })
  ),

  incrementRead: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.bookRead.create({ data: { user_id: ctx.userId, book_id: input.bookId } });
      await prisma.book.update({ where: { id: input.bookId }, data: { total_reads: { increment: 1 } } });
    }),

  narrators: publicProcedure.query(async () => {
    const [narrators, bookFormatCounts] = await Promise.all([
      prisma.narrator.findMany({
        where: { status: "active" },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      }),
      prisma.bookFormat.groupBy({
        by: ["narrator_id"],
        where: { format: "audiobook", is_available: true, submission_status: "approved", narrator_id: { not: null } },
        _count: { narrator_id: true },
      }),
    ]);
    const countMap: Record<string, number> = {};
    bookFormatCounts.forEach((r) => { if (r.narrator_id) countMap[r.narrator_id] = r._count.narrator_id; });
    return narrators.map((n) => ({ ...n, audiobooksCount: countMap[n.id] || 0, listeners: 0 }));
  }),

  narratorById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [narrator, formats] = await Promise.all([
        prisma.narrator.findUnique({ where: { id: input.id } }),
        prisma.bookFormat.findMany({
          where: { narrator_id: input.id, format: "audiobook", is_available: true, submission_status: "approved" },
          include: { book: { select: { id: true, title: true, title_en: true, slug: true, cover_url: true, rating: true, submission_status: true } } },
        }),
      ]);
      if (!narrator) return null;
      const seen = new Set<string>();
      const books = formats
        .filter(f => f.book && f.book.submission_status === "approved" && !seen.has(f.book.id) && seen.add(f.book.id))
        .map(f => f.book!);
      return { ...narrator, books };
    }),

  authorById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => prisma.author.findUnique({ where: { id: input.id } })),

  publisherById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => prisma.publisher.findUnique({ where: { id: input.id } })),

  authors: publicProcedure.query(async () => {
    const [authors, bookCounts] = await Promise.all([
      prisma.author.findMany({
        where: { status: "active" },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      }),
      prisma.book.groupBy({
        by: ["author_id"],
        where: { submission_status: "approved", author_id: { not: null } },
        _count: { author_id: true },
      }),
    ]);
    const countMap: Record<string, number> = {};
    bookCounts.forEach((r) => { if (r.author_id) countMap[r.author_id] = r._count.author_id; });
    return authors.map((a) => ({ ...a, booksCount: countMap[a.id] || 0, followers: 0 }));
  }),

  voices: publicProcedure.query(() =>
    prisma.voice.findMany({
      where: { is_active: true },
      select: { id: true, name: true, language: true, provider: true },
      orderBy: { name: "asc" },
    })
  ),

  cmsPage: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) =>
      prisma.cmsPage.findFirst({ where: { slug: input.slug, status: "published" } })
    ),

  homepageSections: publicProcedure.query(() =>
    prisma.homepageSection.findMany({
      where: { is_enabled: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  siteSettings: publicProcedure.query(() =>
    prisma.siteSetting.findMany({ orderBy: { key: "asc" } })
  ),

  blogPosts: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        cursor: z.string().optional(),
        category: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 10;
      const cursor = input?.cursor;
      const category = input?.category;
      const posts = await prisma.blogPost.findMany({
        where: {
          status: "published",
          ...(category ? { category } : {}),
        },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { publish_date: "desc" },
        select: {
          id: true, title: true, slug: true, excerpt: true, cover_image: true,
          category: true, tags: true, author_name: true, publish_date: true,
          is_featured: true,
        },
      });
      let nextCursor: string | undefined;
      if (posts.length > limit) {
        nextCursor = posts.pop()!.id;
      }
      return { posts, nextCursor };
    }),

  blogPost: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) =>
      prisma.blogPost.findUnique({ where: { slug: input.slug } })
    ),

  recentlyViewed: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      const logs = await prisma.userActivityLog.findMany({
        where: { user_id: ctx.userId, action: "view", book_id: { not: null } },
        orderBy: { created_at: "desc" },
        distinct: ["book_id"],
        take: limit,
        select: { book_id: true },
      });
      const bookIds = logs.map((l) => l.book_id!);
      if (!bookIds.length) return [];
      return prisma.book.findMany({
        where: { id: { in: bookIds } },
        include: {
          author: { select: { id: true, name: true, name_en: true } },
          formats: { where: { submission_status: "approved" }, select: { id: true, format: true, price: true } },
        },
      });
    }),

  recommendations: publicProcedure
    .input(z.object({ bookId: z.string().optional() }).optional().default({}))
    .query(async ({ input }) => {
      if (!input.bookId) {
        return prisma.book.findMany({
          where: { submission_status: "approved" },
          take: 10,
          orderBy: { total_reads: "desc" },
          include: {
            author: { select: { id: true, name: true } },
            formats: { where: { submission_status: "approved" }, select: { id: true, format: true, price: true } },
          },
        });
      }
      const book = await prisma.book.findUnique({
        where: { id: input.bookId },
        select: { category_id: true, author_id: true },
      });
      if (!book) return [];
      return prisma.book.findMany({
        where: {
          id: { not: input.bookId },
          submission_status: "approved",
          OR: [
            { category_id: book.category_id ?? undefined },
            { author_id: book.author_id ?? undefined },
          ],
        },
        take: 10,
        orderBy: { total_reads: "desc" },
        include: {
          author: { select: { id: true, name: true } },
          formats: { where: { submission_status: "approved" }, select: { id: true, format: true, price: true } },
        },
      });
    }),

  comments: publicProcedure
    .input(z.object({ bookId: z.string(), userId: z.string().optional() }))
    .query(async ({ input }) => {
      const comments = await prisma.bookComment.findMany({
        where: { book_id: input.bookId, parent_id: null },
        orderBy: { created_at: "desc" },
        include: {
          replies: { orderBy: { created_at: "asc" }, include: { _count: { select: { likes: true } }, likes: input.userId ? { where: { user_id: input.userId } } : false } },
          _count: { select: { likes: true } },
          likes: input.userId ? { where: { user_id: input.userId } } : false,
        },
      });
      const allUserIds = [...new Set([
        ...comments.map(c => c.user_id),
        ...comments.flatMap(c => c.replies.map((r: any) => r.user_id)),
      ])];
      const profiles = allUserIds.length > 0
        ? await prisma.profile.findMany({
            where: { user_id: { in: allUserIds } },
            select: { user_id: true, display_name: true, avatar_url: true },
          })
        : [];
      const profileMap = new Map(profiles.map(p => [p.user_id, p]));
      return comments.map(c => ({
        ...c,
        display_name: profileMap.get(c.user_id)?.display_name ?? null,
        avatar_url: profileMap.get(c.user_id)?.avatar_url ?? null,
        like_count: c._count.likes,
        liked_by_me: input.userId ? (c.likes as any[]).length > 0 : false,
        replies: c.replies.map((r: any) => ({
          ...r,
          display_name: profileMap.get(r.user_id)?.display_name ?? null,
          avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
          like_count: r._count.likes,
          liked_by_me: input.userId ? (r.likes as any[]).length > 0 : false,
        })),
      }));
    }),

  toggleCommentLike: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.commentLike.findFirst({
        where: { comment_id: input.commentId, user_id: ctx.userId },
      });
      if (existing) {
        await prisma.commentLike.delete({ where: { id: existing.id } });
        return { liked: false };
      }
      await prisma.commentLike.create({ data: { comment_id: input.commentId, user_id: ctx.userId } });
      return { liked: true };
    }),

  postComment: protectedProcedure
    .input(z.object({ bookId: z.string(), content: z.string().min(1).max(2000), parentId: z.string().optional() }))
    .mutation(({ ctx, input }) =>
      prisma.bookComment.create({
        data: {
          book_id: input.bookId,
          user_id: ctx.userId,
          comment: input.content,
          parent_id: input.parentId,
        },
      })
    ),

  trackPrices: publicProcedure
    .input(z.object({ trackIds: z.array(z.string()) }))
    .query(({ input }) =>
      prisma.audiobookTrack.findMany({
        where: { id: { in: input.trackIds } },
        select: { id: true, chapter_price: true },
      })
    ),

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await prisma.bookComment.findUnique({ where: { id: input.commentId } });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      const adminRole = await prisma.userRole.findFirst({
        where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] as any[] } },
      });
      if (comment.user_id !== ctx.userId && !adminRole) throw new TRPCError({ code: "FORBIDDEN" });
      await prisma.bookComment.delete({ where: { id: input.commentId } });
      return { success: true };
    }),

  formatsByBookId: publicProcedure
    .input(z.object({ bookId: z.string() }))
    .query(({ input }) =>
      prisma.bookFormat.findMany({
        where: { book_id: input.bookId, submission_status: "approved", is_available: true },
        orderBy: { created_at: "asc" },
      })
    ),

  detail: publicProcedure
    .input(z.object({ slug: z.string().optional(), id: z.string().optional() }))
    .query(async ({ input }) => {
      if (!input.slug && !input.id) throw new TRPCError({ code: "BAD_REQUEST", message: "slug or id required" });
      const where = input.id ? { id: input.id } : { slug: input.slug! };
      const book = await prisma.book.findUnique({
        where,
        include: {
          author: true,
          publisher: true,
          category: true,
          formats: {
            where: { submission_status: "approved" },
            orderBy: { created_at: "asc" },
            include: {
              narrator: true,
              audiobook_tracks: {
                where: { status: "active" },
                orderBy: { track_number: "asc" },
              },
            },
          },
          contributors: true,
        },
      });
      if (!book || book.submission_status !== "approved") throw new TRPCError({ code: "NOT_FOUND" });

      // Enrich contributors with display_name from profiles
      const contribUserIds = book.contributors.map((c) => c.user_id).filter(Boolean);
      const profiles = contribUserIds.length > 0
        ? await prisma.profile.findMany({
            where: { user_id: { in: contribUserIds } },
            select: { user_id: true, display_name: true, avatar_url: true },
          })
        : [];
      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      return {
        ...book,
        contributors: book.contributors.map((c) => ({
          ...c,
          display_name: profileMap.get(c.user_id)?.display_name ?? null,
          avatar_url: profileMap.get(c.user_id)?.avatar_url ?? null,
        })),
      };
    }),

  searchApprovedBooks: publicProcedure
    .input(z.object({ query: z.string().min(1), format: z.enum(["ebook", "audiobook", "hardcopy"]) }))
    .query(async ({ input }) => {
      const pattern = `%${input.query}%`;
      const books = await prisma.book.findMany({
        where: {
          submission_status: "approved",
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { title_en: { contains: input.query, mode: "insensitive" } },
            { slug: { contains: input.query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true, title: true, title_en: true, cover_url: true, slug: true,
          author: { select: { name: true } },
          formats: { select: { format: true } },
        },
        take: 20,
      });
      return books.map(b => ({
        ...b,
        existingFormats: b.formats.map(f => f.format),
        hasFormat: b.formats.some(f => f.format === input.format),
      }));
    }),

  myCreatorBooks: protectedProcedure
    .input(z.object({ role: z.enum(["writer", "narrator", "publisher"]) }))
    .query(async ({ ctx, input }) => {
      const ownBooks = await prisma.book.findMany({
        where: { submitted_by: ctx.userId },
        include: {
          category: { select: { name: true, name_bn: true } },
          formats: { select: { id: true, format: true, price: true, duration: true, audio_quality: true, stock_count: true, binding: true, in_stock: true, chapters_count: true, file_url: true, file_size: true, submitted_by: true, submission_status: true } },
        },
        orderBy: { created_at: "desc" },
      });
      const contribs = await prisma.bookContributor.findMany({
        where: { user_id: ctx.userId, role: input.role },
        select: { book_id: true },
      });
      const ownIds = new Set(ownBooks.map(b => b.id));
      const extraIds = contribs.map(c => c.book_id).filter(id => !ownIds.has(id));
      let extraBooks: typeof ownBooks = [];
      if (extraIds.length > 0) {
        extraBooks = await prisma.book.findMany({
          where: { id: { in: extraIds } },
          include: {
            category: { select: { name: true, name_bn: true } },
            formats: { select: { id: true, format: true, price: true, duration: true, audio_quality: true, stock_count: true, binding: true, in_stock: true, chapters_count: true, file_url: true, file_size: true, submitted_by: true, submission_status: true } },
          },
        });
      }
      return [...ownBooks, ...extraBooks];
    }),

  submitBook: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      titleEn: z.string().optional(),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      coverUrl: z.string().optional(),
      language: z.string().default("bn"),
      tags: z.array(z.string()).optional(),
      asDraft: z.boolean().default(false),
      format: z.enum(["ebook", "audiobook", "hardcopy"]),
      role: z.enum(["writer", "narrator", "publisher"]),
      price: z.number().optional(),
      pages: z.number().int().optional(),
      chaptersCount: z.number().int().optional(),
      fileUrl: z.string().optional(),
      fileSize: z.string().optional(),
      duration: z.string().optional(),
      audioQuality: z.enum(["standard", "hd"]).optional(),
      stockCount: z.number().int().optional(),
      binding: z.enum(["paperback", "hardcover"]).optional(),
      weight: z.string().optional(),
      dimensions: z.string().optional(),
      deliveryDays: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const slug = input.title.toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9ঀ-৿-]/g, "")
        + "-" + Date.now().toString(36);
      const book = await prisma.book.create({
        data: {
          title: input.title,
          title_en: input.titleEn ?? null,
          slug,
          description: input.description ?? null,
          category_id: input.categoryId ?? null,
          cover_url: input.coverUrl ?? null,
          language: input.language,
          tags: input.tags ?? [],
          submission_status: input.asDraft ? "draft" : "pending",
          submitted_by: ctx.userId,
        },
      });
      await prisma.bookFormat.create({
        data: {
          book_id: book.id,
          format: input.format,
          price: input.price ?? 0,
          pages: input.pages ?? null,
          chapters_count: input.chaptersCount ?? null,
          file_url: input.fileUrl ?? null,
          file_size: input.fileSize ?? null,
          duration: input.duration ?? null,
          audio_quality: input.audioQuality ?? null,
          stock_count: input.stockCount ?? null,
          in_stock: input.stockCount ? input.stockCount > 0 : true,
          binding: input.binding ?? null,
          weight: input.weight ?? null,
          dimensions: input.dimensions ?? null,
          delivery_days: input.deliveryDays ?? null,
          submission_status: input.asDraft ? "draft" : "pending",
          submitted_by: ctx.userId,
        },
      });
      await prisma.bookContributor.create({
        data: { book_id: book.id, user_id: ctx.userId, role: input.role, format: input.format },
      });
      return book;
    }),

  updateBook: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      formatId: z.string().optional(),
      title: z.string().min(1),
      titleEn: z.string().optional(),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      coverUrl: z.string().optional(),
      language: z.string().default("bn"),
      tags: z.array(z.string()).optional(),
      asDraft: z.boolean().default(false),
      format: z.enum(["ebook", "audiobook", "hardcopy"]),
      price: z.number().optional(),
      pages: z.number().int().optional(),
      chaptersCount: z.number().int().optional(),
      fileUrl: z.string().optional(),
      fileSize: z.string().optional(),
      duration: z.string().optional(),
      audioQuality: z.enum(["standard", "hd"]).optional(),
      stockCount: z.number().int().optional(),
      binding: z.enum(["paperback", "hardcover"]).optional(),
      weight: z.string().optional(),
      dimensions: z.string().optional(),
      deliveryDays: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const book = await prisma.book.findUnique({ where: { id: input.bookId } });
      if (!book || book.submitted_by !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" });
      const slug = input.title.toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9ঀ-৿-]/g, "");
      await prisma.book.update({
        where: { id: input.bookId },
        data: {
          title: input.title, title_en: input.titleEn ?? null, slug,
          description: input.description ?? null, category_id: input.categoryId ?? null,
          cover_url: input.coverUrl ?? null, language: input.language,
          tags: input.tags ?? [],
          submission_status: input.asDraft ? "draft" : "pending",
        },
      });
      const formatData = {
        price: input.price ?? 0,
        pages: input.pages ?? null, chapters_count: input.chaptersCount ?? null,
        file_url: input.fileUrl ?? null, file_size: input.fileSize ?? null,
        duration: input.duration ?? null, audio_quality: input.audioQuality ?? null,
        stock_count: input.stockCount ?? null,
        in_stock: input.stockCount ? input.stockCount > 0 : true,
        binding: input.binding ?? null, weight: input.weight ?? null,
        dimensions: input.dimensions ?? null, delivery_days: input.deliveryDays ?? null,
      };
      if (input.formatId) {
        await prisma.bookFormat.update({ where: { id: input.formatId }, data: formatData });
      } else {
        await prisma.bookFormat.create({ data: { ...formatData, book_id: input.bookId, format: input.format, submitted_by: ctx.userId } });
      }
      return { success: true };
    }),

  attachBookFormat: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      format: z.enum(["ebook", "audiobook", "hardcopy"]),
      role: z.enum(["writer", "narrator", "publisher"]),
      price: z.number().optional(),
      pages: z.number().int().optional(),
      chaptersCount: z.number().int().optional(),
      fileUrl: z.string().optional(),
      fileSize: z.string().optional(),
      duration: z.string().optional(),
      audioQuality: z.enum(["standard", "hd"]).optional(),
      stockCount: z.number().int().optional(),
      binding: z.enum(["paperback", "hardcover"]).optional(),
      weight: z.string().optional(),
      dimensions: z.string().optional(),
      deliveryDays: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.bookFormat.findFirst({
        where: { book_id: input.bookId, format: input.format },
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: `This book already has a ${input.format} format` });
      await prisma.bookFormat.create({
        data: {
          book_id: input.bookId, format: input.format,
          price: input.price ?? 0, pages: input.pages ?? null,
          chapters_count: input.chaptersCount ?? null,
          file_url: input.fileUrl ?? null, file_size: input.fileSize ?? null,
          duration: input.duration ?? null, audio_quality: input.audioQuality ?? null,
          stock_count: input.stockCount ?? null,
          in_stock: input.stockCount ? input.stockCount > 0 : true,
          binding: input.binding ?? null, weight: input.weight ?? null,
          dimensions: input.dimensions ?? null, delivery_days: input.deliveryDays ?? null,
          submission_status: "pending", submitted_by: ctx.userId,
        },
      });
      await prisma.bookContributor.create({
        data: { book_id: input.bookId, user_id: ctx.userId, role: input.role, format: input.format },
      });
      return { success: true };
    }),

  submitBookForReview: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const book = await prisma.book.findUnique({ where: { id: input.bookId } });
      if (!book || book.submitted_by !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" });
      return prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "pending" },
      });
    }),

  // ── Ebook chapter management ─────────────────────────────────────────────

  ebookChapters: protectedProcedure
    .input(z.object({ bookFormatId: z.string() }))
    .query(({ input }) =>
      prisma.ebookChapter.findMany({
        where: { book_format_id: input.bookFormatId },
        orderBy: { chapter_order: "asc" },
      })
    ),

  addEbookChapter: protectedProcedure
    .input(z.object({
      bookFormatId: z.string(),
      title: z.string().min(1),
      content: z.string().optional(),
      fileUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await prisma.ebookChapter.count({ where: { book_format_id: input.bookFormatId } });
      return prisma.ebookChapter.create({
        data: {
          book_format_id: input.bookFormatId,
          chapter_title: input.title,
          content: input.content || null,
          file_url: input.fileUrl || null,
          chapter_order: count + 1,
          status: "draft",
          created_by: ctx.userId,
        },
      });
    }),

  submitEbookChapter: protectedProcedure
    .input(z.object({ chapterId: z.string() }))
    .mutation(({ input }) =>
      prisma.ebookChapter.update({ where: { id: input.chapterId }, data: { status: "pending" } })
    ),

  deleteEbookChapter: protectedProcedure
    .input(z.object({ chapterId: z.string() }))
    .mutation(async ({ input }) => {
      const ch = await prisma.ebookChapter.findUnique({ where: { id: input.chapterId } });
      if (!ch || ch.status !== "draft") throw new TRPCError({ code: "FORBIDDEN" });
      return prisma.ebookChapter.delete({ where: { id: input.chapterId } });
    }),

  // ── Audiobook track management ───────────────────────────────────────────

  audiobookTracks: protectedProcedure
    .input(z.object({ bookFormatId: z.string() }))
    .query(({ input }) =>
      prisma.audiobookTrack.findMany({
        where: { book_format_id: input.bookFormatId },
        orderBy: { track_number: "asc" },
      })
    ),

  bookFormatPrice: protectedProcedure
    .input(z.object({ bookFormatId: z.string() }))
    .query(({ input }) =>
      prisma.bookFormat.findUnique({ where: { id: input.bookFormatId }, select: { price: true } })
    ),

  addAudiobookTrack: protectedProcedure
    .input(z.object({
      bookFormatId: z.string(),
      title: z.string().min(1),
      audioUrl: z.string().optional(),
      duration: z.string().optional(),
      mediaType: z.string().optional(),
      chapterPrice: z.number().optional(),
      isPreview: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await prisma.audiobookTrack.count({ where: { book_format_id: input.bookFormatId } });
      return prisma.audiobookTrack.create({
        data: {
          book_format_id: input.bookFormatId,
          title: input.title,
          audio_url: input.audioUrl || null,
          track_number: count + 1,
          duration: input.duration || null,
          is_preview: input.isPreview ?? (count === 0),
          status: "draft",
          created_by: ctx.userId,
          media_type: input.mediaType || "audio",
          chapter_price: input.chapterPrice ?? null,
        },
      });
    }),

  submitAudiobookTrack: protectedProcedure
    .input(z.object({ trackId: z.string() }))
    .mutation(({ input }) =>
      prisma.audiobookTrack.update({ where: { id: input.trackId }, data: { status: "pending" } })
    ),

  deleteAudiobookTrack: protectedProcedure
    .input(z.object({ trackId: z.string() }))
    .mutation(async ({ input }) => {
      const track = await prisma.audiobookTrack.findUnique({ where: { id: input.trackId } });
      if (!track || track.status !== "draft") throw new TRPCError({ code: "FORBIDDEN" });
      return prisma.audiobookTrack.delete({ where: { id: input.trackId } });
    }),

  updateAudiobookTrack: protectedProcedure
    .input(z.object({ trackId: z.string(), title: z.string().min(1), chapterPrice: z.number().nullable() }))
    .mutation(({ input }) =>
      prisma.audiobookTrack.update({
        where: { id: input.trackId },
        data: { title: input.title, chapter_price: input.chapterPrice },
      })
    ),

  toggleTrackPreview: protectedProcedure
    .input(z.object({ trackId: z.string(), isPreview: z.boolean() }))
    .mutation(({ input }) =>
      prisma.audiobookTrack.update({ where: { id: input.trackId }, data: { is_preview: input.isPreview } })
    ),

  reorderAudiobookTracks: protectedProcedure
    .input(z.object({ tracks: z.array(z.object({ id: z.string(), trackNumber: z.number().int() })) }))
    .mutation(async ({ input }) => {
      await Promise.all(
        input.tracks.map(t =>
          prisma.audiobookTrack.update({ where: { id: t.id }, data: { track_number: t.trackNumber } })
        )
      );
      return { success: true };
    }),

  searchBooksByTitle: publicProcedure
    .input(z.object({ query: z.string().min(1), excludeId: z.string().optional() }))
    .query(async ({ input }) => {
      return prisma.book.findMany({
        where: {
          AND: [
            {
              OR: [
                { title: { contains: input.query, mode: "insensitive" } },
                { title_en: { contains: input.query, mode: "insensitive" } },
              ],
            },
            input.excludeId ? { id: { not: input.excludeId } } : {},
          ],
        },
        select: { id: true, title: true, title_en: true, cover_url: true, submission_status: true },
        take: 5,
      });
    }),
});
