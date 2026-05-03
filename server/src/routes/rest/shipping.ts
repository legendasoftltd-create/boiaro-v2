import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { BANGLADESH_DISTRICTS, isDhakaArea } from "../../data/bangladesh-districts.js";
import * as redx from "../../services/redx.service.js";

// Maps RedX delivery statuses to our order statuses
const REDX_STATUS_MAP: Record<string, string> = {
  "ready-for-delivery":   "pickup_received",   // RedX collected parcel from merchant
  "delivery-in-progress": "in_transit",         // Rider dispatched
  "delivered":            "delivered",
  "agent-hold":           "in_transit",         // On hold at agent, still in transit
  "agent-returning":      "returned",
  "returned":             "returned",
  "agent-area-change":    "in_transit",
};

export const shippingRestRouter = Router();

shippingRestRouter.get("/methods", async (req, res) => {
  try {
    const districtId = typeof req.query.districtId === "string" ? req.query.districtId : undefined;
    void districtId;

    const methods = await prisma.shippingMethod.findMany({
      where: { is_active: true },
      orderBy: { base_cost: "asc" },
    });

    res.json(methods);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.get("/districts", async (_req, res) => {
  try {
    res.json({
      districts: BANGLADESH_DISTRICTS.map((name) => ({
        name,
        is_dhaka_area: isDhakaArea(name),
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── RedX ──────────────────────────────────────────────────────────────────────

shippingRestRouter.get("/redx/areas", async (req, res) => {
  try {
    const post_code = typeof req.query.post_code === "string" ? req.query.post_code : undefined;
    const district_name = typeof req.query.district_name === "string" ? req.query.district_name : undefined;
    const data = await redx.getAreas({ post_code, district_name });
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.get("/redx/track/:parcel_id", async (req, res) => {
  try {
    const data = await redx.trackParcel(req.params.parcel_id);
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.get("/redx/parcel/:tracking_id", async (req, res) => {
  try {
    const data = await redx.getParcelInfo(req.params.tracking_id);
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.post("/redx/parcel", async (req, res) => {
  try {
    const data = await redx.createParcel(req.body);
    res.status(201).json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.post("/redx/parcel/:tracking_id/cancel", async (req, res) => {
  try {
    const reason = typeof req.body.reason === "string" ? req.body.reason : undefined;
    const data = await redx.cancelParcel(req.params.tracking_id, reason);
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.get("/redx/pickup-stores", async (_req, res) => {
  try {
    const data = await redx.getPickupStores();
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.get("/redx/pickup-stores/:id", async (req, res) => {
  try {
    const data = await redx.getPickupStore(Number(req.params.id));
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.post("/redx/pickup-stores", async (req, res) => {
  try {
    const data = await redx.createPickupStore(req.body);
    res.status(201).json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.get("/redx/charge", async (req, res) => {
  try {
    const data = await redx.calculateCharge({
      delivery_area_id: Number(req.query.delivery_area_id),
      pickup_area_id: Number(req.query.pickup_area_id),
      cash_collection_amount: Number(req.query.cash_collection_amount),
      weight: Number(req.query.weight),
    });
    res.json(data);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── RedX Webhook ──────────────────────────────────────────────────────────────
// RedX POSTs here when parcel status changes.
// Configure this URL in the RedX dashboard: https://<your-domain>/api/v1/shipping/redx/webhook
shippingRestRouter.post("/redx/webhook", async (req, res) => {
  try {
    const secret = process.env.REDX_WEBHOOK_SECRET;
    if (secret && req.query.token !== secret) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { tracking_number, status, message_en } = req.body as {
      tracking_number?: string;
      status?: string;
      message_en?: string;
    };

    if (!tracking_number || !status) {
      res.status(400).json({ message: "Missing tracking_number or status" });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { redx_tracking_id: tracking_number },
    });

    if (!order) {
      // Not our order — acknowledge and ignore
      res.json({ received: true });
      return;
    }

    const newStatus = REDX_STATUS_MAP[status];
    if (newStatus && newStatus !== order.status) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: newStatus },
      });
      await prisma.orderStatusHistory.create({
        data: {
          order_id: order.id,
          old_status: order.status,
          new_status: newStatus,
          changed_by: "redx-webhook",
          note: message_en ?? status,
        },
      });
      console.log(`[RedX Webhook] Order ${order.order_number}: ${order.status} → ${newStatus} (${status})`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("[RedX Webhook] error:", error);
    // Always return 200 to RedX so it doesn't keep retrying
    res.json({ received: true });
  }
});
