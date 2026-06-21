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
    .input(z.object({ packageId: z.string(), paymentMethod: z.string().default("sslcommerz") }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await prisma.coinPackage.findUnique({ where: { id: input.packageId } });
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });

      const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
      const backendBase = (process.env.BACKEND_URL || process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || "3001"}`).replace(/\/$/, "");

      // Create pending purchase record
      const purchase = await prisma.coinPurchase.create({
        data: {
          user_id: ctx.userId,
          package: { connect: { id: pkg.id } },
          coins_amount: pkg.coins + pkg.bonus_coins,
          price: pkg.price,
          payment_status: "pending",
          payment_method: input.paymentMethod,
        },
      });

      const transactionId = `COIN-${purchase.id}-${Date.now()}`;
      const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } });

      // ── SSLCommerz ──────────────────────────────────────────────────────────
      if (input.paymentMethod === "sslcommerz") {
        const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
        if (!gateway || !gateway.is_enabled) throw new TRPCError({ code: "BAD_REQUEST", message: "SSLCommerz is not configured. Contact admin." });

        const cfg = gateway.config as Record<string, unknown>;
        const cfgStr = (k: string) => { const v = cfg[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };
        const storeId = cfgStr("store_id") || process.env.SSLCOMMERZ_STORE_ID;
        const storePassword = cfgStr("store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
        if (!storeId || !storePassword) throw new TRPCError({ code: "BAD_REQUEST", message: "SSLCommerz credentials missing. Contact admin." });

        const mode = gateway.mode === "live" ? "live" : "test";
        const payload = new URLSearchParams({
          store_id: storeId, store_passwd: storePassword,
          total_amount: String(pkg.price), currency: "BDT", tran_id: transactionId,
          success_url: `${backendBase}/api/v1/payments/sslcommerz/success?redirect=${encodeURIComponent(`${frontendBase}/coin-store?status=success`)}`,
          fail_url: `${backendBase}/api/v1/payments/sslcommerz/fail?redirect=${encodeURIComponent(`${frontendBase}/coin-store?status=failed`)}`,
          cancel_url: `${backendBase}/api/v1/payments/sslcommerz/cancel?redirect=${encodeURIComponent(`${frontendBase}/coin-store?status=cancelled`)}`,
          ipn_url: `${backendBase}/api/v1/payments/sslcommerz/ipn`,
          product_name: pkg.name, product_category: "Coins", product_profile: "general",
          cus_name: "Customer", cus_email: user?.email || `${ctx.userId}@boiaro.local`,
          cus_add1: "N/A", cus_city: "Dhaka", cus_postcode: "1000", cus_country: "Bangladesh",
          cus_phone: "01700000000", ship_name: "Customer", ship_add1: "N/A",
          ship_city: "Dhaka", ship_state: "Dhaka", ship_postcode: "1000", ship_country: "Bangladesh",
          shipping_method: "NO", num_of_item: "1",
        });
        const initUrl = mode === "live"
          ? "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
          : "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
        const res = await fetch(initUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: payload.toString() });
        let sslData: Record<string, unknown>;
        try { sslData = JSON.parse(await res.text()) as Record<string, unknown>; } catch { sslData = {}; }
        const gatewayUrl = typeof sslData.GatewayPageURL === "string" ? sslData.GatewayPageURL : undefined;
        if (!gatewayUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(sslData.failedreason || sslData.message || "SSLCommerz initiation failed.") });
        await prisma.coinPurchase.update({ where: { id: purchase.id }, data: { transaction_id: transactionId } });
        return { success: true, purchase_id: purchase.id, gateway_url: gatewayUrl };
      }

      // ── bKash / Nagad Tokenized Checkout ────────────────────────────────────
      if (input.paymentMethod === "bkash" || input.paymentMethod === "nagad") {
        const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: input.paymentMethod } });
        const cfg = (gateway?.config ?? {}) as Record<string, unknown>;
        const cfgStr = (k: string) => { const v = cfg[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };

        const appKey = cfgStr("app_key") || process.env.BKASH_APP_KEY;
        const appSecret = cfgStr("app_secret") || process.env.BKASH_APP_SECRET;
        const username = cfgStr("username") || process.env.BKASH_USERNAME;
        const password = cfgStr("password") || process.env.BKASH_PASSWORD;

        if (!appKey || !appSecret || !username || !password) throw new TRPCError({ code: "BAD_REQUEST", message: `${input.paymentMethod} credentials missing. Contact admin.` });

        const mode = (gateway?.mode === "live" || (!gateway?.mode && process.env.BKASH_APP_KEY)) ? "live" : "test";
        const baseUrl = mode === "live" ? "https://tokenized.pay.bka.sh/v1.2.0-beta" : "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

        // Step 1: Get token
        const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", username, password },
          body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
        });
        const tokenData = await tokenRes.json() as Record<string, unknown>;
        const idToken = typeof tokenData.id_token === "string" ? tokenData.id_token : undefined;
        if (!idToken) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bKash token grant failed." });

        // Step 2: Create payment
        const callbackUrl = `${backendBase}/api/v1/payments/bkash/callback?purchase_id=${purchase.id}`;
        const createRes = await fetch(`${baseUrl}/tokenized/checkout/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", authorization: idToken, "x-app-key": appKey },
          body: JSON.stringify({
            mode: "0011",
            payerReference: ctx.userId,
            callbackURL: callbackUrl,
            amount: String(pkg.price),
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: transactionId,
          }),
        });
        const createData = await createRes.json() as Record<string, unknown>;
        const bkashUrl = typeof createData.bkashURL === "string" ? createData.bkashURL : undefined;
        const paymentID = typeof createData.paymentID === "string" ? createData.paymentID : undefined;
        if (!bkashUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(createData.statusMessage || "bKash payment creation failed.") });

        await prisma.coinPurchase.update({ where: { id: purchase.id }, data: { transaction_id: paymentID || transactionId } });
        return { success: true, purchase_id: purchase.id, gateway_url: bkashUrl };
      }

      // ── Unknown gateway ──────────────────────────────────────────────────────
      throw new TRPCError({ code: "BAD_REQUEST", message: `Payment method '${input.paymentMethod}' is not supported for coin purchases.` });
    }),

  // ── Per-chapter taka payment initiation ────────────────────────────────────
  initiateChapterPayment: protectedProcedure
    .input(z.object({ trackId: z.string(), bookId: z.string(), paymentMethod: z.string().default("sslcommerz") }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } });
      const track = await prisma.audiobookTrack.findUnique({
        where: { id: input.trackId },
        select: { id: true, title: true, chapter_price: true, chapter_taka_price: true, book_format: { select: { book_id: true } } },
      });
      if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Chapter not found" });
      if (track.book_format.book_id !== input.bookId) throw new TRPCError({ code: "BAD_REQUEST", message: "Chapter does not belong to this book" });

      // Check already unlocked
      const existing = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: input.bookId, format: `audiobook_chapter_${input.trackId}`, status: "active" },
      });
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "This chapter is already unlocked" });

      // Resolve taka price — explicit taka price preferred, else 1-to-1 with coin price
      const takaPrice = track.chapter_taka_price ?? track.chapter_price ?? 10;

      const purchase = await prisma.chapterPurchase.create({
        data: {
          book_id: input.bookId, track_id: input.trackId, user_id: ctx.userId,
          price: takaPrice, payment_method: input.paymentMethod, payment_status: "pending",
        },
      });

      const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
      const backendBase = (process.env.BACKEND_URL || process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "");
      const transactionId = `CHPT-${purchase.id}-${Date.now()}`;

      // ── SSLCommerz ────────────────────────────────────────────────────────
      if (input.paymentMethod === "sslcommerz") {
        const sslGateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
        if (!sslGateway || !sslGateway.is_enabled) throw new TRPCError({ code: "BAD_REQUEST", message: "SSLCommerz is not configured" });
        const cfg = sslGateway.config as Record<string, unknown>;
        const cfgStr2 = (k: string) => { const v = cfg[k]; return typeof v === "string" && (v as string).trim() ? (v as string).trim() : undefined; };
        const storeId = cfgStr2("store_id") || process.env.SSLCOMMERZ_STORE_ID;
        const storePass = cfgStr2("store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
        if (!storeId || !storePass) throw new TRPCError({ code: "BAD_REQUEST", message: "SSLCommerz credentials missing. Contact admin." });
        const mode = sslGateway.mode === "live" ? "live" : "sandbox";
        const payload = new URLSearchParams({
          store_id: storeId, store_passwd: storePass,
          total_amount: String(takaPrice), currency: "BDT", tran_id: transactionId,
          success_url: `${backendBase}/api/v1/payments/sslcommerz/success?redirect=${encodeURIComponent(`${frontendBase}/b/${input.bookId}?chapter_status=success`)}`,
          fail_url: `${backendBase}/api/v1/payments/sslcommerz/fail?redirect=${encodeURIComponent(`${frontendBase}/b/${input.bookId}?chapter_status=failed`)}`,
          cancel_url: `${backendBase}/api/v1/payments/sslcommerz/cancel?redirect=${encodeURIComponent(`${frontendBase}/b/${input.bookId}?chapter_status=cancelled`)}`,
          ipn_url: `${backendBase}/api/v1/payments/sslcommerz/ipn`,
          product_name: track.title, product_category: "Chapter", product_profile: "digital-goods",
          cus_name: "Customer", cus_email: user?.email || `${ctx.userId}@boiaro.local`,
          cus_add1: "N/A", cus_city: "Dhaka", cus_postcode: "1000", cus_country: "Bangladesh",
          cus_phone: "01700000000", ship_name: "Customer", ship_add1: "N/A",
          ship_city: "Dhaka", ship_state: "Dhaka", ship_postcode: "1000", ship_country: "Bangladesh",
          shipping_method: "NO", num_of_item: "1",
        });
        const initUrl = mode === "live"
          ? "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
          : "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
        const res = await fetch(initUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: payload.toString() });
        let sslData: Record<string, unknown>;
        try { sslData = JSON.parse(await res.text()) as Record<string, unknown>; } catch { sslData = {}; }
        const gatewayUrl = typeof sslData.GatewayPageURL === "string" ? sslData.GatewayPageURL : undefined;
        if (!gatewayUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(sslData.failedreason || "SSLCommerz initiation failed.") });
        await prisma.chapterPurchase.update({ where: { id: purchase.id }, data: { transaction_id: transactionId } });
        return { success: true, purchase_id: purchase.id, gateway_url: gatewayUrl, price: takaPrice };
      }

      // ── bKash / Nagad ──────────────────────────────────────────────────────
      if (input.paymentMethod === "bkash" || input.paymentMethod === "nagad") {
        const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: input.paymentMethod } });
        const cfg = (gateway?.config ?? {}) as Record<string, unknown>;
        const cfgStr = (k: string) => { const v = cfg[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };
        const appKey = cfgStr("app_key") || process.env.BKASH_APP_KEY;
        const appSecret = cfgStr("app_secret") || process.env.BKASH_APP_SECRET;
        const username = cfgStr("username") || process.env.BKASH_USERNAME;
        const password = cfgStr("password") || process.env.BKASH_PASSWORD;
        if (!appKey || !appSecret || !username || !password) throw new TRPCError({ code: "BAD_REQUEST", message: "bKash credentials not configured" });
        const bkashMode = (gateway?.mode === "live" || (!gateway?.mode && process.env.BKASH_APP_KEY)) ? "live" : "test";
        const baseUrl = bkashMode === "live" ? "https://tokenized.pay.bka.sh/v1.2.0-beta" : "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
        const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", username, password },
          body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
        });
        const tokenData = await tokenRes.json() as Record<string, unknown>;
        const idToken = typeof tokenData.id_token === "string" ? tokenData.id_token : undefined;
        if (!idToken) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bKash token grant failed." });
        const callbackUrl = `${backendBase}/api/v1/payments/bkash/chapter-callback?purchase_id=${purchase.id}`;
        const createRes = await fetch(`${baseUrl}/tokenized/checkout/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", authorization: idToken, "x-app-key": appKey },
          body: JSON.stringify({ mode: "0011", payerReference: ctx.userId, callbackURL: callbackUrl, amount: String(takaPrice), currency: "BDT", intent: "sale", merchantInvoiceNumber: transactionId }),
        });
        const createData = await createRes.json() as Record<string, unknown>;
        const bkashUrl = typeof createData.bkashURL === "string" ? createData.bkashURL : undefined;
        const paymentID = typeof createData.paymentID === "string" ? createData.paymentID : undefined;
        if (!bkashUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(createData.statusMessage || "bKash payment creation failed.") });
        await prisma.chapterPurchase.update({ where: { id: purchase.id }, data: { transaction_id: paymentID || transactionId } });
        return { success: true, purchase_id: purchase.id, gateway_url: bkashUrl, price: takaPrice };
      }

      throw new TRPCError({ code: "BAD_REQUEST", message: `Payment method '${input.paymentMethod}' not supported.` });
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

  activePaymentGateways: publicProcedure.query(() =>
    prisma.paymentGateway.findMany({
      where: { is_enabled: true, gateway_key: { notIn: ["cod", "demo", "stripe", "paypal", "razorpay"] } },
      select: { id: true, gateway_key: true, label: true, mode: true, sort_priority: true },
      orderBy: { sort_priority: "asc" },
    })
  ),

  userPaymentHistory: protectedProcedure.query(async ({ ctx }) => {
    const [chapterPurchases, coinPurchases] = await Promise.all([
      prisma.chapterPurchase.findMany({
        where: { user_id: ctx.userId },
        include: { track: { select: { title: true, track_number: true } } },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
      prisma.payment.findMany({
        where: { user_id: ctx.userId },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
    ]);

    const chapterItems = chapterPurchases.map(p => ({
      id: p.id,
      type: "chapter" as const,
      title: p.track?.title ?? `Chapter ${p.track?.track_number ?? ""}`,
      amount: p.price,
      currency: "BDT",
      method: p.payment_method,
      status: p.payment_status,
      transaction_id: p.transaction_id,
      created_at: p.created_at.toISOString(),
    }));

    const coinItems = coinPurchases.map(p => ({
      id: p.id,
      type: (p.subscription_id ? "subscription" : "order") as "subscription" | "order",
      title: p.subscription_id ? "সাবস্ক্রিপশন" : "অর্ডার পেমেন্ট",
      amount: p.amount,
      currency: "BDT",
      method: p.method,
      status: p.status,
      transaction_id: p.transaction_id,
      created_at: p.created_at.toISOString(),
    }));

    return [...chapterItems, ...coinItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
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
