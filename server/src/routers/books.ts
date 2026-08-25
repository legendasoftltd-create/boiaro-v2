import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { bookByIdSchema, bookListSchema } from "../schemas/books.js";
import {
  getBookById, listBooks, getBecauseYouReadRecommendations,
  getBestSellerBookIds, getTrendingAudiobookIds, getTopAudiobookIds,
  type RankedBookIds,
} from "../services/books.service.js";
import { resolveBookUrls } from "../lib/mediaUrl.js";
import { getCreatorBookIds, userOwnsBook } from "../lib/creatorBooks.js";
import { maybeRecordView } from "../lib/viewTracking.js";

// Shared include shape for the four "ranked ids -> full book records" homepage
// sections below (bestSellers/specialOffers/trendingAudiobooks/topAudiobooks)
// — same fields as browseBooks/trending already fetch, so trpcBookToMasterBook
// on the frontend works identically no matter which section produced a book.
const bookDetailInclude = {
  author: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, genre: true, is_featured: true } },
  translator: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, genre: true, is_featured: true } },
  publisher: { select: { id: true, name: true, name_en: true, logo_url: true, description: true, is_verified: true } },
  category: { select: { id: true, name: true, name_bn: true, slug: true, icon: true, color: true } },
  formats: {
    where: { submission_status: "approved" as const, is_available: true },
    include: {
      narrator: { select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, specialty: true, rating: true, is_featured: true, user_id: true } },
    },
  },
} as const;

async function attachNarratorsAndResolve(books: any[]) {
  const allNarratorIds = [...new Set(books.flatMap((b) => b.formats.flatMap((f: any) => f.narrator_ids || [])))];
  const narratorRows = allNarratorIds.length > 0
    ? await prisma.narrator.findMany({
        where: { id: { in: allNarratorIds } },
        select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, specialty: true, rating: true, is_featured: true, user_id: true },
      })
    : [];
  const narratorById = new Map(narratorRows.map((n) => [n.id, n]));
  const withNarrators = books.map((b) => ({
    ...b,
    formats: b.formats.map((f: any) => ({
      ...f,
      narrators: (f.narrator_ids || []).map((nid: string) => narratorById.get(nid)).filter(Boolean),
    })),
  }));
  return withNarrators.map(resolveBookUrls);
}

// candidateIds is a pre-ranked (best first) list of book ids from an
// aggregate query (sales sum, listen count, ...); rankById supplies the
// actual rank value used to re-sort after the id list gets narrowed by
// format/search/approval status below — narrowing can drop ids, so the
// original array order can't just be sliced directly.
async function rankAndFetchBooks(
  candidateIds: string[],
  rankById: Map<string, number>,
  opts: { format?: "hardcopy" | "audiobook" | "ebook"; search?: string; limit: number }
) {
  if (candidateIds.length === 0) return [];
  const books = await prisma.book.findMany({
    where: {
      id: { in: candidateIds },
      submission_status: "approved",
      is_active: true,
      ...(opts.format && { formats: { some: { format: opts.format, is_available: true, submission_status: "approved" } } }),
      ...(opts.search && { title: { contains: opts.search, mode: "insensitive" } }),
    },
    include: bookDetailInclude,
  });
  const ranked = books.slice().sort((a, b) => (rankById.get(b.id) ?? 0) - (rankById.get(a.id) ?? 0)).slice(0, opts.limit);
  return attachNarratorsAndResolve(ranked);
}

export const booksRouter = router({
  list: publicProcedure
    .input(bookListSchema)
    .query(async ({ input }) => listBooks(input)),

  browseBooks: publicProcedure
    .input(
      z.object({
        page: z.number().min(0).default(0),
        pageSize: z.number().min(1).max(100).default(30),
        format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
        categoryId: z.string().optional(),
        tag: z.string().optional(),
        filter: z.enum(["free", "new", "bestseller", "trending"]).optional(),
        query: z.string().optional(),
        sort: z.enum(["newest", "rating", "popular", "mostRead"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { page, pageSize, format, categoryId, tag, filter, query, sort } = input;

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
        is_active: true,
        ...(formatBookIds && { id: { in: formatBookIds } }),
        ...(categoryId && { category_id: categoryId }),
        ...(tag && { tags: { has: tag } }),
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

      // "popular" needs a tiebreaker: total_reads has many ties (lots of 0/1/2-read
      // books), and without a secondary key the tied rows' relative order is
      // whatever the DB's scan happens to produce — which can differ from the
      // equivalent mobile REST queries even though they select the same rows,
      // making the two platforms' "Popular"/"Free Books" lists disagree right at
      // the tie boundary. `id: asc` is an arbitrary but stable choice, applied
      // identically on the mobile side (homepage.service.ts / rest/homepage.ts).
      // Admin-set `priority` (ascending — 1 before 2 before 3 — with unset/null sorting
      // last) is the dominant sort key for every browse ordering; each sort's original
      // key stays as the tiebreaker within a priority tier, preserving the pre-existing
      // ranking among equal-priority books.
      //
      // "mostRead" is the one deliberate exception: it backs the "Top 10 Most Read"
      // section, whose entire point is to reflect genuine reader behavior, so it's
      // exempt from priority — a manually-boosted book with few actual reads should
      // never outrank a book real readers are actually reading. Kept as its own `sort`
      // value (not reusing "popular") because "popular" is shared by Audiobooks/Hard
      // Copies/Free Books, which the priority override should still apply to.
      const orderBy: any =
        sort === "newest" ? [{ priority: { sort: "asc", nulls: "last" } }, { published_date: "desc" }]
        : sort === "rating" ? [{ priority: { sort: "asc", nulls: "last" } }, { rating: "desc" }]
        : sort === "popular" ? [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }, { id: "asc" }]
        : sort === "mostRead" ? [{ total_reads: "desc" }, { id: "asc" }]
        : [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }];

      const [books, total] = await Promise.all([
        prisma.book.findMany({
          where,
          skip: page * pageSize,
          take: pageSize,
          orderBy,
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
        }),
        prisma.book.count({ where }),
      ]);

      const allNarratorIds = [...new Set(books.flatMap((b) => b.formats.flatMap((f: any) => f.narrator_ids || [])))];
      const narratorRows = allNarratorIds.length > 0
        ? await prisma.narrator.findMany({
            where: { id: { in: allNarratorIds } },
            select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, specialty: true, rating: true, is_featured: true, user_id: true },
          })
        : [];
      const narratorById = new Map(narratorRows.map((n) => [n.id, n]));
      const booksWithNarrators = books.map((b) => ({
        ...b,
        formats: b.formats.map((f: any) => ({
          ...f,
          narrators: (f.narrator_ids || []).map((nid: string) => narratorById.get(nid)).filter(Boolean),
        })),
      }));

      return { books: booksWithNarrators.map(resolveBookUrls), total };
    }),

  // Full book records for the current trending IDs. Looked up by id directly
  // (like homepage.service.ts's trendingNow) rather than filtered out of the
  // capped `list` query, since a genuinely trending older book can otherwise
  // fall outside that recency window and silently vanish from the section.
  trending: publicProcedure
    .input(z.object({
      periodDays: z.number().default(7),
      limit: z.number().min(1).max(50).default(10),
      format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
      search: z.string().optional(),
    }))
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

      const candidateIds = Object.keys(scores);
      if (candidateIds.length === 0) return [];

      // Admin-set `priority` dominates the ranking (ascending — 1 before 2 before 3 —
      // with unset/null priority sorting last); the computed activity score is the
      // tiebreaker among equal-priority books (the scoring itself is unchanged).
      // A `format` filter is applied here too — before ranking/slicing to `limit` —
      // rather than filtering the final list afterward, which would silently starve
      // the section down to however few of the already-picked candidates match.
      const priorityRows = await prisma.book.findMany({
        where: {
          id: { in: candidateIds },
          ...(input.format ? { formats: { some: { format: input.format, is_available: true, submission_status: "approved" } } } : {}),
          ...(input.search ? { title: { contains: input.search, mode: "insensitive" } } : {}),
        },
        select: { id: true, priority: true },
      });
      const priorityById = new Map(priorityRows.map((r) => [r.id, r.priority]));

      // Ranked/sliced from `priorityRows` (already format-filtered), not the original
      // unfiltered `candidateIds` — slicing the unfiltered list first would let
      // non-matching-format candidates occupy slots ahead of matching ones by chance,
      // then get silently dropped at the final fetch below, shrinking the page.
      const trendingIds = priorityRows
        .map((r) => r.id)
        .sort((a, b) => {
          const pa = priorityById.get(a) ?? Infinity;
          const pb = priorityById.get(b) ?? Infinity;
          if (pa !== pb) return pa - pb;
          return scores[b] - scores[a];
        })
        .slice(0, input.limit);

      if (trendingIds.length === 0) return [];

      const books = await prisma.book.findMany({
        where: { id: { in: trendingIds }, submission_status: "approved", is_active: true },
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

      const allNarratorIds = [...new Set(books.flatMap((b) => b.formats.flatMap((f: any) => f.narrator_ids || [])))];
      const narratorRows = allNarratorIds.length > 0
        ? await prisma.narrator.findMany({
            where: { id: { in: allNarratorIds } },
            select: { id: true, name: true, name_en: true, avatar_url: true, bio: true, specialty: true, rating: true, is_featured: true, user_id: true },
          })
        : [];
      const narratorById = new Map(narratorRows.map((n) => [n.id, n]));
      const booksWithNarrators = books.map((b) => ({
        ...b,
        formats: b.formats.map((f: any) => ({
          ...f,
          narrators: (f.narrator_ids || []).map((nid: string) => narratorById.get(nid)).filter(Boolean),
        })),
      }));

      const bookMap = new Map(booksWithNarrators.map((b) => [b.id, b]));
      return trendingIds.map((id) => bookMap.get(id)).filter(Boolean).map(resolveBookUrls);
    }),

  // Real sales, not the manually-admin-set is_bestseller flag `browseBooks`'s
  // filter=bestseller uses — sums OrderItem.quantity per hardcopy book across
  // real (non-cancelled/returned/pending) orders in the last 180 days, same
  // "rank candidate ids, then fetch+attach narrators" shape as `trending`
  // above. Falls back to books.service.ts's getBestSellerBookIds, shared
  // with the mobile REST equivalent (routes/rest/homepage.ts) so both
  // platforms always agree on the same ranking.
  bestSellers: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
      search: z.string().optional(),
      format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
    }))
    .query(async ({ input }) => {
      const { candidateIds, rankById } = await getBestSellerBookIds();
      return rankAndFetchBooks(candidateIds, rankById, { format: input.format, search: input.search, limit: input.limit });
    }),

  // Books currently carrying an admin-set discount on any format, ranked by
  // discount % (highest first) — not by any engagement/sales signal. With no
  // `format` filter, ranks by each book's best current offer across all its
  // formats; with one, ranks (and requires a discount) on that format only.
  specialOffers: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
      search: z.string().optional(),
      format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
    }))
    .query(async ({ input }) => {
      const where: any = {
        submission_status: "approved",
        is_active: true,
        formats: { some: { ...(input.format && { format: input.format }), is_available: true, submission_status: "approved", discount: { gt: 0 } } },
        ...(input.search && { title: { contains: input.search, mode: "insensitive" } }),
      };
      const candidates = await prisma.book.findMany({
        where,
        orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
        take: 300,
        include: bookDetailInclude,
      });
      const discountOf = (b: any) => {
        const relevant = input.format ? b.formats.filter((f: any) => f.format === input.format) : b.formats;
        return Math.max(0, ...relevant.map((f: any) => f.discount ?? 0));
      };
      const ranked = candidates.slice().sort((a, b) => discountOf(b) - discountOf(a)).slice(0, input.limit);
      return await attachNarratorsAndResolve(ranked);
    }),

  // Recent (last 14 days) unique-listener growth per audiobook — a genuine
  // "people are listening to this right now" signal, distinct from
  // popularAudiobooks (all-time total_reads, a generic reads/views counter
  // shared with ebooks, not audiobook-listen-specific).
  trendingAudiobooks: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10), search: z.string().optional() }))
    .query(async ({ input }) => {
      const { candidateIds, rankById } = await getTrendingAudiobookIds();
      return rankAndFetchBooks(candidateIds, rankById, { format: "audiobook", search: input.search, limit: input.limit });
    }),

  // All-time unique-listener count per audiobook — "Top 10 Audiobooks".
  // Same BookListen source as trendingAudiobooks, no recency window.
  topAudiobooks: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10), search: z.string().optional() }))
    .query(async ({ input }) => {
      const { candidateIds, rankById } = await getTopAudiobookIds();
      return rankAndFetchBooks(candidateIds, rankById, { format: "audiobook", search: input.search, limit: input.limit });
    }),

  byId: publicProcedure
    .input(bookByIdSchema)
    .query(async ({ input }) => getBookById(input.id)),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const book = await prisma.book.findUnique({
        where: { slug: input.slug, submission_status: "approved", is_active: true },
        include: {
          author: true,
          translator: true,
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
      if (!book) throw new TRPCError({ code: "NOT_FOUND" });
      return book;
    }),

  categories: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ input }) => {
      const search = input?.search;
      return prisma.category.findMany({
        where: {
          status: "active",
          ...(search
            ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { name_bn: { contains: search, mode: "insensitive" as const } }, { name_en: { contains: search, mode: "insensitive" as const } }] }
            : {}),
        },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
        include: {
          _count: {
            select: { books: { where: { submission_status: "approved", is_active: true } } },
          },
        },
      });
    }),

  tags: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await prisma.book.findMany({
        where: { submission_status: "approved", is_active: true, tags: { isEmpty: false } },
        select: { tags: true },
      });

      const counts = new Map<string, number>();
      for (const row of rows) {
        for (const tag of row.tags) {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      }

      const search = input?.search?.trim().toLowerCase();
      return Array.from(counts.entries())
        .filter(([tag]) => !search || tag.toLowerCase().includes(search))
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));
    }),

  heroBanners: publicProcedure.query(() =>
    prisma.heroBanner.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  activeAdBanners: publicProcedure.query(() =>
    prisma.adBanner.findMany({
      where: { status: "active" },
      orderBy: [{ display_order: "asc" }, { created_at: "desc" }],
      select: {
        id: true,
        title: true,
        image_url: true,
        destination_url: true,
        placement_key: true,
        display_order: true,
        device: true,
        slides: {
          orderBy: { display_order: "asc" },
          select: { id: true, image_url: true, destination_url: true, display_order: true },
        },
      },
    })
  ),

  // Public ad settings — safe subset of platform_settings for frontend consumers
  adSettings: publicProcedure.query(async () => {
    const keys = [
      "ad_system_enabled", "ad_provider_type",
      "ad_adsense_publisher_id", "ad_web_banner_unit_id", "ad_rewarded_unit_id",
      "ad_premium_hide_ads", "ad_free_show_ads",
      "ad_rewarded_coins", "ad_max_per_day", "ad_cooldown_minutes",
      "ad_country_targeting",
    ];
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return map;
  }),

  // Public analytics settings — safe subset of platform_settings for frontend consumers
  analyticsSettings: publicProcedure.query(async () => {
    const keys = [
      "analytics_ga4_enabled", "analytics_ga4_measurement_id",
      "analytics_gtm_enabled", "analytics_gtm_container_id",
    ];
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return map;
  }),

  // Active placement definitions — used to gate ad display by placement
  activePlacements: publicProcedure.query(() =>
    prisma.adPlacement.findMany({
      where: { is_enabled: true },
      select: { placement_key: true, ad_type: true, device_visibility: true, frequency: true, display_priority: true, delay_seconds: true, min_progress_percent: true },
    })
  ),

  recordAdImpression: protectedProcedure
    .input(z.object({ bannerId: z.string(), slideId: z.string().optional() }))
    .mutation(({ input }) =>
      Promise.all([
        prisma.adBanner.update({ where: { id: input.bannerId }, data: { impressions: { increment: 1 } } }),
        input.slideId
          ? prisma.adBannerSlide.update({ where: { id: input.slideId }, data: { impressions: { increment: 1 } } })
          : null,
      ]).catch(() => null)
    ),

  recordAdClick: protectedProcedure
    .input(z.object({ bannerId: z.string(), slideId: z.string().optional() }))
    .mutation(({ input }) =>
      Promise.all([
        prisma.adBanner.update({ where: { id: input.bannerId }, data: { clicks: { increment: 1 } } }),
        input.slideId
          ? prisma.adBannerSlide.update({ where: { id: input.slideId }, data: { clicks: { increment: 1 } } })
          : null,
      ]).catch(() => null)
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
      where: { user_id: ctx.userId, book: { submission_status: "approved", is_active: true } },
      include: {
        book: {
          include: {
            author: { select: { id: true, name: true } },
            translator: { select: { id: true, name: true } },
            formats: { select: { id: true, format: true, price: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    })
  ),

  // Fires when a user opens the Book Details page — records a *view*, not a
  // read (actual reads are only counted once the reader engages inside
  // EbookReader, see readTracking.ts). Public: anonymous visitors are
  // deduped by deviceId instead of userId.
  recordView: publicProcedure
    .input(z.object({ bookId: z.string(), deviceId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await maybeRecordView(ctx.userId, input.deviceId, input.bookId);
      return { success: true };
    }),

  narrators: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
    const search = input?.search;
    const [narrators, formats] = await Promise.all([
      prisma.narrator.findMany({
        where: {
          status: "active",
          ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { name_en: { contains: search, mode: "insensitive" as const } }] } : {}),
        },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      }),
      prisma.bookFormat.findMany({
        where: { format: "audiobook", is_available: true, submission_status: "approved" },
        select: { book_id: true, narrator_id: true, narrator_ids: true },
      }),
    ]);
    const bookIdsByNarrator: Record<string, Set<string>> = {};
    formats.forEach((f) => {
      const ids = [f.narrator_id, ...f.narrator_ids].filter((id): id is string => !!id);
      ids.forEach((id) => {
        (bookIdsByNarrator[id] ??= new Set()).add(f.book_id);
      });
    });
    const allBookIds = [...new Set(formats.map((f) => f.book_id))];
    const listenRows = allBookIds.length > 0
      ? await prisma.book.findMany({ where: { id: { in: allBookIds } }, select: { id: true, total_listens: true } })
      : [];
    const listensByBookId = new Map(listenRows.map((b) => [b.id, b.total_listens || 0]));
    return narrators.map((n) => {
      const bookIds = [...(bookIdsByNarrator[n.id] || [])];
      const totalListens = bookIds.reduce((sum, id) => sum + (listensByBookId.get(id) || 0), 0);
      // No real narrator-follow feature exists (Follow is a generic
      // user-to-user relation, and Narrator isn't always a User) — this was
      // hardcoded to 0 rather than a fabricated follower count. totalListens
      // is real, already computed above, and is what the individual
      // narrator profile page (narratorById) already shows.
      return { ...n, audiobooksCount: bookIds.length, listeners: totalListens, totalListens };
    });
  }),

  narratorById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [narrator, formats] = await Promise.all([
        prisma.narrator.findUnique({ where: { id: input.id } }),
        prisma.bookFormat.findMany({
          where: {
            format: "audiobook",
            is_available: true,
            submission_status: "approved",
            OR: [{ narrator_id: input.id }, { narrator_ids: { has: input.id } }],
          },
          include: { book: { select: { id: true, title: true, title_en: true, slug: true, cover_url: true, rating: true, submission_status: true, is_active: true, total_listens: true } } },
        }),
      ]);
      if (!narrator) return null;
      const seen = new Set<string>();
      const books = formats
        .filter(f => f.book && f.book.submission_status === "approved" && f.book.is_active && !seen.has(f.book.id) && seen.add(f.book.id))
        .map(f => f.book!);
      const totalListens = books.reduce((sum, b: any) => sum + (b.total_listens || 0), 0);
      return { ...narrator, books, totalListens };
    }),

  authorById: publicProcedure
    .input(z.object({ id: z.string(), page: z.number().min(0).default(0), pageSize: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const { id, page, pageSize } = input;
      const bookWhere = { author_id: id, submission_status: "approved", is_active: true };
      const [author, books, total] = await Promise.all([
        prisma.author.findUnique({ where: { id } }),
        prisma.book.findMany({
          where: bookWhere,
          select: { id: true, title: true, title_en: true, slug: true, cover_url: true, rating: true, is_free: true },
          orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { published_date: "desc" }],
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.book.count({ where: bookWhere }),
      ]);
      if (!author) return null;
      return { ...author, books, total, page, pageSize };
    }),

  translatorById: publicProcedure
    .input(z.object({ id: z.string(), page: z.number().min(0).default(0), pageSize: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const { id, page, pageSize } = input;
      const bookWhere = { translator_id: id, submission_status: "approved", is_active: true };
      const [translator, books, total] = await Promise.all([
        prisma.translator.findUnique({ where: { id } }),
        prisma.book.findMany({
          where: bookWhere,
          select: { id: true, title: true, title_en: true, slug: true, cover_url: true, rating: true, is_free: true },
          orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { published_date: "desc" }],
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.book.count({ where: bookWhere }),
      ]);
      if (!translator) return null;
      return { ...translator, books, total, page, pageSize };
    }),

  publisherById: publicProcedure
    .input(z.object({ id: z.string(), page: z.number().min(0).default(0), pageSize: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const { id, page, pageSize } = input;
      const bookWhere = { publisher_id: id, submission_status: "approved", is_active: true };
      const [publisher, books, total] = await Promise.all([
        prisma.publisher.findUnique({ where: { id } }),
        prisma.book.findMany({
          where: bookWhere,
          select: { id: true, title: true, title_en: true, slug: true, cover_url: true, rating: true, is_free: true },
          orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { published_date: "desc" }],
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.book.count({ where: bookWhere }),
      ]);
      if (!publisher) return null;
      return { ...publisher, books, total, page, pageSize };
    }),

  authors: publicProcedure
    .input(z.object({ page: z.number().min(0).default(0), pageSize: z.number().min(1).max(500).default(500), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 500;
      const search = input?.search;
      const where = {
        status: "active" as const,
        ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { name_en: { contains: search, mode: "insensitive" as const } }] } : {}),
      };
      const [authors, total, bookCounts] = await Promise.all([
        prisma.author.findMany({
          where,
          orderBy: [{ priority: "desc" }, { name: "asc" }],
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.author.count({ where }),
        prisma.book.groupBy({
          by: ["author_id"],
          where: { submission_status: "approved", is_active: true, author_id: { not: null } },
          _count: { author_id: true },
        }),
      ]);
      const countMap: Record<string, number> = {};
      bookCounts.forEach((r) => { if (r.author_id) countMap[r.author_id] = r._count.author_id; });
      return { data: authors.map((a) => ({ ...a, booksCount: countMap[a.id] || 0, followers: 0 })), total, page, pageSize };
    }),

  translators: publicProcedure
    .input(z.object({ page: z.number().min(0).default(0), pageSize: z.number().min(1).max(500).default(500), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 500;
      const search = input?.search;
      const where = {
        status: "active" as const,
        ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { name_en: { contains: search, mode: "insensitive" as const } }] } : {}),
      };
      const [translators, total, bookCounts] = await Promise.all([
        prisma.translator.findMany({
          where,
          orderBy: [{ priority: "desc" }, { name: "asc" }],
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.translator.count({ where }),
        prisma.book.groupBy({
          by: ["translator_id"],
          where: { submission_status: "approved", is_active: true, translator_id: { not: null } },
          _count: { translator_id: true },
        }),
      ]);
      const countMap: Record<string, number> = {};
      bookCounts.forEach((r) => { if (r.translator_id) countMap[r.translator_id] = r._count.translator_id; });
      return { data: translators.map((t) => ({ ...t, booksCount: countMap[t.id] || 0, followers: 0 })), total, page, pageSize };
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

  homepageCategorySections: publicProcedure
    .input(z.object({
      page: z.number().min(0).default(0),
      pageSize: z.number().min(1).max(50).default(50),
      format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
      booksLimit: z.number().min(1).max(50).optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 50;
      const format = input?.format;
      const search = input?.search;
      const [sections, total] = await Promise.all([
        prisma.homepageCategorySection.findMany({
          orderBy: { sort_order: "asc" },
          skip: page * pageSize,
          take: pageSize,
          include: { category: { select: { id: true, name: true, name_bn: true, slug: true } } },
        }),
        prisma.homepageCategorySection.count(),
      ]);

      const data = await Promise.all(
        sections.map(async (sec) => {
          const books = await prisma.book.findMany({
            where: {
              category_id: sec.category_id,
              submission_status: "approved",
              is_active: true,
              // Applied before `take` (not filtered after) so a format/search filter narrows
              // the candidate pool instead of shrinking an already-capped result — see the
              // same caution documented in homepage.service.ts.
              ...(format ? { formats: { some: { format, is_available: true, submission_status: "approved" } } } : {}),
              ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
            },
            take: input?.booksLimit ?? sec.book_limit,
            orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
            select: {
              id: true, title: true, cover_url: true, slug: true,
              formats: { select: { format: true, price: true } },
              author: { select: { id: true, name: true } },
              translator: { select: { id: true, name: true } },
            },
          });
          return { ...sec, books };
        })
      );
      return { data, total, page, pageSize };
    }),

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

  teamMembers: publicProcedure.query(() =>
    prisma.teamMember.findMany({
      where: { status: "active" },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    })
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
        where: { id: { in: bookIds }, submission_status: "approved", is_active: true },
        include: {
          author: { select: { id: true, name: true, name_en: true } },
          translator: { select: { id: true, name: true, name_en: true } },
          formats: { where: { submission_status: "approved" }, select: { id: true, format: true, price: true } },
        },
      });
    }),

  recommendations: publicProcedure
    .input(z.object({
      bookId: z.string().optional(),
      format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
      search: z.string().optional(),
    }).optional().default({}))
    .query(async ({ input }) => {
      const formatWhere = input.format
        ? { formats: { some: { format: input.format, is_available: true, submission_status: "approved" as const } } }
        : {};
      const searchWhere = input.search
        ? { title: { contains: input.search, mode: "insensitive" as const } }
        : {};
      if (!input.bookId) {
        return prisma.book.findMany({
          where: { submission_status: "approved", is_active: true, ...formatWhere, ...searchWhere },
          take: 10,
          orderBy: { total_reads: "desc" },
          include: {
            author: { select: { id: true, name: true } },
            translator: { select: { id: true, name: true } },
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
          is_active: true,
          OR: [
            { category_id: book.category_id ?? undefined },
            { author_id: book.author_id ?? undefined },
          ],
          ...formatWhere,
          ...searchWhere,
        },
        take: 10,
        orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }],
        include: {
          author: { select: { id: true, name: true } },
          translator: { select: { id: true, name: true } },
          formats: { where: { submission_status: "approved" }, select: { id: true, format: true, price: true } },
        },
      });
    }),

  // "Because You Read" — a genuinely personalized recommendation, not the generic
  // popular-books list `recommendations` (above) falls back to without a bookId.
  // protectedProcedure so a logged-out user can never trigger or see it; the frontend
  // additionally gates the query itself behind `enabled: !!user` for belt-and-suspenders.
  becauseYouRead: protectedProcedure
    .input(z.object({
      format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
      search: z.string().optional(),
    }).optional())
    .query(({ ctx, input }) => getBecauseYouReadRecommendations(ctx.userId, 10, input?.format, input?.search)),

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
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      profiles.forEach(p => { profileMap[p.user_id] = p; });
      return comments.map(c => ({
        ...c,
        display_name: profileMap[c.user_id]?.display_name ?? null,
        avatar_url: profileMap[c.user_id]?.avatar_url ?? null,
        like_count: c._count.likes,
        liked_by_me: input.userId ? (c.likes as any[]).length > 0 : false,
        replies: c.replies.map((r: any) => ({
          ...r,
          display_name: profileMap[r.user_id]?.display_name ?? null,
          avatar_url: profileMap[r.user_id]?.avatar_url ?? null,
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
      const where = input.id ? { id: input.id } : { slug: input.slug!.trim() };
      const book = await prisma.book.findUnique({
        where,
        include: {
          author: true,
          translator: true,
          publisher: true,
          category: true,
          formats: {
            where: { submission_status: "approved", is_available: true },
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
      if (!book || book.submission_status !== "approved" || !book.is_active) throw new TRPCError({ code: "NOT_FOUND" });

      // Resolve all admin-selected narrators (BookFormat.narrator_ids) into full Narrator rows,
      // attached per-format as `narrators` — ordered, with the legacy single `narrator` first.
      const allNarratorIds = [...new Set(book.formats.flatMap((f: any) => f.narrator_ids || []))];
      const narratorRows = allNarratorIds.length > 0
        ? await prisma.narrator.findMany({ where: { id: { in: allNarratorIds } } })
        : [];
      const narratorById = new Map(narratorRows.map((n) => [n.id, n]));
      const formatsWithNarrators = book.formats.map((f: any) => ({
        ...f,
        narrators: (f.narrator_ids || []).map((nid: string) => narratorById.get(nid)).filter(Boolean),
      }));
      (book as any).formats = formatsWithNarrators;

      // Only show contributors whose role-format has an approved BookFormat
      const approvedFormatTypes = new Set(book.formats.map((f: any) => f.format as string));
      const visibleContributors = book.contributors.filter((c: any) => {
        if (!c.format) return true;
        return approvedFormatTypes.has(c.format as string);
      });

      // Enrich contributors with display_name from profiles
      const contribUserIds = visibleContributors.map((c) => c.user_id).filter(Boolean);
      const profiles = contribUserIds.length > 0
        ? await prisma.profile.findMany({
            where: { user_id: { in: contribUserIds } },
            select: { user_id: true, display_name: true, avatar_url: true },
          })
        : [];
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      profiles.forEach(p => { profileMap[p.user_id] = p; });

      return resolveBookUrls({
        ...book,
        contributors: visibleContributors.map((c) => ({
          ...c,
          display_name: profileMap[c.user_id]?.display_name ?? null,
          avatar_url: profileMap[c.user_id]?.avatar_url ?? null,
        })),
      });
    }),

  searchApprovedBooks: publicProcedure
    .input(z.object({ query: z.string().min(1), format: z.enum(["ebook", "audiobook", "hardcopy"]) }))
    .query(async ({ input }) => {
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
        orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
        take: 20,
      });
      return books.map(b => ({
        ...b,
        existingFormats: b.formats.map(f => f.format),
        hasFormat: b.formats.some(f => f.format === input.format),
      }));
    }),

  myCreatorBooks: protectedProcedure
    .input(z.object({ role: z.enum(["writer", "narrator", "publisher", "translator"]) }))
    .query(async ({ ctx, input }) => {
      const bookInclude = {
        category: { select: { name: true, name_bn: true } },
        formats: { select: { id: true, format: true, price: true, duration: true, audio_quality: true, stock_count: true, binding: true, in_stock: true, chapters_count: true, file_url: true, file_size: true, submitted_by: true, submission_status: true, subscriber_access: true } },
      };

      const ids = await getCreatorBookIds(ctx.userId, input.role);
      if (ids.size === 0) return [];

      const books = await prisma.book.findMany({
        where: { id: { in: [...ids] } },
        include: bookInclude,
        orderBy: { created_at: "desc" },
      });
      return books.map(resolveBookUrls);
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
      subscriberAccess: z.boolean().optional(),
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
          // Hardcopy can never carry subscription access — enforced here too,
          // not just in the admin panel.
          subscriber_access: input.format === "hardcopy" ? false : (input.subscriberAccess ?? false),
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
      subscriberAccess: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const book = await prisma.book.findUnique({ where: { id: input.bookId } });
      if (!book) throw new TRPCError({ code: "FORBIDDEN" });
      if (book.submitted_by !== ctx.userId && !(await userOwnsBook(ctx.userId!, input.bookId, input.format))) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
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
          submitted_by: input.asDraft ? book.submitted_by : ctx.userId,
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
        // Hardcopy can never carry subscription access — enforced here too,
        // not just in the admin panel.
        subscriber_access: input.format === "hardcopy" ? false : (input.subscriberAccess ?? false),
      };
      if (input.formatId) {
        await prisma.bookFormat.update({ where: { id: input.formatId }, data: formatData });
      } else {
        const existingFormat = await prisma.bookFormat.findFirst({
          where: { book_id: input.bookId, format: input.format },
        });
        if (existingFormat) {
          await prisma.bookFormat.update({ where: { id: existingFormat.id }, data: formatData });
        } else {
          await prisma.bookFormat.create({
            data: {
              ...formatData,
              book_id: input.bookId,
              format: input.format,
              submission_status: input.asDraft ? "draft" : "pending",
              submitted_by: ctx.userId,
            },
          });
        }
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
      subscriberAccess: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const book = await prisma.book.findUnique({ where: { id: input.bookId }, select: { submitted_by: true } });
      if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      if (book.submitted_by !== ctx.userId && !(await userOwnsBook(ctx.userId!, input.bookId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to modify this book" });
      }

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
          // Hardcopy can never carry subscription access — enforced here too,
          // not just in the admin panel.
          subscriber_access: input.format === "hardcopy" ? false : (input.subscriberAccess ?? false),
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
      if (!book) throw new TRPCError({ code: "FORBIDDEN" });
      if (book.submitted_by !== ctx.userId && !(await userOwnsBook(ctx.userId!, input.bookId))) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "pending", submitted_by: ctx.userId },
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
      const chapter = await prisma.ebookChapter.create({
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
      // Keep book_formats.file_url in sync with the first chapter's file
      if (count === 0 && input.fileUrl) {
        await prisma.bookFormat.update({
          where: { id: input.bookFormatId },
          data: { file_url: input.fileUrl },
        });
      }
      return chapter;
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
      // Sets track status to "pending" for admin review.
      // Track only becomes visible on frontend when admin sets it to "active".
      // The parent format/book stay "approved" so existing active tracks remain live.
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
    .input(z.object({
      trackId: z.string(),
      title: z.string().min(1).optional(),
      chapterPrice: z.number().nullable().optional(),
      audioUrl: z.string().optional(),
      mediaType: z.string().optional(),
      duration: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { trackId, ...fields } = input;
      const data: any = {};
      if (fields.title !== undefined) data.title = fields.title;
      if (fields.chapterPrice !== undefined) data.chapter_price = fields.chapterPrice;
      if (fields.audioUrl !== undefined) data.audio_url = fields.audioUrl;
      if (fields.mediaType !== undefined) data.media_type = fields.mediaType;
      if (fields.duration !== undefined) data.duration = fields.duration;
      return prisma.audiobookTrack.update({ where: { id: trackId }, data });
    }),

  uploadTrackAudio: protectedProcedure
    .input(z.object({ trackId: z.string(), audioUrl: z.string(), mediaType: z.string().optional(), duration: z.string().optional() }))
    .mutation(({ input }) =>
      prisma.audiobookTrack.update({
        where: { id: input.trackId },
        data: { audio_url: input.audioUrl, media_type: input.mediaType || "audio", duration: input.duration || null },
      })
    ),

  updateEbookChapter: protectedProcedure
    .input(z.object({
      chapterId: z.string(),
      title: z.string().min(1).optional(),
      content: z.string().optional(),
      fileUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { chapterId, title, content, fileUrl } = input;
      const data: any = {};
      if (title !== undefined) data.chapter_title = title;
      if (content !== undefined) data.content = content;
      if (fileUrl !== undefined) data.file_url = fileUrl;
      const chapter = await prisma.ebookChapter.update({ where: { id: chapterId }, data });
      // Sync first chapter file_url to parent BookFormat
      if (fileUrl !== undefined && chapter.chapter_order === 1) {
        await prisma.bookFormat.update({
          where: { id: chapter.book_format_id },
          data: { file_url: fileUrl },
        });
      }
      return chapter;
    }),

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

  platformStats: publicProcedure.query(async () => {
    const [ebooks, audiobooks, hardcopies, narrators] = await Promise.all([
      prisma.bookFormat.count({ where: { format: "ebook", is_available: true, submission_status: "approved" } }),
      prisma.bookFormat.count({ where: { format: "audiobook", is_available: true, submission_status: "approved" } }),
      prisma.bookFormat.count({ where: { format: "hardcopy", is_available: true, submission_status: "approved" } }),
      prisma.narrator.count({ where: { status: "active" } }),
    ]);
    return { ebooks, audiobooks, hardcopies, narrators };
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
        orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
        take: 5,
      });
    }),
});
