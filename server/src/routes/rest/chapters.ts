import { Router } from "express";
import { z } from "zod";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { calculateEarnings } from "../../lib/earnings.js";
import { s3Configured, createPresignedGetUrl, isS3Url } from "../../lib/s3.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";
import { verifyRevenueCatTransaction } from "../../lib/revenuecat.js";

const AUDIO_URL_TTL = 3600; // 1 hour

async function resolveAudioUrl(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl) return null;
  const resolved = resolveFileUrl(rawUrl);
  if (!resolved) return null;
  if (s3Configured && isS3Url(resolved)) {
    try { return await createPresignedGetUrl(resolved, AUDIO_URL_TTL); } catch { return null; }
  }
  return resolved;
}

export const chaptersRestRouter = Router();

// ── GET /api/v1/books/:bookId/chapters ───────────────────────────────────────
// Public (auth optional). Returns all active chapters with per-user unlock status.
chaptersRestRouter.get("/books/:bookId/chapters", async (req: AuthenticatedRequest, res) => {
  try {
    const param = String(req.params.bookId);
    const userId = req.auth?.userId ?? null;

    // Accept either an id or a slug — resolve to book_id
    const book = await prisma.book.findFirst({
      where: { OR: [{ id: param }, { slug: param }] },
      select: { id: true },
    });
    if (!book) { res.status(404).json({ error: "Book not found" }); return; }
    const bookId = book.id;

    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id: bookId, format: "audiobook" },
      select: {
        id: true,
        price: true,
        coin_price: true,
        subscriber_access: true,
        book: { select: { is_free: true } },
      },
    });
    if (!bookFormat) {
      res.status(404).json({ error: "Audiobook format not found for this book" });
      return;
    }

    const tracks = await prisma.audiobookTrack.findMany({
      where: { book_format_id: bookFormat.id, status: "active" },
      orderBy: { track_number: "asc" },
      select: {
        id: true,
        track_number: true,
        title: true,
        duration: true,
        is_preview: true,
        chapter_price: true,
        chapter_taka_price: true,
        audio_url: true,
        preview_audio_url: true,
      },
    });

    // Infer per-chapter pricing from whether tracks have an individual coin OR taka price
    const hasPerChapterPricing = tracks.some(t => (t.chapter_price ?? 0) > 0 || (t.chapter_taka_price ?? 0) > 0);

    // A book is entirely free if it's not using per-chapter pricing AND either the
    // is_free flag is set, or the whole-book price is 0 taka AND 0 coins (or null).
    // Explicit per-chapter pricing always wins over the book-level is_free flag —
    // otherwise a book-level toggle silently unlocks chapters an admin priced individually.
    const isEntirelyFree =
      !hasPerChapterPricing &&
      (bookFormat.book?.is_free === true || ((bookFormat.price ?? 0) === 0 && (bookFormat.coin_price ?? 0) === 0));

    let unlockedTrackIds = new Set<string>();
    let hasSubscriptionAccess = false;
    if (userId) {
      const [perChapterUnlocks, fullUnlock, subscription] = await Promise.all([
        prisma.contentUnlock.findMany({
          where: { user_id: userId, book_id: bookId, status: "active" },
          select: { format: true },
        }),
        prisma.contentUnlock.findFirst({
          where: { user_id: userId, book_id: bookId, format: "audiobook", status: "active" },
        }),
        prisma.userSubscription.findFirst({
          where: {
            user_id: userId,
            status: { in: ["active", "cancelled"] },
            OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
          },
        }),
      ]);

      hasSubscriptionAccess = Boolean(subscription) && bookFormat.subscriber_access === true;

      if (fullUnlock || hasSubscriptionAccess) {
        tracks.forEach(t => unlockedTrackIds.add(t.id));
      } else {
        perChapterUnlocks.forEach(u => {
          if (u.format.startsWith("audiobook_chapter_")) {
            unlockedTrackIds.add(u.format.replace("audiobook_chapter_", ""));
          }
        });
      }
    }

    const pricingMode = hasPerChapterPricing ? "per_chapter" : "whole_book";

    // Resolve presigned audio URLs for playable tracks:
    // preview tracks, user-unlocked tracks, or every track if the book is free
    const chapters = await Promise.all(
      tracks.map(async t => {
        const hasDirectUnlock = unlockedTrackIds.has(t.id);
        const isFreeTrack = t.is_preview === true || isEntirelyFree;
        const playable = isFreeTrack || hasDirectUnlock;
        // A track marked is_preview (and not part of an entirely free book, and
        // not directly unlocked by this user) must serve the trimmed preview clip
        // — never the full file — so the listening cap can't be bypassed by
        // backgrounding the app or any other client-side trick. Falls back to the
        // full file only if the clip hasn't been generated yet (e.g. just created).
        const usePreviewClip = t.is_preview === true && !isEntirelyFree && !hasDirectUnlock && Boolean(t.preview_audio_url);
        const audio_url = playable ? await resolveAudioUrl(usePreviewClip ? t.preview_audio_url : t.audio_url) : null;
        return {
          id: t.id,
          track_number: t.track_number,
          title: t.title,
          duration: t.duration ?? null,
          is_preview: t.is_preview ?? false,
          chapter_price_coins: isFreeTrack ? 0 : (t.chapter_price ?? null),
          chapter_price_bdt: isFreeTrack ? 0 : (t.chapter_taka_price ?? t.chapter_price ?? null),
          is_free: isFreeTrack,
          is_unlocked: playable,
          audio_url,
        };
      })
    );

    res.json({
      book_id: bookId,
      pricing_mode: pricingMode,
      book_coin_price: bookFormat.coin_price ?? null,
      book_taka_price: bookFormat.price ?? null,
      chapters,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/books/:bookId/unlocked-chapters ──────────────────────────────
// Auth required. Returns only the unlocked chapter IDs for the current user.
chaptersRestRouter.get("/books/:bookId/unlocked-chapters", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const param = String(req.params.bookId);
    const userId = req.auth.userId!;

    const book = await prisma.book.findFirst({
      where: { OR: [{ id: param }, { slug: param }] },
      select: { id: true },
    });
    if (!book) { res.status(404).json({ error: "Book not found" }); return; }
    const bookId = book.id;

    const fullUnlock = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id: bookId, format: "audiobook", status: "active" },
    });

    if (fullUnlock) {
      const tracks = await prisma.audiobookTrack.findMany({
        where: { book_format: { book_id: bookId }, status: "active" },
        select: { id: true, track_number: true, title: true },
        orderBy: { track_number: "asc" },
      });
      res.json({
        book_id: bookId,
        full_book_unlocked: true,
        unlocked_track_ids: tracks.map(t => t.id),
        unlocked_chapters: tracks.map(t => ({
          track_id: t.id,
          track_number: t.track_number,
          title: t.title,
          unlocked_at: fullUnlock.created_at,
        })),
      });
      return;
    }

    const unlocks = await prisma.contentUnlock.findMany({
      where: { user_id: userId, book_id: bookId, status: "active" },
      orderBy: { created_at: "desc" },
    });

    const chapterUnlocks = unlocks.filter(u => u.format.startsWith("audiobook_chapter_"));
    const trackIds = chapterUnlocks.map(u => u.format.replace("audiobook_chapter_", ""));
    const tracks = trackIds.length > 0
      ? await prisma.audiobookTrack.findMany({
          where: { id: { in: trackIds } },
          select: { id: true, track_number: true, title: true },
        })
      : [];
    const trackMap = new Map(tracks.map(t => [t.id, t]));

    res.json({
      book_id: bookId,
      full_book_unlocked: false,
      unlocked_track_ids: trackIds,
      unlocked_chapters: chapterUnlocks.map(u => {
        const trackId = u.format.replace("audiobook_chapter_", "");
        const track = trackMap.get(trackId);
        return {
          track_id: trackId,
          track_number: track?.track_number ?? null,
          title: track?.title ?? null,
          unlocked_at: u.created_at,
        };
      }),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/chapters/:trackId/unlock-coin ───────────────────────────────
// Auth required. Unlock a chapter using coins.
chaptersRestRouter.post("/chapters/:trackId/unlock-coin", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const trackId = String(req.params.trackId);
    const userId = req.auth.userId!;

    const track = await prisma.audiobookTrack.findUnique({
      where: { id: trackId },
      include: { book_format: { select: { book_id: true } } },
    });
    if (!track) {
      res.status(404).json({ error: "Chapter not found" });
      return;
    }

    const bookId = track.book_format.book_id;
    const format = `audiobook_chapter_${trackId}`;

    const existing = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id: bookId, format, status: "active" },
    });
    if (existing || track.is_preview) {
      res.json({ success: true, already_unlocked: true, new_balance: null });
      return;
    }

    const coinCost = track.chapter_price ?? 0;
    if (coinCost <= 0) {
      await prisma.contentUnlock.upsert({
        where: { user_id_book_id_format: { user_id: userId, book_id: bookId, format } },
        create: { user_id: userId, book_id: bookId, format, unlock_method: "free", status: "active" },
        update: { status: "active" },
      });
      res.json({ success: true, coins_spent: 0, new_balance: null });
      return;
    }

    const wallet = await prisma.userCoin.findUnique({ where: { user_id: userId } });
    if (!wallet || wallet.balance < coinCost) {
      res.status(400).json({ error: "Insufficient coins", required: coinCost, balance: wallet?.balance ?? 0 });
      return;
    }

    const [unlock, updatedWallet] = await prisma.$transaction(async (tx: any) => {
      const created = await tx.contentUnlock.upsert({
        where: { user_id_book_id_format: { user_id: userId, book_id: bookId, format } },
        create: { user_id: userId, book_id: bookId, format, coins_spent: coinCost, unlock_method: "coin", status: "active" },
        update: { status: "active", coins_spent: coinCost },
      });
      await tx.coinTransaction.create({
        data: { user_id: userId, amount: -coinCost, type: "spend", description: `Chapter unlock: ${track.title}`, reference_id: bookId, source: "content_unlock" },
      });
      const w = await tx.userCoin.update({
        where: { user_id: userId },
        data: { balance: { decrement: coinCost }, total_spent: { increment: coinCost } },
      });
      return [created, w];
    });

    await calculateEarnings({ bookId, format, saleAmount: 0, contentUnlockId: unlock.id }).catch(() => null);

    res.json({
      success: true,
      already_unlocked: false,
      track_id: trackId,
      book_id: bookId,
      coins_spent: coinCost,
      new_balance: updatedWallet.balance,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

const unlockIapSchema = z.object({
  book_id: z.string().min(1),
  transaction_id: z.string().min(1),
  product_id: z.string().optional(),
});

// ── POST /api/v1/chapters/:trackId/unlock-iap ─────────────────────────────────
// Auth required. Unlock a chapter using an Apple IAP purchase verified via RevenueCat.
chaptersRestRouter.post("/chapters/:trackId/unlock-iap", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const trackId = String(req.params.trackId);
    const userId = req.auth.userId!;
    const input = unlockIapSchema.parse(req.body);

    // Idempotency: a given Apple transaction can only ever unlock the one
    // (user, book, track) it was first used for — replaying it elsewhere is rejected.
    const existingTxn = await prisma.iapTransaction.findUnique({
      where: { transaction_id: input.transaction_id },
    });
    if (existingTxn) {
      const sameRequest =
        existingTxn.user_id === userId && existingTxn.book_id === input.book_id && existingTxn.track_id === trackId;
      if (sameRequest) {
        res.json({ success: true, already_unlocked: true, track_id: trackId, book_id: input.book_id });
        return;
      }
      res.status(409).json({ error: "This transaction has already been used to unlock different content" });
      return;
    }

    const track = await prisma.audiobookTrack.findUnique({
      where: { id: trackId },
      include: { book_format: { select: { book_id: true } } },
    });
    if (!track) {
      res.status(404).json({ error: "Chapter not found" });
      return;
    }
    if (track.book_format.book_id !== input.book_id) {
      res.status(400).json({ error: "Chapter does not belong to this book" });
      return;
    }

    const bookId = track.book_format.book_id;
    const format = `audiobook_chapter_${trackId}`;

    const alreadyUnlocked = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id: bookId, format, status: "active" },
    });

    // Verify the receipt with RevenueCat regardless of prior unlock status —
    // Apple has charged the user either way, so the transaction must be
    // recorded (and rejected if it's a forgery) before acknowledging success.
    const verification = await verifyRevenueCatTransaction(userId, input.transaction_id, input.product_id);
    if (!verification.ok) {
      res.status(402).json({ error: verification.error || "Could not verify Apple purchase" });
      return;
    }

    const unlock = await prisma.$transaction(async (tx: any) => {
      await tx.iapTransaction.create({
        data: {
          user_id: userId,
          book_id: bookId,
          track_id: trackId,
          product_id: input.product_id ?? null,
          transaction_id: input.transaction_id,
          raw_response: verification.matchedEntry as any,
        },
      });
      if (alreadyUnlocked || track.is_preview) return alreadyUnlocked;
      return tx.contentUnlock.upsert({
        where: { user_id_book_id_format: { user_id: userId, book_id: bookId, format } },
        create: { user_id: userId, book_id: bookId, format, unlock_method: "iap", status: "active" },
        update: { status: "active", unlock_method: "iap" },
      });
    });

    if (!alreadyUnlocked && unlock) {
      await calculateEarnings({ bookId, format, saleAmount: 0, contentUnlockId: unlock.id }).catch(() => null);
    }

    res.json({
      success: true,
      already_unlocked: Boolean(alreadyUnlocked || track.is_preview),
      track_id: trackId,
      book_id: bookId,
      message: "Book unlocked successfully",
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

const unlockBookIapSchema = z.object({
  transaction_id: z.string().min(1),
  product_id: z.string().optional(),
  format: z.enum(["ebook", "audiobook"]),
});

// ── POST /api/v1/books/:bookId/unlock-iap ─────────────────────────────────────
// Auth required. Unlock the full eBook or Audiobook using an Apple IAP purchase
// verified via RevenueCat. Same logic as the chapter unlock-iap endpoint above,
// but unlocks the whole book/format rather than a single chapter (track_id: null).
chaptersRestRouter.post("/books/:bookId/unlock-iap", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const param = String(req.params.bookId);
    const userId = req.auth.userId!;
    const input = unlockBookIapSchema.parse(req.body);

    const book = await prisma.book.findFirst({
      where: { OR: [{ id: param }, { slug: param }] },
      select: { id: true },
    });
    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }
    const bookId = book.id;

    // Idempotency: a given Apple transaction can only ever unlock the one
    // (user, book, format) it was first used for — replaying it elsewhere is rejected.
    const existingTxn = await prisma.iapTransaction.findUnique({
      where: { transaction_id: input.transaction_id },
    });
    if (existingTxn) {
      const sameRequest =
        existingTxn.user_id === userId && existingTxn.book_id === bookId && existingTxn.track_id === null;
      if (sameRequest) {
        res.json({ success: true, already_unlocked: true, book_id: bookId, message: "Full book unlocked successfully" });
        return;
      }
      res.status(409).json({ error: "This transaction has already been used to unlock different content" });
      return;
    }

    const alreadyUnlocked = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id: bookId, format: input.format, status: "active" },
    });

    // Verify the receipt with RevenueCat regardless of prior unlock status —
    // Apple has charged the user either way, so the transaction must be
    // recorded (and rejected if it's a forgery) before acknowledging success.
    const verification = await verifyRevenueCatTransaction(userId, input.transaction_id, input.product_id);
    if (!verification.ok) {
      res.status(402).json({ error: verification.error || "Could not verify Apple purchase" });
      return;
    }

    const unlock = await prisma.$transaction(async (tx: any) => {
      await tx.iapTransaction.create({
        data: {
          user_id: userId,
          book_id: bookId,
          track_id: null,
          product_id: input.product_id ?? null,
          transaction_id: input.transaction_id,
          raw_response: verification.matchedEntry as any,
        },
      });
      if (alreadyUnlocked) return alreadyUnlocked;
      return tx.contentUnlock.upsert({
        where: { user_id_book_id_format: { user_id: userId, book_id: bookId, format: input.format } },
        create: { user_id: userId, book_id: bookId, format: input.format, unlock_method: "iap", status: "active" },
        update: { status: "active", unlock_method: "iap" },
      });
    });

    if (!alreadyUnlocked && unlock) {
      await calculateEarnings({ bookId, format: input.format, saleAmount: 0, contentUnlockId: unlock.id }).catch(() => null);
    }

    res.json({
      success: true,
      already_unlocked: Boolean(alreadyUnlocked),
      book_id: bookId,
      message: "Full book unlocked successfully",
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/chapters/:trackId/initiate-payment ──────────────────────────
// Auth required. Start a taka payment for a chapter via gateway.
// Body: { book_id, gateway: "sslcommerz"|"bkash", success_redirect?, fail_redirect? }
chaptersRestRouter.post("/chapters/:trackId/initiate-payment", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const trackId = String(req.params.trackId);
    const userId = req.auth.userId!;
    const { book_id, gateway = "sslcommerz", success_redirect, fail_redirect } = req.body;

    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }

    const bookId = String(book_id);

    const [user, track] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.audiobookTrack.findUnique({
        where: { id: trackId },
        include: { book_format: { select: { book_id: true } } },
      }),
    ]);

    if (!track) { res.status(404).json({ error: "Chapter not found" }); return; }
    if (track.book_format.book_id !== bookId) { res.status(400).json({ error: "Chapter does not belong to this book" }); return; }

    const existing = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id: bookId, format: `audiobook_chapter_${trackId}`, status: "active" },
    });
    if (existing) { res.json({ already_unlocked: true }); return; }

    const takaPrice = track.chapter_taka_price ?? track.chapter_price ?? 10;
    const purchase = await prisma.chapterPurchase.create({
      data: { book_id: bookId, track_id: trackId, user_id: userId, price: takaPrice, payment_method: gateway, payment_status: "pending" },
    });

    const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
    const backendBase = (process.env.BACKEND_URL || process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "");
    const transactionId = `CHPT-${purchase.id}-${Date.now()}`;

    const successRedirect = success_redirect ? String(success_redirect) : `${frontendBase}/b/${bookId}?chapter_status=success`;
    const failRedirect = fail_redirect ? String(fail_redirect) : `${frontendBase}/b/${bookId}?chapter_status=failed`;
    const cancelRedirect = fail_redirect ? String(fail_redirect) : `${frontendBase}/b/${bookId}?chapter_status=cancelled`;

    if (gateway === "sslcommerz") {
      const sslGateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
      if (!sslGateway?.is_enabled) { res.status(400).json({ error: "SSLCommerz is not configured" }); return; }
      const cfg = sslGateway.config as Record<string, unknown>;
      const cfgStr = (k: string) => { const v = cfg[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };
      const storeId = cfgStr("store_id") || process.env.SSLCOMMERZ_STORE_ID;
      const storePass = cfgStr("store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
      if (!storeId || !storePass) { res.status(400).json({ error: "SSLCommerz credentials missing" }); return; }

      const mode = sslGateway.mode === "live" ? "live" : "sandbox";
      const payload = new URLSearchParams({
        store_id: storeId, store_passwd: storePass,
        total_amount: String(takaPrice), currency: "BDT", tran_id: transactionId,
        success_url: `${backendBase}/api/v1/payments/sslcommerz/success?redirect=${encodeURIComponent(successRedirect)}`,
        fail_url: `${backendBase}/api/v1/payments/sslcommerz/fail?redirect=${encodeURIComponent(failRedirect)}`,
        cancel_url: `${backendBase}/api/v1/payments/sslcommerz/cancel?redirect=${encodeURIComponent(cancelRedirect)}`,
        ipn_url: `${backendBase}/api/v1/payments/sslcommerz/ipn`,
        product_name: track.title, product_category: "Chapter", product_profile: "digital-goods",
        cus_name: "Customer", cus_email: user?.email || `${userId}@boiaro.local`,
        cus_add1: "N/A", cus_city: "Dhaka", cus_postcode: "1000", cus_country: "Bangladesh",
        cus_phone: "01700000000", ship_name: "Customer", ship_add1: "N/A",
        ship_city: "Dhaka", ship_state: "Dhaka", ship_postcode: "1000", ship_country: "Bangladesh",
        shipping_method: "NO", num_of_item: "1",
      });
      const initUrl = mode === "live"
        ? "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
        : "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
      const sslRes = await fetch(initUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: payload.toString() });
      let sslData: Record<string, unknown>;
      try { sslData = JSON.parse(await sslRes.text()) as Record<string, unknown>; } catch { sslData = {}; }
      const gatewayUrl = typeof sslData.GatewayPageURL === "string" ? sslData.GatewayPageURL : undefined;
      if (!gatewayUrl) { res.status(500).json({ error: String(sslData.failedreason || "SSLCommerz initiation failed") }); return; }
      await prisma.chapterPurchase.update({ where: { id: purchase.id }, data: { transaction_id: transactionId } });
      res.json({ success: true, purchase_id: purchase.id, gateway_url: gatewayUrl, gateway: "sslcommerz", amount: takaPrice, currency: "BDT" });
      return;
    }

    if (gateway === "bkash" || gateway === "nagad") {
      const gw = await prisma.paymentGateway.findUnique({ where: { gateway_key: gateway } });
      const cfg = (gw?.config ?? {}) as Record<string, unknown>;
      const cfgStr = (k: string) => { const v = cfg[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };
      const appKey = cfgStr("app_key") || process.env.BKASH_APP_KEY;
      const appSecret = cfgStr("app_secret") || process.env.BKASH_APP_SECRET;
      const username = cfgStr("username") || process.env.BKASH_USERNAME;
      const password = cfgStr("password") || process.env.BKASH_PASSWORD;
      if (!appKey || !appSecret || !username || !password) { res.status(400).json({ error: `${gateway} credentials not configured` }); return; }
      const bkashMode = (gw?.mode === "live") ? "live" : "test";
      const baseUrl = bkashMode === "live" ? "https://tokenized.pay.bka.sh/v1.2.0-beta" : "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
      const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", username, password },
        body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
      });
      const tokenData = await tokenRes.json() as Record<string, unknown>;
      const idToken = typeof tokenData.id_token === "string" ? tokenData.id_token : undefined;
      if (!idToken) { res.status(500).json({ error: "bKash token grant failed" }); return; }
      const callbackUrl = `${backendBase}/api/v1/payments/bkash/chapter-callback?purchase_id=${purchase.id}`;
      const createRes = await fetch(`${baseUrl}/tokenized/checkout/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", authorization: idToken, "x-app-key": appKey },
        body: JSON.stringify({ mode: "0011", payerReference: userId, callbackURL: callbackUrl, amount: String(takaPrice), currency: "BDT", intent: "sale", merchantInvoiceNumber: transactionId }),
      });
      const createData = await createRes.json() as Record<string, unknown>;
      const bkashUrl = typeof createData.bkashURL === "string" ? createData.bkashURL : undefined;
      const paymentID = typeof createData.paymentID === "string" ? createData.paymentID : undefined;
      if (!bkashUrl) { res.status(500).json({ error: String(createData.statusMessage || "bKash payment creation failed") }); return; }
      await prisma.chapterPurchase.update({ where: { id: purchase.id }, data: { transaction_id: paymentID || transactionId } });
      res.json({ success: true, purchase_id: purchase.id, gateway_url: bkashUrl, gateway, amount: takaPrice, currency: "BDT" });
      return;
    }

    res.status(400).json({ error: `Unsupported gateway: ${gateway}. Use sslcommerz or bkash.` });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/chapters/payment-status/:purchaseId ──────────────────────────
// Auth required. Poll payment status after returning from gateway.
chaptersRestRouter.get("/chapters/payment-status/:purchaseId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const purchaseId = String(req.params.purchaseId);
    const userId = req.auth.userId!;

    const purchase = await prisma.chapterPurchase.findUnique({ where: { id: purchaseId } });
    if (!purchase || purchase.user_id !== userId) {
      res.status(404).json({ error: "Purchase not found" });
      return;
    }

    const isUnlocked = await prisma.contentUnlock.findFirst({
      where: {
        user_id: userId,
        book_id: purchase.book_id,
        format: `audiobook_chapter_${purchase.track_id}`,
        status: "active",
      },
    });

    res.json({
      purchase_id: purchaseId,
      track_id: purchase.track_id,
      book_id: purchase.book_id,
      amount: purchase.price,
      gateway: purchase.payment_method,
      status: purchase.payment_status,
      transaction_id: purchase.transaction_id ?? null,
      is_unlocked: !!isUnlocked,
      created_at: purchase.created_at,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
