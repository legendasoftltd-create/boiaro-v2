import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { calculateEarnings } from "../../lib/earnings.js";

export const walletRestRouter = Router();

walletRestRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wallet = await prisma.userCoin.findUnique({ where: { user_id: req.auth.userId! } });
    res.json({
      balance: wallet?.balance ?? 0,
      total_earned: wallet?.total_earned ?? 0,
      total_spent: wallet?.total_spent ?? 0,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

walletRestRouter.get("/transactions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const transactions = await prisma.coinTransaction.findMany({
      where: { user_id: req.auth.userId! },
      orderBy: { created_at: "desc" },
      take: limit,
    });
    res.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        source: t.source,
        created_at: t.created_at,
        expires_at: t.expires_at,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

walletRestRouter.post("/claim-daily", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const dailySetting = await prisma.platformSetting.findUnique({ where: { key: "coin_daily_login_reward" } });
    const DAILY_REWARD = parseInt(dailySetting?.value || "10", 10);

    // Atomic: re-check inside the transaction to prevent race-condition double-claims
    const wallet = await prisma.$transaction(async (tx) => {
      const existing = await tx.coinTransaction.findFirst({
        where: { user_id: req.auth.userId!, source: "daily_login", created_at: { gte: todayStart } },
      });
      if (existing) return null;

      await tx.coinTransaction.create({
        data: { user_id: req.auth.userId!, amount: DAILY_REWARD, type: "earn", description: "Daily login reward", source: "daily_login" },
      });
      return tx.userCoin.upsert({
        where: { user_id: req.auth.userId! },
        create: { user_id: req.auth.userId!, balance: DAILY_REWARD, total_earned: DAILY_REWARD, total_spent: 0 },
        update: { balance: { increment: DAILY_REWARD }, total_earned: { increment: DAILY_REWARD } },
      });
    });

    if (!wallet) {
      res.status(400).json({ error: "Daily reward already claimed" });
      return;
    }
    res.json({ reward: DAILY_REWARD, message: "Daily reward claimed", new_balance: wallet.balance });
  } catch (error) {
    sendHttpError(res, error);
  }
});

walletRestRouter.post("/claim-ad", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { placement = "general" } = req.body;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [maxSetting, rewardSetting] = await Promise.all([
      prisma.platformSetting.findUnique({ where: { key: "ad_max_per_day" } }),
      prisma.platformSetting.findUnique({ where: { key: "ad_rewarded_coins" } }),
    ]);
    const MAX_PER_DAY = parseInt(maxSetting?.value || "10", 10);
    const AD_REWARD = parseInt(rewardSetting?.value || "1", 10);
    const todayCount = await prisma.coinTransaction.count({
      where: { user_id: req.auth.userId!, source: "ad_reward", created_at: { gte: todayStart } },
    });
    if (todayCount >= MAX_PER_DAY) {
      res.status(400).json({ error: "Daily ad reward limit reached" });
      return;
    }
    const [, wallet] = await prisma.$transaction([
      prisma.coinTransaction.create({
        data: { user_id: req.auth.userId!, amount: AD_REWARD, type: "earn", description: `Ad reward - ${placement}`, source: "ad_reward", reference_id: placement },
      }),
      prisma.userCoin.upsert({
        where: { user_id: req.auth.userId! },
        create: { user_id: req.auth.userId!, balance: AD_REWARD, total_earned: AD_REWARD, total_spent: 0 },
        update: { balance: { increment: AD_REWARD }, total_earned: { increment: AD_REWARD } },
      }),
    ]);
    res.json({ reward: AD_REWARD, message: "Ad reward claimed", new_balance: wallet.balance });
  } catch (error) {
    sendHttpError(res, error);
  }
});

walletRestRouter.get("/coin-settings", async (_req, res) => {
  try {
    const settings = await prisma.platformSetting.findMany({
      where: {
        key: {
          in: [
            "coin_system_enabled",
            "coin_unlock_enabled",
            "coin_conversion_ratio",
            "ads_per_quick_unlock",
            "bonus_coin_per_ad_session",
            "coin_ad_reward",
            "coin_daily_limit",
            "ad_cooldown_minutes",
          ],
        },
      },
    });
    const map: Record<string, string> = {};
    settings.forEach((s) => { map[s.key] = s.value as string; });
    res.json({
      system_enabled: map.coin_system_enabled !== "false",
      unlock_enabled: map.coin_unlock_enabled !== "false",
      conversion_ratio: parseFloat(map.coin_conversion_ratio || "0.10"),
      ads_per_quick_unlock: parseInt(map.ads_per_quick_unlock || "5", 10),
      bonus_per_session: parseInt(map.bonus_coin_per_ad_session || "5", 10),
      coin_ad_reward: parseInt(map.coin_ad_reward || "1", 10),
      daily_limit: parseInt(map.coin_daily_limit || "10", 10),
      ad_cooldown_minutes: parseInt(map.ad_cooldown_minutes || "5", 10),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});


walletRestRouter.post("/unlock", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, format } = req.body;
    // coin_cost is intentionally NOT accepted from the client — always resolved from DB
    if (!book_id || !format) {
      res.status(400).json({ error: "Missing required fields: book_id, format" });
      return;
    }

    const existing = await prisma.contentUnlock.findFirst({
      where: { user_id: req.auth.userId!, book_id, format, status: "active" },
    });
    if (existing) {
      res.status(400).json({ error: "Content already unlocked" });
      return;
    }

    // Resolve the real coin cost from DB — client-supplied cost is intentionally ignored
    let coin_cost = 0;
    let bookFormatId: string | undefined;
    let salePriceTaka = 0;

    const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
    const chapterMatch = format.match(/^audiobook_chapter_([\da-f-]+)$/);
    if (chapterMatch) {
      const trackId = chapterMatch[1];
      if (!UUID_RE.test(trackId)) {
        res.status(400).json({ error: "Invalid chapter format" });
        return;
      }
      const [track, book] = await Promise.all([
        prisma.audiobookTrack.findUnique({
          where: { id: trackId },
          select: { is_preview: true, chapter_price: true, book_format: { select: { id: true, book_id: true, coin_price: true } } },
        }),
        prisma.book.findUnique({ where: { id: book_id }, select: { is_free: true } }),
      ]);
      if (!track || track.book_format.book_id !== book_id) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }
      if (track.is_preview || Boolean(book?.is_free)) {
        res.status(400).json({ error: "Chapter is free — no coin unlock needed" });
        return;
      }
      coin_cost = Math.round(track.chapter_price ?? track.book_format.coin_price ?? 0);
      bookFormatId = track.book_format.id;
    } else {
      const [bookFormat, book] = await Promise.all([
        prisma.bookFormat.findFirst({
          where: { book_id, format },
          select: { id: true, coin_price: true, price: true },
        }),
        prisma.book.findUnique({ where: { id: book_id }, select: { is_free: true } }),
      ]);
      if (!bookFormat) {
        res.status(404).json({ error: "Book format not found" });
        return;
      }
      if (Boolean(book?.is_free) || (bookFormat.coin_price ?? 0) === 0) {
        res.status(400).json({ error: "Content is free — no coin unlock needed" });
        return;
      }
      coin_cost = bookFormat.coin_price ?? 0;
      bookFormatId = bookFormat.id;
      salePriceTaka = Number(bookFormat.price ?? 0);
    }

    if (coin_cost <= 0) {
      res.status(400).json({ error: "Content is free — no coin unlock needed" });
      return;
    }

    const wallet = await prisma.userCoin.findUnique({ where: { user_id: req.auth.userId! } });
    if (!wallet || wallet.balance < coin_cost) {
      res.status(400).json({ error: "Insufficient coins", required: coin_cost, balance: wallet?.balance ?? 0 });
      return;
    }

    const unlock = await prisma.$transaction(async (tx: any) => {
      const created = await tx.contentUnlock.upsert({
        where: { user_id_book_id_format: { user_id: req.auth.userId!, book_id, format } },
        create: { user_id: req.auth.userId!, book_id, format, coins_spent: coin_cost, unlock_method: "coin", status: "active" },
        update: { status: "active", coins_spent: coin_cost },
      });
      await tx.coinTransaction.create({
        data: { user_id: req.auth.userId!, amount: -coin_cost, type: "spend", description: `Content unlock - ${format}`, reference_id: book_id, source: "content_unlock" },
      });
      await tx.userCoin.update({
        where: { user_id: req.auth.userId! },
        data: { balance: { decrement: coin_cost }, total_spent: { increment: coin_cost } },
      });
      return created;
    });

    if (salePriceTaka > 0) {
      await calculateEarnings({ bookId: book_id, format, saleAmount: salePriceTaka, contentUnlockId: unlock.id });
    }

    const updatedWallet = await prisma.userCoin.findUnique({ where: { user_id: req.auth.userId! } });
    res.json({ success: true, message: "Content unlocked", new_balance: updatedWallet?.balance ?? 0, coins_spent: coin_cost });
  } catch (error) {
    sendHttpError(res, error);
  }
});
