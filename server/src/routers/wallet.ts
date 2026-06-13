import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { calculateEarnings } from "../lib/earnings.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

export const walletRouter = router({
  coinPackages: publicProcedure.query(() =>
    prisma.coinPackage.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  initiateCoinPurchase: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await prisma.coinPackage.findUnique({ where: { id: input.packageId } });
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      // Payment gateway integration placeholder — returns a pending purchase record
      // The actual gateway_url will be generated once SSLCommerz/bKash is integrated
      const purchase = await prisma.coinPurchase.create({
        data: {
          user_id: ctx.userId,
          package: { connect: { id: pkg.id } },
          coins_amount: pkg.coins + pkg.bonus_coins,
          amount_paid: pkg.price,
          price: pkg.price,
          status: "pending",
          gateway: "pending",
        } as any,
      });
      return { success: true, purchase_id: purchase.id, gateway_url: null };
    }),

  balance: protectedProcedure.query(async ({ ctx }) => {
    const [wallet, transactions] = await Promise.all([
      prisma.userCoin.findUnique({ where: { user_id: ctx.userId } }),
      prisma.coinTransaction.findMany({
        where: { user_id: ctx.userId },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
    ]);
    return { wallet, transactions };
  }),

  adjustCoins: protectedProcedure
    .input(
      z.object({
        amount: z.number().int(),
        type: z.enum(["earn", "spend", "bonus", "refund"]),
        description: z.string().optional(),
        referenceId: z.string().optional(),
        source: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { amount, type, description, referenceId, source } = input;

      return prisma.$transaction(async (tx: any) => {
        await tx.coinTransaction.create({
          data: {
            user_id: ctx.userId,
            amount,
            type,
            description: description ?? null,
            reference_id: referenceId ?? null,
            source: source ?? null,
          },
        });

        const upserted = await tx.userCoin.upsert({
          where: { user_id: ctx.userId },
          create: {
            user_id: ctx.userId,
            balance: Math.max(0, amount),
            total_earned: amount > 0 ? amount : 0,
            total_spent: amount < 0 ? Math.abs(amount) : 0,
          },
          update: {
            balance: { increment: amount },
            ...(amount > 0 ? { total_earned: { increment: amount } } : {}),
            ...(amount < 0 ? { total_spent: { increment: Math.abs(amount) } } : {}),
          },
        });

        if (upserted.balance < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient coins" });
        }
        return upserted;
      });
    }),

  unlockContent: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        format: z.string(),
        coinCost: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, format } = input;

      const existing = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: bookId, format },
      });
      if (existing?.status === "active") return { already_unlocked: true };

      // For audiobook chapters, always fetch the real price from the DB — never trust the client value.
      let coinCost = input.coinCost;
      const chapterTrackId = format.match(/^audiobook_chapter_(.+)$/)?.[1];
      if (chapterTrackId) {
        const track = await prisma.audiobookTrack.findUnique({
          where: { id: chapterTrackId },
          select: { is_preview: true, chapter_price: true, book_format: { select: { book_id: true, price: true } } },
        });
        if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Chapter not found" });
        if (track.book_format.book_id !== bookId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Chapter does not belong to this book" });
        }
        const isFormatFree = Number(track.book_format.price ?? 0) <= 0;
        const book = await prisma.book.findUnique({ where: { id: bookId }, select: { is_free: true } });
        if (Boolean(book?.is_free) || isFormatFree || track.is_preview) {
          coinCost = 0; // book is free or chapter is a preview — always free
        } else {
          coinCost = track.chapter_price ?? 100; // use DB price, ignore client value
        }
      }

      if (format === "premium_voice") {
        const book = await prisma.book.findUnique({
          where: { id: bookId },
          select: { premium_voice_enabled: true, voice_access_type: true, voice_coin_price: true },
        });
        if (!book || !book.premium_voice_enabled) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Premium Voice not enabled for this book" });
        }
        if (book.voice_access_type === "subscription") {
          throw new TRPCError({ code: "FORBIDDEN", message: "This book requires an active subscription" });
        }
        if (book.voice_access_type !== "free" && (book.voice_coin_price === null || book.voice_coin_price <= 0)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Coin price not configured for this book — contact admin" });
        }
        coinCost = book.voice_access_type === "free" ? 0 : (book.voice_coin_price ?? 0);
      }

      // Free unlocks skip wallet check entirely
      if (coinCost > 0) {
        const wallet = await prisma.userCoin.findUnique({ where: { user_id: ctx.userId } });
        if (!wallet || wallet.balance < coinCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient coins" });
        }
      }

      // premium_voice is not a BookFormatType enum value — it has no book_formats row.
      // Only query for standard format types to avoid a Prisma enum validation error.
      const BOOK_FORMAT_TYPES = new Set(["ebook", "audiobook", "hardcopy"]);
      const bookFormat = BOOK_FORMAT_TYPES.has(format)
        ? await prisma.bookFormat.findFirst({
            where: { book_id: bookId, format: format as any },
            select: { id: true, price: true, coin_price: true },
          })
        : null;

      const unlock = await prisma.$transaction(async (tx: any) => {
        const created = await tx.contentUnlock.upsert({
          where: {
            user_id_book_id_format: { user_id: ctx.userId, book_id: bookId, format },
          },
          create: {
            user_id: ctx.userId,
            book_id: bookId,
            format,
            coins_spent: coinCost,
            unlock_method: coinCost === 0 ? "free" : "coin",
            status: "active",
          },
          update: { status: "active", coins_spent: coinCost },
        });
        if (coinCost > 0) {
          await tx.coinTransaction.create({
            data: {
              user_id: ctx.userId,
              amount: -coinCost,
              type: "spend",
              description: `Content unlock - ${format}`,
              reference_id: bookId,
              source: "content_unlock",
            },
          });
          await tx.userCoin.update({
            where: { user_id: ctx.userId },
            data: {
              balance: { decrement: coinCost },
              total_spent: { increment: coinCost },
            },
          });
        }
        return created;
      });

      // Calculate contributor earnings using the format's monetary price
      const saleAmount = Number(bookFormat?.price ?? 0);
      if (saleAmount > 0) {
        await calculateEarnings({
          bookId,
          format,
          saleAmount,
          contentUnlockId: unlock.id,
        });
      }

      return { success: true };
    }),

  checkUnlock: protectedProcedure
    .input(z.object({ bookId: z.string(), format: z.string() }))
    .query(async ({ ctx, input }) => {
      const unlock = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: input.bookId, format: input.format, status: "active" },
      });
      if (unlock) return { unlocked: true };

      // For premium_voice, an active subscription also grants access
      if (input.format === "premium_voice") {
        const subscription = await prisma.userSubscription.findFirst({
          where: {
            user_id: ctx.userId,
            status: "active",
            OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
          },
        });
        if (subscription) return { unlocked: true };
      }

      return { unlocked: false };
    }),

  userUnlocks: protectedProcedure.query(({ ctx }) =>
    prisma.contentUnlock.findMany({
      where: { user_id: ctx.userId, status: "active" },
    })
  ),

  checkAccess: protectedProcedure
    .input(z.object({ bookId: z.string(), format: z.enum(["ebook", "audiobook"]) }))
    .query(async ({ ctx, input }) => {
      const { bookId, format } = input;

      // Free content: book flagged as free, or the format has no price
      const [book, bookFormat] = await Promise.all([
        prisma.book.findUnique({ where: { id: bookId }, select: { is_free: true } }),
        prisma.bookFormat.findFirst({
          where: { book_id: bookId, format, submission_status: "approved" },
          select: { price: true },
        }),
      ]);
      if (Boolean(book?.is_free) || Number(bookFormat?.price ?? 0) <= 0) {
        return { hasFullAccess: true, method: "free" };
      }

      const coinUnlock = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: bookId, format, status: "active" },
      });
      if (coinUnlock) return { hasFullAccess: true, method: "coin" };

      const subscription = await prisma.userSubscription.findFirst({
        where: {
          user_id: ctx.userId,
          status: "active",
          OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
        },
      });
      if (subscription) return { hasFullAccess: true, method: "subscription" };

      const purchase = await prisma.userPurchase.findFirst({
        where: { user_id: ctx.userId, book_id: bookId, format, status: "active" },
      });
      if (purchase) return { hasFullAccess: true, method: "purchase" };

      return { hasFullAccess: false, method: "none" };
    }),

  coinSettings: protectedProcedure.query(async () => {
    const settings = await prisma.platformSetting.findMany({
      where: { key: { in: ["coin_system_enabled", "coin_unlock_enabled", "coin_conversion_ratio", "ads_per_quick_unlock", "bonus_coin_per_ad_session", "coin_ad_reward", "coin_daily_limit", "ad_cooldown_minutes"] } },
    });
    const map: Record<string, string> = {};
    settings.forEach(s => { map[s.key] = s.value as string; });
    return {
      systemEnabled: map.coin_system_enabled !== "false",
      unlockEnabled: map.coin_unlock_enabled !== "false",
      conversionRatio: parseFloat(map.coin_conversion_ratio || "0.10"),
      adsPerQuickUnlock: parseInt(map.ads_per_quick_unlock || "5", 10),
      bonusPerSession: parseInt(map.bonus_coin_per_ad_session || "5", 10),
      coinAdReward: parseInt(map.coin_ad_reward || "1", 10),
      dailyLimit: parseInt(map.coin_daily_limit || "10", 10),
    };
  }),

  userUnlocksWithBooks: protectedProcedure.query(async ({ ctx }) => {
    const unlocks = await prisma.contentUnlock.findMany({
      where: { user_id: ctx.userId, status: "active" },
      include: { book: { select: { title: true, slug: true, cover_url: true } } },
      orderBy: { created_at: "desc" },
      take: 20,
    });
    return unlocks.map((u) => ({
      ...u,
      book: u.book ? { ...u.book, cover_url: resolveFileUrl(u.book.cover_url) } : null,
    }));
  }),

  hasSubscription: protectedProcedure
    .input(z.object({ format: z.enum(["ebook", "audiobook"]).optional() }))
    .query(async ({ ctx }) => {
      const sub = await prisma.userSubscription.findFirst({
        where: {
          user_id: ctx.userId,
          status: "active",
          OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
        },
      });
      return { hasSub: !!sub };
    }),

  checkHybridAccess: protectedProcedure
    .input(z.object({ bookId: z.string(), format: z.enum(["ebook", "audiobook"]) }))
    .query(async ({ ctx, input }) => {
      const { bookId, format } = input;

      const coinUnlock = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: bookId, format, status: "active" },
      });
      if (coinUnlock) return { granted: true, method: "coin" };

      const subscription = await prisma.userSubscription.findFirst({
        where: {
          user_id: ctx.userId,
          status: "active",
          OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
        },
      });
      if (subscription) return { granted: true, method: "subscription" };

      const purchase = await prisma.userPurchase.findFirst({
        where: { user_id: ctx.userId, book_id: bookId, format, status: "active" },
      });
      if (purchase) return { granted: true, method: "purchase" };

      return { granted: false, method: "none" };
    }),

  subscriptionPlans: publicProcedure.query(() =>
    prisma.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    })
  ),

  activeSubscription: protectedProcedure.query(({ ctx }) =>
    prisma.userSubscription.findFirst({
      where: { user_id: ctx.userId, status: "active", OR: [{ end_date: null }, { end_date: { gte: new Date() } }] },
      include: { plan: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    })
  ),

  subscribe: protectedProcedure
    .input(z.object({
      planId: z.string(),
      couponCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      // Resolve coupon
      let resolvedDiscount = 0;
      let resolvedCouponId: string | null = null;
      if (input.couponCode) {
        const coupon = await prisma.coupon.findFirst({ where: { code: input.couponCode.toUpperCase(), status: "active" } });
        if (coupon) {
          const now = new Date();
          const valid =
            (!coupon.start_date || coupon.start_date <= now) &&
            (!coupon.end_date || coupon.end_date >= now) &&
            (!coupon.usage_limit || coupon.used_count < coupon.usage_limit);
          if (valid) {
            resolvedDiscount = coupon.discount_type === "percentage"
              ? Math.min(plan.price, (plan.price * coupon.discount_value) / 100)
              : Math.min(plan.price, coupon.discount_value);
            resolvedCouponId = coupon.id;
          }
        }
      }

      const amountDue = Math.max(0, plan.price - resolvedDiscount);

      // Free plan — activate immediately
      if (amountDue === 0) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + (plan.duration_days || 30));

        const sub = await prisma.userSubscription.create({
          data: {
            user_id: ctx.userId,
            plan_id: input.planId,
            start_date: now,
            end_date: endDate,
            status: "active",
            coupon_code: input.couponCode || null,
            discount_amount: resolvedDiscount || null,
            amount_paid: 0,
          },
        });

        if (resolvedCouponId) {
          await prisma.couponUsage.create({
            data: { coupon_id: resolvedCouponId, user_id: ctx.userId, subscription_id: sub.id, discount_amount: resolvedDiscount },
          });
          await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { used_count: { increment: 1 } } });
        }

        return { requires_payment: false, subscription: sub };
      }

      // Paid plan — create pending subscription, client must go to payment gateway
      const sub = await prisma.userSubscription.create({
        data: {
          user_id: ctx.userId,
          plan_id: input.planId,
          status: "pending",
          coupon_code: input.couponCode || null,
          discount_amount: resolvedDiscount || null,
          amount_paid: amountDue,
        },
      });

      if (resolvedCouponId) {
        await prisma.couponUsage.create({
          data: { coupon_id: resolvedCouponId, user_id: ctx.userId, subscription_id: sub.id, discount_amount: resolvedDiscount },
        });
        await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { used_count: { increment: 1 } } });
      }

      return { requires_payment: true, subscription_id: sub.id, amount: amountDue };
    }),
});
