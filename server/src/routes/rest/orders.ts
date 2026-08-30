import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { calculateEarnings } from "../../lib/earnings.js";
import { priceOrder } from "../../lib/orderPricing.js";
import * as redx from "../../services/redx.service.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";
import { cancelOrder, OrderCancelError } from "../../services/orderCancel.service.js";

type GatewayConfig = Record<string, unknown>;

function asGatewayConfig(value: unknown): GatewayConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as GatewayConfig;
  return {};
}

function readConfigString(config: GatewayConfig, key: string): string | undefined {
  const value = config[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveRedirectUrl(urlOrPath: string | undefined, baseOrigin: string, defaultAbsoluteUrl: string): string {
  if (!urlOrPath) return defaultAbsoluteUrl;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const origin = baseOrigin.replace(/\/$/, "");
  return `${origin}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;
}

export const ordersRestRouter = Router();

// GET /orders/payment-gateways — mirrors tRPC orders.paymentGateways
ordersRestRouter.get("/payment-gateways", async (_req, res) => {
  try {
    const gateways = await prisma.paymentGateway.findMany({
      where: { is_enabled: true },
      // Explicit projection — never spread this row. `config` holds live
      // gateway credentials (SSLCommerz store_password, bKash app_secret /
      // username / password) in plaintext, and this endpoint is unauthenticated.
      // A bare findMany here published those to anyone who called it.
      select: {
        id: true,
        gateway_key: true,
        label: true,
        mode: true,
        sort_priority: true,
        is_enabled: true,
        web_enabled: true,
      },
      orderBy: { sort_priority: "asc" },
    });
    res.json(gateways);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /orders — list user's orders (mirrors tRPC orders.myOrders)
ordersRestRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    const orders = await prisma.order.findMany({
      where: { user_id: req.auth.userId! },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { created_at: "desc" },
      include: {
        items: {
          include: {
            book_format: {
              include: { book: { select: { id: true, title: true, cover_url: true } } },
            },
          },
        },
        payments: true,
      },
    });

    let nextCursor: string | undefined;
    if (orders.length > limit) {
      nextCursor = orders.pop()!.id;
    }

    const resolvedOrders = orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        book_format: item.book_format
          ? {
              ...item.book_format,
              book: item.book_format.book
                ? { ...item.book_format.book, cover_url: resolveFileUrl(item.book_format.book.cover_url) }
                : null,
            }
          : null,
      })),
    }));
    res.json({ orders: resolvedOrders, nextCursor });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// POST /orders — place a full order (mirrors tRPC orders.placeOrder)
ordersRestRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const {
      items,
      payment_method,
      coupon_code,
      coupon_discount,
      applied_coupon_id,
      grand_total,
      shipping_name,
      shipping_phone,
      shipping_address,
      shipping_city,
      shipping_district,
      shipping_area,
      shipping_zip,
      shipping_method_id,
      shipping_method_name,
      shipping_carrier,
      shipping_cost,
      estimated_delivery_days,
      total_weight,
      packaging_cost,
      shipping_area_id,
      // wallet extension
      coin_amount,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items array is required" });
      return;
    }
    if (!payment_method) {
      res.status(400).json({ error: "payment_method is required" });
      return;
    }

    const hardcopyItems = items.filter((i: any) => i.format === "hardcopy");
    const digitalItems = items.filter((i: any) => i.format !== "hardcopy");

    // ── Idempotency: reuse a recent pending/awaiting order for same items ──
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const inputKeys = items.map((i: any) => `${i.book_id}:${i.format}`).sort().join(",");
    const recentPending = await prisma.order.findFirst({
      where: {
        user_id: userId,
        status: { in: ["pending", "awaiting_payment"] },
        payment_method,
        created_at: { gte: fiveMinutesAgo },
      },
      include: { items: { select: { book_id: true, format: true } }, payments: { select: { status: true } } },
      orderBy: { created_at: "desc" },
    });
    if (recentPending) {
      const existingKeys = recentPending.items.map((i: any) => `${i.book_id}:${i.format}`).sort().join(",");
      if (existingKeys === inputKeys) {
        res.json({
          order_id: recentPending.id,
          order_number: recentPending.order_number,
          status: recentPending.status,
          payment_status: recentPending.payments[0]?.status ?? null,
          gateway_url: null,
        });
        return;
      }
    }

    // Stock check for hardcopy items — mirrors tRPC
    for (const item of hardcopyItems) {
      const fmt = await prisma.bookFormat.findFirst({
        where: { book_id: item.book_id, format: "hardcopy" },
        select: { in_stock: true, stock_count: true },
      });
      if (!fmt?.in_stock || (fmt.stock_count !== null && fmt.stock_count < (item.quantity ?? 1))) {
        const title = item.book_title || item.book_id;
        res.status(400).json({ error: `"${title}" is out of stock` });
        return;
      }
    }

    // Duplicate purchase check for digital items — mirrors tRPC
    for (const item of digitalItems) {
      const [purchase, unlock] = await Promise.all([
        prisma.userPurchase.findFirst({
          where: { user_id: userId, book_id: item.book_id, format: item.format, status: "active" },
        }),
        prisma.contentUnlock.findFirst({
          where: { user_id: userId, book_id: item.book_id, format: item.format, status: "active" },
        }),
      ]);
      if (purchase || unlock) {
        const title = item.book_title || item.book_id;
        res.status(400).json({ error: `"${title}" (${item.format}) is already unlocked` });
        return;
      }
    }

    // Look up BookFormat ids (mirrors tRPC bookFormatMap lookup)
    const bookFormatMap: Record<string, string | undefined> = {};
    // ── Authoritative pricing ──────────────────────────────────────────────
    // Line prices, coupon discount and grand total are all resolved server-side.
    // grand_total / item.price / coupon_discount from the client are treated as
    // a cross-check only — see lib/orderPricing.ts. Previously the client's
    // grand_total won outright, so any total could be charged for any cart.
    const pricing = await priceOrder({
      userId,
      items: items.map((i: any) => ({
        book_id: i.book_id,
        format: i.format,
        quantity: i.quantity,
        title: i.book_title ?? i.title,
      })),
      couponCode: coupon_code ?? null,
      shippingCost: shipping_cost ?? null,
      clientTotal: grand_total !== undefined ? Number(grand_total) : null,
    });
    const finalGrandTotal = pricing.total;
    const pricedByKey = new Map(pricing.items.map((i) => [`${i.book_id}:${i.format}`, i]));
    for (const pi of pricing.items) {
      bookFormatMap[`${pi.book_id}:${pi.format}`] = pi.book_format_id ?? undefined;
    }

    const isCod = payment_method === "cod";
    const isDemo = payment_method === "demo";
    const isMobile = payment_method === "bkash" || payment_method === "nagad";
    const isSSLCommerz = payment_method === "sslcommerz";
    const isWallet = payment_method === "wallet" || payment_method === "coins";

    // Non-production stub — must not be reachable on a live deployment.
    if (isDemo && process.env.ALLOW_DEMO_PAYMENTS !== "true") {
      res.status(400).json({ error: "Unsupported payment method" });
      return;
    }

    // Wallet/coins payment: verify balance before creating order
    if (isWallet) {
      const coinsToSpend = Number(coin_amount ?? 0);
      if (coinsToSpend <= 0) {
        res.status(400).json({ error: "coin_amount is required for wallet payment" });
        return;
      }
      const wallet = await prisma.userCoin.findUnique({ where: { user_id: userId } });
      if (!wallet || wallet.balance < coinsToSpend) {
        res.status(400).json({ error: "Insufficient coin balance" });
        return;
      }
    }

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        user_id: userId,
        order_number: orderNumber,
        total_amount: finalGrandTotal,
        status: "pending",
        payment_method,
        coupon_code: pricing.coupon_code,
        discount_amount: pricing.discount || null,
        shipping_name: shipping_name || null,
        shipping_phone: shipping_phone || null,
        shipping_address: shipping_address || null,
        shipping_city: shipping_city || null,
        shipping_district: shipping_district || null,
        shipping_area: shipping_area || null,
        shipping_zip: shipping_zip || null,
        shipping_method_id: shipping_method_id || null,
        shipping_method_name: shipping_method_name || null,
        shipping_carrier: shipping_carrier || null,
        shipping_cost: pricing.shipping_cost || null,
        estimated_delivery_days: estimated_delivery_days || null,
        total_weight: total_weight || null,
        packaging_cost: packaging_cost || null,
        items: {
          create: pricing.items.map((item) => ({
            book_id: item.book_id,
            book_format_id: item.book_format_id,
            format: item.format,
            quantity: item.quantity,
            price: item.price,
            discount_amount: item.discount_amount,
          })),
        },
        status_history: { create: { new_status: "pending", changed_by: userId } },
      },
    });

    // Create payment record — mirrors tRPC
    const txnId = isDemo
      ? `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      : isWallet
        ? `WALLET-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        : !isCod
          ? `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
          : null;

    await prisma.payment.create({
      data: {
        user_id: userId,
        order_id: order.id,
        amount: finalGrandTotal,
        method: payment_method,
        status: isCod ? "cod_pending" : isDemo || isWallet ? "paid" : "awaiting_payment",
        transaction_id: txnId,
      },
    });

    // Fulfil immediately only for the gated demo stub and for wallet/coin
    // payments (where the coins are actually debited below — real value moves).
    // bkash/nagad used to land here too, unlocking paid content before any
    // gateway call; they now wait for /payments/bkash/callback-order.
    const shouldFulfill = isDemo || isWallet;
    if (shouldFulfill) {
      const createdItems = await prisma.orderItem.findMany({
        where: { order_id: order.id },
        select: { id: true, book_id: true, format: true, price: true },
      });
      const itemIdMap: Record<string, string> = {};
      for (const ci of createdItems) {
        itemIdMap[`${ci.book_id}:${ci.format}`] = ci.id;
      }

      for (const item of digitalItems) {
        const priced = pricedByKey.get(`${item.book_id}:${item.format}`);
        // Net of the allocated discount, so earnings reconcile with the ledger.
        const saleAmount = priced ? priced.net_amount : 0;
        await prisma.userPurchase.create({
          data: {
            user_id: userId,
            book_id: item.book_id,
            format: item.format,
            amount: saleAmount,
            payment_method,
            status: "active",
            order_id: order.id,
          },
        });
        await prisma.contentUnlock.upsert({
          where: { user_id_book_id_format: { user_id: userId, book_id: item.book_id, format: item.format } },
          create: { user_id: userId, book_id: item.book_id, format: item.format, status: "active", unlock_method: "purchase" },
          update: { status: "active" },
        });
        await calculateEarnings({
          bookId: item.book_id,
          format: item.format,
          saleAmount,
          orderId: order.id,
          orderItemId: itemIdMap[`${item.book_id}:${item.format}`] ?? null,
        });
      }

      await prisma.order.update({ where: { id: order.id }, data: { status: "confirmed" } });

    }

    // Deduct coins for wallet payment
    if (isWallet) {
      const coinsToSpend = Number(coin_amount ?? 0);
      await prisma.$transaction([
        prisma.coinTransaction.create({
          data: {
            user_id: userId,
            amount: -coinsToSpend,
            type: "spend",
            description: `Order payment - ${order.order_number}`,
            source: "order_payment",
            reference_id: order.id,
          },
        }),
        prisma.userCoin.update({
          where: { user_id: userId },
          data: { balance: { decrement: coinsToSpend }, total_spent: { increment: coinsToSpend } },
        }),
      ]);
    }

    // Record coupon usage — mirrors tRPC
    if (pricing.coupon_id && pricing.discount > 0) {
      await prisma.couponUsage.create({
        data: {
          coupon_id: pricing.coupon_id,
          user_id: userId,
          order_id: order.id,
          discount_amount: pricing.discount,
        },
      });
      await prisma.coupon.update({
        where: { id: pricing.coupon_id },
        data: { used_count: { increment: 1 } },
      });
    }

    // Auto-create RedX parcel for hardcopy orders with a delivery area ID
    if (hardcopyItems.length > 0 && shipping_area_id) {
      try {
        const pickupStoreId = process.env.REDX_PICKUP_STORE_ID
          ? Number(process.env.REDX_PICKUP_STORE_ID)
          : undefined;
        const weightGrams = String(Math.round((Number(total_weight) || 0.5) * 1000));
        const { tracking_id } = await redx.createParcel({
          customer_name: shipping_name ?? "Customer",
          customer_phone: shipping_phone ?? "",
          delivery_area: shipping_area ?? "",
          delivery_area_id: Number(shipping_area_id),
          customer_address: shipping_address ?? "",
          cash_collection_amount: String(isCod ? finalGrandTotal : 0),
          parcel_weight: weightGrams,
          merchant_invoice_id: orderNumber,
          value: String(finalGrandTotal),
          pickup_store_id: pickupStoreId,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { redx_tracking_id: tracking_id, redx_area_id: Number(shipping_area_id) },
        });
      } catch (err) {
        console.error("[RedX] parcel creation failed for order", orderNumber, err);
      }
    }

    // SSLCommerz — mirrors tRPC placeOrder SSLCommerz block exactly
    if (isSSLCommerz) {
      const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
      if (!gateway || !gateway.is_enabled) {
        res.status(400).json({ error: "SSLCommerz is not enabled" });
        return;
      }
      const gatewayConfig = asGatewayConfig(gateway.config);
      const mode = gateway.mode === "live" ? "live" : "test";
      const storeId = readConfigString(gatewayConfig, "store_id") || process.env.SSLCOMMERZ_STORE_ID;
      const storePassword = readConfigString(gatewayConfig, "store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
      if (!storeId || !storePassword) {
        res.status(400).json({ error: "SSLCommerz credentials are missing" });
        return;
      }

      const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
      const backendBaseUrl = (
        process.env.BACKEND_URL ||
        process.env.SERVER_URL ||
        process.env.PUBLIC_API_URL ||
        `http://localhost:${process.env.PORT || "3001"}`
      ).replace(/\/$/, "");

      const successUrl = resolveRedirectUrl(
        readConfigString(gatewayConfig, "success_url"),
        frontendBaseUrl,
        `${frontendBaseUrl}/payment/callback?status=success`
      );
      const failUrl = resolveRedirectUrl(
        readConfigString(gatewayConfig, "fail_url"),
        frontendBaseUrl,
        `${frontendBaseUrl}/payment/callback?status=failed`
      );
      const cancelUrl = resolveRedirectUrl(
        readConfigString(gatewayConfig, "cancel_url"),
        frontendBaseUrl,
        `${frontendBaseUrl}/payment/callback?status=cancelled`
      );
      const ipnUrl = resolveRedirectUrl(
        readConfigString(gatewayConfig, "ipn_url"),
        backendBaseUrl,
        `${backendBaseUrl}/api/v1/payments/sslcommerz/ipn`
      );

      const callbackSuccess = `${backendBaseUrl}/api/v1/payments/sslcommerz/success`;
      const callbackFail = `${backendBaseUrl}/api/v1/payments/sslcommerz/fail`;
      const callbackCancel = `${backendBaseUrl}/api/v1/payments/sslcommerz/cancel`;

      const payload = new URLSearchParams({
        store_id: storeId,
        store_passwd: storePassword,
        total_amount: String(finalGrandTotal),
        currency: "BDT",
        tran_id: txnId || order.id,
        success_url: `${callbackSuccess}?redirect=${encodeURIComponent(successUrl)}`,
        fail_url: `${callbackFail}?redirect=${encodeURIComponent(failUrl)}`,
        cancel_url: `${callbackCancel}?redirect=${encodeURIComponent(cancelUrl)}`,
        ipn_url: ipnUrl,
        product_name: order.order_number,
        product_category: "Book",
        product_profile: "general",
        cus_name: shipping_name || "Customer",
        cus_email: `${userId}@boiaro.local`,
        cus_add1: shipping_address || "N/A",
        cus_city: shipping_city || "N/A",
        cus_postcode: shipping_zip || "0000",
        cus_country: "Bangladesh",
        cus_phone: shipping_phone || "00000000000",
        ship_name: shipping_name || "Customer",
        ship_add1: shipping_address || "N/A",
        ship_city: shipping_city || "N/A",
        ship_state: shipping_district || shipping_city || "N/A",
        ship_postcode: shipping_zip || "0000",
        ship_country: "Bangladesh",
        shipping_method: shipping_method_name || "NO",
        num_of_item: String(items.length),
      });

      const initUrl = mode === "live"
        ? "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
        : "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";

      const response = await fetch(initUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload.toString(),
      });
      const raw = await response.text();
      let data: any = null;
      try { data = JSON.parse(raw); } catch { data = { status: "FAILED", message: raw }; }

      await prisma.paymentEvent.create({
        data: {
          order_id: order.id,
          gateway: "sslcommerz",
          event_type: "initiate",
          status: String(data?.status || "unknown").toLowerCase(),
          transaction_id: txnId || order.id,
          amount: finalGrandTotal,
          raw_response: data,
          currency: "BDT",
        },
      });

      const gatewayUrl: string | undefined = data?.GatewayPageURL;
      if (!response.ok || !gatewayUrl) {
        res.status(400).json({ error: data?.failedreason || data?.message || "Failed to initiate SSLCommerz payment" });
        return;
      }

      // Same response shape as tRPC
      res.status(201).json({ orderId: order.id, gatewayUrl });
      return;
    }

    // Same response shape as tRPC for non-SSLCommerz
    res.status(201).json({ orderId: order.id, gatewayUrl: null });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /orders/:order_id/tracking — get RedX tracking events for user's order
ordersRestRouter.get("/:order_id/tracking", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.order_id), user_id: req.auth.userId! },
      select: { redx_tracking_id: true },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (!order.redx_tracking_id) {
      res.status(404).json({ error: "No tracking info available for this order" });
      return;
    }
    const data = await redx.trackParcel(order.redx_tracking_id);
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// PATCH /orders/:order_id — cancel an order (user-initiated; reverses access/coins/RedX)
ordersRestRouter.patch("/:order_id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, note } = req.body;
    if (status !== "cancelled") {
      res.status(400).json({ error: "Only status=cancelled is allowed via this endpoint" });
      return;
    }
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.order_id), user_id: req.auth.userId! },
      select: { id: true },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    await cancelOrder(order.id, { changedBy: req.auth.userId!, note, actor: "customer" });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrderCancelError) {
      res.status(400).json({ error: error.message });
      return;
    }
    sendHttpError(res, error);
  }
});

// GET /orders/:order_id — get order details (mirrors tRPC orders.byId)
ordersRestRouter.get("/:order_id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.order_id), user_id: req.auth.userId! },
      include: {
        items: {
          include: {
            book_format: { include: { book: true } },
          },
        },
        payments: true,
        status_history: { orderBy: { created_at: "desc" } },
      },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (error) {
    sendHttpError(res, error);
  }
});
