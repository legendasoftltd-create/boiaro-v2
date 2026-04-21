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
    .input(z.object({ bookId: z.string().optional() }))
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
    .input(z.object({ bookId: z.string() }))
    .query(async ({ input }) => {
      const comments = await prisma.bookComment.findMany({
        where: { book_id: input.bookId, parent_id: null },
        orderBy: { created_at: "desc" },
        include: { replies: { orderBy: { created_at: "asc" } }, _count: { select: { likes: true } } },
      });
      const userIds = [...new Set(comments.map(c => c.user_id))];
      const profiles = userIds.length > 0
        ? await prisma.profile.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, display_name: true, avatar_url: true },
          })
        : [];
      const profileMap = new Map(profiles.map(p => [p.user_id, p]));
      return comments.map(c => ({
        ...c,
        display_name: profileMap.get(c.user_id)?.display_name ?? null,
        avatar_url: profileMap.get(c.user_id)?.avatar_url ?? null,
      }));
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

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await prisma.bookComment.findUnique({ where: { id: input.commentId } });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      const profile = await prisma.profile.findUnique({ where: { user_id: ctx.userId }, select: { role: true } });
      const isAdmin = profile?.role === "admin" || profile?.role === "moderator";
      if (comment.user_id !== ctx.userId && !isAdmin) throw new TRPCError({ code: "FORBIDDEN" });
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
});
