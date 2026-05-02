import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

export const subscriptionsRestRouter = Router();

// GET /subscriptions/plans — public list of active plans
subscriptionsRestRouter.get("/plans", async (_req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    });
    res.json({
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        duration_days: p.duration_days,
        features: p.features,
        is_active: p.is_active,
        is_featured: p.is_featured,
        sort_order: p.sort_order,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /subscriptions/my — current user's subscriptions
subscriptionsRestRouter.get("/my", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const subscriptions = await prisma.userSubscription.findMany({
      where: { user_id: req.auth.userId! },
      include: { plan: { select: { name: true, description: true, features: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        plan_id: s.plan_id,
        status: s.status,
        start_date: s.start_date,
        end_date: s.end_date,
        amount_paid: s.amount_paid,
        coupon_code: s.coupon_code,
        discount_amount: s.discount_amount,
        subscription_plans: {
          name: s.plan.name,
          description: s.plan.description,
          features: s.plan.features,
        },
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /subscriptions/active — user's current active subscription
subscriptionsRestRouter.get("/active", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sub = await prisma.userSubscription.findFirst({
      where: {
        user_id: req.auth.userId!,
        status: "active",
        OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
      },
      include: { plan: { select: { name: true, description: true, features: true, duration_days: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ subscription: sub ?? null });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// POST /subscriptions/subscribe — subscribe to a plan
subscriptionsRestRouter.post("/subscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { plan_id, coupon_code, coupon_discount, payment_method = "demo" } = req.body;

    if (!plan_id) {
      res.status(400).json({ error: "plan_id is required" });
      return;
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: plan_id } });
    if (!plan || !plan.is_active) {
      res.status(404).json({ error: "Subscription plan not found or inactive" });
      return;
    }

    // Validate coupon if provided
    let resolvedDiscount = Number(coupon_discount ?? 0);
    let resolvedCouponId: string | null = null;

    if (coupon_code && !coupon_discount) {
      const coupon = await prisma.coupon.findFirst({
        where: { code: String(coupon_code).toUpperCase(), status: "active" },
      });
      if (coupon) {
        const now = new Date();
        const valid =
          (!coupon.start_date || coupon.start_date <= now) &&
          (!coupon.end_date || coupon.end_date >= now) &&
          (!coupon.usage_limit || coupon.used_count < coupon.usage_limit);
        if (valid) {
          resolvedDiscount =
            coupon.discount_type === "percentage"
              ? Math.min(plan.price, (plan.price * coupon.discount_value) / 100)
              : Math.min(plan.price, coupon.discount_value);
          resolvedCouponId = coupon.id;
        }
      }
    } else if (coupon_code) {
      const coupon = await prisma.coupon.findFirst({
        where: { code: String(coupon_code).toUpperCase(), status: "active" },
      });
      if (coupon) resolvedCouponId = coupon.id;
    }

    const amountPaid = Math.max(0, plan.price - resolvedDiscount);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + (plan.duration_days || 30));

    const sub = await prisma.userSubscription.create({
      data: {
        user_id: userId,
        plan_id: plan.id,
        start_date: now,
        end_date: endDate,
        status: "active",
        coupon_code: coupon_code || null,
        discount_amount: resolvedDiscount || null,
        amount_paid: amountPaid,
      },
    });

    // Record coupon usage
    if (resolvedCouponId && resolvedDiscount) {
      await prisma.couponUsage.create({
        data: {
          coupon_id: resolvedCouponId,
          user_id: userId,
          subscription_id: sub.id,
          discount_amount: resolvedDiscount,
        },
      });
      await prisma.coupon.update({
        where: { id: resolvedCouponId },
        data: { used_count: { increment: 1 } },
      });
    }

    void payment_method; // payment gateway integration handled separately

    res.status(201).json({
      id: sub.id,
      plan_id: sub.plan_id,
      status: sub.status,
      start_date: sub.start_date,
      end_date: sub.end_date,
      amount_paid: sub.amount_paid,
      coupon_code: sub.coupon_code,
      discount_amount: sub.discount_amount,
      plan: { name: plan.name, description: plan.description, features: plan.features },
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
