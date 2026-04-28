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
    const existing = await prisma.coinTransaction.findFirst({
      where: { user_id: req.auth.userId!, source: "daily_login", created_at: { gte: todayStart } },
    });
    if (existing) {
      res.status(400).json({ error: "Daily reward already claimed" });
      return;
    }
    const DAILY_REWARD = 10;
    const [, wallet] = await prisma.$transaction([
      prisma.coinTransaction.create({
        data: { user_id: req.auth.userId!, amount: DAILY_REWARD, type: "earn", description: "Daily login reward", source: "daily_login" },
      }),
      prisma.userCoin.upsert({
        where: { user_id: req.auth.userId! },
        create: { user_id: req.auth.userId!, balance: DAILY_REWARD, total_earned: DAILY_REWARD, total_spent: 0 },
        update: { balance: { increment: DAILY_REWARD }, total_earned: { increment: DAILY_REWARD } },
      }),
    ]);
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
    const MAX_PER_DAY = 10;
    const AD_REWARD = 1;
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

walletRestRouter.post("/unlock", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, format, coin_cost } = req.body;
    if (!book_id || !format || coin_cost === undefined) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const existing = await prisma.contentUnlock.findFirst({
      where: { user_id: req.auth.userId!, book_id, format, status: "active" },
    });
    if (existing) {
      res.status(400).json({ error: "Content already unlocked" });
      return;
    }
    const wallet = await prisma.userCoin.findUnique({ where: { user_id: req.auth.userId! } });
    if (!wallet || wallet.balance < coin_cost) {
      res.status(400).json({ error: "Insufficient coins" });
      return;
    }
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id, format },
      select: { id: true, price: true },
    });
    const unlock = await prisma.$transaction(async (tx) => {
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
    const saleAmount = Number(bookFormat?.price ?? 0);
    if (saleAmount > 0) {
      await calculateEarnings({ bookId: book_id, format, saleAmount, contentUnlockId: unlock.id });
    }
    const updatedWallet = await prisma.userCoin.findUnique({ where: { user_id: req.auth.userId! } });
    res.json({ success: true, message: "Content unlocked", new_balance: updatedWallet?.balance ?? 0 });
  } catch (error) {
    sendHttpError(res, error);
  }
});
