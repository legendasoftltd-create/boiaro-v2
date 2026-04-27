import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import type { Context } from "../context.js";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { calculateEarnings } from "../lib/earnings.js";

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = await prisma.userRole.findFirst({
    where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } },
  });
  if (!role) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const HOMEPAGE_SECTION_DEFAULTS: Array<{
  section_key: string;
  title: string;
  subtitle: string | null;
  is_enabled: boolean;
  sort_order: number;
  display_source: string | null;
}> = [
  { section_key: "hero", title: "Hero Banner", subtitle: null, is_enabled: true, sort_order: 1, display_source: null },
  { section_key: "continue_reading", title: "পড়া চালিয়ে যান", subtitle: null, is_enabled: true, sort_order: 2, display_source: null },
  { section_key: "continue_listening", title: "শোনা চালিয়ে যান", subtitle: null, is_enabled: true, sort_order: 3, display_source: null },
  { section_key: "recently_viewed", title: "সম্প্রতি দেখা", subtitle: null, is_enabled: true, sort_order: 4, display_source: null },
  { section_key: "recommended_for_you", title: "আপনার জন্য", subtitle: "AI সাজেশন", is_enabled: true, sort_order: 5, display_source: null },
  { section_key: "because_you_read", title: "আপনি যা পড়েছেন", subtitle: null, is_enabled: true, sort_order: 6, display_source: null },
  { section_key: "featured_books", title: "নতুন প্রকাশনা", subtitle: "সদ্য প্রকাশিত বইসমূহ", is_enabled: true, sort_order: 7, display_source: null },
  { section_key: "trending_books", title: "ট্রেন্ডিং বই", subtitle: "জনপ্রিয় বইসমূহ", is_enabled: true, sort_order: 8, display_source: null },
  { section_key: "top_10_most_read", title: "সর্বাধিক পঠিত ১০", subtitle: null, is_enabled: true, sort_order: 9, display_source: null },
  { section_key: "editors_pick", title: "সম্পাদকের পছন্দ", subtitle: null, is_enabled: true, sort_order: 10, display_source: null },
  { section_key: "popular_audiobooks", title: "জনপ্রিয় অডিওবুক", subtitle: "শুনুন আপনার পছন্দের বই", is_enabled: true, sort_order: 11, display_source: null },
  { section_key: "audiobooks", title: "অডিওবুক সমূহ", subtitle: null, is_enabled: true, sort_order: 12, display_source: null },
  { section_key: "hard_copies", title: "হার্ড কপি", subtitle: "সংগ্রহে রাখুন", is_enabled: true, sort_order: 13, display_source: null },
  { section_key: "free_books", title: "ফ্রি বই", subtitle: "বিনামূল্যে পড়ুন", is_enabled: true, sort_order: 14, display_source: null },
  { section_key: "categories", title: "ক্যাটাগরি", subtitle: "বিষয় অনুযায়ী বই খুঁজুন", is_enabled: true, sort_order: 15, display_source: null },
  { section_key: "authors", title: "জনপ্রিয় লেখক", subtitle: "আমাদের প্রিয় লেখকগণ", is_enabled: true, sort_order: 16, display_source: null },
  { section_key: "narrators", title: "জনপ্রিয় কথক", subtitle: null, is_enabled: true, sort_order: 17, display_source: null },
  { section_key: "live_radio", title: "Live Radio", subtitle: "Listen to live streaming now", is_enabled: false, sort_order: 18, display_source: null },
  { section_key: "blog", title: "ব্লগ ও আর্টিকেল", subtitle: "আমাদের সাম্প্রতিক লেখা", is_enabled: true, sort_order: 19, display_source: null },
  { section_key: "app_download", title: "অ্যাপ ডাউনলোড", subtitle: null, is_enabled: true, sort_order: 20, display_source: null },
];

const APP_ROLE_VALUES = ["admin", "moderator", "user", "writer", "publisher", "narrator", "rj"] as const;
const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;

export const adminRouter = router({
  // ── Books ───────────────────────────────────────────────────────────────────
  listBooks: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const books = await prisma.book.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.status ? { submission_status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        include: {
          author: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, name_bn: true } },
          publisher: { select: { id: true, name: true } },
          formats: {
            select: {
              id: true,
              book_id: true,
              format: true,
              price: true,
              stock_count: true,
              narrator_id: true,
              submission_status: true,
              narrator: { select: { id: true, name: true } },
            },
          },
        },
      });
      let nextCursor: string | undefined;
      if (books.length > input.limit) nextCursor = books.pop()!.id;
      return { books, nextCursor };
    }),

  listBookContributorCounts: adminProcedure.query(async () => {
    const grouped = await prisma.bookContributor.groupBy({
      by: ["book_id"],
      _count: { book_id: true },
    });
    return grouped.map((row) => ({ book_id: row.book_id, count: row._count.book_id }));
  }),

  listBookFormatsByBook: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .query(({ input }) =>
      prisma.bookFormat.findMany({
        where: { book_id: input.bookId },
        select: {
          id: true,
          book_id: true,
          format: true,
          price: true,
          original_price: true,
          discount: true,
          pages: true,
          duration: true,
          file_size: true,
          file_url: true,
          chapters_count: true,
          preview_chapters: true,
          preview_percentage: true,
          audio_quality: true,
          binding: true,
          dimensions: true,
          weight: true,
          weight_kg_per_copy: true,
          delivery_days: true,
          in_stock: true,
          stock_count: true,
          is_available: true,
          narrator_id: true,
          submission_status: true,
          printing_cost: true,
          unit_cost: true,
          default_packaging_cost: true,
          publisher_commission_percent: true,
          submitted_by: true,
          publisher_id: true,
          payout_model: true,
          isbn: true,
          created_at: true,
          updated_at: true,
          publisher: { select: { name: true } },
          narrator: { select: { name: true } },
        },
      })
    ),

  getBookFormatPrice: adminProcedure
    .input(z.object({ formatId: z.string() }))
    .query(({ input }) =>
      prisma.bookFormat.findUnique({
        where: { id: input.formatId },
        select: { price: true },
      })
    ),

  upsertBook: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        title_en: z.string().optional().nullable(),
        slug: z.string().min(1),
        description: z.string().optional().nullable(),
        description_bn: z.string().optional().nullable(),
        author_id: z.string().optional().nullable(),
        category_id: z.string().optional().nullable(),
        publisher_id: z.string().optional().nullable(),
        cover_url: z.string().optional().nullable(),
        is_featured: z.boolean().optional(),
        is_bestseller: z.boolean().optional(),
        is_new: z.boolean().optional(),
        is_free: z.boolean().optional(),
        language: z.string().optional().nullable(),
        tags: z.array(z.string()).nullable().optional(),
        submission_status: z.string().optional().nullable(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { id, author_id, category_id, publisher_id, ...data } = input;
      const normalizedTags =
        data.tags === undefined ? undefined : data.tags === null ? [] : data.tags;

      const relationData = {
        author: author_id ? { connect: { id: author_id } } : { disconnect: true },
        category: category_id ? { connect: { id: category_id } } : { disconnect: true },
        publisher: publisher_id ? { connect: { id: publisher_id } } : { disconnect: true },
      };

      if (id) {
        return prisma.book.update({
          where: { id },
          data: {
            ...data,
            ...(data.submission_status === "pending" ? { submitted_by: ctx.userId } : {}),
            ...(normalizedTags !== undefined ? { tags: { set: normalizedTags } } : {}),
            ...relationData,
          } as any,
        });
      }

      return prisma.book.create({
        data: {
          ...data,
          submission_status: data.submission_status ?? "pending",
          submitted_by: ctx.userId,
          ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
          ...(author_id ? { author: { connect: { id: author_id } } } : {}),
          ...(category_id ? { category: { connect: { id: category_id } } } : {}),
          ...(publisher_id ? { publisher: { connect: { id: publisher_id } } } : {}),
        } as any,
      });
    }),

  deleteBookWithFormats: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) =>
      prisma.$transaction(async (tx) => {
        const formatIds = (
          await tx.bookFormat.findMany({
            where: { book_id: input.id },
            select: { id: true },
          })
        ).map((f) => f.id);

        const commentIds = (
          await tx.bookComment.findMany({
            where: { book_id: input.id },
            select: { id: true },
          })
        ).map((c) => c.id);

        if (commentIds.length > 0) {
          await tx.commentLike.deleteMany({ where: { comment_id: { in: commentIds } } });
          await tx.bookComment.deleteMany({ where: { id: { in: commentIds } } });
        }

        // Clear nullable references first so historical orders and presence survive.
        if (formatIds.length > 0) {
          await tx.orderItem.updateMany({
            where: { book_format_id: { in: formatIds } },
            data: { book_format_id: null },
          });
        }
        await tx.userPresence.updateMany({
          where: { current_book_id: input.id },
          data: { current_book_id: null },
        });

        // Remove direct book/format dependents.
        await tx.bookmark.deleteMany({ where: { book_id: input.id } });
        await tx.bookRead.deleteMany({ where: { book_id: input.id } });
        await tx.review.deleteMany({ where: { book_id: input.id } });
        await tx.readingProgress.deleteMany({ where: { book_id: input.id } });
        await tx.listeningProgress.deleteMany({ where: { book_id: input.id } });
        await tx.contentUnlock.deleteMany({ where: { book_id: input.id } });
        await tx.dailyBookStat.deleteMany({ where: { book_id: input.id } });
        await tx.bookContributor.deleteMany({ where: { book_id: input.id } });

        // Best-effort cleanup for auxiliary tables keyed by book_id without Prisma relations.
        await tx.accountingLedger.deleteMany({ where: { book_id: input.id } });
        await tx.contentAccessLog.deleteMany({ where: { book_id: input.id } });
        await tx.contentAccessToken.deleteMany({ where: { book_id: input.id } });
        await tx.contentConsumptionTime.deleteMany({ where: { book_id: input.id } });
        await tx.contentEditRequest.deleteMany({ where: { book_id: input.id } });
        await tx.contributorEarning.deleteMany({ where: { book_id: input.id } });
        await tx.formatRevenueSplit.deleteMany({ where: { book_id: input.id } });
        await tx.userPurchase.deleteMany({ where: { book_id: input.id } });

        if (formatIds.length > 0) {
          await tx.audiobookTrack.deleteMany({ where: { book_format_id: { in: formatIds } } });
          await tx.ebookChapter.deleteMany({ where: { book_format_id: { in: formatIds } } });
          await tx.bookFormat.deleteMany({ where: { id: { in: formatIds } } });
        }

        await tx.book.delete({ where: { id: input.id } });
      })
    ),

  upsertBookFormat: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        book_id: z.string(),
        format: z.string(),
        narrator_id: z.string().nullable().optional(),
        price: z.number().nullable().optional(),
        original_price: z.number().nullable().optional(),
        discount: z.number().nullable().optional(),
        pages: z.number().int().nullable().optional(),
        duration: z.string().nullable().optional(),
        file_size: z.string().nullable().optional(),
        file_url: z.string().nullable().optional(),
        chapters_count: z.number().int().nullable().optional(),
        preview_chapters: z.number().int().nullable().optional(),
        preview_percentage: z.number().nullable().optional(),
        audio_quality: z.string().nullable().optional(),
        binding: z.string().nullable().optional(),
        dimensions: z.string().nullable().optional(),
        weight: z.string().nullable().optional(),
        weight_kg_per_copy: z.number().nullable().optional(),
        delivery_days: z.number().int().nullable().optional(),
        in_stock: z.boolean().nullable().optional(),
        stock_count: z.number().int().nullable().optional(),
        is_available: z.boolean().nullable().optional(),
        submission_status: z.string().nullable().optional(),
        printing_cost: z.number().nullable().optional(),
        unit_cost: z.number().nullable().optional(),
        default_packaging_cost: z.number().nullable().optional(),
        publisher_commission_percent: z.number().nullable().optional(),
        submitted_by: z.string().nullable().optional(),
        publisher_id: z.string().nullable().optional(),
        payout_model: z.string().nullable().optional(),
        isbn: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      if (id) {
        return prisma.bookFormat.update({
          where: { id },
          data: {
            ...data,
            ...(data.submission_status === "pending" ? { submitted_by: data.submitted_by ?? ctx.userId } : {}),
          } as any,
        });
      }
      return prisma.bookFormat.create({
        data: {
          ...data,
          submission_status: data.submission_status ?? "pending",
          submitted_by: data.submitted_by ?? ctx.userId,
        } as any,
      });
    }),

  setBookFormatAvailability: adminProcedure
    .input(z.object({ id: z.string(), isAvailable: z.boolean() }))
    .mutation(({ input }) =>
      prisma.bookFormat.update({
        where: { id: input.id },
        data: { is_available: input.isAvailable },
      })
    ),

  deleteBookFormatCascade: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) =>
      prisma.$transaction([
        prisma.audiobookTrack.deleteMany({ where: { book_format_id: input.id } }),
        prisma.bookFormat.delete({ where: { id: input.id } }),
      ])
    ),

  addAudiobookTrackAdmin: adminProcedure
    .input(
      z.object({
        book_format_id: z.string(),
        title: z.string().min(1),
        audio_url: z.string().nullable().optional(),
        track_number: z.number().int(),
        duration: z.string().nullable().optional(),
        is_preview: z.boolean().optional(),
        status: z.string().optional(),
        media_type: z.string().optional(),
        chapter_price: z.number().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.audiobookTrack.create({
        data: {
          ...input,
          created_by: ctx.userId,
        } as any,
      })
    ),

  updateAudiobookTrackAdmin: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().min(1), chapter_price: z.number().nullable().optional() }))
    .mutation(({ input }) =>
      prisma.audiobookTrack.update({
        where: { id: input.id },
        data: { title: input.title, chapter_price: input.chapter_price ?? null },
      })
    ),

  deleteAudiobookTrackAdmin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.audiobookTrack.delete({ where: { id: input.id } })),

  createAccountingLedgerEntry: adminProcedure
    .input(
      z.object({
        type: z.string(),
        category: z.string(),
        description: z.string().nullable().optional(),
        amount: z.number(),
        entry_date: z.string().optional(),
        book_id: z.string().nullable().optional(),
        reference_type: z.string().nullable().optional(),
        reference_id: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.accountingLedger.create({
        data: {
          type: input.type,
          category: input.category,
          description: input.description ?? null,
          amount: input.amount,
          entry_date: input.entry_date ? new Date(input.entry_date) : new Date(),
          book_id: input.book_id ?? null,
          reference_type: input.reference_type ?? null,
          reference_id: input.reference_id ?? null,
          created_by: ctx.userId,
        },
      })
    ),

  listAccountingLedgerEntries: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(500) }).optional())
    .query(({ input }) =>
      prisma.accountingLedger.findMany({
        orderBy: [{ entry_date: "desc" }, { created_at: "desc" }],
        take: input?.limit ?? 500,
      })
    ),

  reverseAccountingLedgerEntry: adminProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await prisma.accountingLedger.findUnique({ where: { id: input.entryId } });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Ledger entry not found" });
      return prisma.accountingLedger.create({
        data: {
          type: entry.type,
          category: entry.category,
          description: `REVERSAL: ${entry.description || entry.category} (original: ${entry.id.slice(0, 8)})`,
          amount: -Math.abs(Number(entry.amount || 0)),
          entry_date: new Date(),
          source: "manual",
          created_by: ctx.userId,
          reference_type: "reversal",
          reference_id: entry.id,
          book_id: entry.book_id,
          order_id: entry.order_id,
        },
      });
    }),

  listWallets: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(200) }).optional())
    .query(async ({ input }) => {
      const wallets = await prisma.userCoin.findMany({
        orderBy: { balance: "desc" },
        take: input?.limit ?? 200,
      });
      const userIds = [...new Set(wallets.map((w) => w.user_id))];
      const profiles = userIds.length
        ? await prisma.profile.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, display_name: true, avatar_url: true },
          })
        : [];
      const profileMap = Object.fromEntries(
        profiles.map((profile) => [profile.user_id, { display_name: profile.display_name, avatar_url: profile.avatar_url }])
      );
      return wallets.map((wallet) => ({
        ...wallet,
        profiles: profileMap[wallet.user_id] || null,
      }));
    }),

  listCoinTransactions: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(200) }).optional())
    .query(({ input }) =>
      prisma.coinTransaction.findMany({
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 200,
      })
    ),

  listCoinTransactionsByUser: adminProcedure
    .input(z.object({ userId: z.string(), limit: z.number().min(1).max(500).default(50) }).optional())
    .query(({ input }) =>
      prisma.coinTransaction.findMany({
        where: { user_id: input?.userId },
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 50,
      })
    ),

  adjustUserCoins: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number().int(),
        type: z.string().default("adjustment"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.$transaction(async (tx) => {
        const wallet = await tx.userCoin.findUnique({ where: { user_id: input.userId } });
        if (!wallet) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
        }
        const newBalance = wallet.balance + input.amount;
        if (newBalance < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
        }
        const updatedWallet = await tx.userCoin.update({
          where: { user_id: input.userId },
          data: {
            balance: newBalance,
            total_earned: input.amount > 0 ? wallet.total_earned + input.amount : wallet.total_earned,
            total_spent: input.amount < 0 ? wallet.total_spent + Math.abs(input.amount) : wallet.total_spent,
          },
        });
        await tx.coinTransaction.create({
          data: {
            user_id: input.userId,
            amount: input.amount,
            type: input.type,
            description: input.description || `Admin adjustment: ${input.amount}`,
            source: "admin",
          },
        });
        return updatedWallet;
      });
    }),

  listReferrals: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(200) }).optional())
    .query(({ input }) =>
      prisma.referral.findMany({
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 200,
      })
    ),

  approveBook: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .mutation(({ input }) =>
      prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "approved" },
      })
    ),

  rejectBook: adminProcedure
    .input(z.object({ bookId: z.string(), reason: z.string().optional() }))
    .mutation(({ input }) =>
      prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "rejected" },
      })
    ),

  // ── Users ───────────────────────────────────────────────────────────────────
  listUsers: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional(), search: z.string().optional() }))
    .query(async ({ input }) => {
      const users = await prisma.user.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.search
          ? {
              OR: [
                { email: { contains: input.search, mode: "insensitive" } },
                { profile: { display_name: { contains: input.search, mode: "insensitive" } } },
              ],
            }
          : undefined,
        orderBy: { created_at: "desc" },
        include: {
          profile: {
            select: {
              display_name: true,
              avatar_url: true,
              is_active: true,
              deleted_at: true,
              deleted_reason: true,
            },
          },
          roles: true,
        },
      });
      const userIds = users.map((user) => user.id);
      const [orderCounts, activeSubscriptions] = await Promise.all([
        userIds.length > 0
          ? prisma.order.groupBy({
              by: ["user_id"],
              where: { user_id: { in: userIds } },
              _count: { user_id: true },
            })
          : [],
        userIds.length > 0
          ? prisma.userSubscription.findMany({
              where: { user_id: { in: userIds }, status: "active" },
              select: { user_id: true },
            })
          : [],
      ]);
      const orderCountByUserId = Object.fromEntries(
        orderCounts.map((item) => [item.user_id, item._count.user_id])
      );
      const activeSubscriptionUserIds = new Set(activeSubscriptions.map((item) => item.user_id));

      const usersWithStats = users.map((user) => ({
        ...user,
        order_count: orderCountByUserId[user.id] ?? 0,
        has_active_sub: activeSubscriptionUserIds.has(user.id),
      }));

      let nextCursor: string | undefined;
      if (usersWithStats.length > input.limit) nextCursor = usersWithStats.pop()!.id;
      return { users: usersWithStats, nextCursor };
    }),

  getUserStats: adminProcedure.query(async () => {
    const [total, creators, verified, deleted] = await Promise.all([
      prisma.user.count({
        where: {
          profile: {
            is: {
              deleted_at: null,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          profile: {
            is: {
              deleted_at: null,
            },
          },
          roles: {
            some: {
              role: {
                in: ["writer", "publisher", "narrator"],
              },
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          email_verified: true,
          profile: {
            is: {
              deleted_at: null,
            },
          },
        },
      }),
      prisma.profile.count({
        where: {
          deleted_at: {
            not: null,
          },
        },
      }),
    ]);

    return { total, creators, verified, deleted };
  }),

  updateUserBasic: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        displayName: z.string().min(1),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      await prisma.user.update({
        where: { id: input.userId },
        data: { email: input.email },
      });
      return prisma.profile.update({
        where: { user_id: input.userId },
        data: { display_name: input.displayName },
      });
    }),

  updateUserStatus: adminProcedure
    .input(z.object({ userId: z.string(), isActive: z.boolean() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: { is_active: input.isActive },
      })
    ),

  softDeleteUser: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string().optional() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_reason: input.reason ?? null,
        },
      })
    ),

  restoreUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: {
          is_active: true,
          deleted_at: null,
          deleted_reason: null,
        },
      })
    ),

  // ── Orders ──────────────────────────────────────────────────────────────────
  listOrders: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const orders = await prisma.order.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        include: {
          items: {
            select: {
              id: true,
              order_id: true,
              format: true,
              price: true,
              quantity: true,
              book_id: true,
            },
          },
          payments: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              method: true,
              transaction_id: true,
              created_at: true,
            },
          },
        },
      });
      const missingNameUserIds = [
        ...new Set(orders.filter((order) => !order.shipping_name && !!order.user_id).map((order) => order.user_id)),
      ];
      const profiles = missingNameUserIds.length
        ? await prisma.profile.findMany({
            where: { user_id: { in: missingNameUserIds } },
            select: { user_id: true, display_name: true, phone: true },
          })
        : [];
      const profileMap = Object.fromEntries(
        profiles.map((profile) => [
          profile.user_id,
          {
            display_name: profile.display_name ?? null,
            phone: profile.phone ?? null,
          },
        ])
      );
      const enrichedOrders = orders.map((order) => ({
        ...order,
        _customerName:
          order.shipping_name || profileMap[order.user_id]?.display_name || order.user_id?.slice(0, 8) || "Unknown",
        _customerPhone: order.shipping_phone || profileMap[order.user_id]?.phone || null,
        _payment: order.payments?.[0] ?? null,
      }));
      let nextCursor: string | undefined;
      if (enrichedOrders.length > input.limit) nextCursor = enrichedOrders.pop()!.id;
      return { orders: enrichedOrders, nextCursor };
    }),

  orderDetail: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        include: {
          items: true,
          payments: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { status: true, method: true, transaction_id: true },
          },
          status_history: {
            orderBy: { created_at: "desc" },
            select: { id: true, old_status: true, new_status: true, created_at: true, note: true, changed_by: true },
          },
        },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const shipment = await prisma.shipment.findFirst({
        where: { order_id: input.orderId },
        orderBy: { created_at: "desc" },
      });
      const shipmentEvents = shipment
        ? await prisma.shipmentEvent.findMany({
            where: { shipment_id: shipment.id },
            orderBy: { created_at: "desc" },
          })
        : [];
      const bookIds = [...new Set(order.items.map((item) => item.book_id).filter(Boolean) as string[])];
      const books = bookIds.length
        ? await prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: { id: true, title: true, cover_url: true },
          })
        : [];
      const bookMap = Object.fromEntries(books.map((book) => [book.id, book]));

      return {
        order,
        items: order.items.map((item) => ({
          ...item,
          books: item.book_id ? bookMap[item.book_id] ?? null : null,
        })),
        payment: order.payments[0] ?? null,
        statusHistory: order.status_history,
        shipment: shipment
          ? {
              ...shipment,
              courier_name: shipment.carrier,
              tracking_code: shipment.tracking_number,
              provider_code: shipment.carrier || "manual",
              parcel_id: shipment.id,
            }
          : null,
        shipmentEvents,
      };
    }),

  updateOrderStatus: adminProcedure
    .input(z.object({ orderId: z.string(), status: z.string(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      return prisma.$transaction([
        prisma.order.update({ where: { id: input.orderId }, data: { status: input.status } }),
        prisma.orderStatusHistory.create({
          data: {
            order_id: input.orderId,
            old_status: order.status,
            new_status: input.status,
            changed_by: ctx.userId,
            note: input.note,
          },
        }),
      ]);
    }),

  updateCodPaymentStatus: adminProcedure
    .input(z.object({ orderId: z.string(), codPaymentStatus: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.order.update({
        where: { id: input.orderId },
        data: { cod_payment_status: input.codPaymentStatus },
      });
    }),

  markCodPaid: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.$transaction([
        prisma.payment.updateMany({
          where: { order_id: input.orderId, method: "cod" },
          data: {
            status: "paid",
            transaction_id: `COD-MANUAL-${input.orderId.slice(0, 8).toUpperCase()}`,
          },
        }),
        prisma.order.update({
          where: { id: input.orderId },
          data: { cod_payment_status: "settled_to_merchant" },
        }),
        prisma.paymentEvent.create({
          data: {
            order_id: input.orderId,
            event_type: "cod_manual_settle",
            status: "paid",
            raw_response: { settled_by: ctx.userId } as any,
          },
        }),
      ]);
    }),

  markOrderPurchased: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        purchaseCostPerUnit: z.number().nonnegative(),
        packagingCost: z.number().nonnegative().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      const orderItems = await prisma.orderItem.findMany({
        where: { order_id: input.orderId, format: "hardcopy" },
        select: { quantity: true, book_id: true },
      });
      const totalQty = orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
      const totalCogs = totalQty * input.purchaseCostPerUnit;
      const bookIds = [...new Set(orderItems.map((item) => item.book_id).filter(Boolean) as string[])];
      const books = bookIds.length
        ? await prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: { title: true },
          })
        : [];
      const description = `Order-based purchase: ${
        books.map((book) => book.title).join(", ") || "Book"
      } — ${totalQty} × ৳${input.purchaseCostPerUnit} (Order #${order.order_number || input.orderId.slice(0, 8)})`;

      return prisma.$transaction([
        prisma.order.update({
          where: { id: input.orderId },
          data: {
            purchase_cost_per_unit: input.purchaseCostPerUnit,
            packaging_cost: input.packagingCost,
            is_purchased: true,
          },
        }),
        prisma.accountingLedger.create({
          data: {
            type: "expense",
            category: "cost_of_goods_sold",
            description,
            amount: totalCogs,
            entry_date: new Date(),
            order_id: input.orderId,
            reference_type: "order",
            reference_id: input.orderId,
            created_by: ctx.userId,
          },
        }),
      ]);
    }),

  createShipment: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await prisma.shipment.findFirst({ where: { order_id: input.orderId } });
      if (existing) return existing;
      return prisma.shipment.create({
        data: {
          order_id: input.orderId,
          status: "created",
        },
      });
    }),

  updateShipment: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        shipmentId: z.string(),
        status: z.string(),
        courierName: z.string().nullable().optional(),
        trackingCode: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const old = await prisma.shipment.findUnique({ where: { id: input.shipmentId } });
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await prisma.shipment.update({
        where: { id: input.shipmentId },
        data: {
          status: input.status,
          carrier: input.courierName ?? old.carrier,
          tracking_number: input.trackingCode ?? old.tracking_number,
        },
      });
      await prisma.shipmentEvent.create({
        data: {
          shipment_id: input.shipmentId,
          status: input.status,
          description: `Manual update: ${old.status} → ${input.status}`,
        },
      });
      const shipToOrder: Record<string, string> = {
        picked_up: "pickup_received",
        in_transit: "in_transit",
        delivered: "delivered",
      };
      if (shipToOrder[input.status]) {
        await prisma.order.update({
          where: { id: input.orderId },
          data: { status: shipToOrder[input.status] },
        });
      }
      return updated;
    }),

  // ── Role Applications ───────────────────────────────────────────────────────
  listRoleApplications: adminProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(({ input }) =>
      prisma.roleApplication.findMany({
        where: input.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
      })
    ),

  approveRoleApplication: adminProcedure
    .input(z.object({ applicationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await prisma.roleApplication.findUnique({ where: { id: input.applicationId } });
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const role = app.applied_role;
      const userId = app.user_id;
      const displayName = app.display_name || "Unknown";

      await prisma.$transaction(async (tx) => {
        await tx.roleApplication.update({
          where: { id: input.applicationId },
          data: { status: "approved", reviewed_by: ctx.userId, verified: true, reviewed_at: new Date() },
        });
        await tx.userRole.upsert({
          where: { user_id_role: { user_id: userId, role: role as any } },
          create: { user_id: userId, role: role as any },
          update: {},
        });
      });

      if (role === "writer") {
        const existing = await prisma.author.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.author.create({ data: { name: displayName, user_id: userId, status: "active" } });
      } else if (role === "publisher") {
        const existing = await prisma.publisher.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.publisher.create({ data: { name: displayName, user_id: userId } });
      } else if (role === "narrator") {
        const existing = await prisma.narrator.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.narrator.create({ data: { name: displayName, user_id: userId, status: "active" } });
      } else if (role === "rj") {
        const existing = await prisma.rjProfile.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.rjProfile.create({ data: { user_id: userId, stage_name: displayName, is_approved: true } });
        else await prisma.rjProfile.update({ where: { user_id: userId }, data: { is_approved: true } });
      }

      if (app.display_name) {
        await prisma.profile.updateMany({ where: { user_id: userId }, data: { display_name: app.display_name } });
      }

      return { success: true };
    }),

  listAdminRoles: adminProcedure.query(() =>
    prisma.adminRole.findMany({
      orderBy: { created_at: "asc" },
    })
  ),

  upsertAdminRole: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(2).optional(),
        label: z.string().min(1),
        description: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.id) {
        return prisma.adminRole.update({
          where: { id: input.id },
          data: {
            label: input.label,
            description: input.description ?? null,
          },
        });
      }

      if (!input.name) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Role name is required for new roles" });
      }

      return prisma.adminRole.create({
        data: {
          name: input.name.trim().toLowerCase(),
          label: input.label,
          description: input.description ?? null,
        },
      });
    }),

  deleteAdminRole: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const linkedCount = await prisma.adminUserRole.count({ where: { admin_role_id: input.id } });
      if (linkedCount > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a role assigned to users" });
      }
      return prisma.adminRole.delete({ where: { id: input.id } });
    }),

  listAdminRolePermissions: adminProcedure
    .input(z.object({ roleId: z.string() }))
    .query(async ({ input }) => {
      const role = await prisma.adminRole.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      if (!APP_ROLE_VALUES.includes(role.name as (typeof APP_ROLE_VALUES)[number])) return [];
      return prisma.rolePermission.findMany({
        where: { role: role.name as (typeof APP_ROLE_VALUES)[number] },
      });
    }),

  replaceAdminRolePermissions: adminProcedure
    .input(
      z.object({
        roleId: z.string(),
        modules: z.array(
          z.object({
            module: z.string(),
            can_view: z.boolean(),
            can_create: z.boolean(),
            can_edit: z.boolean(),
            can_delete: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const role = await prisma.adminRole.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      if (!APP_ROLE_VALUES.includes(role.name as (typeof APP_ROLE_VALUES)[number])) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Permissions require a mapped app role name" });
      }
      const appRole = role.name as (typeof APP_ROLE_VALUES)[number];
      const keys = input.modules.flatMap((entry) =>
        PERMISSION_ACTIONS.filter((action) => entry[`can_${action}` as const]).map((action) => ({
          permission_key: `${entry.module}:${action}`,
        }))
      );

      await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { role: appRole } }),
        ...(keys.length
          ? [
              prisma.rolePermission.createMany({
                data: keys.map((key) => ({ role: appRole, permission_key: key.permission_key, is_allowed: true })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
      return { success: true };
    }),

  listAdminUserRoles: adminProcedure.query(() =>
    prisma.adminUserRole.findMany({
      orderBy: { created_at: "desc" },
      include: { admin_role: { select: { label: true, name: true } } },
    })
  ),

  assignAdminRoleToUser: adminProcedure
    .input(
      z.object({
        user_id: z.string(),
        admin_role_id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const [existing, role] = await Promise.all([
        prisma.adminUserRole.findFirst({ where: { user_id: input.user_id } }),
        prisma.adminRole.findUnique({ where: { id: input.admin_role_id }, select: { name: true } }),
      ]);
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });

      const result = existing
        ? await prisma.adminUserRole.update({
            where: { id: existing.id },
            data: { admin_role_id: input.admin_role_id, is_active: true },
          })
        : await prisma.adminUserRole.create({
            data: { user_id: input.user_id, admin_role_id: input.admin_role_id, is_active: true },
          });

      if (APP_ROLE_VALUES.includes(role.name as (typeof APP_ROLE_VALUES)[number])) {
        await prisma.userRole.upsert({
          where: { user_id_role: { user_id: input.user_id, role: role.name as (typeof APP_ROLE_VALUES)[number] } },
          create: { user_id: input.user_id, role: role.name as (typeof APP_ROLE_VALUES)[number] },
          update: {},
        });
      }

      return result;
    }),

  setAdminUserRoleActive: adminProcedure
    .input(z.object({ id: z.string(), is_active: z.boolean() }))
    .mutation(({ input }) =>
      prisma.adminUserRole.update({
        where: { id: input.id },
        data: { is_active: input.is_active },
      })
    ),

  // ── Permissions ─────────────────────────────────────────────────────────────
  myPermissions: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = await prisma.userRole.findFirst({
      where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } },
    });
    if (!isAdmin) return { roleName: null, permissions: [], isSuperAdmin: false };

    const MODULES = [
      "books", "users", "orders", "payments", "reports", "support", "content",
      "settings", "roles", "email", "notifications", "analytics", "cms",
      "subscriptions", "coupons", "shipping", "withdrawals", "revenue",
    ];

    if (isAdmin.role === "admin") {
      return {
        roleName: "super_admin",
        isSuperAdmin: true,
        permissions: MODULES.map((m) => ({ module: m, can_view: true, can_create: true, can_edit: true, can_delete: true })),
      };
    }

    return {
      roleName: "moderator",
      isSuperAdmin: false,
      permissions: MODULES.map((m) => ({ module: m, can_view: true, can_create: false, can_edit: false, can_delete: false })),
    };
  }),

  // ── Content Edit Requests ───────────────────────────────────────────────────
  submitEditRequest: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(["book", "book_format"]),
        contentId: z.string(),
        proposedChanges: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { contentType, contentId, proposedChanges } = input;
      const existing = await prisma.contentEditRequest.findFirst({
        where: { book_id: contentId, request_type: contentType, user_id: ctx.userId, status: "pending" },
      });
      if (existing) {
        return prisma.contentEditRequest.update({
          where: { id: existing.id },
          data: { details: JSON.stringify(proposedChanges) },
        });
      }
      return prisma.contentEditRequest.create({
        data: {
          book_id: contentId,
          user_id: ctx.userId,
          request_type: contentType,
          details: JSON.stringify(proposedChanges),
          status: "pending",
        },
      });
    }),

  checkPendingEditRequest: protectedProcedure
    .input(z.object({ contentType: z.string(), contentId: z.string() }))
    .query(({ ctx, input }) =>
      prisma.contentEditRequest.findFirst({
        where: { book_id: input.contentId, request_type: input.contentType, user_id: ctx.userId, status: "pending" },
        select: { id: true, status: true, created_at: true },
      })
    ),

  // ── Creator Account Management ──────────────────────────────────────────────
  createCreator: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["writer", "publisher", "narrator"]),
        profileTable: z.enum(["authors", "publishers", "narrators"]),
        profileData: z.record(z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const { email, password, role, profileTable, profileData } = input;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });

      const password_hash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          email,
          password_hash,
          profile: {
            create: {
              display_name: (profileData.name as string) ?? null,
              referral_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
            },
          },
          roles: { create: { role: role as any } },
        },
      });

      if (profileTable === "authors") {
        await prisma.author.create({ data: { ...(profileData as any), user_id: user.id } });
      } else if (profileTable === "publishers") {
        await prisma.publisher.create({ data: { ...(profileData as any), user_id: user.id } });
      } else {
        await prisma.narrator.create({ data: { ...(profileData as any), user_id: user.id } });
      }

      return { message: "Creator account created successfully", userId: user.id };
    }),

  linkCreatorProfile: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["writer", "publisher", "narrator"]),
        profileTable: z.enum(["authors", "publishers", "narrators"]),
        profileId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { email, role, profileTable, profileId } = input;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      if (profileTable === "authors") {
        await prisma.author.update({ where: { id: profileId }, data: { user_id: user.id, linked_at: new Date() } });
      } else if (profileTable === "publishers") {
        await prisma.publisher.update({ where: { id: profileId }, data: { user_id: user.id, linked_at: new Date() } });
      } else {
        await prisma.narrator.update({ where: { id: profileId }, data: { user_id: user.id, linked_at: new Date() } });
      }

      await prisma.userRole.upsert({
        where: { user_id_role: { user_id: user.id, role: role as any } },
        create: { user_id: user.id, role: role as any },
        update: {},
      });

      return { message: "Profile linked successfully" };
    }),

  unlinkCreatorProfile: adminProcedure
    .input(
      z.object({
        profileTable: z.enum(["authors", "publishers", "narrators"]),
        profileId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const roleByTable: Record<"authors" | "publishers" | "narrators", "writer" | "publisher" | "narrator"> = {
        authors: "writer",
        publishers: "publisher",
        narrators: "narrator",
      };
      const targetRole = roleByTable[input.profileTable];

      let previousUserId: string | null | undefined;
      if (input.profileTable === "authors") {
        const row = await prisma.author.findUnique({ where: { id: input.profileId }, select: { user_id: true } });
        previousUserId = row?.user_id;
        await prisma.author.update({ where: { id: input.profileId }, data: { user_id: null, linked_at: null } });
      } else if (input.profileTable === "publishers") {
        const row = await prisma.publisher.findUnique({ where: { id: input.profileId }, select: { user_id: true } });
        previousUserId = row?.user_id;
        await prisma.publisher.update({ where: { id: input.profileId }, data: { user_id: null, linked_at: null } });
      } else {
        const row = await prisma.narrator.findUnique({ where: { id: input.profileId }, select: { user_id: true } });
        previousUserId = row?.user_id;
        await prisma.narrator.update({ where: { id: input.profileId }, data: { user_id: null, linked_at: null } });
      }

      if (previousUserId) {
        const [linkedAuthor, linkedPublisher, linkedNarrator] = await Promise.all([
          targetRole === "writer"
            ? prisma.author.count({ where: { user_id: previousUserId } })
            : Promise.resolve(0),
          targetRole === "publisher"
            ? prisma.publisher.count({ where: { user_id: previousUserId } })
            : Promise.resolve(0),
          targetRole === "narrator"
            ? prisma.narrator.count({ where: { user_id: previousUserId } })
            : Promise.resolve(0),
        ]);
        const stillLinkedForRole =
          targetRole === "writer" ? linkedAuthor > 0 : targetRole === "publisher" ? linkedPublisher > 0 : linkedNarrator > 0;

        if (!stillLinkedForRole) {
          await prisma.userRole.deleteMany({ where: { user_id: previousUserId, role: targetRole as any } });
        }
      }

      return { message: "Account unlinked successfully" };
    }),

  searchCreatorLinkCandidates: adminProcedure
    .input(z.object({ query: z.string().min(2) }))
    .query(async ({ input }) => {
      const q = input.query.trim();
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { profile: { display_name: { contains: q, mode: "insensitive" } } },
            { profile: { phone: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: 25,
        orderBy: { created_at: "desc" },
        include: {
          profile: { select: { display_name: true, avatar_url: true, phone: true } },
          roles: true,
        },
      });
      const userIds = users.map((u) => u.id);
      const [authors, publishers, narrators] = await Promise.all([
        userIds.length
          ? prisma.author.findMany({
              where: { user_id: { in: userIds } },
              select: { user_id: true, id: true, name: true },
            })
          : [],
        userIds.length
          ? prisma.publisher.findMany({
              where: { user_id: { in: userIds } },
              select: { user_id: true, id: true, name: true },
            })
          : [],
        userIds.length
          ? prisma.narrator.findMany({
              where: { user_id: { in: userIds } },
              select: { user_id: true, id: true, name: true },
            })
          : [],
      ]);

      const linksByUser: Record<string, Array<{ type: string; name: string }>> = {};
      authors.forEach((a) => {
        if (!a.user_id) return;
        if (!linksByUser[a.user_id]) linksByUser[a.user_id] = [];
        linksByUser[a.user_id].push({ type: "author", name: a.name });
      });
      publishers.forEach((p) => {
        if (!p.user_id) return;
        if (!linksByUser[p.user_id]) linksByUser[p.user_id] = [];
        linksByUser[p.user_id].push({ type: "publisher", name: p.name });
      });
      narrators.forEach((n) => {
        if (!n.user_id) return;
        if (!linksByUser[n.user_id]) linksByUser[n.user_id] = [];
        linksByUser[n.user_id].push({ type: "narrator", name: n.name });
      });

      return users.map((u) => ({
        user_id: u.id,
        email: u.email,
        display_name: u.profile?.display_name || u.email,
        avatar_url: u.profile?.avatar_url ?? null,
        phone: u.profile?.phone ?? null,
        roles: u.roles.map((r) => r.role),
        existing_links: linksByUser[u.id] || [],
      }));
    }),

  // ── Authors CRUD ────────────────────────────────────────────────────────────
  listAuthors: adminProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(({ input }) =>
      prisma.author.findMany({
        where: input.search
          ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { name_en: { contains: input.search, mode: "insensitive" } }] }
          : undefined,
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      })
    ),

  createAuthor: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      name_en: z.string().optional(),
      bio: z.string().optional(),
      genre: z.string().optional(),
      avatar_url: z.string().optional(),
      phone: z.string().optional(),
      is_featured: z.boolean().optional(),
      is_trending: z.boolean().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => prisma.author.create({ data: input as any })),

  updateAuthor: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      name_en: z.string().optional(),
      bio: z.string().optional(),
      genre: z.string().optional(),
      avatar_url: z.string().optional(),
      phone: z.string().optional(),
      is_featured: z.boolean().optional(),
      is_trending: z.boolean().optional(),
      priority: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.author.update({ where: { id }, data: data as any });
    }),

  deleteAuthor: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.author.delete({ where: { id: input.id } })),

  // ── Site Settings ───────────────────────────────────────────────────────────
  updateSiteSetting: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input }) =>
      prisma.siteSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      })
    ),

  // ── Narrators ────────────────────────────────────────────────────────────────
  listNarrators: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.narrator.findMany({
        where: input?.search
          ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { name_en: { contains: input.search, mode: "insensitive" } }] }
          : undefined,
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      })
    ),

  createNarrator: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), bio: z.string().optional(), specialty: z.string().optional(), avatar_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional() }))
    .mutation(({ input }) => prisma.narrator.create({ data: input as any })),

  updateNarrator: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), name_en: z.string().optional(), bio: z.string().optional(), specialty: z.string().optional(), avatar_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.narrator.update({ where: { id }, data });
    }),

  deleteNarrator: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.narrator.delete({ where: { id: input.id } })),

  // ── Publishers ───────────────────────────────────────────────────────────────
  listPublishers: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.publisher.findMany({
        where: input?.search
          ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { name_en: { contains: input.search, mode: "insensitive" } }] }
          : undefined,
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      })
    ),

  createPublisher: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), description: z.string().optional(), logo_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_verified: z.boolean().optional(), priority: z.number().optional() }))
    .mutation(({ input }) => prisma.publisher.create({ data: input as any })),

  updatePublisher: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), name_en: z.string().optional(), description: z.string().optional(), logo_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_verified: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.publisher.update({ where: { id }, data });
    }),

  deletePublisher: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.publisher.delete({ where: { id: input.id } })),

  // ── Categories ───────────────────────────────────────────────────────────────
  listCategories: adminProcedure.query(() =>
    prisma.category.findMany({ orderBy: [{ priority: "desc" }, { name: "asc" }] })
  ),

  createCategory: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), priority: z.number().optional() }))
    .mutation(({ input }) => prisma.category.create({ data: input as any })),

  updateCategory: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.category.update({ where: { id }, data });
    }),

  deleteCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.category.delete({ where: { id: input.id } })),

  // ── Homepage Sections ─────────────────────────────────────────────────────────
  listHomepageSections: adminProcedure.query(async () => {
    const existing = await prisma.homepageSection.findMany({ orderBy: { sort_order: "asc" } });
    if (existing.length > 0) return existing;

    await prisma.homepageSection.createMany({
      data: HOMEPAGE_SECTION_DEFAULTS,
      skipDuplicates: true,
    });

    return prisma.homepageSection.findMany({ orderBy: { sort_order: "asc" } });
  }),

  resetHomepageSections: adminProcedure
    .input(z.object({ hardReset: z.boolean().default(false) }).optional())
    .mutation(async ({ input }) => {
      if (input?.hardReset) {
        await prisma.homepageSection.deleteMany({});
      }
      await prisma.homepageSection.createMany({
        data: HOMEPAGE_SECTION_DEFAULTS,
        skipDuplicates: true,
      });
      return { success: true };
    }),

  updateHomepageSection: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().optional(), subtitle: z.string().optional(), is_enabled: z.boolean().optional(), sort_order: z.number().optional(), display_source: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.homepageSection.update({ where: { id }, data });
    }),

  // ── Reviews ──────────────────────────────────────────────────────────────────
  listReviews: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.review.findMany({
        where: input?.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        include: { book: { select: { id: true, title: true } } },
      })
    ),

  approveReview: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.review.update({ where: { id: input.id }, data: { status: "approved" } })),

  rejectReview: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.review.update({ where: { id: input.id }, data: { status: "rejected" } })),

  // ── Ad Config ────────────────────────────────────────────────────────────────
  adConfig: adminProcedure.query(() =>
    prisma.platformSetting.findMany({
      where: { key: { startsWith: "ad_" } },
    })
  ),

  // ── Site Settings by category ─────────────────────────────────────────────────
  siteSettingsByCategory: adminProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(() => prisma.siteSetting.findMany({ orderBy: { key: "asc" } })),

  // ── Dashboard counts ──────────────────────────────────────────────────────────
  dashboard: adminProcedure.query(async () => {
    const [users, books, orders, pendingReviews, roleApplications] = await Promise.all([
      prisma.user.count(),
      prisma.book.count({ where: { submission_status: "approved" } }),
      prisma.order.count(),
      prisma.review.count({ where: { status: "pending" } }),
      prisma.roleApplication.count({ where: { status: "pending" } }),
    ]);
    return { users, books, orders, pendingReviews, roleApplications };
  }),

  // ── Activity / System Logs ────────────────────────────────────────────────────
  activityLogs: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.adminActivityLog.findMany({
        take: input?.limit ?? 50,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        orderBy: { created_at: "desc" },
      })
    ),

  // ── Notifications ─────────────────────────────────────────────────────────────
  listNotifications: adminProcedure.query(() =>
    prisma.notification.findMany({
      orderBy: { created_at: "desc" },
    })
  ),

  createNotification: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.string().default("system"),
        audience: z.string().default("all"),
        targetUserId: z.string().nullable().optional(),
        priority: z.string().default("normal"),
        link: z.string().nullable().optional(),
        channel: z.string().default("in_app"),
        scheduledAt: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.notification.create({
        data: {
          title: input.title,
          message: input.message,
          type: input.type,
          audience: input.audience,
          target_user_id: input.audience === "specific" ? input.targetUserId ?? null : null,
          priority: input.priority,
          link: input.link ?? null,
          channel: input.channel,
          scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : null,
          created_by: ctx.userId,
          status: input.scheduledAt ? "scheduled" : "draft",
        },
      })
    ),

  updateNotification: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.string().default("system"),
        audience: z.string().default("all"),
        targetUserId: z.string().nullable().optional(),
        priority: z.string().default("normal"),
        link: z.string().nullable().optional(),
        channel: z.string().default("in_app"),
        scheduledAt: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.notification.update({
        where: { id: input.id },
        data: {
          title: input.title,
          message: input.message,
          type: input.type,
          audience: input.audience,
          target_user_id: input.audience === "specific" ? input.targetUserId ?? null : null,
          priority: input.priority,
          link: input.link ?? null,
          channel: input.channel,
          scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : null,
          status: input.scheduledAt ? "scheduled" : "draft",
        },
      })
    ),

  deleteNotification: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.notification.delete({ where: { id: input.id } })),

  sendNotification: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const notification = await prisma.notification.findUnique({ where: { id: input.id } });
      if (!notification) throw new TRPCError({ code: "NOT_FOUND" });

      let userIds: string[] = [];
      if (notification.audience === "specific" && notification.target_user_id) {
        userIds = [notification.target_user_id];
      } else if (notification.audience === "all") {
        const users = await prisma.user.findMany({ select: { id: true } });
        userIds = users.map((user) => user.id);
      } else {
        const roles = await prisma.userRole.findMany({
          where: { role: notification.audience as any },
          select: { user_id: true },
        });
        userIds = [...new Set(roles.map((role) => role.user_id))];
      }

      if (!userIds.length) return { sent: 0 };

      await prisma.userNotification.createMany({
        data: userIds.map((userId) => ({
          user_id: userId,
          notification_id: notification.id,
        })),
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "sent", sent_at: new Date() },
      });

      return { sent: userIds.length };
    }),

  // ── Notification Templates ───────────────────────────────────────────────────
  listNotificationTemplates: adminProcedure.query(() =>
    prisma.notificationTemplate.findMany({
      orderBy: { created_at: "desc" },
    })
  ),

  createNotificationTemplate: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        title: z.string().min(1),
        message: z.string().default(""),
        type: z.string().default("system"),
        channel: z.string().default("in_app"),
        ctaText: z.string().nullable().optional(),
        ctaLink: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.notificationTemplate.create({
        data: {
          name: input.name,
          title: input.title,
          message: input.message,
          type: input.type,
          channel: input.channel,
          cta_text: input.ctaText ?? null,
          cta_link: input.ctaLink ?? null,
        },
      })
    ),

  updateNotificationTemplate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        title: z.string().min(1),
        message: z.string().default(""),
        type: z.string().default("system"),
        channel: z.string().default("in_app"),
        ctaText: z.string().nullable().optional(),
        ctaLink: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.notificationTemplate.update({
        where: { id: input.id },
        data: {
          name: input.name,
          title: input.title,
          message: input.message,
          type: input.type,
          channel: input.channel,
          cta_text: input.ctaText ?? null,
          cta_link: input.ctaLink ?? null,
        },
      })
    ),

  deleteNotificationTemplate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.notificationTemplate.delete({ where: { id: input.id } })),

  listSupportTickets: adminProcedure.query(async () => {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { created_at: "desc" },
      include: { replies: { select: { id: true } } },
    });
    const userIds = [...new Set(tickets.map((t) => t.user_id).filter(Boolean))];
    const [users, profiles] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
      userIds.length ? prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true, phone: true } }) : [],
    ]);
    const userEmailById = Object.fromEntries(users.map((u) => [u.id, u.email]));
    const profileByUserId = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
    return tickets.map((t) => ({
      ...t,
      ticket_number: `TKT-${t.id.slice(0, 8).toUpperCase()}`,
      type: "ticket",
      message: t.description,
      user_name: profileByUserId[t.user_id]?.display_name || "User",
      user_email: userEmailById[t.user_id] || null,
      user_phone: profileByUserId[t.user_id]?.phone || null,
      replies_count: t.replies.length,
    }));
  }),

  getSupportTicketDetail: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const ticket = await prisma.supportTicket.findUnique({ where: { id: input.id } });
      if (!ticket) return null;
      const [user, profile] = await Promise.all([
        prisma.user.findUnique({ where: { id: ticket.user_id }, select: { email: true } }),
        prisma.profile.findUnique({ where: { user_id: ticket.user_id }, select: { display_name: true, phone: true } }),
      ]);
      return {
        ...ticket,
        ticket_number: `TKT-${ticket.id.slice(0, 8).toUpperCase()}`,
        type: "ticket",
        message: ticket.description,
        attachment_url: null,
        user_name: profile?.display_name || "User",
        user_email: user?.email || null,
        user_phone: profile?.phone || null,
      };
    }),

  listSupportTicketReplies: adminProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ input }) => {
      const replies = await prisma.ticketReply.findMany({
        where: { ticket_id: input.ticketId },
        orderBy: { created_at: "asc" },
      });
      const userIds = [...new Set(replies.map((r) => r.user_id).filter(Boolean))];
      const profiles = userIds.length
        ? await prisma.profile.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, display_name: true },
          })
        : [];
      const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.display_name || "User"]));
      return replies.map((r) => ({
        ...r,
        is_admin: r.is_staff,
        is_internal: r.is_staff && (r.message || "").startsWith("[Internal] "),
        sender_name: r.is_staff ? "Admin" : profileMap[r.user_id] || "User",
        message: r.is_staff && (r.message || "").startsWith("[Internal] ") ? (r.message || "").replace(/^\[Internal\]\s*/, "") : r.message,
      }));
    }),

  updateSupportTicket: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string().optional(),
        priority: z.string().optional(),
        assigned_to: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.supportTicket.update({
        where: { id },
        data,
      });
    }),

  addSupportTicketReply: adminProcedure
    .input(
      z.object({
        ticketId: z.string(),
        userId: z.string(),
        message: z.string().min(1),
        isInternal: z.boolean().default(false),
      })
    )
    .mutation(({ input }) =>
      prisma.ticketReply.create({
        data: {
          ticket_id: input.ticketId,
          user_id: input.userId,
          message: input.isInternal ? `[Internal] ${input.message}` : input.message,
          is_staff: true,
        },
      })
    ),

  listEmailTemplates: adminProcedure.query(async () => {
    const rows = await prisma.emailTemplate.findMany({ orderBy: { created_at: "asc" } });
    return rows.map((row) => ({
      ...row,
      body_html: row.body,
      body_text: row.body,
      status: row.is_active ? "active" : "inactive",
    }));
  }),

  upsertEmailTemplate: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        template_type: z.string().min(1),
        subject: z.string().min(1),
        body_html: z.string().default(""),
        body_text: z.string().default(""),
        status: z.enum(["active", "inactive"]).default("active"),
      })
    )
    .mutation(async ({ input }) => {
      const variables = Array.from(new Set((input.body_html.match(/\{\{(.*?)\}\}/g) || []).map((s) => s.replace(/[{}]/g, "").trim())));
      const data = {
        name: input.name,
        template_type: input.template_type,
        subject: input.subject,
        body: input.body_html || input.body_text || "",
        variables,
        is_active: input.status === "active",
      };
      if (input.id) {
        return prisma.emailTemplate.update({ where: { id: input.id }, data });
      }
      return prisma.emailTemplate.create({ data });
    }),

  deleteEmailTemplate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.emailTemplate.delete({ where: { id: input.id } })),

  getActiveEmailTemplate: adminProcedure
    .input(z.object({ templateType: z.string().min(1) }))
    .query(({ input }) =>
      prisma.emailTemplate.findFirst({
        where: { template_type: input.templateType, is_active: true },
        select: { subject: true, body: true },
      })
    ),

  logEmailEvent: adminProcedure
    .input(
      z.object({
        recipient_email: z.string().email(),
        template_type: z.string().min(1),
        subject: z.string().min(1),
        status: z.string().default("sent"),
        error_message: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.emailLog.create({
        data: {
          recipient_email: input.recipient_email,
          template_type: input.template_type,
          subject: input.subject,
          status: input.status,
          error_message: input.error_message ?? null,
          sent_at: input.status === "sent" ? new Date() : null,
        },
      })
    ),

  listEmailLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(200) }).optional())
    .query(({ input }) =>
      prisma.emailLog.findMany({
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 200,
      })
    ),

  sendTestEmail: adminProcedure
    .input(z.object({ recipientEmail: z.string().email() }))
    .mutation(async ({ input }) => {
      const now = new Date();
      await prisma.emailLog.create({
        data: {
          recipient_email: input.recipientEmail,
          template_type: "test-email",
          subject: "BoiAro Email Test",
          status: "sent",
          sent_at: now,
        },
      });
      return { success: true };
    }),

  listSystemAlerts: adminProcedure.query(async () => {
    const logs = await prisma.systemLog.findMany({
      where: { level: { in: ["warn", "error", "critical"] } },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return logs.map((log) => {
      const meta = (log.metadata || {}) as Record<string, any>;
      const severity = log.level === "critical" ? "critical" : log.level === "error" ? "warning" : "info";
      return {
        id: log.id,
        alert_type: log.module || "system",
        severity,
        title: meta.title || `${(log.module || "System").toUpperCase()} alert`,
        message: log.message,
        metric_value: typeof meta.metric_value === "number" ? meta.metric_value : null,
        threshold: typeof meta.threshold === "number" ? meta.threshold : null,
        is_resolved: Boolean(meta.is_resolved),
        resolved_at: meta.resolved_at || null,
        created_at: log.created_at,
      };
    });
  }),

  resolveSystemAlert: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const current = await prisma.systemLog.findUnique({
        where: { id: input.id },
        select: { metadata: true },
      });
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      const existing = (current.metadata || {}) as Record<string, any>;
      return prisma.systemLog.update({
        where: { id: input.id },
        data: {
          metadata: {
            ...existing,
            is_resolved: true,
            resolved_at: new Date().toISOString(),
          } as any,
        },
      });
    }),

  runSystemAlertCheck: adminProcedure.mutation(async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const errorCount = await prisma.systemLog.count({
      where: { created_at: { gte: oneHourAgo }, level: { in: ["error", "critical"] } },
    });
    return {
      alerts_found: errorCount,
      alerts_inserted: 0,
    };
  }),

  // ── User detail + role update ─────────────────────────────────────────────────
  getAdminUserDetailPage: adminProcedure
    .input(z.object({ type: z.enum(["user", "author", "narrator", "publisher"]), id: z.string() }))
    .query(async ({ input }) => {
      const roleByType = {
        author: "writer",
        narrator: "narrator",
        publisher: "publisher",
      } as const;

      if (input.type === "user") {
        const user = await prisma.user.findUnique({
          where: { id: input.id },
          include: { profile: true, roles: true },
        });
        if (!user || !user.profile) return null;

        return {
          record: user.profile,
          profile: user.profile,
          roles: user.roles.map((r) => r.role),
          authMeta: {
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: null,
            email_confirmed_at: user.email_verified ? user.updated_at : null,
          },
          application: null,
          books: [],
          earnings: [],
          withdrawals: [],
        };
      }

      const record =
        input.type === "author"
          ? await prisma.author.findUnique({ where: { id: input.id } })
          : input.type === "narrator"
            ? await prisma.narrator.findUnique({ where: { id: input.id } })
            : await prisma.publisher.findUnique({ where: { id: input.id } });
      if (!record) return null;

      if (!record.user_id) {
        return {
          record,
          profile: null,
          roles: [],
          authMeta: null,
          application: null,
          books: [],
          earnings: [],
          withdrawals: [],
        };
      }

      const [user, app, books, earnings, withdrawals] = await Promise.all([
        prisma.user.findUnique({
          where: { id: record.user_id },
          include: { profile: true, roles: true },
        }),
        prisma.roleApplication.findFirst({
          where: { user_id: record.user_id, applied_role: roleByType[input.type] },
          orderBy: { created_at: "desc" },
        }),
        prisma.book.findMany({
          where: { submitted_by: record.user_id },
          select: { id: true, title: true, cover_url: true, submission_status: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: 20,
        }),
        prisma.contributorEarning.findMany({
          where: { user_id: record.user_id },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.withdrawalRequest.findMany({
          where: { user_id: record.user_id },
          orderBy: { created_at: "desc" },
          take: 20,
        }),
      ]);

      return {
        record,
        profile: user?.profile || null,
        roles: (user?.roles || []).map((r) => r.role),
        authMeta: user
          ? {
              email: user.email,
              created_at: user.created_at,
              last_sign_in_at: null,
              email_confirmed_at: user.email_verified ? user.updated_at : null,
            }
          : null,
        application: app,
        books,
        earnings,
        withdrawals,
      };
    }),

  updateAdminUserProfile: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        display_name: z.string().optional(),
        bio: z.string().optional(),
        avatar_url: z.string().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: {
          display_name: input.display_name,
          bio: input.bio,
          avatar_url: input.avatar_url,
        },
      })
    ),

  updateAdminCreatorProfile: adminProcedure
    .input(
      z.object({
        type: z.enum(["author", "narrator", "publisher"]),
        id: z.string(),
        name: z.string().optional(),
        name_en: z.string().optional(),
        email: z.string().optional(),
        status: z.string().optional(),
        priority: z.number().optional(),
        is_featured: z.boolean().optional(),
        is_trending: z.boolean().optional(),
        bio: z.string().optional(),
        avatar_url: z.string().optional(),
        genre: z.string().optional(),
        specialty: z.string().optional(),
        rating: z.number().optional(),
        is_verified: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.type === "author") {
        return prisma.author.update({
          where: { id: input.id },
          data: {
            name: input.name,
            name_en: input.name_en,
            email: input.email,
            status: input.status,
            priority: input.priority,
            is_featured: input.is_featured,
            is_trending: input.is_trending,
            bio: input.bio,
            avatar_url: input.avatar_url,
            genre: input.genre,
          },
        });
      }
      if (input.type === "narrator") {
        return prisma.narrator.update({
          where: { id: input.id },
          data: {
            name: input.name,
            name_en: input.name_en,
            email: input.email,
            status: input.status,
            priority: input.priority,
            is_featured: input.is_featured,
            is_trending: input.is_trending,
            bio: input.bio,
            avatar_url: input.avatar_url,
            specialty: input.specialty,
            rating: input.rating,
          },
        });
      }
      return prisma.publisher.update({
        where: { id: input.id },
        data: {
          name: input.name,
          name_en: input.name_en,
          email: input.email,
          status: input.status,
          priority: input.priority,
          is_featured: input.is_featured,
          description: input.bio,
          logo_url: input.avatar_url,
          is_verified: input.is_verified,
        },
      });
    }),

  setUserTempPassword: adminProcedure
    .input(z.object({ userId: z.string(), tempPassword: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const password_hash = await bcrypt.hash(input.tempPassword, 12);
      return prisma.user.update({
        where: { id: input.userId },
        data: { password_hash },
        select: { id: true },
      });
    }),

  listCreatorPermissionUsers: adminProcedure.query(async () => {
    const roleUsers = await prisma.userRole.findMany({
      where: { role: { in: ["writer", "publisher", "narrator"] } },
      select: { user_id: true, role: true },
    });
    const userIds = [...new Set(roleUsers.map((r) => r.user_id))];
    if (!userIds.length) return [];
    const profiles = await prisma.profile.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, display_name: true },
    });
    const roleMap: Record<string, string[]> = {};
    roleUsers.forEach((r) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });
    return profiles.map((p) => ({
      ...p,
      roles: roleMap[p.user_id] || [],
    }));
  }),

  getUserPermissionOverrides: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) =>
      prisma.userPermissionOverride.findMany({
        where: { user_id: input.userId },
        select: { permission_key: true, is_allowed: true },
      })
    ),

  replaceUserPermissionOverrides: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        grantedBy: z.string().optional(),
        overrides: z.array(
          z.object({
            permission_key: z.string(),
            is_allowed: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      await prisma.$transaction([
        prisma.userPermissionOverride.deleteMany({ where: { user_id: input.userId } }),
        ...(input.overrides.length
          ? [
              prisma.userPermissionOverride.createMany({
                data: input.overrides.map((o) => ({
                  user_id: input.userId,
                  permission_key: o.permission_key,
                  is_allowed: o.is_allowed,
                  granted_by: input.grantedBy ?? null,
                })),
              }),
            ]
          : []),
      ]);
      return { success: true };
    }),

  getUserDetail: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) =>
      prisma.user.findUnique({
        where: { id: input.id },
        include: {
          profile: true,
          roles: true,
        },
      })
    ),

  getUserProfileModalData: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [user, wallet, subscription, orders, payments, coinTxns, earnings] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.userId },
          include: { profile: true, roles: true },
        }),
        prisma.userCoin.findUnique({
          where: { user_id: input.userId },
          select: { balance: true, total_earned: true, total_spent: true },
        }),
        prisma.userSubscription.findFirst({
          where: { user_id: input.userId, status: "active" },
          include: { plan: { select: { name: true, price: true } } },
          orderBy: { created_at: "desc" },
        }),
        prisma.order.findMany({
          where: { user_id: input.userId },
          select: {
            id: true,
            order_number: true,
            status: true,
            total_amount: true,
            payment_method: true,
            cod_payment_status: true,
            created_at: true,
            shipping_name: true,
            shipping_address: true,
            shipping_district: true,
            shipping_phone: true,
          },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.payment.findMany({
          where: { user_id: input.userId },
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            transaction_id: true,
            created_at: true,
            order_id: true,
          },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.coinTransaction.findMany({
          where: { user_id: input.userId },
          select: { id: true, amount: true, type: true, description: true, source: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.contributorEarning.findMany({
          where: { user_id: input.userId },
          select: { id: true, earned_amount: true, role: true, format: true, status: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
      ]);

      const profile = user?.profile
        ? {
            ...user.profile,
            email: user.email,
          }
        : null;

      return {
        profile,
        roles: (user?.roles || []).map((r) => r.role),
        wallet,
        subscription: subscription
          ? {
              ...subscription,
              subscription_plans: subscription.plan,
            }
          : null,
        orders,
        payments,
        coinTxns,
        earnings,
      };
    }),

  getCreatorLinksByUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [authors, publishers, narrators] = await Promise.all([
        prisma.author.findMany({
          where: { user_id: input.userId },
          select: { id: true, name: true, name_en: true, avatar_url: true, status: true },
          orderBy: { linked_at: "desc" },
        }),
        prisma.publisher.findMany({
          where: { user_id: input.userId },
          select: { id: true, name: true, name_en: true, logo_url: true, status: true },
          orderBy: { linked_at: "desc" },
        }),
        prisma.narrator.findMany({
          where: { user_id: input.userId },
          select: { id: true, name: true, name_en: true, avatar_url: true, status: true },
          orderBy: { linked_at: "desc" },
        }),
      ]);

      return {
        authors,
        publishers,
        narrators,
      };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.string(), role: z.string(), action: z.enum(["add", "remove"]) }))
    .mutation(async ({ input }) => {
      if (input.action === "add") {
        await prisma.userRole.upsert({
          where: { user_id_role: { user_id: input.userId, role: input.role as any } },
          create: { user_id: input.userId, role: input.role as any },
          update: {},
        });
      } else {
        await prisma.userRole.deleteMany({ where: { user_id: input.userId, role: input.role as any } });
      }
    }),

  // ── Blog Posts ────────────────────────────────────────────────────────────────
  listBlogPosts: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.blogPost.findMany({
        where: input?.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
      })
    ),

  createBlogPost: adminProcedure
    .input(z.object({ title: z.string().min(1), slug: z.string().min(1), content: z.string().default(""), excerpt: z.string().optional(), cover_image: z.string().optional(), category: z.string().optional(), tags: z.array(z.string()).default([]), status: z.string().default("draft"), author_name: z.string().optional(), is_featured: z.boolean().optional(), seo_title: z.string().optional(), seo_description: z.string().optional(), seo_keywords: z.string().optional(), publish_date: z.string().optional() }))
    .mutation(({ input }) => {
      const { publish_date, ...data } = input;
      return prisma.blogPost.create({ data: { ...data, ...(publish_date ? { publish_date: new Date(publish_date) } : {}) } as any });
    }),

  updateBlogPost: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().optional(), slug: z.string().optional(), content: z.string().optional(), excerpt: z.string().optional(), cover_image: z.string().optional(), category: z.string().optional(), tags: z.array(z.string()).optional(), status: z.string().optional(), author_name: z.string().optional(), is_featured: z.boolean().optional(), seo_title: z.string().optional(), seo_description: z.string().optional(), seo_keywords: z.string().optional(), publish_date: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, publish_date, ...data } = input;
      return prisma.blogPost.update({ where: { id }, data: { ...data, ...(publish_date ? { publish_date: new Date(publish_date) } : {}) } as any });
    }),

  deleteBlogPost: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.blogPost.delete({ where: { id: input.id } })),

  // ── Roles list ────────────────────────────────────────────────────────────────
  listRoles: adminProcedure.query(() =>
    prisma.userRole.groupBy({
      by: ["role"],
      _count: { role: true },
    })
  ),

  // ── Admin Activity Log ──────────────────────────────────────────────────────
  logAction: adminProcedure
    .input(
      z.object({
        action: z.string(),
        module: z.string().optional(),
        targetId: z.string().optional(),
        targetType: z.string().optional(),
        details: z.string().optional(),
        riskLevel: z.string().default("low"),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.adminActivityLog.create({
        data: {
          user_id: ctx.userId,
          action: input.action,
          module: input.module,
          target_id: input.targetId,
          target_type: input.targetType,
          details: input.details,
          risk_level: input.riskLevel,
          status: "success",
        },
      })
    ),

  // ── Categories (enhanced with is_trending) ─────────────────────────────────
  createCategoryFull: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => prisma.category.create({ data: input as any })),

  updateCategoryFull: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.category.update({ where: { id }, data });
    }),

  // ── Homepage Sections bulk update ──────────────────────────────────────────
  bulkUpdateHomepageSections: adminProcedure
    .input(z.array(z.object({ id: z.string(), title: z.string(), subtitle: z.string().nullable().optional(), is_enabled: z.boolean(), sort_order: z.number() })))
    .mutation(async ({ input }) => {
      await Promise.all(input.map(s =>
        prisma.homepageSection.update({ where: { id: s.id }, data: { title: s.title, subtitle: s.subtitle, is_enabled: s.is_enabled, sort_order: s.sort_order } })
      ));
      return { success: true };
    }),

  // ── Hero Banners CRUD ──────────────────────────────────────────────────────
  listHeroBanners: adminProcedure.query(() =>
    prisma.heroBanner.findMany({ orderBy: { sort_order: "asc" } })
  ),

  upsertHeroBanner: adminProcedure
    .input(z.object({ id: z.string().optional(), title: z.string().min(1), subtitle: z.string().nullable().optional(), cta_text: z.string().nullable().optional(), cta_link: z.string().nullable().optional(), image_url: z.string().nullable().optional(), is_active: z.boolean().default(true), sort_order: z.number().default(0) }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if (id) return prisma.heroBanner.update({ where: { id }, data });
      return prisma.heroBanner.create({ data: data as any });
    }),

  deleteHeroBanner: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.heroBanner.delete({ where: { id: input.id } })),

  // ── CMS Pages CRUD ──────────────────────────────────────────────────────────
  listCmsPages: adminProcedure.query(() =>
    prisma.cmsPage.findMany({ orderBy: { updated_at: "desc" } })
  ),

  createCmsPage: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        slug: z.string().min(1),
        content: z.string().default(""),
        featured_image: z.string().nullable().optional(),
        status: z.string().default("draft"),
        seo_title: z.string().nullable().optional(),
        seo_description: z.string().nullable().optional(),
        seo_keywords: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.cmsPage.create({
        data: {
          title: input.title,
          slug: input.slug,
          content: input.content,
          status: input.status,
          featured_image: input.featured_image ?? null,
          seo_title: input.seo_title ?? null,
          seo_description: input.seo_description ?? null,
          seo_keywords: input.seo_keywords ?? null,
        },
      })
    ),

  updateCmsPage: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        slug: z.string().min(1),
        content: z.string().default(""),
        featured_image: z.string().nullable().optional(),
        status: z.string().default("draft"),
        seo_title: z.string().nullable().optional(),
        seo_description: z.string().nullable().optional(),
        seo_keywords: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.cmsPage.update({
        where: { id },
        data: {
          title: data.title,
          slug: data.slug,
          content: data.content,
          status: data.status,
          featured_image: data.featured_image ?? null,
          seo_title: data.seo_title ?? null,
          seo_description: data.seo_description ?? null,
          seo_keywords: data.seo_keywords ?? null,
        },
      });
    }),

  // ── Coin Packages ───────────────────────────────────────────────────────────
  listCoinPackages: adminProcedure.query(() =>
    prisma.coinPackage.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "desc" }] })
  ),

  listCoinPurchases: adminProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().optional() }).optional())
    .query(({ input }) =>
      prisma.coinPurchase.findMany({
        where: input?.status ? { payment_status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 50,
      })
    ),

  updateCoinPackage: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        coins: z.number().int().nonnegative(),
        price: z.number().nonnegative(),
        bonus_coins: z.number().int().nonnegative().default(0),
        sort_order: z.number().int().default(0),
        is_featured: z.boolean().default(false),
        is_active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      if (input.id) {
        return prisma.coinPackage.update({
          where: { id: input.id },
          data: {
            name: input.name,
            coins: input.coins,
            price: input.price,
            bonus_coins: input.bonus_coins,
            sort_order: input.sort_order,
            is_featured: input.is_featured,
            ...(typeof input.is_active === "boolean" ? { is_active: input.is_active } : {}),
          },
        });
      }
      return prisma.coinPackage.create({
        data: {
          name: input.name,
          coins: input.coins,
          price: input.price,
          bonus_coins: input.bonus_coins,
          sort_order: input.sort_order,
          is_featured: input.is_featured,
          is_active: input.is_active ?? true,
        },
      });
    }),

  deleteCoinPackage: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.coinPackage.delete({ where: { id: input.id } })),

  // ── Coupons ─────────────────────────────────────────────────────────────────
  listCoupons: adminProcedure.query(() =>
    prisma.coupon.findMany({ orderBy: { created_at: "desc" } })
  ),

  createCoupon: adminProcedure
    .input(
      z.object({
        code: z.string().min(1),
        description: z.string().nullable().optional(),
        discount_type: z.string().default("percentage"),
        discount_value: z.number().nonnegative(),
        applies_to: z.string().default("all"),
        min_order_amount: z.number().nullable().optional(),
        usage_limit: z.number().int().nullable().optional(),
        per_user_limit: z.number().int().nullable().optional(),
        start_date: z.string().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        first_order_only: z.boolean().default(false),
      })
    )
    .mutation(({ input }) =>
      prisma.coupon.create({
        data: {
          code: input.code.toUpperCase(),
          description: input.description ?? null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          applies_to: input.applies_to,
          min_order_amount: input.min_order_amount ?? null,
          usage_limit: input.usage_limit ?? null,
          per_user_limit: input.per_user_limit ?? null,
          start_date: input.start_date ? new Date(input.start_date) : new Date(),
          end_date: input.end_date ? new Date(input.end_date) : null,
          status: input.status,
          first_order_only: input.first_order_only,
        },
      })
    ),

  updateCoupon: adminProcedure
    .input(
      z.object({
        id: z.string(),
        code: z.string().min(1),
        description: z.string().nullable().optional(),
        discount_type: z.string().default("percentage"),
        discount_value: z.number().nonnegative(),
        applies_to: z.string().default("all"),
        min_order_amount: z.number().nullable().optional(),
        usage_limit: z.number().int().nullable().optional(),
        per_user_limit: z.number().int().nullable().optional(),
        start_date: z.string().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        first_order_only: z.boolean().default(false),
      })
    )
    .mutation(({ input }) =>
      prisma.coupon.update({
        where: { id: input.id },
        data: {
          code: input.code.toUpperCase(),
          description: input.description ?? null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          applies_to: input.applies_to,
          min_order_amount: input.min_order_amount ?? null,
          usage_limit: input.usage_limit ?? null,
          per_user_limit: input.per_user_limit ?? null,
          start_date: input.start_date ? new Date(input.start_date) : new Date(),
          end_date: input.end_date ? new Date(input.end_date) : null,
          status: input.status,
          first_order_only: input.first_order_only,
        },
      })
    ),

  deleteCoupon: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.coupon.delete({ where: { id: input.id } })),

  // ── Subscription Plans ──────────────────────────────────────────────────────
  listSubscriptionPlans: adminProcedure.query(() =>
    prisma.subscriptionPlan.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "desc" }] })
  ),

  createPlan: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        price: z.number().nonnegative(),
        duration_days: z.number().int().positive().default(30),
        sort_order: z.number().int().default(0),
        is_featured: z.boolean().default(false),
        is_active: z.boolean().default(true),
        features: z.array(z.string()).default([]),
      })
    )
    .mutation(({ input }) =>
      prisma.subscriptionPlan.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          price: input.price,
          duration_days: input.duration_days,
          sort_order: input.sort_order,
          is_featured: input.is_featured,
          is_active: input.is_active,
          features: input.features,
        },
      })
    ),

  updatePlan: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        price: z.number().nonnegative(),
        duration_days: z.number().int().positive().default(30),
        sort_order: z.number().int().default(0),
        is_featured: z.boolean().default(false),
        is_active: z.boolean().default(true),
        features: z.array(z.string()).default([]),
      })
    )
    .mutation(({ input }) =>
      prisma.subscriptionPlan.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description ?? null,
          price: input.price,
          duration_days: input.duration_days,
          sort_order: input.sort_order,
          is_featured: input.is_featured,
          is_active: input.is_active,
          features: input.features,
        },
      })
    ),

  deletePlan: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.subscriptionPlan.delete({ where: { id: input.id } })),

  // ── Ad Banners ──────────────────────────────────────────────────────────────
  listAdBanners: adminProcedure.query(() =>
    prisma.adBanner.findMany({ orderBy: [{ display_order: "asc" }, { created_at: "desc" }] })
  ),

  updateAdBanner: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        title: z.string().nullable().optional(),
        image_url: z.string().nullable().optional(),
        destination_url: z.string().nullable().optional(),
        placement_key: z.string().min(1),
        start_date: z.string().nullable().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        display_order: z.number().int().default(0),
        device: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const data = {
        title: input.title ?? null,
        image_url: input.image_url ?? null,
        destination_url: input.destination_url ?? null,
        placement_key: input.placement_key,
        start_date: input.start_date ? new Date(input.start_date) : null,
        end_date: input.end_date ? new Date(input.end_date) : null,
        status: input.status,
        display_order: input.display_order,
        device: input.device ?? null,
      };
      if (input.id) return prisma.adBanner.update({ where: { id: input.id }, data });
      return prisma.adBanner.create({ data });
    }),

  deleteAdBanner: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.adBanner.delete({ where: { id: input.id } })),

  // ── Ad Campaigns ────────────────────────────────────────────────────────────
  listAdCampaigns: adminProcedure.query(() =>
    prisma.adCampaign.findMany({ orderBy: { created_at: "desc" } })
  ),

  updateAdCampaign: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        ad_type: z.string().default("banner"),
        placement_key: z.string().nullable().optional(),
        start_date: z.string().nullable().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        target_page: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const data = {
        name: input.name,
        ad_type: input.ad_type,
        placement_key: input.placement_key ?? null,
        start_date: input.start_date ? new Date(input.start_date) : null,
        end_date: input.end_date ? new Date(input.end_date) : null,
        status: input.status,
        target_page: input.target_page ?? null,
        notes: input.notes ?? null,
      };
      if (input.id) return prisma.adCampaign.update({ where: { id: input.id }, data });
      return prisma.adCampaign.create({ data });
    }),

  deleteAdCampaign: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.adCampaign.delete({ where: { id: input.id } })),

  // ── Ad Placements ───────────────────────────────────────────────────────────
  listAdPlacements: adminProcedure.query(() =>
    prisma.adPlacement.findMany({ orderBy: [{ display_priority: "asc" }, { placement_key: "asc" }] })
  ),

  updateAdPlacement: adminProcedure
    .input(
      z.object({
        id: z.string(),
        ad_type: z.string().optional(),
        frequency: z.string().nullable().optional(),
        device_visibility: z.string().nullable().optional(),
        display_priority: z.number().int().nullable().optional(),
        notes: z.string().nullable().optional(),
        is_enabled: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.adPlacement.update({ where: { id }, data });
    }),

  adReportSummary: adminProcedure.query(async () => {
    const [banners, rewardedLogs] = await Promise.all([
      prisma.adBanner.findMany({
        orderBy: { impressions: "desc" },
        take: 20,
      }),
      prisma.rewardedAdLog.findMany({
        select: { coins_rewarded: true },
      }),
    ]);

    const totalImpressions = banners.reduce((sum, banner) => sum + Number(banner.impressions || 0), 0);
    const totalClicks = banners.reduce((sum, banner) => sum + Number(banner.clicks || 0), 0);
    const rewardedCount = rewardedLogs.length;
    const totalCoinsGiven = rewardedLogs.reduce((sum, log) => sum + Number(log.coins_rewarded || 0), 0);

    return {
      banners,
      totalImpressions,
      totalClicks,
      rewardedCount,
      totalCoinsGiven,
    };
  }),

  analyticsReportData: adminProcedure.query(async () => {
    const [orders, orderItems, earnings, categories, authors, profiles] = await Promise.all([
      prisma.order.findMany({
        select: {
          id: true,
          user_id: true,
          total_amount: true,
          status: true,
          created_at: true,
          coupon_code: true,
          discount_amount: true,
          shipping_cost: true,
          payment_method: true,
          cod_payment_status: true,
        },
      }),
      prisma.orderItem.findMany({
        select: {
          order_id: true,
          format: true,
          price: true,
          quantity: true,
          book_id: true,
        },
      }),
      prisma.contributorEarning.findMany({
        select: {
          user_id: true,
          role: true,
          earned_amount: true,
          status: true,
          book_id: true,
          format: true,
        },
      }),
      prisma.category.findMany({ select: { id: true, name: true, name_bn: true } }),
      prisma.author.findMany({ select: { id: true, name: true } }),
      prisma.profile.findMany({ select: { user_id: true, display_name: true } }),
    ]);

    const bookIds = [...new Set(orderItems.map((item) => item.book_id).filter(Boolean) as string[])];
    const books = bookIds.length
      ? await prisma.book.findMany({
          where: { id: { in: bookIds } },
          select: { id: true, title: true, author_id: true, publisher_id: true, category_id: true },
        })
      : [];
    const bookMap = Object.fromEntries(books.map((book) => [book.id, book]));

    return {
      orders,
      orderItems: orderItems.map((item) => ({
        order_id: item.order_id,
        format: item.format,
        unit_price: item.price,
        quantity: item.quantity,
        book_id: item.book_id,
        books: item.book_id ? bookMap[item.book_id] ?? null : null,
      })),
      earnings,
      categories,
      authors,
      profiles,
    };
  }),

  userEngagementAnalytics: adminProcedure.query(async () => {
    const now = Date.now();
    const last30Date = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const last7Date = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fiveMinDate = new Date(now - 5 * 60 * 1000);

    const [consumption, onlineCount, totalUsers, reads] = await Promise.all([
      prisma.contentConsumptionTime.findMany({
        where: { created_at: { gte: last30Date } },
        select: { user_id: true, format: true, seconds: true, created_at: true },
      }),
      prisma.userPresence.count({ where: { last_seen: { gte: fiveMinDate } } }),
      prisma.profile.count(),
      prisma.bookRead.findMany({
        where: { created_at: { gte: last7Date } },
        select: { created_at: true },
      }),
    ]);

    const dauMap: Record<string, Set<string>> = {};
    const formatMap: Record<string, number> = {};
    for (const row of consumption) {
      const date = row.created_at.toISOString().slice(0, 10);
      if (!dauMap[date]) dauMap[date] = new Set();
      dauMap[date].add(row.user_id);
      formatMap[row.format] = (formatMap[row.format] || 0) + Number(row.seconds || 0);
    }

    const dauData = Object.entries(dauMap)
      .map(([date, users]) => ({ date, users: users.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const formatData = Object.entries(formatMap).map(([name, value]) => ({
      name,
      value: Math.round(value / 3600),
    }));

    const readsMap: Record<string, number> = {};
    for (const row of reads) {
      const date = row.created_at.toISOString().slice(0, 10);
      readsMap[date] = (readsMap[date] || 0) + 1;
    }
    const readsData = Object.entries(readsMap)
      .map(([date, count]) => ({ date: date.slice(5), reads: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { dauData, formatData, onlineCount, totalUsers, readsData };
  }),

  liveUsers: adminProcedure
    .input(z.object({ filter: z.enum(["online", "reading", "listening"]).optional() }).optional())
    .query(async ({ input }) => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activityFilter =
        input?.filter === "reading"
          ? "reading"
          : input?.filter === "listening"
            ? "listening"
            : undefined;

      const rows = await prisma.userPresence.findMany({
        where: {
          last_seen: { gte: fiveMinAgo },
          ...(activityFilter ? { activity_type: activityFilter } : {}),
        },
        orderBy: { last_seen: "desc" },
        select: {
          user_id: true,
          last_seen: true,
          activity_type: true,
          current_page: true,
          current_book_id: true,
        },
      });

      if (!rows.length) return [];

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const bookIds = [...new Set(rows.map((r) => r.current_book_id).filter(Boolean) as string[])];
      const [profiles, books] = await Promise.all([
        prisma.profile.findMany({
          where: { user_id: { in: userIds } },
          select: { user_id: true, display_name: true },
        }),
        bookIds.length
          ? prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } })
          : Promise.resolve([]),
      ]);
      const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.display_name || p.user_id.slice(0, 8)]));
      const bookMap = Object.fromEntries(books.map((b) => [b.id, b.title]));

      return rows.map((r) => ({
        ...r,
        display_name: profileMap[r.user_id] || r.user_id.slice(0, 8),
        book_title: r.current_book_id ? bookMap[r.current_book_id] || null : null,
      }));
    }),

  readingAnalyticsData: adminProcedure.query(async () => {
    const [logs, books, bookReads, presenceData, settings] = await Promise.all([
      prisma.userActivityLog.findMany({
        select: { action: true, book_id: true, user_id: true, created_at: true, metadata: true },
        orderBy: { created_at: "desc" },
        take: 5000,
      }),
      prisma.book.findMany({ select: { id: true, title: true, total_reads: true, cover_url: true } }),
      prisma.bookRead.findMany({ select: { book_id: true, user_id: true, created_at: true } }),
      prisma.userPresence.findMany(),
      prisma.platformSetting.findMany({
        where: { key: "rec_trending_period_days" },
        select: { key: true, value: true },
        take: 1,
      }),
    ]);

    return {
      logs: logs.map((row) => ({
        event_type: row.action,
        book_id: row.book_id,
        user_id: row.user_id,
        created_at: row.created_at,
        metadata: row.metadata,
      })),
      books,
      bookReads,
      presenceData,
      trendingPeriod: settings[0]?.value ?? "7",
    };
  }),

  // ── Withdrawal Requests ────────────────────────────────────────────────────
  listWithdrawals: adminProcedure.query(async () => {
    const withdrawals = await prisma.withdrawalRequest.findMany({ orderBy: { created_at: "desc" } });
    const userIds = [...new Set(withdrawals.map(w => w.user_id))];
    const profiles = await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } });
    const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || "Unknown"]));
    return withdrawals.map(w => ({
      ...w,
      display_name: profileMap[w.user_id] || "Unknown",
      account_info: w.mobile_number || w.bank_account || "—",
      admin_notes: w.notes,
    }));
  }),

  processWithdrawal: adminProcedure
    .input(z.object({ id: z.string(), status: z.string(), adminNotes: z.string().optional() }))
    .mutation(({ input }) =>
      prisma.withdrawalRequest.update({
        where: { id: input.id },
        data: { status: input.status, notes: input.adminNotes ?? null },
      })
    ),

  // ── Submissions ────────────────────────────────────────────────────────────
  listSubmissions: adminProcedure
    .input(z.object({ status: z.string() }))
    .query(async ({ input }) => {
      const books = await prisma.book.findMany({
        where: {
          OR: [
            { submission_status: input.status },
            { formats: { some: { submission_status: input.status } } },
          ],
        },
        orderBy: { created_at: "desc" },
        include: {
          category: { select: { name: true, name_bn: true } },
          formats: { select: { id: true, format: true, price: true, stock_count: true, duration: true, audio_quality: true, file_url: true } },
          contributors: { select: { user_id: true, role: true, format: true } },
        },
      });
      const userIds = [...new Set(books.map(b => b.submitted_by).filter(Boolean) as string[])];
      const profiles = userIds.length > 0
        ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } })
        : [];
      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || "Unknown"]));
      return books.map(b => ({
        ...b,
        _submitter: b.submitted_by ? (profileMap[b.submitted_by] || "Unknown") : "Admin",
        book_formats: b.formats,
        book_contributors: b.contributors,
        categories: b.category,
      }));
    }),

  updateSubmissionStatus: adminProcedure
    .input(z.object({ bookId: z.string(), status: z.enum(["approved", "rejected", "draft", "pending"]) }))
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const updatedBook = await tx.book.update({
          where: { id: input.bookId },
          data: {
            submission_status: input.status,
            ...(input.status === "pending" ? { submitted_by: ctx.userId } : {}),
          },
        });

        // Keep book + format review states aligned so a book does not appear
        // in both pending and approved tabs at the same time.
        await tx.bookFormat.updateMany({
          where: { book_id: input.bookId },
          data: { submission_status: input.status },
        });

        if (input.status === "approved") {
          const audiobookFormats = await tx.bookFormat.findMany({
            where: { book_id: input.bookId, format: "audiobook" },
            select: { id: true },
          });
          const audiobookFormatIds = audiobookFormats.map((f) => f.id);
          if (audiobookFormatIds.length > 0) {
            await tx.audiobookTrack.updateMany({
              where: {
                book_format_id: { in: audiobookFormatIds },
                status: { in: ["draft", "pending"] },
              },
              data: { status: "active" },
            });
          }
        }

        return updatedBook;
      });
    }),

  getAudiobookTracksForFormat: adminProcedure
    .input(z.object({ bookFormatId: z.string() }))
    .query(({ input }) =>
      prisma.audiobookTrack.findMany({ where: { book_format_id: input.bookFormatId }, orderBy: { track_number: "asc" } })
    ),

  listEditRequests: adminProcedure.query(async () => {
    const requests = await prisma.contentEditRequest.findMany({ where: { status: "pending" }, orderBy: { created_at: "desc" } });
    const userIds = [...new Set(requests.map(r => r.user_id))];
    const bookIds = [...new Set(requests.map(r => r.book_id))];
    const [profiles, books] = await Promise.all([
      userIds.length > 0 ? prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } }) : [],
      bookIds.length > 0 ? prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true, cover_url: true } }) : [],
    ]);
    const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || "Unknown"]));
    const bookMap = Object.fromEntries(books.map(b => [b.id, b]));
    return requests.map(r => ({
      ...r,
      proposed_changes: (() => { try { return JSON.parse(r.details || "{}"); } catch { return {}; } })(),
      _submitter: profileMap[r.user_id] || "Unknown",
      _book: bookMap[r.book_id] || null,
    }));
  }),

  approveEditRequest: adminProcedure
    .input(z.object({ requestId: z.string(), adminNotes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const req = await prisma.contentEditRequest.findUnique({ where: { id: input.requestId } });
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      const changes = (() => { try { return JSON.parse(req.details || "{}"); } catch { return {}; } })();
      await prisma.$transaction(async (tx) => {
        if (changes.book && req.book_id && req.request_type === "book") {
          const { submission_status: _ss, submitted_by: _sb, ...bookUpdates } = changes.book;
          if (Object.keys(bookUpdates).length > 0) await tx.book.update({ where: { id: req.book_id }, data: bookUpdates });
        }
        if (changes.format?.format_id) {
          const { format_id, ...formatUpdates } = changes.format;
          if (Object.keys(formatUpdates).length > 0) await tx.bookFormat.update({ where: { id: format_id }, data: formatUpdates });
        }
        await tx.contentEditRequest.update({
          where: { id: input.requestId },
          data: { status: "approved", reviewer_id: ctx.userId },
        });
      });
      return { success: true };
    }),

  rejectEditRequest: adminProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(({ ctx, input }) =>
      prisma.contentEditRequest.update({
        where: { id: input.requestId },
        data: { status: "rejected", reviewer_id: ctx.userId },
      })
    ),

  // ── System Health & Logs ────────────────────────────────────────────────────
  dbHealth: adminProcedure.query(async () => {
    const nowIso = new Date().toISOString();

    const [connectionsRaw, slowQueriesRaw, tableStatsRaw, indexUsageRaw, cacheRaw, sizeRaw, locksRaw] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT pid, state, wait_event,
               LEFT(query, 180) AS query_preview
        FROM pg_stat_activity
        WHERE datname = current_database()
        ORDER BY state = 'active' DESC, query_start DESC
        LIMIT 80
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT pid, state,
               EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000 AS duration_ms,
               LEFT(query, 180) AS query_preview
        FROM pg_stat_activity
        WHERE state = 'active'
          AND query_start IS NOT NULL
          AND query NOT ILIKE '%pg_stat_activity%'
          AND (clock_timestamp() - query_start) > interval '500 milliseconds'
        ORDER BY duration_ms DESC
        LIMIT 20
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT relname AS table_name,
               n_live_tup AS estimated_rows,
               pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
               pg_size_pretty(pg_indexes_size(relid)) AS index_size
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 30
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          indexrelname AS index_name,
          relname AS table_name,
          idx_scan,
          idx_tup_read,
          pg_size_pretty(pg_relation_size(indexrelid)) AS size
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC NULLS LAST
        LIMIT 50
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          SUM(blks_hit)::bigint AS blocks_hit,
          SUM(blks_read)::bigint AS blocks_read
        FROM pg_stat_database
        WHERE datname = current_database()
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT pg_database_size(current_database())::bigint AS size_bytes,
               pg_size_pretty(pg_database_size(current_database())) AS size_pretty
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT blocked.pid AS blocked_pid,
               blocking.pid AS blocking_pid,
               LEFT(blocked.query, 120) AS blocked_query
        FROM pg_locks blocked_locks
        JOIN pg_stat_activity blocked ON blocked.pid = blocked_locks.pid
        JOIN pg_locks blocking_locks
          ON blocking_locks.locktype = blocked_locks.locktype
          AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
          AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
          AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
          AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
          AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
          AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
          AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
          AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
          AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
          AND blocking_locks.pid <> blocked_locks.pid
        JOIN pg_stat_activity blocking ON blocking.pid = blocking_locks.pid
        WHERE NOT blocked_locks.granted
      `).catch(() => []),
    ]);

    const activeConnections = connectionsRaw.filter((c) => c.state === "active").length;
    const currentUsed = connectionsRaw.length;
    const maxConnections = 90;
    const saturation = Math.round((currentUsed / maxConnections) * 100);
    const cacheHit = Number(cacheRaw?.[0]?.blocks_hit ?? 0);
    const cacheRead = Number(cacheRaw?.[0]?.blocks_read ?? 0);
    const cacheRatio = cacheHit + cacheRead > 0 ? cacheHit / (cacheHit + cacheRead) : 1;
    const slowCount = slowQueriesRaw.length;

    let healthScore = 100;
    healthScore -= Math.min(35, Math.max(0, saturation - 45));
    healthScore -= Math.min(25, slowCount * 3);
    healthScore -= locksRaw.length > 0 ? 15 : 0;
    healthScore -= cacheRatio < 0.9 ? Math.round((0.9 - cacheRatio) * 100) : 0;
    healthScore = Math.max(0, Math.min(100, healthScore));
    const healthStatus = healthScore >= 80 ? "healthy" : healthScore >= 55 ? "degraded" : "critical";

    return {
      health: { score: healthScore, status: healthStatus },
      connections: { active: activeConnections, details: connectionsRaw },
      slow_queries: { count: slowCount, queries: slowQueriesRaw },
      pool: {
        max_connections: maxConnections,
        current_used: currentUsed,
        active: activeConnections,
        idle: connectionsRaw.filter((c) => c.state === "idle").length,
        idle_in_transaction: connectionsRaw.filter((c) => c.state === "idle in transaction").length,
        waiting: locksRaw.length,
        saturation_pct: saturation,
        avg_idle_seconds: null,
        longest_idle_seconds: null,
        by_state: Object.entries(
          connectionsRaw.reduce((acc, cur) => {
            const key = String(cur.state || "unknown");
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([state, count]) => ({ state, count })),
      },
      tables: tableStatsRaw,
      index_usage: indexUsageRaw,
      cache: {
        ratio: cacheRatio,
        blocks_hit: cacheHit,
        blocks_read: cacheRead,
      },
      db_size: sizeRaw?.[0] ?? null,
      locks: locksRaw,
      timestamp: nowIso,
    };
  }),

  systemLogs: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(30),
        level: z.string().optional(),
        module: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 30;
      const where: any = {};
      if (input?.level && input.level !== "all") where.level = input.level;
      if (input?.module) where.module = input.module;
      if (input?.search) {
        where.OR = [
          { message: { contains: input.search, mode: "insensitive" } },
          { module: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.systemLog.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.systemLog.count({ where }),
      ]);

      return {
        logs: rows.map((r) => ({
          ...r,
          occurrence_count: 1,
          first_seen_at: r.created_at,
          last_seen_at: r.updated_at ?? r.created_at,
        })),
        total,
      };
    }),

  cleanupSystemLogs: adminProcedure
    .input(z.object({ olderThanDays: z.number().int().min(1).max(365).default(90) }).optional())
    .mutation(async ({ input }) => {
      const olderThanDays = input?.olderThanDays ?? 90;
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      const result = await prisma.systemLog.deleteMany({
        where: { created_at: { lt: cutoff } },
      });
      return { deleted: result.count };
    }),

  // ── Approve / Reject Role Application (enhanced) ──────────────────────────
  approveApplication: adminProcedure
    .input(z.object({ applicationId: z.string(), userId: z.string(), role: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await prisma.roleApplication.findUnique({ where: { id: input.applicationId } });
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });

      await prisma.$transaction(async (tx) => {
        await tx.roleApplication.update({
          where: { id: input.applicationId },
          data: { status: "approved", reviewed_by: ctx.userId, verified: true, reviewed_at: new Date() },
        });
        await tx.userRole.upsert({
          where: { user_id_role: { user_id: input.userId, role: input.role as any } },
          create: { user_id: input.userId, role: input.role as any },
          update: {},
        });
      });

      const displayName = app.display_name || "Unknown";
      if (input.role === "writer") {
        const existing = await prisma.author.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.author.create({ data: { name: displayName, user_id: input.userId, status: "active" } });
      } else if (input.role === "publisher") {
        const existing = await prisma.publisher.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.publisher.create({ data: { name: displayName, user_id: input.userId } });
      } else if (input.role === "narrator") {
        const existing = await prisma.narrator.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.narrator.create({ data: { name: displayName, user_id: input.userId, status: "active" } });
      } else if (input.role === "rj") {
        const existing = await prisma.rjProfile.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.rjProfile.create({ data: { user_id: input.userId, stage_name: displayName, is_approved: true } });
        else await prisma.rjProfile.update({ where: { user_id: input.userId }, data: { is_approved: true } });
      }

      if (app.display_name) {
        await prisma.profile.update({ where: { user_id: input.userId }, data: { display_name: app.display_name } });
      }

      return { success: true };
    }),

  rejectApplication: adminProcedure
    .input(z.object({ applicationId: z.string() }))
    .mutation(({ ctx, input }) =>
      prisma.roleApplication.update({
        where: { id: input.applicationId },
        data: { status: "rejected", reviewed_by: ctx.userId, reviewed_at: new Date() },
      })
    ),

  // ── Revenue Splits ─────────────────────────────────────────────────────────
  listDefaultRevenueRules: adminProcedure.query(async () => {
    const rules = await prisma.defaultRevenueRule.findMany({ orderBy: { format: "asc" } });
    return rules.map((r) => ({
      id: r.id,
      format: r.format,
      writer_percentage: r.writer_pct,
      publisher_percentage: r.publisher_pct,
      narrator_percentage: r.narrator_pct,
      platform_percentage: r.platform_pct,
      fulfillment_cost_percentage: r.fulfillment_cost_pct,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }),

  updateDefaultRevenueRule: adminProcedure
    .input(z.object({ id: z.string(), writer_percentage: z.number(), publisher_percentage: z.number(), narrator_percentage: z.number(), platform_percentage: z.number(), fulfillment_cost_percentage: z.number() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.defaultRevenueRule.update({
        where: { id },
        data: {
          writer_pct: data.writer_percentage,
          publisher_pct: data.publisher_percentage,
          narrator_pct: data.narrator_percentage,
          platform_pct: data.platform_percentage,
          fulfillment_cost_pct: data.fulfillment_cost_percentage,
        },
      });
    }),

  listRevenueOverrides: adminProcedure.query(async () => {
    const splits = await prisma.formatRevenueSplit.findMany({ orderBy: { created_at: "desc" } });
    const bookIds = [...new Set(splits.map(s => s.book_id))];
    const books = bookIds.length > 0
      ? await prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } })
      : [];
    const bookMap = Object.fromEntries(books.map(b => [b.id, b]));
    return splits.map(s => ({
      id: s.id, book_id: s.book_id, format: s.format, created_at: s.created_at,
      writer_percentage: s.writer_pct,
      publisher_percentage: s.publisher_pct,
      narrator_percentage: s.narrator_pct,
      platform_percentage: s.platform_pct,
      fulfillment_cost_percentage: s.fulfillment_cost_pct,
      books: bookMap[s.book_id] || null,
    }));
  }),

  upsertRevenueOverride: adminProcedure
    .input(z.object({ book_id: z.string(), format: z.string(), writer_percentage: z.number(), publisher_percentage: z.number(), narrator_percentage: z.number(), platform_percentage: z.number(), fulfillment_cost_percentage: z.number() }))
    .mutation(async ({ input }) => {
      const data = {
        book_id: input.book_id, format: input.format,
        writer_pct: input.writer_percentage, publisher_pct: input.publisher_percentage,
        narrator_pct: input.narrator_percentage, platform_pct: input.platform_percentage,
        fulfillment_cost_pct: input.fulfillment_cost_percentage,
      };
      const existing = await prisma.formatRevenueSplit.findFirst({ where: { book_id: input.book_id, format: input.format } });
      if (existing) return prisma.formatRevenueSplit.update({ where: { id: existing.id }, data });
      return prisma.formatRevenueSplit.create({ data });
    }),

  deleteRevenueOverride: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.formatRevenueSplit.delete({ where: { id: input.id } })),

  listPayments: adminProcedure.query(async () => {
    const payments = await prisma.payment.findMany({
      orderBy: { created_at: "desc" },
      include: {
        order: {
          select: {
            id: true,
            order_number: true,
            shipping_name: true,
            shipping_phone: true,
            shipping_address: true,
            shipping_district: true,
            status: true,
            total_amount: true,
            payment_method: true,
            cod_payment_status: true,
            user_id: true,
          },
        },
      },
    });
    const missingNameUserIds = [
      ...new Set(payments.filter((p) => !p.order?.shipping_name && !!p.user_id).map((p) => p.user_id)),
    ];
    const profiles = missingNameUserIds.length
      ? await prisma.profile.findMany({
          where: { user_id: { in: missingNameUserIds } },
          select: { user_id: true, display_name: true, phone: true },
        })
      : [];
    const profileMap = Object.fromEntries(
      profiles.map((profile) => [profile.user_id, { display_name: profile.display_name ?? null, phone: profile.phone ?? null }])
    );
    return payments.map((payment) => ({
      ...payment,
      orders: payment.order ?? null,
      _customerName:
        payment.order?.shipping_name ||
        profileMap[payment.user_id]?.display_name ||
        payment.user_id?.slice(0, 8) ||
        "Unknown",
      _customerPhone: payment.order?.shipping_phone || profileMap[payment.user_id]?.phone || null,
    }));
  }),

  markPaymentFailed: adminProcedure
    .input(z.object({ paymentId: z.string() }))
    .mutation(({ input }) =>
      prisma.payment.update({
        where: { id: input.paymentId },
        data: { status: "failed" },
      })
    ),

  listPaymentGateways: adminProcedure.query(() =>
    prisma.paymentGateway.findMany({
      orderBy: [{ sort_priority: "asc" }, { created_at: "asc" }],
    })
  ),

  updatePaymentGateway: adminProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().min(1),
        is_enabled: z.boolean(),
        mode: z.string().nullable().optional(),
        sort_priority: z.number().int().default(0),
        config: z.record(z.any()).default({}),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.paymentGateway.update({
        where: { id: input.id },
        data: {
          label: input.label,
          is_enabled: input.is_enabled,
          mode: input.mode ?? null,
          sort_priority: input.sort_priority,
          config: input.config as any,
          notes: input.notes ?? null,
        },
      })
    ),

  revenueAuditOrder: adminProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const query = input.query.trim();
      const order =
        (await prisma.order.findUnique({ where: { id: query } })) ||
        (await prisma.order.findFirst({ where: { order_number: query } }));
      if (!order) return null;

      const [payment, ledgerEntries, orderItems, books] = await Promise.all([
        prisma.payment.findFirst({ where: { order_id: order.id }, orderBy: { created_at: "desc" } }),
        prisma.accountingLedger.findMany({ where: { order_id: order.id }, orderBy: { created_at: "desc" } }),
        prisma.orderItem.findMany({ where: { order_id: order.id } }),
        prisma.book.findMany({
          where: { id: { in: [...new Set((await prisma.orderItem.findMany({ where: { order_id: order.id }, select: { book_id: true } })).map((i) => i.book_id).filter(Boolean) as string[])] } },
          select: { id: true, title: true },
        }),
      ]);

      const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));
      const paidStatuses = new Set(["paid", "confirmed", "completed", "access_granted", "delivered"]);
      const revenueIncluded =
        order.payment_method === "cod"
          ? paidStatuses.has(order.status) && /settled|paid/i.test(order.cod_payment_status || "")
          : paidStatuses.has(order.status);

      const incomeEntries = ledgerEntries.filter((e) => e.type === "income" && e.category === "book_sale");
      let exclusionReason: string | null = null;
      if (!revenueIncluded) {
        exclusionReason = order.payment_method === "cod" ? "cod_not_settled_or_status_not_verified" : "status_not_verified";
      }

      const issues: string[] = [];
      if (incomeEntries.length === 0 && revenueIncluded) issues.push("Order is verified revenue but missing ledger income entry");
      if (incomeEntries.length > 1) issues.push(`Duplicate ledger income entries found: ${incomeEntries.length}`);
      if (!payment && order.payment_method !== "cod") issues.push("No payment record found for non-COD order");
      if (payment?.status === "paid" && !revenueIncluded) issues.push("Payment paid but order excluded from revenue");
      if (order.payment_method === "cod" && order.status === "delivered" && !/settled/i.test(order.cod_payment_status || "")) {
        issues.push("COD delivered but cod_payment_status not settled");
      }

      return {
        order,
        payment,
        ledgerEntries,
        orderItems: orderItems.map((item) => ({ ...item, books: item.book_id ? bookMap[item.book_id] || null : null })),
        revenueIncluded,
        exclusionReason,
        issues,
      };
    }),

  revenueAuditFixOrder: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const paidStatuses = new Set(["paid", "confirmed", "completed", "access_granted", "delivered"]);
      const verified =
        order.payment_method === "cod"
          ? paidStatuses.has(order.status) && /settled|paid/i.test(order.cod_payment_status || "")
          : paidStatuses.has(order.status);

      const existingIncome = await prisma.accountingLedger.findFirst({
        where: { order_id: order.id, type: "income", category: "book_sale", amount: { gt: 0 } },
      });
      const fixes: string[] = [];
      if (verified && !existingIncome) {
        await prisma.accountingLedger.create({
          data: {
            type: "income",
            category: "book_sale",
            amount: Number(order.total_amount || 0),
            entry_date: new Date(),
            order_id: order.id,
            reference_type: "order",
            reference_id: order.id,
            description: `Auto-fix: revenue ledger for order ${order.order_number || order.id.slice(0, 8)}`,
            source: "system",
            created_by: ctx.userId,
          },
        });
        fixes.push("created_missing_income_ledger");
      }
      return { fixes };
    }),

  revenueConsistencyCheck: adminProcedure.query(async () => {
    const [orders, ledger] = await Promise.all([
      prisma.order.findMany({
        select: { id: true, order_number: true, total_amount: true, status: true, payment_method: true, cod_payment_status: true, created_at: true },
      }),
      prisma.accountingLedger.findMany({
        where: { type: "income", category: "book_sale" },
      }),
    ]);
    const paidStatuses = new Set(["paid", "confirmed", "completed", "access_granted", "delivered"]);
    const verifiedOrders = orders.filter((o) =>
      o.payment_method === "cod"
        ? paidStatuses.has(o.status) && /settled|paid/i.test(o.cod_payment_status || "")
        : paidStatuses.has(o.status)
    );
    const orderRevenue = verifiedOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const positiveLedger = ledger.filter((e) => Number(e.amount) > 0);
    const ledgerIncome = positiveLedger.reduce((s, e) => s + Number(e.amount || 0), 0);
    const ledgerOrderIds = new Set(positiveLedger.map((e) => e.order_id).filter(Boolean));
    const missingFromLedger = verifiedOrders.filter((o) => !ledgerOrderIds.has(o.id));
    const seen = new Set<string>();
    const duplicateInLedger: any[] = [];
    positiveLedger.forEach((e) => {
      if (!e.order_id) return;
      if (seen.has(e.order_id)) duplicateInLedger.push(e);
      seen.add(e.order_id);
    });
    return {
      orderRevenue,
      ledgerIncome,
      mismatch: Math.abs(orderRevenue - ledgerIncome) > 0.01,
      missingFromLedger,
      duplicateInLedger,
    };
  }),

  weeklyReportData: adminProcedure.query(async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    start.setHours(0, 0, 0, 0);
    const startDay = start.toISOString().slice(0, 10);

    const [newUsersCount, weekOrders, weekLedger, topBooks, consumption, alerts] = await Promise.all([
      prisma.profile.count({ where: { created_at: { gte: start } } }),
      prisma.order.findMany({
        where: { created_at: { gte: start }, status: { in: ["paid", "confirmed", "completed", "access_granted", "delivered"] } },
        select: { total_amount: true },
      }),
      prisma.accountingLedger.findMany({ where: { entry_date: { gte: new Date(startDay) } }, select: { type: true, amount: true, category: true } }),
      prisma.book.findMany({ select: { title: true, total_reads: true }, orderBy: { total_reads: "desc" }, take: 5 }),
      prisma.contentConsumptionTime.findMany({ where: { created_at: { gte: start } }, select: { format: true, seconds: true } }),
      prisma.systemLog.findMany({ where: { created_at: { gte: start }, level: { in: ["warn", "error", "critical"] } }, select: { level: true, metadata: true } }),
    ]);

    const income = weekLedger.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount || 0), 0);
    const expense = weekLedger.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount || 0), 0);
    const ebookHours = consumption.filter((c) => c.format === "ebook").reduce((s, c) => s + Number(c.seconds || 0), 0) / 3600;
    const audioHours = consumption.filter((c) => c.format === "audiobook").reduce((s, c) => s + Number(c.seconds || 0), 0) / 3600;
    const normalizedAlerts = alerts.map((a) => {
      const meta = (a.metadata || {}) as Record<string, any>;
      const isResolved = Boolean(meta.is_resolved);
      return { severity: a.level === "critical" ? "critical" : a.level === "error" ? "warning" : "info", is_resolved: isResolved };
    });

    return {
      newUsers: newUsersCount,
      totalOrders: weekOrders.length,
      totalRevenue: weekOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      income,
      expense,
      netProfit: income - expense,
      topBooks: topBooks.map((b) => ({ title: b.title, reads: b.total_reads || 0 })),
      ebookHours: Number(ebookHours.toFixed(1)),
      audioHours: Number(audioHours.toFixed(1)),
      alertsTotal: normalizedAlerts.length,
      alertsCritical: normalizedAlerts.filter((a) => a.severity === "critical").length,
      alertsResolved: normalizedAlerts.filter((a) => a.is_resolved).length,
      alertsUnresolved: normalizedAlerts.filter((a) => !a.is_resolved).length,
      pool: { saturation_pct: null, active: null, idle: null },
    };
  }),

  financialReportData: adminProcedure.query(async () => {
    const [orders, orderItems, ledger, earnings, bookFormats, books] = await Promise.all([
      prisma.order.findMany({
        select: {
          id: true,
          total_amount: true,
          status: true,
          created_at: true,
          packaging_cost: true,
          fulfillment_cost: true,
          shipping_cost: true,
          payment_method: true,
          cod_payment_status: true,
          purchase_cost_per_unit: true,
          is_purchased: true,
          order_number: true,
        },
      }),
      prisma.orderItem.findMany({
        select: {
          id: true,
          order_id: true,
          book_id: true,
          format: true,
          price: true,
          quantity: true,
        },
      }),
      prisma.accountingLedger.findMany({
        orderBy: [{ entry_date: "desc" }, { created_at: "desc" }],
      }),
      prisma.contributorEarning.findMany({
        select: {
          book_id: true,
          format: true,
          role: true,
          earned_amount: true,
          sale_amount: true,
          status: true,
          created_at: true,
        },
      }),
      prisma.bookFormat.findMany({
        select: {
          book_id: true,
          format: true,
          original_price: true,
          discount: true,
          publisher_commission_percent: true,
          unit_cost: true,
        },
      }),
      prisma.book.findMany({ select: { id: true, title: true } }),
    ]);

    const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));
    return {
      orders,
      orderItems: orderItems.map((item) => ({
        ...item,
        unit_price: item.price,
        books: item.book_id ? bookMap[item.book_id] || null : null,
      })),
      ledger,
      earnings: earnings.map((e) => ({
        ...e,
        books: e.book_id ? bookMap[e.book_id] || null : null,
      })),
      bookFormats,
      books,
    };
  }),

  investorReportData: adminProcedure.query(async () => {
    const [orders, orderItems, ledger, earnings, profiles, withdrawals, bookFormats, books] = await Promise.all([
      prisma.order.findMany({
        select: {
          id: true,
          total_amount: true,
          status: true,
          created_at: true,
          packaging_cost: true,
          fulfillment_cost: true,
          shipping_cost: true,
          payment_method: true,
          cod_payment_status: true,
          user_id: true,
          purchase_cost_per_unit: true,
          is_purchased: true,
        },
      }),
      prisma.orderItem.findMany({
        select: { order_id: true, book_id: true, format: true, price: true, quantity: true },
      }),
      prisma.accountingLedger.findMany({ orderBy: [{ entry_date: "desc" }, { created_at: "desc" }] }),
      prisma.contributorEarning.findMany({
        select: { book_id: true, format: true, role: true, earned_amount: true, sale_amount: true, status: true, created_at: true },
      }),
      prisma.profile.findMany({ select: { id: true, created_at: true }, take: 1000 }),
      prisma.withdrawalRequest.findMany({
        select: { id: true, amount: true, status: true, created_at: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.bookFormat.findMany({ select: { book_id: true, format: true, unit_cost: true, original_price: true, publisher_commission_percent: true } }),
      prisma.book.findMany({ select: { id: true, title: true } }),
    ]);
    const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));
    return {
      orders,
      orderItems: orderItems.map((item) => ({
        ...item,
        unit_price: item.price,
        books: item.book_id ? bookMap[item.book_id] || null : null,
      })),
      ledger,
      earnings,
      profiles,
      withdrawals,
      bookFormats,
    };
  }),

  performanceData: adminProcedure.query(async () => {
    const oneDayAgo = new Date(Date.now() - 86400000);
    const [perfLogs, errorLogs, dbStats] = await Promise.all([
      prisma.systemLog.findMany({
        where: { module: { in: ["api", "trpc", "rest", "db"] } },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { module: true, metadata: true, created_at: true },
      }),
      prisma.systemLog.findMany({
        where: { level: { in: ["error", "critical"] }, created_at: { gte: oneDayAgo } },
        orderBy: { created_at: "asc" },
        select: { level: true, created_at: true, module: true },
      }),
      prisma.platformSetting.findMany({
        where: { key: { in: ["db_pool_saturation_pct", "db_pool_active", "db_pool_idle", "db_slow_queries_count", "db_health_score", "db_health_status"] } },
        select: { key: true, value: true },
      }),
    ]);
    const settingMap = Object.fromEntries(dbStats.map((s) => [s.key, s.value]));

    const edgeLogs = perfLogs.map((log, idx) => {
      const meta = (log.metadata || {}) as Record<string, any>;
      return {
        id: `perf-${idx}`,
        function_name: String(meta.function_name || log.module || "unknown"),
        response_time_ms: Number(meta.response_time_ms || meta.duration_ms || 0),
        status_code: Number(meta.status_code || 200),
        created_at: log.created_at,
      };
    });

    return {
      edgeLogs,
      errorLogs,
      dbHealth: {
        health: {
          score: Number(settingMap.db_health_score || 0),
          status: settingMap.db_health_status || "unknown",
        },
        connections: {
          active: Number(settingMap.db_pool_active || 0),
          idle: Number(settingMap.db_pool_idle || 0),
        },
        slow_queries: {
          count: Number(settingMap.db_slow_queries_count || 0),
        },
        pool: {
          saturation_pct: Number(settingMap.db_pool_saturation_pct || 0),
        },
      },
    };
  }),

  listEarnings: adminProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const earnings = await prisma.contributorEarning.findMany({ orderBy: { created_at: "desc" }, take: input?.limit ?? 50 });
      const bookIds = [...new Set(earnings.map(e => e.book_id).filter(Boolean) as string[])];
      const books = bookIds.length > 0
        ? await prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } })
        : [];
      const bookMap = Object.fromEntries(books.map(b => [b.id, b]));
      return earnings.map(e => ({ ...e, books: e.book_id ? bookMap[e.book_id] || null : null }));
    }),

  confirmEarnings: adminProcedure
    .input(z.object({ earningIds: z.array(z.string()).min(1) }))
    .mutation(async ({ input }) => {
      const result = await prisma.contributorEarning.updateMany({
        where: { id: { in: input.earningIds }, status: "pending" },
        data: { status: "confirmed" },
      });
      return { confirmed_count: result.count };
    }),

  // Backfill earnings for an existing confirmed order that was placed before
  // earnings calculation was implemented.
  calculateOrderEarnings: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        include: { items: { select: { id: true, book_id: true, format: true, price: true, quantity: true } } },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      let created = 0;
      for (const item of order.items) {
        const alreadyExists = await prisma.contributorEarning.findFirst({
          where: { order_item_id: item.id },
        });
        if (alreadyExists) continue;

        await calculateEarnings({
          bookId: item.book_id,
          format: item.format,
          saleAmount: Number(item.price) * item.quantity,
          orderId: order.id,
          orderItemId: item.id,
        });
        created++;
      }
      return { created };
    }),

  revenueDashboardData: adminProcedure.query(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const paidStatuses = ["paid", "completed", "access_granted", "delivered"];
    const [incomeRows, paidOrders, paidItems, books, profiles] = await Promise.all([
      prisma.accountingLedger.findMany({
        where: { type: "income", entry_date: { gte: thirtyDaysAgo } },
        select: { entry_date: true, amount: true },
        orderBy: { entry_date: "asc" },
      }),
      prisma.order.findMany({
        where: { status: { in: paidStatuses } },
        select: { user_id: true, total_amount: true },
      }),
      prisma.orderItem.findMany({
        where: { order: { status: { in: paidStatuses } } },
        select: { book_id: true, format: true, price: true, quantity: true },
      }),
      prisma.book.findMany({ select: { id: true, title: true } }),
      prisma.profile.findMany({ select: { user_id: true, display_name: true } }),
    ]);

    const dailyByDate: Record<string, number> = {};
    incomeRows.forEach((row) => {
      const key = row.entry_date.toISOString().slice(0, 10);
      dailyByDate[key] = (dailyByDate[key] || 0) + Number(row.amount || 0);
    });
    const dailyRevenue = Object.entries(dailyByDate).map(([date, amount]) => ({ date, amount: Math.round(amount) }));

    const formatByName: Record<string, number> = {};
    const revenueByBookId: Record<string, number> = {};
    paidItems.forEach((item) => {
      const total = Number(item.price || 0) * Number(item.quantity || 1);
      formatByName[item.format || "unknown"] = (formatByName[item.format || "unknown"] || 0) + total;
      if (item.book_id) revenueByBookId[item.book_id] = (revenueByBookId[item.book_id] || 0) + total;
    });
    const formatRevenue = Object.entries(formatByName).map(([name, value]) => ({ name, value: Math.round(value) }));
    const bookTitleById = Object.fromEntries(books.map((b) => [b.id, b.title]));
    const topBooks = Object.entries(revenueByBookId)
      .map(([bookId, revenue]) => ({ title: bookTitleById[bookId] || "Unknown", revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const profileNameByUserId = Object.fromEntries(profiles.map((p) => [p.user_id, p.display_name || "User"]));
    const spentByUserId: Record<string, number> = {};
    paidOrders.forEach((order) => {
      spentByUserId[order.user_id] = (spentByUserId[order.user_id] || 0) + Number(order.total_amount || 0);
    });
    const topUsers = Object.entries(spentByUserId)
      .map(([userId, spent]) => ({ name: profileNameByUserId[userId] || "User", spent: Math.round(spent) }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10);

    return { dailyRevenue, formatRevenue, topBooks, topUsers };
  }),

  revenueStats: adminProcedure.query(async () => {
    const [earnings, withdrawals] = await Promise.all([
      prisma.contributorEarning.findMany(),
      prisma.withdrawalRequest.findMany(),
    ]);
    const uniqueOrderSales = new Map<string, number>();
    earnings.forEach(e => {
      if (e.order_id && !uniqueOrderSales.has(e.order_id)) uniqueOrderSales.set(e.order_id, Number(e.sale_amount || 0));
    });
    return {
      totalSales: Array.from(uniqueOrderSales.values()).reduce((s, v) => s + v, 0),
      platformEarnings: earnings.filter(e => e.role === "platform").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      writerPayouts: earnings.filter(e => e.role === "writer").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      publisherPayouts: earnings.filter(e => e.role === "publisher").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      narratorPayouts: earnings.filter(e => e.role === "narrator").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      pendingWithdrawals: withdrawals.filter(w => w.status === "pending").reduce((s, w) => s + Number(w.amount || 0), 0),
    };
  }),

  // ── Shipping Methods ───────────────────────────────────────────────────────
  listShippingMethods: adminProcedure.query(() =>
    prisma.shippingMethod.findMany({ orderBy: { name: "asc" } })
  ),

  upsertShippingMethod: adminProcedure
    .input(z.object({ id: z.string().optional(), name: z.string().min(1), description: z.string().nullable().optional(), base_cost: z.number().default(0), per_kg_cost: z.number().default(0), zone: z.string().nullable().optional(), delivery_days: z.string().nullable().optional(), is_active: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if (id) return prisma.shippingMethod.update({ where: { id }, data });
      return prisma.shippingMethod.create({ data: data as any });
    }),

  updateShippingMethod: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        base_cost: z.number().optional(),
        per_kg_cost: z.number().optional(),
        zone: z.string().nullable().optional(),
        delivery_days: z.string().nullable().optional(),
        is_active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.shippingMethod.update({ where: { id }, data });
    }),

  deleteShippingMethod: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.shippingMethod.delete({ where: { id: input.id } })),

  toggleShippingMethod: adminProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(({ input }) => prisma.shippingMethod.update({ where: { id: input.id }, data: { is_active: input.isActive } })),

  // ── Free Shipping Campaigns ────────────────────────────────────────────────
  listFreeShipping: adminProcedure.query(() =>
    prisma.freeShippingCampaign.findMany({ orderBy: { created_at: "desc" } })
  ),

  upsertFreeShipping: adminProcedure
    .input(z.object({ id: z.string().optional(), name: z.string().min(1), min_order_value: z.number().default(0), start_date: z.string().optional(), end_date: z.string().nullable().optional(), is_active: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const { id, start_date, end_date, ...rest } = input;
      const data = { ...rest, start_date: start_date ? new Date(start_date) : new Date(), end_date: end_date ? new Date(end_date) : null };
      if (id) return prisma.freeShippingCampaign.update({ where: { id }, data });
      return prisma.freeShippingCampaign.create({ data: data as any });
    }),

  deleteFreeShipping: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.freeShippingCampaign.delete({ where: { id: input.id } })),

  toggleFreeShipping: adminProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(({ input }) => prisma.freeShippingCampaign.update({ where: { id: input.id }, data: { is_active: input.isActive } })),

  // ── Platform Settings ──────────────────────────────────────────────────────
  getPlatformSettings: adminProcedure
    .input(z.object({ keys: z.array(z.string()).optional() }).optional())
    .query(async ({ input }) => {
      const keys = input?.keys?.filter(Boolean);
      const settings = await prisma.platformSetting.findMany({
        where: keys && keys.length > 0 ? { key: { in: keys } } : undefined,
      });
      return Object.fromEntries(settings.map((s) => [s.key, s.value]));
    }),

  setPlatformSetting: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input }) =>
      prisma.platformSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      })
    ),

  bulkSetPlatformSettings: adminProcedure
    .input(
      z.union([
        z.array(z.object({ key: z.string(), value: z.string() })),
        z.object({ pairs: z.array(z.object({ key: z.string(), value: z.string() })) }),
      ])
    )
    .mutation(async ({ input }) => {
      const pairs = Array.isArray(input) ? input : input.pairs;
      await Promise.all(
        pairs.map((s) =>
          prisma.platformSetting.upsert({
            where: { key: s.key },
            create: { key: s.key, value: s.value },
            update: { value: s.value },
          })
        )
      );
      return { success: true };
    }),

  // ── Book Titles (for select dropdowns) ───────────────────────────────────
  listBookTitles: adminProcedure.query(() =>
    prisma.book.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } })
  ),

  // ── Book Contributors ──────────────────────────────────────────────────────
  listBookContributors: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ input }) => {
      const contributors = await prisma.bookContributor.findMany({ where: { book_id: input.bookId } });
      const userIds = contributors.map(c => c.user_id).filter(Boolean) as string[];
      const profiles = userIds.length > 0
        ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } })
        : [];
      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name]));
      return contributors.map(c => ({ ...c, display_name: profileMap[c.user_id || ""] || "Unknown" }));
    }),

  addBookContributor: adminProcedure
    .input(z.object({ bookId: z.string(), userId: z.string(), role: z.string(), format: z.string() }))
    .mutation(({ input }) =>
      prisma.bookContributor.create({
        data: { book_id: input.bookId, user_id: input.userId, role: input.role, format: input.format },
      })
    ),

  removeBookContributor: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.bookContributor.delete({ where: { id: input.id } })),

  // ── Book Revenue Split (per-book) ─────────────────────────────────────────
  getBookRevenueSplit: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ input }) => {
      const [defaults, overrides] = await Promise.all([
        prisma.defaultRevenueRule.findMany({ orderBy: { format: "asc" } }),
        prisma.formatRevenueSplit.findMany({ where: { book_id: input.bookId } }),
      ]);
      return {
        defaults: defaults.map((d) => ({
          id: d.id,
          format: d.format,
          writer_percentage: d.writer_pct,
          publisher_percentage: d.publisher_pct,
          narrator_percentage: d.narrator_pct,
          platform_percentage: d.platform_pct,
          fulfillment_cost_percentage: d.fulfillment_cost_pct,
          created_at: d.created_at,
          updated_at: d.updated_at,
        })),
        overrides: overrides.map(s => ({
          id: s.id, format: s.format,
          writer_percentage: s.writer_pct, publisher_percentage: s.publisher_pct,
          narrator_percentage: s.narrator_pct, platform_percentage: s.platform_pct,
          fulfillment_cost_percentage: s.fulfillment_cost_pct,
        })),
      };
    }),

  // ── RJ Management ─────────────────────────────────────────────────────────
  listRjProfiles: adminProcedure.query(() =>
    prisma.rjProfile.findMany({ orderBy: { created_at: "desc" } })
  ),

  listLiveSessions: adminProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(20) }).optional())
    .query(({ input }) =>
      prisma.liveSession.findMany({
        where: input?.status ? { status: input.status } : undefined,
        orderBy: { started_at: "desc" },
        take: input?.limit ?? 20,
      })
    ),

  updateRjProfile: adminProcedure
    .input(z.object({ id: z.string(), is_approved: z.boolean().optional(), is_active: z.boolean().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.rjProfile.update({ where: { id }, data });
    }),

  createRjProfileFromDisplayName: adminProcedure
    .input(z.object({ displayName: z.string().min(1), stageName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const profile = await prisma.profile.findFirst({
        where: { display_name: { contains: input.displayName, mode: "insensitive" } },
        select: { user_id: true },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      await prisma.userRole.upsert({
        where: { user_id_role: { user_id: profile.user_id, role: "rj" } },
        create: { user_id: profile.user_id, role: "rj" },
        update: {},
      });

      const existing = await prisma.rjProfile.findUnique({ where: { user_id: profile.user_id } });
      if (existing) {
        return prisma.rjProfile.update({
          where: { user_id: profile.user_id },
          data: { stage_name: input.stageName, is_approved: true },
        });
      }
      return prisma.rjProfile.create({
        data: { user_id: profile.user_id, stage_name: input.stageName, is_approved: true },
      });
    }),

  forceEndLiveSession: adminProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const session = await prisma.liveSession.update({
        where: { id: input.sessionId },
        data: { status: "ended", ended_at: new Date(), disconnect_reason: "admin_force_stop" },
      });
      const station = await prisma.radioStation.findFirst({ select: { id: true } });
      if (station) {
        await prisma.radioStation.update({
          where: { id: station.id },
          data: { is_active: false },
        });
      }
      return session;
    }),

  listRadioStations: adminProcedure.query(() =>
    prisma.radioStation.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] })
  ),

  upsertRadioStation: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        stream_url: z.string().min(1),
        artwork_url: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        is_active: z.boolean().default(true),
        sort_order: z.number().int().default(0),
      })
    )
    .mutation(({ input }) => {
      const data = {
        name: input.name,
        stream_url: input.stream_url,
        artwork_url: input.artwork_url ?? null,
        description: input.description ?? null,
        is_active: input.is_active,
        sort_order: input.sort_order,
      };
      if (input.id) return prisma.radioStation.update({ where: { id: input.id }, data });
      return prisma.radioStation.create({ data });
    }),

  setRadioStationActive: adminProcedure
    .input(z.object({ id: z.string(), is_active: z.boolean() }))
    .mutation(({ input }) =>
      prisma.radioStation.update({ where: { id: input.id }, data: { is_active: input.is_active } })
    ),

  gamificationData: adminProcedure.query(async () => {
    const [badges, streakUsers, earnedBadges, pointsAgg, activeGoals] = await Promise.all([
      prisma.badgeDefinition.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "desc" }] }),
      prisma.userStreak.count(),
      prisma.userBadge.count(),
      prisma.gamificationPoint.aggregate({ _sum: { points: true } }),
      prisma.userGoal.count({ where: { status: "active" } }),
    ]);
    return {
      badges,
      stats: {
        totalStreakUsers: streakUsers,
        totalBadgesEarned: earnedBadges,
        totalPoints: pointsAgg._sum.points ?? 0,
        activeGoals,
      },
    };
  }),

  upsertBadgeDefinition: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        key: z.string().min(1),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        category: z.string().default("general"),
        condition_type: z.string().default("manual"),
        condition_value: z.number().int().nullable().optional(),
        coin_reward: z.number().int().nullable().optional(),
        sort_order: z.number().int().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const data = {
        key: input.key,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        condition_type: input.condition_type,
        condition_value: input.condition_value ?? 0,
        coin_reward: input.coin_reward ?? 0,
        sort_order: input.sort_order ?? 0,
      };
      if (input.id) return prisma.badgeDefinition.update({ where: { id: input.id }, data });
      return prisma.badgeDefinition.create({ data });
    }),

  setBadgeDefinitionActive: adminProcedure
    .input(z.object({ id: z.string(), is_active: z.boolean() }))
    .mutation(({ input }) =>
      prisma.badgeDefinition.update({ where: { id: input.id }, data: { is_active: input.is_active } })
    ),

  smsRecipientsByGroup: adminProcedure
    .input(z.object({ group: z.enum(["authors", "narrators", "publishers", "users", "rj"]) }))
    .query(async ({ input }) => {
      if (input.group === "authors") {
        const rows = await prisma.author.findMany({ select: { name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.name, group: "authors" }));
      }
      if (input.group === "narrators") {
        const rows = await prisma.narrator.findMany({ select: { name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.name, group: "narrators" }));
      }
      if (input.group === "publishers") {
        const rows = await prisma.publisher.findMany({ select: { name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.name, group: "publishers" }));
      }
      if (input.group === "users") {
        const rows = await prisma.profile.findMany({ select: { display_name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.display_name || "Unknown", group: "users" }));
      }
      const rows = await prisma.rjProfile.findMany({ select: { stage_name: true, phone: true } });
      return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.stage_name, group: "rj" }));
    }),

  listSmsLogs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(({ input }) =>
      prisma.smsLog.findMany({ orderBy: { created_at: "desc" }, take: input?.limit ?? 100 })
    ),

  listSmsTemplates: adminProcedure.query(() =>
    prisma.smsTemplate.findMany({ orderBy: { created_at: "desc" } })
  ),

  createSmsTemplate: adminProcedure
    .input(z.object({ name: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const templateKey = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const existing = await prisma.smsTemplate.findUnique({ where: { template_key: templateKey } });
      if (existing) {
        return prisma.smsTemplate.update({
          where: { template_key: templateKey },
          data: { name: input.name.trim(), body: input.body.trim() },
        });
      }
      return prisma.smsTemplate.create({
        data: {
          name: input.name.trim(),
          body: input.body.trim(),
          template_key: templateKey,
          variables: [],
          is_active: true,
        },
      });
    }),

  sendSms: adminProcedure
    .input(z.object({ recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional(), group: z.string().optional() })), message: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (!input.recipients.length) return { sent: 0, failed: 0, skipped: 0 };
      const normalized = input.recipients.map((r) => ({ ...r, phone: r.phone.trim() })).filter((r) => r.phone.length > 0);
      const rows = normalized.map((r) => ({
        phone_number: r.phone,
        message: input.message,
        provider: "app",
        status: "sent",
      }));
      await prisma.smsLog.createMany({ data: rows });
      return { sent: rows.length, failed: 0, skipped: input.recipients.length - rows.length };
    }),

  liveMonitoringData: adminProcedure
    .input(z.object({ from: z.string(), format: z.string().optional() }))
    .query(async ({ input }) => {
      const from = new Date(input.from);
      const [payments, paymentEvents, coinTransactions, contentUnlocks, orders, orderItems, ledger, systemLogs] = await Promise.all([
        prisma.payment.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 500 }),
        prisma.paymentEvent.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 200 }),
        prisma.coinTransaction.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 500 }),
        prisma.contentUnlock.findMany({
          where: {
            created_at: { gte: from },
            ...(input.format && input.format !== "all" ? { format: input.format } : {}),
          },
          orderBy: { created_at: "desc" },
          take: 500,
        }),
        prisma.order.findMany({
          where: { created_at: { gte: from } },
          select: {
            id: true, status: true, total_amount: true, payment_method: true, cod_payment_status: true, created_at: true, shipping_cost: true,
          },
          orderBy: { created_at: "desc" },
          take: 1000,
        }),
        prisma.orderItem.findMany({
          select: { order_id: true, format: true, quantity: true, price: true },
          take: 1000,
        }),
        prisma.accountingLedger.findMany({
          where: { entry_date: { gte: from } },
          select: { id: true, order_id: true, type: true, category: true, amount: true, entry_date: true },
          take: 1000,
        }),
        prisma.systemLog.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 200 }),
      ]);
      return {
        payments,
        paymentEvents,
        coinTransactions,
        contentUnlocks,
        orders,
        orderItems: orderItems.map((item) => ({ ...item, unit_price: item.price })),
        ledger,
        systemLogs,
      };
    }),

  r2RolloutStatus: adminProcedure.query(async () => {
    const keys = [
      "r2_rollout_current_percent",
      "r2_rollout_auto_scale_enabled",
      "r2_rollout_min_percent",
      "r2_rollout_max_percent",
      "r2_rollout_scale_up_threshold",
      "r2_rollout_scale_down_threshold",
      "r2_rollout_step_size",
      "r2_rollout_last_adjusted_at",
      "r2_rollout_last_adjustment_reason",
      "r2_rollout_circuit_breaker_tripped",
      "r2_rollout_circuit_breaker_safe_percent",
    ];
    const settings = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    const now = new Date();
    const todayStart = new Date(now.toISOString().slice(0, 10));
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [events, r2Logs] = await Promise.all([
      prisma.paymentEvent.findMany({ where: { created_at: { gte: sevenDaysAgo } }, select: { created_at: true, status: true } }),
      prisma.systemLog.findMany({
        where: { created_at: { gte: sevenDaysAgo }, module: { in: ["r2", "media", "storage"] } },
        select: { created_at: true, level: true, metadata: true, message: true, module: true },
      }),
    ]);

    const dayMap: Record<string, any> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(sevenDaysAgo.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = {
        stat_date: key,
        r2_requests: 0,
        origin_requests: 0,
        r2_errors: 0,
        origin_errors: 0,
        r2_signed_url_failures: 0,
        playback_successes: 0,
        playback_failures: 0,
        rollout_percent: Number(map.r2_rollout_current_percent || 0),
        auto_adjusted: false,
        error_rate_r2: 0,
        error_rate_origin: 0,
        fallback_count: 0,
      };
    }

    r2Logs.forEach((log) => {
      const key = log.created_at.toISOString().slice(0, 10);
      if (!dayMap[key]) return;
      const meta = (log.metadata || {}) as Record<string, any>;
      const provider = String(meta.provider || "").toLowerCase();
      const isR2 = provider.includes("r2") || String(log.module).toLowerCase() === "r2";
      if (isR2) dayMap[key].r2_requests += 1;
      else dayMap[key].origin_requests += 1;
      if (["error", "critical"].includes(log.level)) {
        if (isR2) dayMap[key].r2_errors += 1;
        else dayMap[key].origin_errors += 1;
      }
      if (String(log.message || "").toLowerCase().includes("signed url")) dayMap[key].r2_signed_url_failures += 1;
      if (String(log.message || "").toLowerCase().includes("fallback")) dayMap[key].fallback_count += 1;
    });
    events.forEach((event) => {
      const key = event.created_at.toISOString().slice(0, 10);
      if (!dayMap[key]) return;
      if (event.status === "paid") dayMap[key].playback_successes += 1;
      else if (event.status === "failed") dayMap[key].playback_failures += 1;
    });
    Object.values(dayMap).forEach((d: any) => {
      d.error_rate_r2 = d.r2_requests > 0 ? (d.r2_errors / d.r2_requests) * 100 : 0;
      d.error_rate_origin = d.origin_requests > 0 ? (d.origin_errors / d.origin_requests) * 100 : 0;
    });

    const todayKey = todayStart.toISOString().slice(0, 10);
    const history = Object.values(dayMap).sort((a: any, b: any) => a.stat_date.localeCompare(b.stat_date));
    const today = history.find((d: any) => d.stat_date === todayKey) || null;

    return {
      config: {
        current_percent: Number(map.r2_rollout_current_percent || 0),
        auto_scale_enabled: map.r2_rollout_auto_scale_enabled === "true",
        min_percent: Number(map.r2_rollout_min_percent || 0),
        max_percent: Number(map.r2_rollout_max_percent || 100),
        scale_up_threshold: Number(map.r2_rollout_scale_up_threshold || 1),
        scale_down_threshold: Number(map.r2_rollout_scale_down_threshold || 3),
        step_size: Number(map.r2_rollout_step_size || 10),
        last_adjusted_at: map.r2_rollout_last_adjusted_at || null,
        last_adjustment_reason: map.r2_rollout_last_adjustment_reason || null,
      },
      today,
      history,
      circuit_breaker: {
        tripped: map.r2_rollout_circuit_breaker_tripped === "true",
        safe_percent: map.r2_rollout_circuit_breaker_safe_percent ? Number(map.r2_rollout_circuit_breaker_safe_percent) : null,
      },
    };
  }),

  updateR2RolloutConfig: adminProcedure
    .input(
      z.object({
        current_percent: z.number().int().min(0).max(100).optional(),
        auto_scale_enabled: z.boolean().optional(),
        min_percent: z.number().int().min(0).max(100).optional(),
        max_percent: z.number().int().min(0).max(100).optional(),
        scale_up_threshold: z.number().min(0).max(100).optional(),
        scale_down_threshold: z.number().min(0).max(100).optional(),
        step_size: z.number().int().min(1).max(100).optional(),
        reset_circuit_breaker: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const keyMap: Record<string, string> = {
        current_percent: "r2_rollout_current_percent",
        auto_scale_enabled: "r2_rollout_auto_scale_enabled",
        min_percent: "r2_rollout_min_percent",
        max_percent: "r2_rollout_max_percent",
        scale_up_threshold: "r2_rollout_scale_up_threshold",
        scale_down_threshold: "r2_rollout_scale_down_threshold",
        step_size: "r2_rollout_step_size",
      };
      const pairs = Object.entries(input)
        .filter(([k, v]) => k in keyMap && v !== undefined)
        .map(([k, v]) => ({ key: keyMap[k], value: String(v) }));
      if (input.reset_circuit_breaker) {
        pairs.push({ key: "r2_rollout_circuit_breaker_tripped", value: "false" });
      }
      await prisma.$transaction(
        pairs.map((pair) =>
          prisma.platformSetting.upsert({
            where: { key: pair.key },
            create: pair,
            update: { value: pair.value },
          })
        )
      );
      return { ok: true };
    }),

  autoAdjustR2Rollout: adminProcedure.mutation(async () => {
    const status = await prisma.platformSetting.findMany({
      where: {
        key: {
          in: [
            "r2_rollout_current_percent",
            "r2_rollout_auto_scale_enabled",
            "r2_rollout_min_percent",
            "r2_rollout_max_percent",
            "r2_rollout_scale_up_threshold",
            "r2_rollout_scale_down_threshold",
            "r2_rollout_step_size",
          ],
        },
      },
    });
    const map = Object.fromEntries(status.map((s) => [s.key, s.value]));
    const autoEnabled = map.r2_rollout_auto_scale_enabled !== "false";
    const oldPercent = Number(map.r2_rollout_current_percent || 0);
    if (!autoEnabled) return { adjusted: false, old_percent: oldPercent, new_percent: oldPercent, reason: "auto-scale disabled" };

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await prisma.systemLog.findMany({
      where: { created_at: { gte: start }, module: { in: ["r2", "media", "storage"] } },
      select: { level: true, module: true, metadata: true },
    });
    let r2Requests = 0;
    let r2Errors = 0;
    logs.forEach((log) => {
      const meta = (log.metadata || {}) as Record<string, any>;
      const provider = String(meta.provider || "").toLowerCase();
      const isR2 = provider.includes("r2") || String(log.module).toLowerCase() === "r2";
      if (!isR2) return;
      r2Requests += 1;
      if (["error", "critical"].includes(log.level)) r2Errors += 1;
    });
    const errorRate = r2Requests > 0 ? (r2Errors / r2Requests) * 100 : 0;
    const upThreshold = Number(map.r2_rollout_scale_up_threshold || 1);
    const downThreshold = Number(map.r2_rollout_scale_down_threshold || 3);
    const step = Number(map.r2_rollout_step_size || 10);
    const minPercent = Number(map.r2_rollout_min_percent || 0);
    const maxPercent = Number(map.r2_rollout_max_percent || 100);

    let newPercent = oldPercent;
    let reason = "within thresholds";
    if (errorRate > downThreshold) {
      newPercent = Math.max(minPercent, oldPercent - step);
      reason = `error rate ${errorRate.toFixed(2)}% > ${downThreshold}%`;
    } else if (errorRate < upThreshold) {
      newPercent = Math.min(maxPercent, oldPercent + step);
      reason = `error rate ${errorRate.toFixed(2)}% < ${upThreshold}%`;
    }
    const adjusted = newPercent !== oldPercent;
    if (adjusted) {
      await prisma.$transaction([
        prisma.platformSetting.upsert({
          where: { key: "r2_rollout_current_percent" },
          create: { key: "r2_rollout_current_percent", value: String(newPercent) },
          update: { value: String(newPercent) },
        }),
        prisma.platformSetting.upsert({
          where: { key: "r2_rollout_last_adjusted_at" },
          create: { key: "r2_rollout_last_adjusted_at", value: new Date().toISOString() },
          update: { value: new Date().toISOString() },
        }),
        prisma.platformSetting.upsert({
          where: { key: "r2_rollout_last_adjustment_reason" },
          create: { key: "r2_rollout_last_adjustment_reason", value: reason },
          update: { value: reason },
        }),
      ]);
    }
    return { adjusted, old_percent: oldPercent, new_percent: newPercent, reason };
  }),

  addRjRole: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ input }) =>
      prisma.userRole.upsert({
        where: { user_id_role: { user_id: input.userId, role: "rj" } },
        create: { user_id: input.userId, role: "rj" },
        update: {},
      })
    ),

  // ── Full Dashboard Stats ───────────────────────────────────────────────────
  fullDashboard: adminProcedure.query(async () => {
    const today = new Date().toISOString().split("T")[0];
    const todayStart = new Date(today);

    const [
      bookCount, formatCounts, authorCount, narratorCount,
      orders, profileCount, topBooks, recentOrders,
      pendingApps, recentReviews, bookReads,
      ledgerAll, todayLedger, recentLedger,
      coinTxns, earnings, hardcopyFormats,
      paidOrderUsers, orderItems, topRated,
    ] = await Promise.all([
      prisma.book.count(),
      prisma.bookFormat.groupBy({ by: ["format"], _count: { id: true } }),
      prisma.author.count(),
      prisma.narrator.count(),
      prisma.order.findMany({ select: { id: true, total_amount: true, status: true, created_at: true, shipping_cost: true, payment_method: true } }),
      prisma.profile.count(),
      prisma.book.findMany({ select: { title: true, total_reads: true }, orderBy: { total_reads: "desc" }, take: 5 }),
      prisma.order.findMany({ select: { id: true, total_amount: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 6 }),
      prisma.roleApplication.findMany({ where: { status: "pending" }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.review.findMany({ select: { id: true, rating: true, created_at: true, book: { select: { title: true } } }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.bookRead.count(),
      prisma.accountingLedger.findMany({ select: { type: true, amount: true, entry_date: true } }),
      prisma.accountingLedger.findMany({ where: { entry_date: { gte: todayStart } }, select: { type: true, amount: true } }),
      prisma.accountingLedger.findMany({ select: { description: true, amount: true, type: true, entry_date: true }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.coinTransaction.findMany({ select: { type: true, amount: true } }),
      prisma.contributorEarning.findMany({ select: { role: true, earned_amount: true, sale_amount: true, format: true, order_id: true } }),
      prisma.bookFormat.findMany({ where: { format: "hardcopy" }, select: { stock_count: true, book: { select: { title: true } } } }),
      prisma.order.findMany({ where: { status: { not: "cancelled" } }, select: { user_id: true } }),
      prisma.orderItem.findMany({ select: { book_id: true, format: true, price: true, quantity: true, order_id: true } }),
      prisma.book.findMany({ where: { rating: { not: null } }, select: { title: true, rating: true, reviews_count: true }, orderBy: { rating: "desc" }, take: 5 }),
    ]);

    const fmtMap = Object.fromEntries(formatCounts.map(f => [f.format, f._count.id]));
    const ledgerEntries = ledgerAll;

    const totalIncome = ledgerEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const totalExpense = ledgerEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const todayIncome = todayLedger.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const todayExpense = todayLedger.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);

    const totalCoinsEarned = coinTxns.filter(c => c.type === "earn" || c.type === "bonus").reduce((s, c) => s + Math.abs(c.amount), 0);
    const totalCoinsSpent = coinTxns.filter(c => c.type === "spend").reduce((s, c) => s + Math.abs(c.amount), 0);

    const statusMap: Record<string, number> = {};
    orders.forEach(o => { statusMap[o.status || "pending"] = (statusMap[o.status || "pending"] || 0) + 1; });

    const hcFormats = hardcopyFormats;
    const totalStock = hcFormats.reduce((s, f) => s + (f.stock_count || 0), 0);
    const outOfStockCount = hcFormats.filter(f => (f.stock_count || 0) <= 0).length;
    const lowStockCount = hcFormats.filter(f => { const sc = f.stock_count || 0; return sc > 0 && sc <= 5; }).length;
    const lowStockBooks = hcFormats
      .filter(f => (f.stock_count || 0) <= 5)
      .map(f => ({ title: f.book?.title || "Unknown", stock: f.stock_count || 0 }))
      .sort((a, b) => a.stock - b.stock).slice(0, 8);

    const paidUserIds = new Set(paidOrderUsers.map(o => o.user_id));
    const activeEarnings = earnings;
    const writerEarnings = activeEarnings.filter(e => e.role === "writer").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const narratorEarnings = activeEarnings.filter(e => e.role === "narrator").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const publisherEarnings = activeEarnings.filter(e => e.role === "publisher").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const uniqueOrderSales = new Map<string, number>();
    activeEarnings.forEach(e => { if (e.order_id && !uniqueOrderSales.has(e.order_id)) uniqueOrderSales.set(e.order_id, Number(e.sale_amount || 0)); });
    const totalSaleAmount = Array.from(uniqueOrderSales.values()).reduce((s, v) => s + v, 0);
    const platformEarnings = Math.max(0, totalSaleAmount - writerEarnings - narratorEarnings - publisherEarnings);

    const validOrders = orders.filter(o => o.status !== "cancelled");
    const monthMap: Record<string, { revenue: number; cost: number; profit: number }> = {};
    validOrders.forEach(o => {
      const key = new Date(o.created_at).toISOString().slice(0, 7);
      if (!monthMap[key]) monthMap[key] = { revenue: 0, cost: 0, profit: 0 };
      monthMap[key].revenue += Number(o.total_amount || 0);
    });
    ledgerEntries.forEach(e => {
      const key = e.entry_date ? new Date(e.entry_date).toISOString().slice(0, 7) : null;
      if (!key) return;
      if (!monthMap[key]) monthMap[key] = { revenue: 0, cost: 0, profit: 0 };
      if (e.type === "expense") monthMap[key].cost += Number(e.amount);
    });
    Object.values(monthMap).forEach(m => { m.profit = m.revenue - m.cost; });
    const revenueByMonth = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, d]) => ({ month, ...d }));

    const bookSales: Record<string, { title: string; sales: number; revenue: number }> = {};
    orderItems.forEach(item => {
      if (!item.book_id) return;
      if (!bookSales[item.book_id]) bookSales[item.book_id] = { title: "Unknown", sales: 0, revenue: 0 };
      bookSales[item.book_id].sales += item.quantity || 1;
      bookSales[item.book_id].revenue += Number(item.price || 0) * (item.quantity || 1);
    });
    const topSellingBooks = Object.values(bookSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      totalBooks: bookCount,
      totalEbooks: fmtMap["ebook"] || 0,
      totalAudiobooks: fmtMap["audiobook"] || 0,
      totalHardcopies: fmtMap["hardcopy"] || 0,
      totalAuthors: authorCount,
      totalNarrators: narratorCount,
      totalUsers: profileCount,
      totalOrders: orders.length,
      totalRevenue: validOrders.reduce((s, o) => s + (Number(o.total_amount || 0) - Number(o.shipping_cost || 0)), 0),
      totalIncome, totalExpense, netProfit: totalIncome - totalExpense,
      todayIncome, todayExpense, todayProfit: todayIncome - todayExpense,
      recentLedger: recentLedger.map(r => ({
        description: (r as any).description || "—", amount: Number(r.amount), type: r.type,
        date: r.entry_date ? new Date(r.entry_date).toLocaleDateString() : "—",
      })),
      totalCoinsEarned, totalCoinsSpent,
      ordersByStatus: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
      totalStock, lowStockCount, outOfStockCount, lowStockBooks,
      revenueByMonth,
      formatDistribution: [
        { name: "eBook", value: fmtMap["ebook"] || 0 },
        { name: "Audiobook", value: fmtMap["audiobook"] || 0 },
        { name: "Hard Copy", value: fmtMap["hardcopy"] || 0 },
      ].filter(f => f.value > 0),
      topBooks: topBooks.map(b => ({ title: b.title, reads: b.total_reads || 0 })),
      topSellingBooks,
      topRatedBooks: topRated.filter(b => b.rating != null && b.rating > 0).map(b => ({ title: b.title, rating: Number(b.rating), reviews: b.reviews_count || 0 })),
      writerEarnings, narratorEarnings, publisherEarnings, platformEarnings,
      totalViews: 0,
      totalReads: bookReads,
      totalPurchases: validOrders.length,
      paidUsers: paidUserIds.size,
      pendingApplications: pendingApps.map(a => ({
        id: a.id.slice(0, 8), fullId: a.id, userId: a.user_id, role: a.applied_role,
        user: a.display_name || a.user_id.slice(0, 8), date: new Date(a.created_at).toLocaleDateString(),
      })),
      pendingReviews: recentReviews.map(r => ({
        id: r.id.slice(0, 8), book: r.book?.title || "Unknown",
        rating: r.rating, date: new Date(r.created_at).toLocaleDateString(),
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id.slice(0, 8), total: Number(o.total_amount || 0),
        status: o.status || "pending", created: new Date(o.created_at).toLocaleDateString(),
      })),
      onlineNow: 0, readingNow: 0, listeningNow: 0,
      formatProfit: [], topEarningBooks: [],
      codPending: 0, codCollected: 0, codSettled: 0,
      realNetProfit: totalIncome - totalExpense,
    };
  }),

  // ── Content Access Logs ────────────────────────────────────────────────────
  listContentAccessLogs: adminProcedure
    .input(z.object({ limit: z.number().default(100) }).optional())
    .query(({ input }) =>
      prisma.contentAccessLog.findMany({ orderBy: { created_at: "desc" }, take: input?.limit ?? 100 })
    ),
});
