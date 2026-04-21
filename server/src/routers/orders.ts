import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
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
});
