import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

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
      shippingCarrier: z.string().optional(),
      shippingCost: z.number().optional(),
      estimatedDeliveryDays: z.string().optional(),
      totalWeight: z.number().optional(),
      packagingCost: z.number().optional(),
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
        for (const item of digitalItems) {
          await prisma.userPurchase.create({
            data: { user_id: userId, book_id: item.bookId, format: item.format, amount: item.price, payment_method: input.paymentMethod, status: "active" },
          });
          await prisma.contentUnlock.upsert({
            where: { user_id_book_id_format: { user_id: userId, book_id: item.bookId, format: item.format } },
            create: { user_id: userId, book_id: item.bookId, format: item.format, status: "active", unlock_method: "purchase" },
            update: { status: "active" },
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

      // SSLCommerz: return null gateway URL until payment gateway is integrated (Phase 5)
      return { orderId: order.id, gatewayUrl: null as string | null };
    }),
});
