import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const profilesRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.profile.findUnique({ where: { user_id: ctx.userId } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    return profile;
  }),

  update: protectedProcedure
    .input(
      z.object({
        display_name: z.string().optional(),
        full_name: z.string().optional(),
        bio: z.string().optional(),
        avatar_url: z.string().url().optional().or(z.literal("")),
        preferred_language: z.string().optional(),
        genre: z.string().optional(),
        specialty: z.string().optional(),
        experience: z.string().optional(),
        phone: z.string().optional(),
        website_url: z.string().optional(),
        facebook_url: z.string().optional(),
        instagram_url: z.string().optional(),
        youtube_url: z.string().optional(),
        portfolio_url: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.profile.update({
        where: { user_id: ctx.userId },
        data: input,
      });
    }),

  readingProgress: protectedProcedure.query(({ ctx }) =>
    prisma.readingProgress.findMany({
      where: { user_id: ctx.userId },
      include: {
        book: {
          include: {
            author: { select: { id: true, name: true } },
            formats: { select: { id: true, format: true } },
          },
        },
      },
      orderBy: { last_read_at: "desc" },
    })
  ),

  readingProgressByBook: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(({ ctx, input }) =>
      prisma.readingProgress.findUnique({
        where: { user_id_book_id: { user_id: ctx.userId, book_id: input.bookId } },
      })
    ),

  listeningProgress: protectedProcedure.query(({ ctx }) =>
    prisma.listeningProgress.findMany({
      where: { user_id: ctx.userId },
      include: {
        book: {
          include: {
            author: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { last_listened_at: "desc" },
      take: 10,
    })
  ),

  listeningProgressByBook: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(({ ctx, input }) =>
      prisma.listeningProgress.findUnique({
        where: { user_id_book_id: { user_id: ctx.userId, book_id: input.bookId } },
      })
    ),

  updateReadingProgress: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        currentPage: z.number().int().min(0),
        totalPages: z.number().int().min(0),
        percentage: z.number().min(0).max(100).optional(),
        cfi: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Use caller-supplied percentage (accurate for EPUB) or calculate from page numbers (PDF)
      const percentage = input.percentage !== undefined
        ? Math.min(input.percentage, 100)
        : input.totalPages > 0
          ? Math.min((input.currentPage / input.totalPages) * 100, 100)
          : 0;

      return prisma.readingProgress.upsert({
        where: { user_id_book_id: { user_id: ctx.userId, book_id: input.bookId } },
        create: {
          user_id: ctx.userId,
          book_id: input.bookId,
          current_page: input.currentPage,
          total_pages: input.totalPages,
          percentage,
          last_read_at: new Date(),
          last_read_cfi: input.cfi ?? null,
        },
        update: {
          current_page: input.currentPage,
          total_pages: input.totalPages,
          percentage,
          last_read_at: new Date(),
          ...(input.cfi !== undefined ? { last_read_cfi: input.cfi } : {}),
        },
      });
    }),

  updateListeningProgress: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        currentPosition: z.number(),
        totalDuration: z.number(),
        currentTrack: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const percentage = input.totalDuration > 0
        ? Math.min((input.currentPosition / input.totalDuration) * 100, 100)
        : 0;

      return prisma.listeningProgress.upsert({
        where: { user_id_book_id: { user_id: ctx.userId, book_id: input.bookId } },
        create: {
          user_id: ctx.userId,
          book_id: input.bookId,
          current_position: input.currentPosition,
          total_duration: input.totalDuration,
          current_track: input.currentTrack,
          percentage,
          last_listened_at: new Date(),
        },
        update: {
          current_position: input.currentPosition,
          total_duration: input.totalDuration,
          current_track: input.currentTrack,
          percentage,
          last_listened_at: new Date(),
        },
      });
    }),

  submitRoleApplication: protectedProcedure
    .input(z.object({ role: z.string(), message: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.roleApplication.findFirst({
        where: { user_id: ctx.userId, applied_role: input.role as any, status: "pending" },
      });
      if (existing) return existing;
      return prisma.roleApplication.create({
        data: { user_id: ctx.userId, applied_role: input.role as any, status: "pending" } as any,
      });
    }),

  userRoles: protectedProcedure.query(({ ctx }) =>
    prisma.userRole.findMany({ where: { user_id: ctx.userId } })
  ),

  hasRole: protectedProcedure
    .input(z.object({ role: z.string() }))
    .query(async ({ ctx, input }) => {
      const r = await prisma.userRole.findFirst({
        where: { user_id: ctx.userId, role: input.role as any },
      });
      return { hasRole: !!r };
    }),

  permissionOverrides: protectedProcedure.query(({ ctx }) =>
    prisma.userPermissionOverride.findMany({
      where: { user_id: ctx.userId },
      select: { permission_key: true, is_allowed: true },
    })
  ),

  userOrders: protectedProcedure.query(({ ctx }) =>
    prisma.order.findMany({
      where: { user_id: ctx.userId },
      include: {
        items: {
          include: {
            book_format: {
              include: {
                book: { select: { id: true, title: true, slug: true, cover_url: true } },
              },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    })
  ),

  presence: protectedProcedure
    .input(
      z.object({
        activityType: z.string().default("browsing"),
        currentBookId: z.string().optional(),
        currentPage: z.string().optional(),
        sessionId: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.userPresence.upsert({
        where: { user_id: ctx.userId },
        create: {
          user_id: ctx.userId,
          activity_type: input.activityType,
          current_book_id: input.currentBookId,
          current_page: input.currentPage,
          session_id: input.sessionId,
          last_seen: new Date(),
        },
        update: {
          activity_type: input.activityType,
          current_book_id: input.currentBookId,
          current_page: input.currentPage,
          session_id: input.sessionId,
          last_seen: new Date(),
        },
      })
    ),

  applyForRole: protectedProcedure
    .input(z.object({
      role: z.enum(["writer", "publisher", "narrator", "rj"]),
      displayName: z.string().optional(),
      notes: z.string().optional(),
      portfolioUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.roleApplication.findFirst({
        where: { user_id: ctx.userId, applied_role: input.role, status: "pending" },
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "You already have a pending application for this role" });
      return prisma.roleApplication.create({
        data: {
          user_id: ctx.userId,
          applied_role: input.role,
          display_name: input.displayName || null,
          notes: input.notes || null,
          portfolio_url: input.portfolioUrl || null,
          status: "pending",
        },
      });
    }),

  createTicket: protectedProcedure
    .input(z.object({
      subject: z.string().min(1),
      description: z.string().min(1),
      category: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      prisma.supportTicket.create({
        data: {
          user_id: ctx.userId,
          subject: input.subject,
          description: input.description,
          category: input.category || "general",
          status: "open",
        },
      })
    ),

  creatorStats: protectedProcedure
    .input(z.object({ role: z.enum(["writer", "narrator", "publisher"]) }))
    .query(async ({ ctx, input }) => {
      const [contributors, submittedBooks, earnings, withdrawals] = await Promise.all([
        prisma.bookContributor.findMany({
          where: { user_id: ctx.userId, role: input.role },
          select: { book_id: true },
        }),
        // Also count books the creator submitted directly (e.g. via creator portal)
        prisma.book.findMany({
          where: { submitted_by: ctx.userId },
          select: { id: true },
        }),
        prisma.contributorEarning.findMany({ where: { user_id: ctx.userId, role: input.role } }),
        prisma.withdrawalRequest.findMany({ where: { user_id: ctx.userId } }),
      ]);

      // Merge both sources for total book count
      const allBookIds = new Set([
        ...contributors.map((c) => c.book_id),
        ...submittedBooks.map((b) => b.id),
      ]);
      const bookCount = allBookIds.size;

      const totalEarnings = earnings.reduce((s, e) => s + e.earned_amount, 0);
      const confirmed = earnings.filter(e => e.status === "confirmed").reduce((s, e) => s + e.earned_amount, 0);
      const withdrawn = withdrawals.filter(w => w.status === "paid").reduce((s, w) => s + w.amount, 0);
      const pendingPayout = withdrawals
        .filter(w => w.status === "pending" || w.status === "approved")
        .reduce((s, w) => s + w.amount, 0);

      return {
        bookCount,
        totalEarnings,
        availableBalance: Math.max(0, confirmed - withdrawn - pendingPayout),
        pendingPayout,
        withdrawn,
        // salesByFormat = number of individual sales (earning records per format)
        salesByFormat: {
          ebook: earnings.filter(e => e.format === "ebook").length,
          audiobook: earnings.filter(e => e.format === "audiobook").length,
          hardcopy: earnings.filter(e => e.format === "hardcopy").length,
        },
        revenueByFormat: {
          ebook: earnings.filter(e => e.format === "ebook").reduce((s, e) => s + e.earned_amount, 0),
          audiobook: earnings.filter(e => e.format === "audiobook").reduce((s, e) => s + e.earned_amount, 0),
          hardcopy: earnings.filter(e => e.format === "hardcopy").reduce((s, e) => s + e.earned_amount, 0),
        },
      };
    }),

  mySubmittedBooks: protectedProcedure.query(async ({ ctx }) => {
    // Include both directly submitted books AND books the user is credited on
    const [submittedBooks, contributorLinks] = await Promise.all([
      prisma.book.findMany({
        where: { submitted_by: ctx.userId },
        select: { id: true, title: true, cover_url: true, submission_status: true, created_at: true },
      }),
      prisma.bookContributor.findMany({
        where: { user_id: ctx.userId },
        select: { book_id: true },
      }),
    ]);

    const submittedIds = new Set(submittedBooks.map((b) => b.id));
    const extraIds = [...new Set(contributorLinks.map((c) => c.book_id))].filter(
      (id) => !submittedIds.has(id)
    );

    const extraBooks = extraIds.length > 0
      ? await prisma.book.findMany({
          where: { id: { in: extraIds } },
          select: { id: true, title: true, cover_url: true, submission_status: true, created_at: true },
        })
      : [];

    return [...submittedBooks, ...extraBooks].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }),

  myEarnings: protectedProcedure
    .input(z.object({ role: z.enum(["writer", "narrator", "publisher"]) }))
    .query(async ({ ctx, input }) => {
      const earnings = await prisma.contributorEarning.findMany({
        where: { user_id: ctx.userId, role: input.role },
        orderBy: { created_at: "desc" },
      });
      const bookIds = [...new Set(earnings.map(e => e.book_id))];
      const books = await prisma.book.findMany({
        where: { id: { in: bookIds } },
        select: { id: true, title: true },
      });
      const bookMap = Object.fromEntries(books.map(b => [b.id, b.title]));
      return earnings.map(e => ({ ...e, book_title: bookMap[e.book_id] || null }));
    }),

  myWithdrawals: protectedProcedure.query(({ ctx }) =>
    prisma.withdrawalRequest.findMany({
      where: { user_id: ctx.userId },
      orderBy: { created_at: "desc" },
    })
  ),

  requestWithdrawal: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      method: z.enum(["bkash", "nagad", "bank"]),
      accountInfo: z.string().min(1),
      role: z.enum(["writer", "narrator", "publisher"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify available balance before creating request
      const [earnings, existingWithdrawals] = await Promise.all([
        prisma.contributorEarning.findMany({
          where: { user_id: ctx.userId, role: input.role, status: "confirmed" },
          select: { earned_amount: true },
        }),
        prisma.withdrawalRequest.findMany({
          where: { user_id: ctx.userId, status: { in: ["pending", "approved"] } },
          select: { amount: true },
        }),
      ]);

      const confirmedTotal = earnings.reduce((s, e) => s + e.earned_amount, 0);
      const pendingWithdrawn = existingWithdrawals.reduce((s, w) => s + w.amount, 0);
      const available = confirmedTotal - pendingWithdrawn;

      if (input.amount > available) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient balance. Available: ৳${available.toFixed(2)}, Requested: ৳${input.amount.toFixed(2)}`,
        });
      }

      const mobileMethod = input.method === "bkash" || input.method === "nagad";
      return prisma.withdrawalRequest.create({
        data: {
          user_id: ctx.userId,
          amount: input.amount,
          method: input.method,
          mobile_number: mobileMethod ? input.accountInfo : null,
          bank_account: !mobileMethod ? input.accountInfo : null,
          status: "pending",
        },
      });
    }),

  platformSetting: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const setting = await prisma.platformSetting.findUnique({ where: { key: input.key } });
      return setting?.value ?? null;
    }),

  referralInfo: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.profile.findUnique({
      where: { user_id: ctx.userId },
      select: { referral_code: true },
    });
    const referrals = await prisma.referral.findMany({
      where: { referrer_id: ctx.userId },
      orderBy: { created_at: "desc" },
    });
    const totalEarned = referrals
      .filter(r => r.reward_status === "paid")
      .reduce((sum, r) => sum + r.reward_amount, 0);
    return {
      referral_code: profile?.referral_code || null,
      total_referrals: referrals.length,
      total_earned: totalEarned,
      pending_referrals: referrals.filter(r => r.status === "pending").length,
      referrals: referrals.map(r => ({
        id: r.id,
        referred_user_id: r.referred_user_id,
        status: r.status,
        reward_amount: r.reward_amount,
        reward_status: r.reward_status,
        created_at: r.created_at.toISOString(),
      })),
    };
  }),

  revenuePreview: publicProcedure
    .input(z.object({ bookId: z.string(), format: z.enum(["ebook", "audiobook", "hardcopy"]) }))
    .query(async ({ input }) => {
      const [override, defaultRule, bookFormat] = await Promise.all([
        prisma.formatRevenueSplit.findFirst({
          where: { book_id: input.bookId, format: input.format },
        }),
        prisma.defaultRevenueRule.findFirst({
          where: { format: input.format },
        }),
        prisma.bookFormat.findFirst({
          where: { book_id: input.bookId, format: input.format as any },
          select: { original_price: true, discount: true },
        }),
      ]);

      const rule = override
        ? {
            writer_percentage: override.writer_pct,
            publisher_percentage: override.publisher_pct,
            narrator_percentage: override.narrator_pct,
            platform_percentage: override.platform_pct,
            fulfillment_cost_percentage: override.fulfillment_cost_pct,
          }
        : defaultRule
        ? {
            writer_percentage: defaultRule.writer_percentage,
            publisher_percentage: defaultRule.publisher_percentage,
            narrator_percentage: defaultRule.narrator_percentage,
            platform_percentage: defaultRule.platform_percentage,
            fulfillment_cost_percentage: defaultRule.fulfillment_cost_percentage,
          }
        : null;

      return {
        rule,
        original_price: bookFormat?.original_price ?? null,
        discount: bookFormat?.discount ?? null,
      };
    }),
});
