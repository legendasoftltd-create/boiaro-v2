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

// GET /subscriptions/status — quick active-subscription summary for mobile UI
subscriptionsRestRouter.get("/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sub = await prisma.userSubscription.findFirst({
      where: {
        user_id: req.auth.userId!,
        status: "active",
        OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
      },
      include: { plan: { select: { name: true, features: true } } },
      orderBy: { created_at: "desc" },
    });

    const now = new Date();
    const daysRemaining = sub?.end_date
      ? Math.max(0, Math.ceil((sub.end_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    res.json({
      is_subscribed: !!sub,
      status: sub?.status ?? null,
      plan_name: sub?.plan?.name ?? null,
      plan_features: sub?.plan?.features ?? null,
      end_date: sub?.end_date ?? null,
      days_remaining: daysRemaining,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /subscriptions/my — current user's subscription history (paginated)
subscriptionsRestRouter.get("/my", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const where = { user_id: req.auth.userId! };

    const [subscriptions, total] = await Promise.all([
      prisma.userSubscription.findMany({
        where,
        include: { plan: { select: { name: true, description: true, features: true } } },
        orderBy: { created_at: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.userSubscription.count({ where }),
    ]);

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
        created_at: s.created_at,
        subscription_plans: {
          name: s.plan.name,
          description: s.plan.description,
          features: s.plan.features,
        },
      })),
      total,
      limit,
      offset,
      has_more: offset + limit < total,
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

// POST /subscriptions/cancel — cancel the current active subscription
// Access remains until end_date; status is set to "cancelled" immediately.
subscriptionsRestRouter.post("/cancel", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;

    const sub = await prisma.userSubscription.findFirst({
      where: {
        user_id: userId,
        status: "active",
        OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
      },
      orderBy: { created_at: "desc" },
    });

    if (!sub) {
      res.status(404).json({ error: "No active subscription to cancel" });
      return;
    }

    await prisma.userSubscription.update({
      where: { id: sub.id },
      data: { status: "cancelled" },
    });

    res.json({
      success: true,
      message: "Subscription cancelled. You retain access until the end of the billing period.",
      subscription_id: sub.id,
      end_date: sub.end_date,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// POST /subscriptions/subscribe — initiate subscription (requires payment for paid plans)
// Body: { plan_id, coupon_code?, payment_method? }
// Response (paid plan):   { requires_payment: true, gateway_url, subscription_id, transaction_id }
// Response (free plan):   { requires_payment: false, subscription: { id, status, ... } }
subscriptionsRestRouter.post("/subscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { plan_id, coupon_code, payment_method = "sslcommerz" } = req.body;

    if (!plan_id) {
      res.status(400).json({ error: "plan_id is required" });
      return;
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: plan_id } });
    if (!plan || !plan.is_active) {
      res.status(404).json({ error: "Subscription plan not found or inactive" });
      return;
    }

    // Block if user already has an active subscription
    const existingActive = await prisma.userSubscription.findFirst({
      where: {
        user_id: userId,
        status: "active",
        OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
      },
      select: { id: true, end_date: true },
    });
    if (existingActive) {
      res.status(409).json({
        error: "You already have an active subscription. Cancel your current subscription before subscribing to a new plan.",
        subscription_id: existingActive.id,
        end_date: existingActive.end_date,
      });
      return;
    }

    // Resolve coupon discount
    let resolvedDiscount = 0;
    let resolvedCouponId: string | null = null;

    if (coupon_code) {
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
    }

    const amountDue = Math.max(0, plan.price - resolvedDiscount);

    // Free plan — activate immediately, no payment needed
    if (amountDue === 0) {
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
          amount_paid: 0,
        },
      });

      if (resolvedCouponId) {
        await prisma.couponUsage.create({
          data: { coupon_id: resolvedCouponId, user_id: userId, subscription_id: sub.id, discount_amount: resolvedDiscount },
        });
        await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { used_count: { increment: 1 } } });
      }

      res.status(201).json({ requires_payment: false, subscription: { id: sub.id, status: sub.status, end_date: sub.end_date } });
      return;
    }

    // Paid plan — create pending subscription + initiate SSLCommerz
    const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
    if (!gateway || !gateway.is_enabled) {
      res.status(400).json({ error: "Payment gateway is not configured. Contact admin." });
      return;
    }

    const gatewayConfig = gateway.config as Record<string, unknown>;
    const getString = (key: string) => {
      const v = gatewayConfig[key];
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const storeId = getString("store_id") || process.env.SSLCOMMERZ_STORE_ID;
    const storePassword = getString("store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;

    if (!storeId || !storePassword) {
      res.status(400).json({ error: "Payment gateway credentials are missing. Contact admin." });
      return;
    }

    const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
    const backendBase = (process.env.BACKEND_URL || process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || "3001"}`).replace(/\/$/, "");
    const mode = gateway.mode === "live" ? "live" : "test";

    // Create pending subscription
    const sub = await prisma.userSubscription.create({
      data: {
        user_id: userId,
        plan_id: plan.id,
        status: "pending",
        coupon_code: coupon_code || null,
        discount_amount: resolvedDiscount || null,
        amount_paid: amountDue,
      },
    });

    // Reserve coupon usage at subscription creation to prevent over-use;
    // rolled back if payment fails or is cancelled.
    if (resolvedCouponId) {
      await prisma.couponUsage.create({
        data: { coupon_id: resolvedCouponId, user_id: userId, subscription_id: sub.id, discount_amount: resolvedDiscount },
      });
      await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { used_count: { increment: 1 } } });
    }

    const transactionId = `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    // Create payment record linked to subscription
    await prisma.payment.create({
      data: {
        user_id: userId,
        subscription_id: sub.id,
        amount: amountDue,
        method: payment_method,
        status: "pending",
        transaction_id: transactionId,
      },
    });

    // Initiate SSLCommerz
    const successUrl = `${backendBase}/api/v1/payments/sslcommerz/success?redirect=${encodeURIComponent(`${frontendBase}/subscription/callback?status=success`)}`;
    const failUrl    = `${backendBase}/api/v1/payments/sslcommerz/fail?redirect=${encodeURIComponent(`${frontendBase}/subscription/callback?status=failed`)}`;
    const cancelUrl  = `${backendBase}/api/v1/payments/sslcommerz/cancel?redirect=${encodeURIComponent(`${frontendBase}/subscription/callback?status=cancelled`)}`;
    const ipnUrl     = `${backendBase}/api/v1/payments/sslcommerz/ipn`;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, profile: { select: { full_name: true, phone: true } } },
    });

    const sslPayload = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePassword,
      total_amount: String(amountDue),
      currency: "BDT",
      tran_id: transactionId,
      success_url: successUrl,
      fail_url: failUrl,
      cancel_url: cancelUrl,
      ipn_url: ipnUrl,
      product_name: plan.name,
      product_category: "Subscription",
      product_profile: "general",
      cus_name: user?.profile?.full_name || "Customer",
      cus_email: user?.email || "customer@example.com",
      cus_phone: user?.profile?.phone || "01700000000",
      cus_add1: "Bangladesh",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",
      shipping_method: "NO",
      num_of_item: "1",
      emi_option: "0",
    });

    const sslBase = mode === "live"
      ? "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
      : "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";

    const sslRes = await fetch(sslBase, { method: "POST", body: sslPayload });
    const sslData = await sslRes.json() as Record<string, unknown>;

    if (sslData.status !== "SUCCESS" || !sslData.GatewayPageURL) {
      // Gateway init failed — rollback coupon reservation and mark subscription failed
      if (resolvedCouponId) {
        await prisma.couponUsage.deleteMany({ where: { subscription_id: sub.id } });
        await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { used_count: { decrement: 1 } } });
      }
      await prisma.userSubscription.update({ where: { id: sub.id }, data: { status: "failed" } });
      res.status(502).json({ error: String(sslData.failedreason || sslData.message || "Failed to initiate payment") });
      return;
    }

    res.status(201).json({
      requires_payment: true,
      gateway_url: sslData.GatewayPageURL,
      subscription_id: sub.id,
      transaction_id: transactionId,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
