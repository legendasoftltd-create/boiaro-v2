import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { calculateEarnings } from "../lib/earnings.js";
import * as redx from "../services/redx.service.js";

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
    .input(z.object({ limit: z.number().default(20), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const orders = await prisma.order.findMany({
        where: { user_id: ctx.userId },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
      if (orders.length > input.limit) {
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

  paymentGateways: publicProcedure.query(() =>
    prisma.paymentGateway.findMany({
      where: { is_enabled: true },
      orderBy: { sort_priority: "asc" },
    })
  ),

  validateCoupon: protectedProcedure
    .input(z.object({
      code: z.string(),
      totalAmount: z.number(),
      hasHardcopy: z.boolean().optional(),
      hasEbook: z.boolean().optional(),
      hasAudiobook: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const coupon = await prisma.coupon.findFirst({
        where: { code: input.code.toUpperCase(), status: "active" },
      });
      if (!coupon) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid coupon code" });

      const now = new Date();
      if (coupon.start_date && coupon.start_date > now) throw new TRPCError({ code: "BAD_REQUEST", message: "Coupon not yet active" });
      if (coupon.end_date && coupon.end_date < now) throw new TRPCError({ code: "BAD_REQUEST", message: "Coupon expired" });
      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) throw new TRPCError({ code: "BAD_REQUEST", message: "Usage limit reached" });
      if (coupon.min_order_amount && input.totalAmount < coupon.min_order_amount) throw new TRPCError({ code: "BAD_REQUEST", message: `Min ৳${coupon.min_order_amount} required` });

      if (coupon.applies_to === "hardcopy" && !input.hasHardcopy) throw new TRPCError({ code: "BAD_REQUEST", message: "This coupon is for hardcopy orders only" });
      if (coupon.applies_to === "ebook" && !input.hasEbook) throw new TRPCError({ code: "BAD_REQUEST", message: "This coupon is for ebook orders only" });
      if (coupon.applies_to === "audiobook" && !input.hasAudiobook) throw new TRPCError({ code: "BAD_REQUEST", message: "This coupon is for audiobook orders only" });

      if (coupon.per_user_limit && coupon.per_user_limit > 0) {
        const usageCount = await prisma.couponUsage.count({ where: { coupon_id: coupon.id, user_id: ctx.userId } });
        if (usageCount >= coupon.per_user_limit) throw new TRPCError({ code: "BAD_REQUEST", message: "You've already used this coupon" });
      }

      if (coupon.first_order_only) {
        const orderCount = await prisma.order.count({
          where: { user_id: ctx.userId, status: { in: ["confirmed", "paid", "completed", "delivered"] } },
        });
        if (orderCount > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This coupon is for first orders only" });
      }

      const discountAmount = coupon.discount_type === "percentage"
        ? Math.min(input.totalAmount, (input.totalAmount * coupon.discount_value) / 100)
        : Math.min(input.totalAmount, coupon.discount_value);

      return { couponId: coupon.id, discountAmount, code: coupon.code };
    }),

  placeOrder: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        bookId: z.string(),
        format: z.enum(["ebook", "audiobook", "hardcopy"]),
        quantity: z.number().int().min(1).default(1),
        price: z.number(),
        bookTitle: z.string().optional(),
      })),
      paymentMethod: z.string(),
      couponCode: z.string().optional(),
      couponDiscount: z.number().optional(),
      appliedCouponId: z.string().optional(),
      grandTotal: z.number(),
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

      // Look up BookFormat ids
      const bookFormatMap: Record<string, string | undefined> = {};
      for (const item of input.items) {
        const fmt = await prisma.bookFormat.findFirst({
          where: { book_id: item.bookId, format: item.format as any },
          select: { id: true },
        });
        if (fmt) bookFormatMap[`${item.bookId}:${item.format}`] = fmt.id;
      }

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const isCod = input.paymentMethod === "cod";
      const isDemo = input.paymentMethod === "demo";
      const isMobile = input.paymentMethod === "bkash" || input.paymentMethod === "nagad";
      const isSSLCommerz = input.paymentMethod === "sslcommerz";

      const order = await prisma.order.create({
        data: {
          user_id: userId,
          order_number: orderNumber,
          total_amount: input.grandTotal,
          status: "pending",
          payment_method: input.paymentMethod,
          coupon_code: input.couponCode || null,
          discount_amount: input.couponDiscount || null,
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
          shipping_cost: input.shippingCost || null,
          estimated_delivery_days: input.estimatedDeliveryDays || null,
          total_weight: input.totalWeight || null,
          packaging_cost: input.packagingCost || null,
          items: {
            create: input.items.map(item => ({
              book_id: item.bookId,
              book_format_id: bookFormatMap[`${item.bookId}:${item.format}`] || null,
              format: item.format as any,
              quantity: item.quantity,
              price: item.price,
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
          amount: input.grandTotal,
          method: input.paymentMethod,
          status: isCod ? "cod_pending" : isDemo ? "paid" : "awaiting_payment",
          transaction_id: txnId,
        },
      });

      // Fulfill digital items for demo/mobile payments
      const shouldFulfill = isDemo || isMobile;
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
          await prisma.userPurchase.create({
            data: { user_id: userId, book_id: item.bookId, format: item.format, amount: item.price, payment_method: input.paymentMethod, status: "active" },
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
            saleAmount: item.price,
            orderId: order.id,
            orderItemId: itemIdMap[`${item.bookId}:${item.format}`] ?? null,
          });
        }
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "confirmed" },
        });
        if (isMobile) {
          await prisma.payment.updateMany({
            where: { order_id: order.id },
            data: { status: "paid", transaction_id: `${input.paymentMethod.toUpperCase()}-${Date.now()}` },
          });
        }
      }

      // Record coupon usage
      if (input.appliedCouponId && input.couponDiscount) {
        await prisma.couponUsage.create({
          data: { coupon_id: input.appliedCouponId, user_id: userId, order_id: order.id, discount_amount: input.couponDiscount },
        });
        await prisma.coupon.update({
          where: { id: input.appliedCouponId },
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
            cash_collection_amount: String(isCod ? input.grandTotal : 0),
            parcel_weight: weightGrams,
            merchant_invoice_id: orderNumber,
            value: String(input.grandTotal),
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
          total_amount: String(input.grandTotal),
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
            amount: input.grandTotal,
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

      return { orderId: order.id, gatewayUrl: null as string | null };
    }),
});
