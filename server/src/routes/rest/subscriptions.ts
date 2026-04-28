import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

export const subscriptionsRestRouter = Router();

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
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

subscriptionsRestRouter.get("/my", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const subscriptions = await prisma.userSubscription.findMany({
      where: { user_id: req.auth.userId! },
      include: { plan: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        plan_id: s.plan_id,
        status: s.status,
        start_date: s.start_date,
        end_date: s.end_date,
        subscription_plans: { name: s.plan.name },
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
