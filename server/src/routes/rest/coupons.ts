import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

export const couponsRestRouter = Router();

// GET /coupons/:code — get coupon details (public, basic info)
couponsRestRouter.get("/:code", async (req, res) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const coupon = await prisma.coupon.findFirst({
      where: { code, status: "active" },
      select: {
        id: true,
        code: true,
        discount_type: true,
        discount_value: true,
        applies_to: true,
        description: true,
        start_date: true,
        end_date: true,
        min_order_amount: true,
        first_order_only: true,
        per_user_limit: true,
        usage_limit: true,
        used_count: true,
      },
    });

    if (!coupon) {
      res.status(404).json({ error: "Coupon not found or inactive" });
      return;
    }

    const now = new Date();
    if (coupon.start_date && coupon.start_date > now) {
      res.status(400).json({ error: "Coupon not yet active" });
      return;
    }
    if (coupon.end_date && coupon.end_date < now) {
      res.status(400).json({ error: "Coupon has expired" });
      return;
    }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      res.status(400).json({ error: "Coupon usage limit reached" });
      return;
    }

    res.json({
      id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      applies_to: coupon.applies_to,
      description: coupon.description,
      min_order_amount: coupon.min_order_amount,
      first_order_only: coupon.first_order_only,
      end_date: coupon.end_date,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// POST /coupons/validate — validate a coupon against order details
// Body: { code, total_amount, has_hardcopy?, has_ebook?, has_audiobook?,
//         items?: [{book_id, amount}] }
// items is used to scope book/category coupons to the eligible subtotal.
couponsRestRouter.post("/validate", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const {
      code,
      total_amount,
      has_hardcopy = false,
      has_ebook = false,
      has_audiobook = false,
      items = [] as { book_id: string; amount: number }[],
    } = req.body;

    if (!code || total_amount === undefined) {
      res.status(400).json({ error: "code and total_amount are required" });
      return;
    }

    const coupon = await prisma.coupon.findFirst({
      where: { code: String(code).toUpperCase(), status: "active" },
      include: { books: { select: { book_id: true } } },
    });

    if (!coupon) {
      res.status(400).json({ error: "Invalid coupon code" });
      return;
    }

    const now = new Date();
    if (coupon.start_date && coupon.start_date > now) {
      res.status(400).json({ error: "Coupon not yet active" });
      return;
    }
    if (coupon.end_date && coupon.end_date < now) {
      res.status(400).json({ error: "Coupon has expired" });
      return;
    }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      res.status(400).json({ error: "Coupon usage limit reached" });
      return;
    }
    if (coupon.min_order_amount && Number(total_amount) < coupon.min_order_amount) {
      res.status(400).json({ error: `Minimum order amount ৳${coupon.min_order_amount} required` });
      return;
    }

    if (coupon.applies_to === "hardcopy" && !has_hardcopy) {
      res.status(400).json({ error: "This coupon is for hardcopy orders only" });
      return;
    }
    if (coupon.applies_to === "ebook" && !has_ebook) {
      res.status(400).json({ error: "This coupon is for ebook orders only" });
      return;
    }
    if (coupon.applies_to === "audiobook" && !has_audiobook) {
      res.status(400).json({ error: "This coupon is for audiobook orders only" });
      return;
    }

    // Book-specific: only enforce when items are provided (published mobile apps may not send items)
    if (coupon.applies_to === "books" && (items as { book_id: string }[]).length > 0) {
      const allowedIds = new Set(coupon.books.map((b) => b.book_id));
      const cartIds = (items as { book_id: string }[]).map((i) => i.book_id);
      if (!cartIds.some((id) => allowedIds.has(id))) {
        res.status(400).json({ error: "This coupon is not valid for any book in your cart" });
        return;
      }
    }

    // Category-specific: only enforce when items are provided (published mobile apps may not send items)
    if (coupon.applies_to === "category" && coupon.category_id && (items as { book_id: string }[]).length > 0) {
      const cartIds = (items as { book_id: string }[]).map((i) => i.book_id);
      const matchCount = await prisma.book.count({
        where: { id: { in: cartIds }, category_id: coupon.category_id },
      });
      if (matchCount === 0) {
        res.status(400).json({ error: "This coupon is not valid for any book in your cart" });
        return;
      }
    }

    if (coupon.per_user_limit && coupon.per_user_limit > 0) {
      const usageCount = await prisma.couponUsage.count({
        where: { coupon_id: coupon.id, user_id: userId },
      });
      if (usageCount >= coupon.per_user_limit) {
        res.status(400).json({ error: "You have already used this coupon" });
        return;
      }
    }

    if (coupon.first_order_only) {
      const orderCount = await prisma.order.count({
        where: {
          user_id: userId,
          status: { in: ["confirmed", "paid", "completed", "delivered"] },
        },
      });
      if (orderCount > 0) {
        res.status(400).json({ error: "This coupon is for first-time orders only" });
        return;
      }
    }

    // Compute eligible base amount for discount
    let eligibleAmount = Number(total_amount);
    if (coupon.applies_to === "books" && items.length > 0) {
      const allowedIds = new Set(coupon.books.map((b) => b.book_id));
      eligibleAmount = (items as { book_id: string; amount: number }[])
        .filter((i) => allowedIds.has(i.book_id))
        .reduce((s, i) => s + Number(i.amount), 0);
    } else if (coupon.applies_to === "category" && coupon.category_id && items.length > 0) {
      const cartIds = (items as { book_id: string }[]).map((i) => i.book_id);
      const matchingBooks = await prisma.book.findMany({
        where: { id: { in: cartIds }, category_id: coupon.category_id },
        select: { id: true },
      });
      const matchingIds = new Set(matchingBooks.map((b) => b.id));
      eligibleAmount = (items as { book_id: string; amount: number }[])
        .filter((i) => matchingIds.has(i.book_id))
        .reduce((s, i) => s + Number(i.amount), 0);
    }

    const discount_amount =
      coupon.discount_type === "percentage"
        ? Math.min(eligibleAmount, (eligibleAmount * coupon.discount_value) / 100)
        : Math.min(eligibleAmount, coupon.discount_value);

    const amount = Number(total_amount);
    res.json({
      valid: true,
      coupon_id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      applies_to: coupon.applies_to,
      eligible_amount: eligibleAmount,
      discount_amount,
      final_amount: Math.max(0, amount - discount_amount),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
