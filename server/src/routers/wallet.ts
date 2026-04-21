import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const walletRouter = router({
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

      return prisma.$transaction(async (tx) => {
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
      const { bookId, format, coinCost } = input;

      const existing = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: bookId, format },
      });
      if (existing?.status === "active") return { already_unlocked: true };

      const wallet = await prisma.userCoin.findUnique({ where: { user_id: ctx.userId } });
      if (!wallet || wallet.balance < coinCost) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient coins" });
      }

      await prisma.$transaction([
        prisma.contentUnlock.upsert({
          where: {
            user_id_book_id_format: { user_id: ctx.userId, book_id: bookId, format },
          },
          create: {
            user_id: ctx.userId,
            book_id: bookId,
            format,
            coins_spent: coinCost,
            unlock_method: "coin",
            status: "active",
          },
          update: { status: "active", coins_spent: coinCost },
        }),
        prisma.coinTransaction.create({
          data: {
            user_id: ctx.userId,
            amount: -coinCost,
            type: "spend",
            description: `Content unlock - ${format}`,
            reference_id: bookId,
            source: "content_unlock",
          },
        }),
        prisma.userCoin.update({
          where: { user_id: ctx.userId },
          data: {
            balance: { decrement: coinCost },
            total_spent: { increment: coinCost },
          },
        }),
      ]);

      return { success: true };
    }),

  checkUnlock: protectedProcedure
    .input(z.object({ bookId: z.string(), format: z.string() }))
    .query(async ({ ctx, input }) => {
      const unlock = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: input.bookId, format: input.format, status: "active" },
      });
      return { unlocked: !!unlock };
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

  hasSubscription: protectedProcedure
    .input(z.object({ format: z.enum(["ebook", "audiobook"]).optional() }))
    .query(async ({ ctx, input }) => {
      const sub = await prisma.userSubscription.findFirst({
        where: {
          user_id: ctx.userId,
          status: "active",
          OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
        },
        include: { plan: { select: { access_type: true } } },
      });
      if (!sub) return { hasSub: false };
      const at = (sub as any).plan?.access_type;
      if (!input.format || at === "premium" || at === "both" || at === input.format) {
        return { hasSub: true };
      }
      return { hasSub: false };
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
});
