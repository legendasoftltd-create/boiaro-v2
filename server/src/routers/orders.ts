import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { calculateEarnings } from "../lib/earnings.js";
import { priceOrder, evaluateCoupon } from "../lib/orderPricing.js";
import * as redx from "../services/redx.service.js";
import { cancelOrder, OrderCancelError } from "../services/orderCancel.service.js";

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

export const ordersRouter = router({
  myOrders: protectedProcedure
    .input(z.object({ limit: z.number().default(20), cursor: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const orders = await prisma.order.findMany({
        where: { user_id: ctx.userId },
        take: limit + 1,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
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
      return { orders, nextCursor };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const order = await prisma.order.findFirst({
        where: { id: input.id, user_id: ctx.userId },
        include: {
          items: {
            include: {
              book_format: {
                include: { book: true },
              },
            },
          },
          payments: true,
          status_history: { orderBy: { created_at: "desc" } },
        },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      return order;
    }),

  create: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            bookFormatId: z.string(),
            quantity: z.number().int().min(1).default(1),
          })
        ),
        shippingName: z.string().optional(),
        shippingPhone: z.string().optional(),
        shippingAddress: z.string().optional(),
        shippingCity: z.string().optional(),
        shippingDistrict: z.string().optional(),
        shippingArea: z.string().optional(),
        shippingMethodId: z.string().optional(),
        couponCode: z.string().optional(),
        paymentMethod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const formats = await prisma.bookFormat.findMany({
        where: { id: { in: input.items.map((i) => i.bookFormatId) } },
        include: { book: true },
      });

      let totalAmount = 0;
      const orderItems = input.items.map((item) => {
        const fmt = formats.find((f) => f.id === item.bookFormatId);
        if (!fmt) throw new TRPCError({ code: "BAD_REQUEST", message: `Format ${item.bookFormatId} not found` });
        const price = fmt.price ?? 0;
        totalAmount += price * item.quantity;
        return {
          book_id: fmt.book_id,
          book_format_id: fmt.id,
          format: fmt.format,
          price,
          quantity: item.quantity,
        };
      });

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      return prisma.order.create({
        data: {
          user_id: ctx.userId,
          order_number: orderNumber,
          total_amount: totalAmount,
          shipping_name: input.shippingName,
          shipping_phone: input.shippingPhone,
          shipping_address: input.shippingAddress,
          shipping_city: input.shippingCity,
          shipping_district: input.shippingDistrict,
          shipping_area: input.shippingArea,
          shipping_method_id: input.shippingMethodId,
          coupon_code: input.couponCode,
          payment_method: input.paymentMethod,
          status: "pending",
          items: { create: orderItems },
          status_history: { create: { new_status: "pending", changed_by: ctx.userId } },
        },
        include: { items: true },
      });
    }),

  // Web-only (this tRPC surface has no mobile client) — must never offer
  // app-only gateways like RevenueCat/Apple IAP. Mobile uses the separate
  // REST /orders/payment-gateways endpoint, which stays unfiltered.
  paymentGateways: publicProcedure.query(() =>
    prisma.paymentGateway.findMany({
      where: { is_enabled: true, web_enabled: true },
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
    })
  ),

  // Pre-checkout quote. Delegates to the same evaluateCoupon() that
  // placeOrder uses, so the figure quoted here and the figure actually charged
  // can never drift apart — they are literally the same code path.
  validateCoupon: protectedProcedure
    .input(z.object({
      code: z.string(),
      totalAmount: z.number(),
      hasHardcopy: z.boolean().optional(),
      hasEbook: z.boolean().optional(),
      hasAudiobook: z.boolean().optional(),
      // items with amounts allow book/category-scoped discount calculation
      items: z.array(z.object({
        bookId: z.string(),
        amount: z.number(),
        format: z.enum(["ebook", "audiobook", "hardcopy"]).optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Older clients send hasHardcopy/hasEbook/hasAudiobook flags rather than
      // per-item formats; synthesise formats from them so applies_to still works.
      const flagFormats: ("ebook" | "audiobook" | "hardcopy")[] = [];
      if (input.hasHardcopy) flagFormats.push("hardcopy");
      if (input.hasEbook) flagFormats.push("ebook");
      if (input.hasAudiobook) flagFormats.push("audiobook");

      const items = (input.items ?? []).map((i, idx) => ({
        book_id: i.bookId,
        format: i.format ?? flagFormats[idx] ?? flagFormats[0],
        amount: i.amount,
      }));
      if (items.length === 0 && flagFormats.length > 0) {
        items.push({ book_id: "", format: flagFormats[0], amount: input.totalAmount });
      }

      const result = await evaluateCoupon({
        userId: ctx.userId,
        code: input.code,
        items,
        subtotal: input.totalAmount,
      });

      return {
        couponId: result.coupon_id,
        discountAmount: result.discount_amount,
        eligibleAmount: result.eligible_amount,
        code: result.code,
      };
    }),

  placeOrder: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        bookId: z.string(),
        format: z.enum(["ebook", "audiobook", "hardcopy"]),
        quantity: z.number().int().min(1).default(1),
        // Advisory only — the server reprices every line from BookFormat.price.
        // Kept in the schema so already-shipped clients keep validating.
        price: z.number().optional(),
        bookTitle: z.string().optional(),
      })),
      // Allow-list: 'demo' is a non-production stub and is refused below unless
      // ALLOW_DEMO_PAYMENTS is explicitly enabled.
      paymentMethod: z.enum(["sslcommerz", "bkash", "nagad", "cod", "wallet", "demo"]),
      couponCode: z.string().optional(),
      // Advisory only — the discount is recomputed from the coupon itself.
      couponDiscount: z.number().optional(),
      appliedCouponId: z.string().optional(),
      // Cross-check only — a mismatch against the server's total rejects the order.
      grandTotal: z.number().optional(),
      shippingName: z.string().optional(),
      shippingPhone: z.string().optional(),
      shippingAddress: z.string().optional(),
      shippingCity: z.string().optional(),
      shippingDistrict: z.string().optional(),
      shippingArea: z.string().optional(),
      shippingZip: z.string().optional(),
      shippingMethodId: z.string().optional(),
      shippingMethodName: z.string().optional(),
      shippingCarrier: z.string().nullish(),
      shippingCost: z.number().optional(),
      estimatedDeliveryDays: z.string().optional(),
      totalWeight: z.number().optional(),
      packagingCost: z.number().optional(),
      shippingAreaId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      // 'demo' short-circuits the gateway entirely, so it must never be
      // reachable in production. Opt in explicitly on staging instead.
      if (input.paymentMethod === "demo" && process.env.ALLOW_DEMO_PAYMENTS !== "true") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported payment method" });
      }

      // ── Idempotency: reuse a recent pending/awaiting order for same items ──
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const inputBookFormatKeys = input.items
        .map(i => `${i.bookId}:${i.format}`)
        .sort()
        .join(",");

      const recentPending = await prisma.order.findFirst({
        where: {
          user_id: userId,
          status: { in: ["pending", "awaiting_payment"] },
          payment_method: input.paymentMethod,
          created_at: { gte: fiveMinutesAgo },
        },
        include: { items: { select: { book_id: true, format: true } }, payments: { select: { status: true } } },
        orderBy: { created_at: "desc" },
      });

      if (recentPending) {
        const existingKeys = recentPending.items
          .map(i => `${i.book_id}:${i.format}`)
          .sort()
          .join(",");
        if (existingKeys === inputBookFormatKeys) {
          const existingPayment = recentPending.payments[0];

          // Gateway-backed methods can't be short-circuited with gatewayUrl:null
          // — the checkout page treats a null gatewayUrl as "nothing left to
          // pay", clears the cart and shows the success screen, even though the
          // order is still unpaid and the content stays locked. Fail loudly
          // instead of reporting a success that didn't happen.
          if (["sslcommerz", "bkash", "nagad"].includes(input.paymentMethod)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "A payment for these items is already in progress. Complete or cancel it before trying again.",
            });
          }

          // Return the existing order instead of creating a duplicate
          return {
            orderId: recentPending.id,
            orderNumber: recentPending.order_number,
            status: recentPending.status,
            paymentStatus: existingPayment?.status ?? null,
            gatewayUrl: null,
          };
        }
      }

      // Stock check for hardcopy items
      const hardcopyItems = input.items.filter(i => i.format === "hardcopy");
      for (const item of hardcopyItems) {
        const fmt = await prisma.bookFormat.findFirst({
          where: { book_id: item.bookId, format: "hardcopy" },
          select: { in_stock: true, stock_count: true },
        });
        if (!fmt?.in_stock || (fmt.stock_count !== null && fmt.stock_count < item.quantity)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${item.bookTitle || item.bookId}" is out of stock` });
        }
      }

      // Duplicate purchase check for digital items
      const digitalItems = input.items.filter(i => i.format !== "hardcopy");
      for (const item of digitalItems) {
        const [purchase, unlock] = await Promise.all([
          prisma.userPurchase.findFirst({ where: { user_id: userId, book_id: item.bookId, format: item.format, status: "active" } }),
          prisma.contentUnlock.findFirst({ where: { user_id: userId, book_id: item.bookId, format: item.format, status: "active" } }),
        ]);
        if (purchase || unlock) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${item.bookTitle || item.bookId}" (${item.format}) is already unlocked` });
        }
      }

      // ── Authoritative pricing ────────────────────────────────────────────
      // Every line price, the coupon discount and the grand total are resolved
      // server-side here. input.price / input.couponDiscount / input.grandTotal
      // are only cross-checked, never charged.
      const pricing = await priceOrder({
        userId,
        items: input.items.map(i => ({
          book_id: i.bookId,
          format: i.format,
          quantity: i.quantity,
          title: i.bookTitle,
        })),
        couponCode: input.couponCode ?? null,
        shippingCost: input.shippingCost ?? null,
        clientTotal: input.grandTotal ?? null,
      });
      const grandTotal = pricing.total;
      const pricedByKey = new Map(pricing.items.map(i => [`${i.book_id}:${i.format}`, i]));
      const bookFormatMap: Record<string, string | undefined> = Object.fromEntries(
        pricing.items.map(i => [`${i.book_id}:${i.format}`, i.book_format_id ?? undefined])
      );

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const isCod = input.paymentMethod === "cod";
      const isDemo = input.paymentMethod === "demo";
      const isMobile = input.paymentMethod === "bkash" || input.paymentMethod === "nagad";
      const isSSLCommerz = input.paymentMethod === "sslcommerz";

      const order = await prisma.order.create({
        data: {
          user_id: userId,
          order_number: orderNumber,
          total_amount: grandTotal,
          status: "pending",
          payment_method: input.paymentMethod,
          coupon_code: pricing.coupon_code,
          discount_amount: pricing.discount || null,
          shipping_name: input.shippingName || null,
          shipping_phone: input.shippingPhone || null,
          shipping_address: input.shippingAddress || null,
          shipping_city: input.shippingCity || null,
          shipping_district: input.shippingDistrict || null,
          shipping_area: input.shippingArea || null,
          shipping_zip: input.shippingZip || null,
          shipping_method_id: input.shippingMethodId || null,
          shipping_method_name: input.shippingMethodName || null,
          shipping_carrier: input.shippingCarrier || null,
          shipping_cost: pricing.shipping_cost || null,
          estimated_delivery_days: input.estimatedDeliveryDays || null,
          total_weight: input.totalWeight || null,
          packaging_cost: input.packagingCost || null,
          items: {
            create: pricing.items.map(item => ({
              book_id: item.book_id,
              book_format_id: item.book_format_id,
              format: item.format as any,
              quantity: item.quantity,
              price: item.price,
              discount_amount: item.discount_amount,
            })),
          },
          status_history: { create: { new_status: "pending", changed_by: userId } },
        },
      });

      // Create payment record
      const txnId = isDemo
        ? `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        : !isCod ? `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` : null;

      await prisma.payment.create({
        data: {
          user_id: userId,
          order_id: order.id,
          amount: grandTotal,
          method: input.paymentMethod,
          status: isCod ? "cod_pending" : isDemo ? "paid" : "awaiting_payment",
          transaction_id: txnId,
        },
      });

      // Fulfil immediately only for the explicitly-enabled demo stub.
      // bkash/nagad previously landed here too, which unlocked paid content
      // before a single taka moved — they now wait for their real gateway
      // callback (/api/v1/payments/bkash/callback-order), same as SSLCommerz.
      const shouldFulfill = isDemo;
      if (shouldFulfill) {
        // Fetch created order items to link earnings to the correct item IDs
        const createdItems = await prisma.orderItem.findMany({
          where: { order_id: order.id },
          select: { id: true, book_id: true, format: true, price: true },
        });
        const itemIdMap: Record<string, string> = {};
        for (const ci of createdItems) {
          itemIdMap[`${ci.book_id}:${ci.format}`] = ci.id;
        }

        for (const item of digitalItems) {
          const priced = pricedByKey.get(`${item.bookId}:${item.format}`);
          // Net of the allocated discount, so earnings reconcile with the ledger.
          const saleAmount = priced ? priced.net_amount : 0;
          await prisma.userPurchase.create({
            data: { user_id: userId, book_id: item.bookId, format: item.format, amount: saleAmount, payment_method: input.paymentMethod, status: "active", order_id: order.id },
          });
          await prisma.contentUnlock.upsert({
            where: { user_id_book_id_format: { user_id: userId, book_id: item.bookId, format: item.format } },
            create: { user_id: userId, book_id: item.bookId, format: item.format, status: "active", unlock_method: "purchase" },
            update: { status: "active" },
          });
          // Calculate and record contributor earnings
          await calculateEarnings({
            bookId: item.bookId,
            format: item.format,
            saleAmount,
            orderId: order.id,
            orderItemId: itemIdMap[`${item.bookId}:${item.format}`] ?? null,
          });
        }
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "confirmed" },
        });
        // Create accounting ledger income entry for immediately-fulfilled orders (idempotent)
        const orderSellable = Math.max(0, Number(order.total_amount || 0) - pricing.shipping_cost);
        if (orderSellable > 0) {
          const existingLedger = await prisma.accountingLedger.findFirst({
            where: { order_id: order.id, type: "income", category: "book_sale" },
          });
          if (!existingLedger) {
            await prisma.accountingLedger.create({
              data: {
                type: "income",
                category: "book_sale",
                amount: orderSellable,
                entry_date: new Date(),
                order_id: order.id,
                reference_type: "order",
                reference_id: order.id,
                description: `Order payment - ${order.order_number}`,
                source: input.paymentMethod,
              },
            });
          }
        }
      }

      // Record coupon usage — from the server's own validation, not the
      // client's claimed id/amount.
      if (pricing.coupon_id && pricing.discount > 0) {
        await prisma.couponUsage.create({
          data: { coupon_id: pricing.coupon_id, user_id: userId, order_id: order.id, discount_amount: pricing.discount },
        });
        await prisma.coupon.update({
          where: { id: pricing.coupon_id },
          data: { used_count: { increment: 1 } },
        });
      }

      // Auto-create RedX parcel for hardcopy orders that have a delivery area ID
      if (hardcopyItems.length > 0 && input.shippingAreaId) {
        try {
          const pickupStoreId = process.env.REDX_PICKUP_STORE_ID
            ? Number(process.env.REDX_PICKUP_STORE_ID)
            : undefined;
          const weightGrams = String(Math.round((input.totalWeight ?? 0.5) * 1000));
          const { tracking_id } = await redx.createParcel({
            customer_name: input.shippingName ?? "Customer",
            customer_phone: input.shippingPhone ?? "",
            delivery_area: input.shippingArea ?? "",
            delivery_area_id: input.shippingAreaId,
            customer_address: input.shippingAddress ?? "",
            cash_collection_amount: String(isCod ? grandTotal : 0),
            parcel_weight: weightGrams,
            merchant_invoice_id: orderNumber,
            value: String(grandTotal),
            pickup_store_id: pickupStoreId,
          });
          await prisma.order.update({
            where: { id: order.id },
            data: { redx_tracking_id: tracking_id, redx_area_id: input.shippingAreaId },
          });
        } catch (err) {
          // Don't fail the order if RedX is unavailable — log and continue
          console.error("[RedX] parcel creation failed for order", orderNumber, err);
        }
      }

      if (isSSLCommerz) {
        const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
        if (!gateway || !gateway.is_enabled) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "SSLCommerz is not enabled" });
        }
        const gatewayConfig = asGatewayConfig(gateway.config);
        const mode = gateway.mode === "live" ? "live" : "test";
        const storeId = readConfigString(gatewayConfig, "store_id") || process.env.SSLCOMMERZ_STORE_ID;
        const storePassword = readConfigString(gatewayConfig, "store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
        if (!storeId || !storePassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "SSLCommerz credentials are missing" });
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
          total_amount: String(grandTotal),
          currency: "BDT",
          tran_id: txnId || order.id,
          success_url: `${callbackSuccess}?redirect=${encodeURIComponent(successUrl)}`,
          fail_url: `${callbackFail}?redirect=${encodeURIComponent(failUrl)}`,
          cancel_url: `${callbackCancel}?redirect=${encodeURIComponent(cancelUrl)}`,
          ipn_url: ipnUrl,
          product_name: order.order_number,
          product_category: "Book",
          product_profile: "general",
          cus_name: input.shippingName || "Customer",
          cus_email: `${ctx.userId}@boiaro.local`,
          cus_add1: input.shippingAddress || "N/A",
          cus_city: input.shippingCity || "N/A",
          cus_postcode: input.shippingZip || "0000",
          cus_country: "Bangladesh",
          cus_phone: input.shippingPhone || "00000000000",
          ship_name: input.shippingName || "Customer",
          ship_add1: input.shippingAddress || "N/A",
          ship_city: input.shippingCity || "N/A",
          ship_state: input.shippingDistrict || input.shippingCity || "N/A",
          ship_postcode: input.shippingZip || "0000",
          ship_country: "Bangladesh",
          shipping_method: input.shippingMethodName || "NO",
          num_of_item: String(input.items.length),
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
        try {
          data = JSON.parse(raw);
        } catch {
          data = { status: "FAILED", message: raw };
        }

        await prisma.paymentEvent.create({
          data: {
            order_id: order.id,
            gateway: "sslcommerz",
            event_type: "initiate",
            status: String(data?.status || "unknown").toLowerCase(),
            transaction_id: txnId || order.id,
            amount: grandTotal,
            raw_response: data,
            currency: "BDT",
          },
        });

        const gatewayUrl: string | undefined = data?.GatewayPageURL;
        if (!response.ok || !gatewayUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: data?.failedreason || data?.message || "Failed to initiate SSLCommerz payment",
          });
        }
        return { orderId: order.id, gatewayUrl };
      }

      // ── bKash / Nagad tokenized checkout ─────────────────────────────────
      // These used to be "fulfilled" the moment the order was created, with no
      // gateway call at all — the checkout UI promised a redirect that never
      // happened. Now they initiate a real tokenized checkout and the order
      // stays awaiting_payment until /payments/bkash/callback-order executes
      // the payment against bKash and calls finalizePaidOrder().
      if (isMobile) {
        const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: input.paymentMethod } });
        if (gateway && gateway.is_enabled === false) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${input.paymentMethod} is not enabled` });
        }
        const cfg = asGatewayConfig(gateway?.config);
        const appKey = readConfigString(cfg, "app_key") || process.env.BKASH_APP_KEY;
        const appSecret = readConfigString(cfg, "app_secret") || process.env.BKASH_APP_SECRET;
        const username = readConfigString(cfg, "username") || process.env.BKASH_USERNAME;
        const password = readConfigString(cfg, "password") || process.env.BKASH_PASSWORD;
        if (!appKey || !appSecret || !username || !password) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${input.paymentMethod} credentials are missing. Contact admin.` });
        }

        const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
        const backendBase = (
          process.env.BACKEND_URL ||
          process.env.SERVER_URL ||
          process.env.PUBLIC_API_URL ||
          `http://localhost:${process.env.PORT || "3001"}`
        ).replace(/\/$/, "");
        const mode = (gateway?.mode === "live" || (!gateway?.mode && process.env.BKASH_APP_KEY)) ? "live" : "test";
        const baseUrl = mode === "live"
          ? "https://tokenized.pay.bka.sh/v1.2.0-beta"
          : "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

        const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", username, password },
          body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
        });
        const tokenData = (await tokenRes.json()) as Record<string, unknown>;
        const idToken = typeof tokenData.id_token === "string" ? tokenData.id_token : undefined;
        if (!idToken) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bKash token grant failed." });
        }

        const callbackUrl =
          `${backendBase}/api/v1/payments/bkash/callback-order` +
          `?order_id=${order.id}` +
          `&redirect=${encodeURIComponent(`${frontendBase}/payment/callback`)}`;

        const createRes = await fetch(`${baseUrl}/tokenized/checkout/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", authorization: idToken, "x-app-key": appKey },
          body: JSON.stringify({
            mode: "0011",
            payerReference: userId,
            callbackURL: callbackUrl,
            amount: grandTotal.toFixed(2),
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: orderNumber,
          }),
        });
        const createData = (await createRes.json()) as Record<string, unknown>;
        const bkashUrl = typeof createData.bkashURL === "string" ? createData.bkashURL : undefined;
        const paymentID = typeof createData.paymentID === "string" ? createData.paymentID : undefined;
        if (!bkashUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: String(createData.statusMessage || "Failed to initiate bKash payment"),
          });
        }

        await prisma.order.update({ where: { id: order.id }, data: { status: "awaiting_payment" } });
        await prisma.payment.updateMany({
          where: { order_id: order.id },
          data: { status: "awaiting_payment", transaction_id: paymentID || txnId },
        });
        await prisma.paymentEvent.create({
          data: {
            order_id: order.id,
            gateway: input.paymentMethod,
            event_type: "initiate",
            status: String(createData.statusCode || "unknown").toLowerCase(),
            transaction_id: paymentID || txnId,
            amount: grandTotal,
            raw_response: createData as any,
            currency: "BDT",
          },
        });

        return { orderId: order.id, gatewayUrl: bkashUrl };
      }

      return { orderId: order.id, gatewayUrl: null as string | null };
    }),

  // Web (tRPC) equivalent of the mobile REST PATCH /orders/:order_id cancel endpoint.
  cancel: protectedProcedure
    .input(z.object({ orderId: z.string(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findFirst({
        where: { id: input.orderId, user_id: ctx.userId },
        select: { id: true },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        await cancelOrder(order.id, { changedBy: ctx.userId, note: input.note, actor: "customer" });
      } catch (err) {
        if (err instanceof OrderCancelError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
      return { success: true };
    }),
});
