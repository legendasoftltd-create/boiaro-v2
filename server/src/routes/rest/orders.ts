import { Router } from "express";
import { TRPCError } from "@trpc/server";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { calculateEarnings } from "../../lib/earnings.js";

export const ordersRestRouter = Router();

ordersRestRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { items, shipping_address, payment_method = "online" } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items array is required" });
      return;
    }

    let totalAmount = 0;
    const orderItems: Array<{
      book_id: string;
      book_format_id: string | null;
      format: any;
      quantity: number;
      price: number;
    }> = [];

    for (const item of items) {
      if (!item.book_id || !item.format) {
        res.status(400).json({ error: "Each item requires book_id and format" });
        return;
      }
      const fmt = await prisma.bookFormat.findFirst({
        where: { book_id: item.book_id, format: item.format },
        select: { id: true, price: true },
      });
      if (!fmt) throw new TRPCError({ code: "BAD_REQUEST", message: `Format ${item.format} not found for book ${item.book_id}` });
      const qty = item.quantity ?? 1;
      const price = Number(fmt.price ?? 0);
      totalAmount += price * qty;
      orderItems.push({ book_id: item.book_id, book_format_id: fmt.id, format: item.format, quantity: qty, price });
    }

    const orderNumber = `BOI-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        user_id: req.auth.userId!,
        order_number: orderNumber,
        total_amount: totalAmount,
        status: "pending",
        payment_method,
        shipping_name: shipping_address?.name ?? null,
        shipping_address: shipping_address?.address ?? null,
        shipping_phone: shipping_address?.phone ?? null,
        shipping_city: shipping_address?.city ?? null,
        shipping_zip: shipping_address?.zip ?? null,
        items: { create: orderItems },
        status_history: { create: { new_status: "pending", changed_by: req.auth.userId! } },
      },
    });

    res.status(201).json({
      id: order.id,
      order_number: order.order_number,
      total_amount: order.total_amount,
      status: order.status,
      payment_method: order.payment_method,
      created_at: order.created_at,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

ordersRestRouter.get("/:order_id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.order_id), user_id: req.auth.userId! },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const orderItems2 = await prisma.orderItem.findMany({
      where: { order_id: order.id },
      include: {
        book_format: { include: { book: { select: { id: true, title: true, cover_url: true, slug: true } } } },
      },
    });
    res.json({
      id: order.id,
      order_number: order.order_number,
      user_id: order.user_id,
      total_amount: order.total_amount,
      status: order.status,
      payment_method: order.payment_method,
      shipping_name: order.shipping_name,
      shipping_address: order.shipping_address,
      shipping_phone: order.shipping_phone,
      shipping_city: order.shipping_city,
      shipping_zip: order.shipping_zip,
      created_at: order.created_at,
      updated_at: order.updated_at,
      order_items: orderItems2.map((item) => ({
        id: item.id,
        book_id: item.book_id,
        format: item.format,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
        books: item.book_format?.book ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
