import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { calculateEarnings, calculateOrderEarnings } from "../../lib/earnings.js";
import { sendNotificationEmail } from "../../lib/mailer.js";

export const paymentsRestRouter = Router();

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolveRedirectUrl(urlOrPath: string | undefined, baseOrigin: string, defaultAbsoluteUrl: string): string {
  if (!urlOrPath) return defaultAbsoluteUrl;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const origin = baseOrigin.replace(/\/$/, "");
  return `${origin}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;
}

async function finalizePaidOrder(params: { orderId: string; paymentMethod: string; transactionId?: string }) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true },
  });
  if (!order) return false;

  await prisma.payment.updateMany({
    where: { order_id: params.orderId },
    data: {
      status: "paid",
      transaction_id: params.transactionId || undefined,
    },
  });

  await calculateOrderEarnings(order.id);

  for (const item of order.items) {
    if (!item.book_id || item.format === "hardcopy") continue;
    const existingPurchase = await prisma.userPurchase.findFirst({
      where: {
        user_id: order.user_id,
        book_id: item.book_id,
        format: item.format,
      },
      select: { id: true },
    });
    if (existingPurchase) {
      await prisma.userPurchase.update({
        where: { id: existingPurchase.id },
        data: {
          status: "active",
          payment_method: params.paymentMethod,
          amount: item.price,
        },
      });
    } else {
      await prisma.userPurchase.create({
        data: {
          user_id: order.user_id,
          book_id: item.book_id,
          format: item.format,
          amount: item.price,
          payment_method: params.paymentMethod,
          status: "active",
        },
      });
    }

    await prisma.contentUnlock.upsert({
      where: {
        user_id_book_id_format: {
          user_id: order.user_id,
          book_id: item.book_id,
          format: item.format,
        },
      },
      create: {
        user_id: order.user_id,
        book_id: item.book_id,
        format: item.format,
        status: "active",
        unlock_method: "purchase",
      },
      update: { status: "active" },
    });

  }

  if (["pending", "awaiting_payment"].includes(order.status || "")) {
    await prisma.order.update({
      where: { id: params.orderId },
      data: { status: "confirmed" },
    });
  }

  const orderUser = await prisma.user.findUnique({ where: { id: order.user_id }, select: { email: true } });
  if (orderUser?.email) {
    const itemLines = order.items
      .map((i) => `<tr><td style="padding:6px 0">${i.format}</td><td style="padding:6px 0;text-align:right">৳${Number(i.price).toFixed(2)}</td></tr>`)
      .join("");
    sendNotificationEmail({
      to: orderUser.email,
      subject: `Order Confirmed – #${(order as any).order_number || order.id.slice(0, 8).toUpperCase()}`,
      templateType: "order_confirmation",
      bodyHtml: `<h2 style="color:#16a34a">Order Confirmed ✓</h2>
        <p>Thank you for your purchase! Your order has been confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="border-bottom:2px solid #e5e7eb">
            <th style="text-align:left;padding:6px 0;color:#6b7280;font-weight:500">Item</th>
            <th style="text-align:right;padding:6px 0;color:#6b7280;font-weight:500">Price</th>
          </tr></thead>
          <tbody>${itemLines}</tbody>
          <tfoot><tr style="border-top:2px solid #e5e7eb">
            <td style="padding:8px 0;font-weight:700">Total</td>
            <td style="padding:8px 0;font-weight:700;text-align:right">৳${Number(order.total_amount).toFixed(2)}</td>
          </tr></tfoot>
        </table>
        <a href="https://boiaro.com/dashboard" style="display:inline-block;padding:10px 24px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none">View My Library</a>`,
      text: `Order confirmed. Total: ৳${Number(order.total_amount).toFixed(2)}`,
    }).catch(() => {});
  }

  return true;
}

async function finalizeSubscriptionPayment(params: { subscriptionId: string; paymentMethod: string; transactionId?: string }) {
  const sub = await prisma.userSubscription.findUnique({
    where: { id: params.subscriptionId },
    include: { plan: true },
  });
  if (!sub || sub.status === "active") return false;

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + (sub.plan.duration_days || 30));

  await prisma.userSubscription.update({
    where: { id: params.subscriptionId },
    data: { status: "active", start_date: now, end_date: endDate },
  });

  await prisma.payment.updateMany({
    where: { subscription_id: params.subscriptionId },
    data: { status: "paid", transaction_id: params.transactionId || undefined },
  });

  const subUser = await prisma.user.findUnique({ where: { id: sub.user_id }, select: { email: true } });
  if (subUser?.email) {
    const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    sendNotificationEmail({
      to: subUser.email,
      subject: `Your ${sub.plan.name} subscription is now active!`,
      templateType: "subscription_activated",
      bodyHtml: `<h2 style="color:#6d28d9">Subscription Activated ✓</h2>
        <p>Your <strong>${sub.plan.name}</strong> subscription has been activated successfully.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px">
          <tr><td style="padding:8px 0;color:#6b7280">Plan</td><td style="padding:8px 0;font-weight:600">${sub.plan.name}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Valid From</td><td style="padding:8px 0">${fmt(now)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Valid Until</td><td style="padding:8px 0">${fmt(endDate)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Amount Paid</td><td style="padding:8px 0;font-weight:600">৳${Number(sub.amount_paid ?? 0).toFixed(2)}</td></tr>
        </table>`,
      text: `Your ${sub.plan.name} subscription is active until ${fmt(endDate)}.`,
    }).catch(() => {});
  }

  return true;
}

paymentsRestRouter.post("/initiate", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      res.status(400).json({ error: "order_id is required" });
      return;
    }
    const order = await prisma.order.findFirst({
      where: { id: order_id, user_id: req.auth.userId! },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const gateway = await prisma.paymentGateway.findUnique({
      where: { gateway_key: "sslcommerz" },
    });
    if (!gateway || !gateway.is_enabled) {
      res.status(400).json({ error: "SSLCommerz is not enabled" });
      return;
    }

    const gatewayConfig = asObject(gateway.config);
    const mode = gateway.mode === "live" ? "live" : "test";
    const storeId = getString(gatewayConfig, "store_id") || process.env.SSLCOMMERZ_STORE_ID;
    const storePassword = getString(gatewayConfig, "store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
    if (!storeId || !storePassword) {
      res.status(400).json({ error: "SSLCommerz credentials are missing" });
      return;
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
    const backendBaseUrl = (
      process.env.BACKEND_URL ||
      process.env.SERVER_URL ||
      process.env.PUBLIC_API_URL ||
      `http://localhost:${process.env.PORT || "3001"}`
    ).replace(/\/$/, "");

    const successUrl = resolveRedirectUrl(
      getString(gatewayConfig, "success_url"),
      frontendBaseUrl,
      `${frontendBaseUrl}/payment/callback?status=success`,
    );
    const failUrl = resolveRedirectUrl(
      getString(gatewayConfig, "fail_url"),
      frontendBaseUrl,
      `${frontendBaseUrl}/payment/callback?status=failed`,
    );
    const cancelUrl = resolveRedirectUrl(
      getString(gatewayConfig, "cancel_url"),
      frontendBaseUrl,
      `${frontendBaseUrl}/payment/callback?status=cancelled`,
    );
    const ipnUrl = resolveRedirectUrl(
      getString(gatewayConfig, "ipn_url"),
      backendBaseUrl,
      `${backendBaseUrl}/api/v1/payments/sslcommerz/ipn`,
    );

    const callbackSuccess = `${backendBaseUrl}/api/v1/payments/sslcommerz/success`;
    const callbackFail = `${backendBaseUrl}/api/v1/payments/sslcommerz/fail`;
    const callbackCancel = `${backendBaseUrl}/api/v1/payments/sslcommerz/cancel`;
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payload = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePassword,
      total_amount: String(Number(order.total_amount ?? 0)),
      currency: "BDT",
      tran_id: transactionId,
      success_url: `${callbackSuccess}?redirect=${encodeURIComponent(successUrl)}`,
      fail_url: `${callbackFail}?redirect=${encodeURIComponent(failUrl)}`,
      cancel_url: `${callbackCancel}?redirect=${encodeURIComponent(cancelUrl)}`,
      ipn_url: ipnUrl,
      product_name: order.order_number,
      product_category: "Book",
      product_profile: "general",
      cus_name: order.shipping_name || "Customer",
      cus_email: `${req.auth.userId}@boiaro.local`,
      cus_add1: order.shipping_address || "N/A",
      cus_city: order.shipping_city || "N/A",
      cus_postcode: order.shipping_zip || "0000",
      cus_country: "Bangladesh",
      cus_phone: order.shipping_phone || "00000000000",
      ship_name: order.shipping_name || "Customer",
      ship_add1: order.shipping_address || "N/A",
      ship_city: order.shipping_city || "N/A",
      ship_state: order.shipping_city || "N/A",
      ship_postcode: order.shipping_zip || "0000",
      ship_country: "Bangladesh",
      shipping_method: "NO",
      num_of_item: "1",
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
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      data = { status: "FAILED", message: raw };
    }

    const gatewayUrl = typeof data.GatewayPageURL === "string" ? data.GatewayPageURL : undefined;
    if (!response.ok || !gatewayUrl) {
      res.status(400).json({
        error: String(data.failedreason || data.message || "Failed to initiate SSLCommerz payment"),
      });
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.order.update({
        where: { id: order_id },
        data: { status: "awaiting_payment" },
      });
      const existingPayment = await tx.payment.findFirst({
        where: { order_id },
        select: { id: true },
      });
      if (existingPayment) {
        await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            method: "sslcommerz",
            status: "awaiting_payment",
            transaction_id: transactionId,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            user_id: req.auth.userId!,
            order_id,
            amount: Number(order.total_amount ?? 0),
            method: "sslcommerz",
            status: "awaiting_payment",
            transaction_id: transactionId,
          },
        });
      }
      await tx.paymentEvent.create({
        data: {
          order_id: order.id,
          gateway: "sslcommerz",
          event_type: "initiate",
          status: String(data.status || "unknown").toLowerCase(),
          transaction_id: transactionId,
          amount: Number(order.total_amount ?? 0),
          raw_response: data as any,
          currency: "BDT",
        },
      });
    });

    res.json({
      success: true,
      gateway_url: gatewayUrl,
      transaction_id: transactionId,
      raw_status: data.status || null,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

async function handleSslCommerzCallback(req: AuthenticatedRequest, res: any, status: "success" | "failed" | "cancelled") {
  const fallbackBase = process.env.FRONTEND_URL || "http://localhost:8080";
  const redirect =
    getString(asObject(req.query), "redirect") || `${fallbackBase}/payment/callback?status=${status}`;

  try {
    const payload = asObject(req.method === "POST" ? req.body : req.query);
    const tranId = getString(payload, "tran_id");
    const valId = getString(payload, "val_id");

    const payment = tranId
      ? await prisma.payment.findFirst({
          where: { transaction_id: tranId },
          include: { order: true },
        })
      : null;

    const orderId = payment?.order_id;
    const subscriptionId = payment?.subscription_id;
    const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
    const gatewayConfig = asObject(gateway?.config);
    const storeId = getString(gatewayConfig, "store_id") || process.env.SSLCOMMERZ_STORE_ID;
    const storePassword = getString(gatewayConfig, "store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
    const mode = gateway?.mode === "live" ? "live" : "test";

    let validationResponse: Record<string, unknown> | null = null;
    if (status === "success" && valId && storeId && storePassword) {
      const validationBase = mode === "live"
        ? "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
        : "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";
      const url = `${validationBase}?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePassword)}&v=1&format=json`;
      try {
        const response = await fetch(url);
        validationResponse = (await response.json()) as Record<string, unknown>;
      } catch {
        validationResponse = { status: "VALIDATION_FAILED" };
      }
    }

    await prisma.paymentEvent.create({
      data: {
        gateway: "sslcommerz",
        event_type: `callback_${status}`,
        order_id: orderId || null,
        transaction_id: tranId || null,
        status,
        raw_response: {
          payload,
          validation: validationResponse,
        } as any,
      },
    });

    const validationStatus = String(validationResponse?.status || "").toUpperCase();
    const isValidated = !validationResponse || validationStatus === "VALID" || validationStatus === "VALIDATED";

    if (status === "success" && isValidated) {
      if (orderId) {
        await finalizePaidOrder({ orderId, paymentMethod: "sslcommerz", transactionId: tranId });
      } else if (subscriptionId) {
        await finalizeSubscriptionPayment({ subscriptionId, paymentMethod: "sslcommerz", transactionId: tranId });
      }
    } else if (status !== "success") {
      if (orderId) {
        await prisma.payment.updateMany({
          where: { order_id: orderId },
          data: { status: status === "cancelled" ? "cancelled" : "failed" },
        });
      } else if (subscriptionId) {
        await prisma.payment.updateMany({
          where: { subscription_id: subscriptionId },
          data: { status: status === "cancelled" ? "cancelled" : "failed" },
        });
        await prisma.userSubscription.update({
          where: { id: subscriptionId },
          data: { status: status === "cancelled" ? "cancelled" : "failed" },
        });
      }
    }

    const separator = redirect.includes("?") ? "&" : "?";
    const finalUrl = subscriptionId
      ? `${redirect}${separator}subscription_id=${encodeURIComponent(subscriptionId)}`
      : `${redirect}${separator}order_id=${encodeURIComponent(orderId || "")}`;
    res.redirect(finalUrl);
  } catch (error) {
    console.error("SSLCommerz callback failed:", error);
    const separator = redirect.includes("?") ? "&" : "?";
    const fallbackUrl = `${redirect}${separator}status=failed&reason=callback_error`;
    res.redirect(fallbackUrl);
  }
}

paymentsRestRouter.all("/sslcommerz/success", async (req, res) => {
  await handleSslCommerzCallback(req as any, res, "success");
});
paymentsRestRouter.all("/sslcommerz/fail", async (req, res) => {
  await handleSslCommerzCallback(req as any, res, "failed");
});
paymentsRestRouter.all("/sslcommerz/cancel", async (req, res) => {
  await handleSslCommerzCallback(req as any, res, "cancelled");
});

paymentsRestRouter.post("/sslcommerz/ipn", async (req, res) => {
  const payload = asObject(req.body);
  const tranId = getString(payload, "tran_id");
  const status = String(payload.status || "").toUpperCase();
  const payment = tranId
    ? await prisma.payment.findFirst({
        where: { transaction_id: tranId },
      })
    : null;

  await prisma.paymentEvent.create({
    data: {
      gateway: "sslcommerz",
      event_type: "ipn",
      order_id: payment?.order_id || null,
      transaction_id: tranId || null,
      status: status || "ipn",
      raw_response: payload as any,
    },
  });

  if (payment?.order_id && (status === "VALID" || status === "VALIDATED")) {
    await finalizePaidOrder({
      orderId: payment.order_id,
      paymentMethod: "sslcommerz",
      transactionId: tranId,
    });
  }

  res.json({ success: true });
});

paymentsRestRouter.post("/demo", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      res.status(400).json({ error: "order_id is required" });
      return;
    }
    const order = await prisma.order.findFirst({
      where: { id: order_id, user_id: req.auth.userId! },
      include: { items: true },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const txnId = `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await prisma.$transaction(async (tx: any) => {
      await tx.order.update({ where: { id: order_id }, data: { status: "confirmed" } });
      await tx.payment.create({
        data: {
          user_id: req.auth.userId!,
          order_id,
          amount: Number(order.total_amount ?? 0),
          method: "demo",
          status: "paid",
          transaction_id: txnId,
        },
      });
      for (const item of order.items) {
        if (item.book_id && item.format !== "hardcopy") {
          await tx.userPurchase.create({
            data: { user_id: req.auth.userId!, book_id: item.book_id, format: item.format, amount: item.price, payment_method: "demo", status: "active" },
          });
          await tx.contentUnlock.upsert({
            where: { user_id_book_id_format: { user_id: req.auth.userId!, book_id: item.book_id, format: item.format } },
            create: { user_id: req.auth.userId!, book_id: item.book_id, format: item.format, status: "active", unlock_method: "purchase" },
            update: { status: "active" },
          });
        }
      }
    });
    for (const item of order.items) {
      if (item.book_id && item.format !== "hardcopy" && item.price > 0) {
        await calculateEarnings({ bookId: item.book_id, format: item.format, saleAmount: item.price, orderId: order.id, orderItemId: item.id });
      }
    }
    res.json({ message: "Payment completed (demo)" });
  } catch (error) {
    sendHttpError(res, error);
  }
});
