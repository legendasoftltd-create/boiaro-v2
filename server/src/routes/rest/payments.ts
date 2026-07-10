import { Router } from "express";
import { createHash } from "crypto";
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

// Customer cancelled before paying — remove the order entirely rather than leaving a
// permanent "pending" row (which the admin panel can't tell apart from a stuck/incomplete
// order). Coupon usage must be decremented so a cancelled checkout doesn't burn the
// customer's coupon use. Deletion order respects FK dependencies (no cascade in schema).
async function deleteCancelledOrder(orderId: string) {
  const couponUsages = await prisma.couponUsage.findMany({
    where: { order_id: orderId },
    select: { coupon_id: true },
  });

  await prisma.$transaction([
    ...couponUsages.map((cu) =>
      prisma.coupon.update({
        where: { id: cu.coupon_id },
        data: { used_count: { decrement: 1 } },
      })
    ),
    prisma.contributorEarning.deleteMany({ where: { order_id: orderId } }),
    prisma.couponUsage.deleteMany({ where: { order_id: orderId } }),
    prisma.orderItem.deleteMany({ where: { order_id: orderId } }),
    prisma.orderStatusHistory.deleteMany({ where: { order_id: orderId } }),
    prisma.payment.deleteMany({ where: { order_id: orderId } }),
    prisma.paymentEvent.deleteMany({ where: { order_id: orderId } }),
    prisma.order.delete({ where: { id: orderId } }),
  ]);
}

async function finalizePaidOrder(params: { orderId: string; paymentMethod: string; transactionId?: string }) {
  // Atomic status flip: only one concurrent caller can move from pending/awaiting_payment → confirmed.
  // This is the primary guard against IPN + redirect race conditions creating duplicate earnings.
  const updated = await prisma.order.updateMany({
    where: { id: params.orderId, status: { in: ["pending", "awaiting_payment"] } },
    data: { status: "confirmed" },
  });
  // If no rows were updated, another request already finalized this order — skip all side effects.
  if (updated.count === 0) {
    // Still update payment record (idempotent) but skip earnings/unlock to avoid duplicates.
    await prisma.payment.updateMany({
      where: { order_id: params.orderId },
      data: { status: "paid", transaction_id: params.transactionId || undefined },
    });
    return true;
  }

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

  // Create accounting ledger income entry (idempotent — skips if already exists)
  const sellableAmount = Math.max(0, Number(order.total_amount || 0) - Number(order.shipping_cost || 0));
  if (sellableAmount > 0) {
    const existingLedger = await prisma.accountingLedger.findFirst({
      where: { order_id: order.id, type: "income", category: "book_sale" },
    });
    if (!existingLedger) {
      await prisma.accountingLedger.create({
        data: {
          type: "income",
          category: "book_sale",
          amount: sellableAmount,
          entry_date: new Date(),
          order_id: order.id,
          reference_type: "order",
          reference_id: order.id,
          description: `Order payment - ${(order as any).order_number || order.id.slice(0, 8).toUpperCase()}`,
          source: params.paymentMethod,
        },
      });
    }
  }

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
    }).catch((err) => console.error("[payment] DB update failed:", err));
  }

  return true;
}

async function finalizeCoinPurchase(params: { purchaseId: string; transactionId?: string }) {
  const purchase = await prisma.coinPurchase.findUnique({ where: { id: params.purchaseId } });
  if (!purchase || purchase.payment_status === "paid") return false;

  await prisma.$transaction(async (tx: any) => {
    await tx.coinTransaction.create({
      data: {
        user_id: purchase.user_id,
        amount: purchase.coins_amount,
        type: "earn",
        description: `Coin package purchase`,
        source: "purchase",
        reference_id: purchase.id,
      },
    });
    await tx.userCoin.upsert({
      where: { user_id: purchase.user_id },
      create: { user_id: purchase.user_id, balance: purchase.coins_amount, total_earned: purchase.coins_amount, total_spent: 0 },
      update: { balance: { increment: purchase.coins_amount }, total_earned: { increment: purchase.coins_amount } },
    });
    await tx.coinPurchase.update({
      where: { id: purchase.id },
      data: { payment_status: "paid", payment_method: "sslcommerz", transaction_id: params.transactionId || purchase.transaction_id },
    });
  });
  return true;
}

async function finalizeChapterPurchase(params: { purchaseId: string; transactionId?: string }) {
  const purchase = await prisma.chapterPurchase.findUnique({ where: { id: params.purchaseId } });
  if (!purchase || purchase.payment_status === "paid") return false;

  const txnId = params.transactionId || purchase.transaction_id;
  const chapterFormat = `audiobook_chapter_${purchase.track_id}`;

  await prisma.$transaction(async (tx: any) => {
    await tx.chapterPurchase.update({
      where: { id: purchase.id },
      data: { payment_status: "paid", transaction_id: txnId },
    });
    await tx.contentUnlock.upsert({
      where: {
        user_id_book_id_format: {
          user_id: purchase.user_id,
          book_id: purchase.book_id,
          format: chapterFormat,
        },
      },
      create: {
        user_id: purchase.user_id,
        book_id: purchase.book_id,
        format: chapterFormat,
        status: "active",
        unlock_method: "purchase",
      },
      update: { status: "active" },
    });
    // Record in unified payments table for history
    await tx.payment.create({
      data: {
        user_id: purchase.user_id,
        amount: purchase.price,
        method: purchase.payment_method,
        status: "paid",
        transaction_id: txnId || `CHPT-${purchase.id}`,
        order_id: null,
        subscription_id: null,
      },
    });
  });

  // Calculate contributor earnings for the chapter purchase.
  // Done outside the transaction so the ContentUnlock row is visible to the query.
  const price = Number(purchase.price || 0);
  if (price > 0) {
    const unlock = await prisma.contentUnlock.findFirst({
      where: { user_id: purchase.user_id, book_id: purchase.book_id, format: chapterFormat },
      select: { id: true },
    });
    // Guard: skip if earnings already exist for this unlock (concurrent IPN + redirect scenario)
    const alreadyEarned = unlock
      ? await prisma.contributorEarning.findFirst({ where: { content_unlock_id: unlock.id }, select: { id: true } })
      : null;
    if (!alreadyEarned) {
      await calculateEarnings({
        bookId: purchase.book_id,
        format: "audiobook",
        saleAmount: price,
        contentUnlockId: unlock?.id ?? null,
      });
    }
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

  await prisma.$transaction([
    prisma.userSubscription.update({
      where: { id: params.subscriptionId },
      data: { status: "active", start_date: now, end_date: endDate },
    }),
    prisma.payment.updateMany({
      where: { subscription_id: params.subscriptionId },
      data: { status: "paid", transaction_id: params.transactionId || undefined },
    }),
  ]);

  // Record subscription revenue in the accounting ledger so it appears in financial reports
  const amtPaid = Number(sub.amount_paid ?? 0);
  if (amtPaid > 0) {
    await prisma.accountingLedger.create({
      data: {
        type: "income",
        category: "subscription",
        amount: amtPaid,
        entry_date: now,
        reference_type: "subscription",
        reference_id: params.subscriptionId,
        description: `Subscription - ${sub.plan.name}`,
        source: params.paymentMethod || "sslcommerz",
      },
    });
  }

  // Expire any other pending subscriptions for the same user (stale checkout attempts)
  const stalePending = await prisma.userSubscription.findMany({
    where: { user_id: sub.user_id, status: "pending", id: { not: params.subscriptionId } },
    select: { id: true },
  });
  if (stalePending.length > 0) {
    const staleIds = stalePending.map((s) => s.id);
    const staleCouponUsages = await prisma.couponUsage.findMany({
      where: { subscription_id: { in: staleIds } },
      select: { coupon_id: true },
    });
    await prisma.$transaction([
      ...staleCouponUsages.map((cu) =>
        prisma.coupon.update({ where: { id: cu.coupon_id }, data: { used_count: { decrement: 1 } } })
      ),
      prisma.couponUsage.deleteMany({ where: { subscription_id: { in: staleIds } } }),
      prisma.userSubscription.updateMany({ where: { id: { in: staleIds } }, data: { status: "failed" } }),
    ]);
  }

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
    }).catch((err) => console.error("[payment] DB update failed:", err));
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

/**
 * SSLCommerz verify_sign algorithm:
 * 1. Take fields listed in verify_key from the payload
 * 2. Replace store_passwd value with MD5(store_passwd)
 * 3. Sort keys alphabetically
 * 4. Concatenate as key=value& pairs
 * 5. MD5 hash of the string must equal verify_sign
 */
function verifySslCommerzSign(payload: Record<string, unknown>, storePassword: string): boolean {
  const verifyKey = getString(payload, "verify_key");
  const verifySign = getString(payload, "verify_sign");
  if (!verifyKey || !verifySign) return false;

  const fields = verifyKey.split(",").map(k => k.trim()).filter(Boolean);
  const hashedPass = createHash("md5").update(storePassword).digest("hex");

  const parts = fields
    .sort()
    .map(key => {
      const val = key === "store_passwd" ? hashedPass : String(payload[key] ?? "");
      return `${key}=${val}`;
    });

  const computedHash = createHash("md5").update(parts.join("&")).digest("hex");
  const isValid = computedHash === verifySign;
  if (!isValid) {
    console.warn("[payment] verify_sign mismatch debug", {
      verifyKey,
      fields,
      payloadKeys: Object.keys(payload),
      computedHash,
      verifySign,
    });
  }
  return isValid;
}

function isSafeRedirect(url: string): boolean {
  const allowed = [
    process.env.FRONTEND_URL,
    process.env.DASHBOARD_URL,
    "http://localhost:8080",
    "http://localhost:3000",
  ].filter(Boolean) as string[];
  try {
    const target = new URL(url);
    return allowed.some(origin => {
      try { return new URL(origin).origin === target.origin; } catch { return false; }
    });
  } catch { return false; }
}

async function handleSslCommerzCallback(req: AuthenticatedRequest, res: any, status: "success" | "failed" | "cancelled") {
  const fallbackBase = process.env.FRONTEND_URL || "http://localhost:8080";
  const rawRedirect = getString(asObject(req.query), "redirect");
  const redirect =
    rawRedirect && isSafeRedirect(rawRedirect)
      ? rawRedirect
      : `${fallbackBase}/payment/callback?status=${status}`;

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

    // Detect coin purchase: tran_id format is COIN-{uuid}-{timestamp}
    const UUID_PATTERN = /^(?:COIN|CHPT)-([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})-\d+$/i;
    let coinPurchaseId: string | undefined;
    if (tranId?.startsWith("COIN-")) {
      const match = tranId.match(UUID_PATTERN);
      coinPurchaseId = match?.[1];
      if (!coinPurchaseId) console.warn("[payment] Malformed COIN tran_id:", tranId);
    }
    // Detect chapter purchase: tran_id format is CHPT-{uuid}-{timestamp}
    let chapterPurchaseId: string | undefined;
    if (tranId?.startsWith("CHPT-")) {
      const match = tranId.match(UUID_PATTERN);
      chapterPurchaseId = match?.[1];
      if (!chapterPurchaseId) console.warn("[payment] Malformed CHPT tran_id:", tranId);
    }
    const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
    const gatewayConfig = asObject(gateway?.config);
    const storeId = getString(gatewayConfig, "store_id") || process.env.SSLCOMMERZ_STORE_ID;
    const storePassword = getString(gatewayConfig, "store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
    const mode = gateway?.mode === "live" ? "live" : "test";

    // Verify SSLCommerz signature when present (IPN and direct callbacks both send verify_sign).
    // On a hash mismatch for "success", don't hard-reject immediately if we have a val_id —
    // fall through to the official validationserverAPI round-trip below, which asks SSLCommerz's
    // own servers to confirm the transaction directly and is authoritative regardless of whether
    // our locally-computed hash matches (the verify_key field set SSLCommerz sends isn't always
    // stable, so a self-computed mismatch alone must not strand a paid order). Only hard-reject
    // a "success" callback when there's no val_id to fall back on. "failed"/"cancelled" carry no
    // unlock risk (no money moved), so a mismatch there is just logged.
    if (storePassword && payload["verify_sign"]) {
      const signValid = verifySslCommerzSign(payload, storePassword);
      if (!signValid) {
        console.warn(`[payment] SSLCommerz verify_sign mismatch on ${status} callback`);
        if (status === "success" && !valId) {
          res.status(400).json({ error: "Invalid signature" });
          return;
        }
      }
    }

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
      } else if (coinPurchaseId) {
        await finalizeCoinPurchase({ purchaseId: coinPurchaseId, transactionId: tranId });
      } else if (chapterPurchaseId) {
        await finalizeChapterPurchase({ purchaseId: chapterPurchaseId, transactionId: tranId });
      }
    } else if (status !== "success") {
      if (orderId && status === "cancelled") {
        await deleteCancelledOrder(orderId);
      } else if (orderId) {
        await prisma.payment.updateMany({
          where: { order_id: orderId },
          data: { status: "failed" },
        });
      } else if (subscriptionId) {
        // Rollback coupon reservation so the user can reuse it on the next attempt
        const subCouponUsages = await prisma.couponUsage.findMany({
          where: { subscription_id: subscriptionId },
          select: { coupon_id: true },
        });
        await prisma.$transaction([
          ...subCouponUsages.map((cu) =>
            prisma.coupon.update({ where: { id: cu.coupon_id }, data: { used_count: { decrement: 1 } } })
          ),
          prisma.couponUsage.deleteMany({ where: { subscription_id: subscriptionId } }),
          prisma.payment.updateMany({
            where: { subscription_id: subscriptionId },
            data: { status: status === "cancelled" ? "cancelled" : "failed" },
          }),
          prisma.userSubscription.update({
            where: { id: subscriptionId },
            data: { status: status === "cancelled" ? "cancelled" : "failed" },
          }),
        ]);
      } else if (coinPurchaseId) {
        await prisma.coinPurchase.update({
          where: { id: coinPurchaseId },
          data: { payment_status: status === "cancelled" ? "cancelled" : "failed" },
        }).catch((err) => console.error("[payment] DB update failed:", err));
      } else if (chapterPurchaseId) {
        await prisma.chapterPurchase.update({
          where: { id: chapterPurchaseId },
          data: { payment_status: status === "cancelled" ? "cancelled" : "failed" },
        }).catch((err) => console.error("[payment] DB update failed:", err));
      }
    }

    const separator = redirect.includes("?") ? "&" : "?";
    const finalUrl = coinPurchaseId || chapterPurchaseId || (orderId && status === "cancelled")
      ? redirect
      : subscriptionId
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
  const ipnValId = getString(payload, "val_id");

  // Verify SSLCommerz IPN signature before trusting any payload field. On a hash mismatch,
  // fall back to the official validationserverAPI round-trip (same as the browser-redirect
  // success handler) before rejecting — a self-computed hash mismatch alone must not drop a
  // genuinely paid IPN, since SSLCommerz's own servers are the authoritative source of truth.
  let ipnGatewayConfig: Record<string, unknown> = {};
  let ipnStorePass: string | undefined;
  let ipnStoreId: string | undefined;
  let ipnMode: "live" | "test" = "test";
  if (payload["verify_sign"]) {
    const gw = await prisma.paymentGateway.findUnique({ where: { gateway_key: "sslcommerz" } });
    ipnGatewayConfig = asObject(gw?.config);
    ipnStorePass = getString(ipnGatewayConfig, "store_password") || process.env.SSLCOMMERZ_STORE_PASSWORD;
    ipnStoreId = getString(ipnGatewayConfig, "store_id") || process.env.SSLCOMMERZ_STORE_ID;
    ipnMode = gw?.mode === "live" ? "live" : "test";
    if (ipnStorePass && !verifySslCommerzSign(payload, ipnStorePass)) {
      console.warn("[ipn] SSLCommerz verify_sign mismatch");
      let validatedByApi = false;
      if (ipnValId && ipnStoreId) {
        const validationBase = ipnMode === "live"
          ? "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
          : "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";
        const url = `${validationBase}?val_id=${encodeURIComponent(ipnValId)}&store_id=${encodeURIComponent(ipnStoreId)}&store_passwd=${encodeURIComponent(ipnStorePass)}&v=1&format=json`;
        try {
          const response = await fetch(url);
          const result = (await response.json()) as Record<string, unknown>;
          const resultStatus = String(result?.status || "").toUpperCase();
          validatedByApi = resultStatus === "VALID" || resultStatus === "VALIDATED";
        } catch {
          validatedByApi = false;
        }
      }
      if (!validatedByApi) {
        console.warn("[ipn] SSLCommerz validationserverAPI also failed to confirm — rejecting IPN");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      console.warn("[ipn] verify_sign mismatch but validationserverAPI confirmed — accepting IPN");
    }
  }

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

  const IPN_UUID_PATTERN = /^(?:COIN|CHPT)-([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})-\d+$/i;
  if (status === "VALID" || status === "VALIDATED") {
    if (payment?.order_id) {
      await finalizePaidOrder({ orderId: payment.order_id, paymentMethod: "sslcommerz", transactionId: tranId });
    } else if (payment?.subscription_id) {
      await finalizeSubscriptionPayment({ subscriptionId: payment.subscription_id, paymentMethod: "sslcommerz", transactionId: tranId });
    } else if (tranId?.startsWith("COIN-")) {
      const match = tranId.match(IPN_UUID_PATTERN);
      const purchaseId = match?.[1];
      if (purchaseId) await finalizeCoinPurchase({ purchaseId, transactionId: tranId });
      else console.warn("[ipn] Malformed COIN tran_id:", tranId);
    } else if (tranId?.startsWith("CHPT-")) {
      const match = tranId.match(IPN_UUID_PATTERN);
      const purchaseId = match?.[1];
      if (purchaseId) await finalizeChapterPurchase({ purchaseId, transactionId: tranId });
      else console.warn("[ipn] Malformed CHPT tran_id:", tranId);
    }
  }

  res.json({ success: true });
});

// ── bKash Tokenized Checkout callback ───────────────────────────────────────
paymentsRestRouter.get("/bkash/callback", async (req, res) => {
  const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
  const { purchase_id, paymentID, status } = req.query as Record<string, string>;

  try {
    if (!purchase_id || !paymentID || status !== "success") {
      res.redirect(`${frontendBase}/coin-store?status=${status === "cancel" ? "cancelled" : "failed"}`);
      return;
    }

    const purchase = await prisma.coinPurchase.findUnique({ where: { id: purchase_id } });
    if (!purchase) { res.redirect(`${frontendBase}/coin-store?status=failed`); return; }

    // Look up bKash/nagad gateway credentials to execute payment
    const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: purchase.payment_method } });
    const cfg = asObject(gateway?.config);
    const cfgStr = (k: string) => getString(cfg, k);
    const appKey = cfgStr("app_key") || process.env.BKASH_APP_KEY;
    const appSecret = cfgStr("app_secret") || process.env.BKASH_APP_SECRET;
    const username = cfgStr("username") || process.env.BKASH_USERNAME;
    const password = cfgStr("password") || process.env.BKASH_PASSWORD;

    if (!appKey || !appSecret || !username || !password) {
      res.redirect(`${frontendBase}/coin-store?status=failed`);
      return;
    }

    const mode = (gateway?.mode === "live" || (!gateway?.mode && process.env.BKASH_APP_KEY)) ? "live" : "test";
    const baseUrl = mode === "live" ? "https://tokenized.pay.bka.sh/v1.2.0-beta" : "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

    // Refresh token
    const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", username, password },
      body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;
    const idToken = typeof tokenData.id_token === "string" ? tokenData.id_token : undefined;
    if (!idToken) { res.redirect(`${frontendBase}/coin-store?status=failed`); return; }

    // Execute payment
    const execRes = await fetch(`${baseUrl}/tokenized/checkout/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", authorization: idToken, "x-app-key": appKey },
      body: JSON.stringify({ paymentID }),
    });
    const execData = await execRes.json() as Record<string, unknown>;
    const txnId = typeof execData.trxID === "string" ? execData.trxID : paymentID;
    const execStatus = String(execData.statusCode || "").toLowerCase();

    if (execStatus === "0000") {
      await finalizeCoinPurchase({ purchaseId: purchase_id, transactionId: txnId });
      res.redirect(`${frontendBase}/coin-store?status=success`);
    } else {
      await prisma.coinPurchase.update({ where: { id: purchase_id }, data: { payment_status: "failed" } }).catch((err) => console.error("[payment] DB update failed:", err));
      res.redirect(`${frontendBase}/coin-store?status=failed`);
    }
  } catch (err) {
    console.error("bKash callback error:", err);
    res.redirect(`${frontendBase}/coin-store?status=failed`);
  }
});

// ── bKash chapter payment callback ───────────────────────────────────────────
paymentsRestRouter.get("/bkash/chapter-callback", async (req, res) => {
  const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
  const { purchase_id, paymentID, status } = req.query as Record<string, string>;

  const purchase = purchase_id ? await prisma.chapterPurchase.findUnique({ where: { id: purchase_id } }) : null;
  const bookId = purchase?.book_id || "";
  const redirectBase = `${frontendBase}/b/${bookId}`;

  try {
    if (!purchase_id || !paymentID || status !== "success" || !purchase) {
      res.redirect(`${redirectBase}?chapter_status=${status === "cancel" ? "cancelled" : "failed"}`);
      return;
    }

    const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: purchase.payment_method } });
    const cfg = asObject(gateway?.config);
    const cfgStr = (k: string) => getString(cfg, k);
    const appKey = cfgStr("app_key") || process.env.BKASH_APP_KEY;
    const appSecret = cfgStr("app_secret") || process.env.BKASH_APP_SECRET;
    const username = cfgStr("username") || process.env.BKASH_USERNAME;
    const password = cfgStr("password") || process.env.BKASH_PASSWORD;

    if (!appKey || !appSecret || !username || !password) {
      res.redirect(`${redirectBase}?chapter_status=failed`); return;
    }

    const mode = (gateway?.mode === "live" || (!gateway?.mode && process.env.BKASH_APP_KEY)) ? "live" : "test";
    const baseUrl = mode === "live" ? "https://tokenized.pay.bka.sh/v1.2.0-beta" : "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

    const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", username, password },
      body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;
    const idToken = typeof tokenData.id_token === "string" ? tokenData.id_token : undefined;
    if (!idToken) { res.redirect(`${redirectBase}?chapter_status=failed`); return; }

    const execRes = await fetch(`${baseUrl}/tokenized/checkout/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", authorization: idToken, "x-app-key": appKey },
      body: JSON.stringify({ paymentID }),
    });
    const execData = await execRes.json() as Record<string, unknown>;
    const txnId = typeof execData.trxID === "string" ? execData.trxID : paymentID;
    const execStatus = String(execData.statusCode || "").toLowerCase();

    if (execStatus === "0000") {
      await finalizeChapterPurchase({ purchaseId: purchase_id, transactionId: txnId });
      res.redirect(`${redirectBase}?chapter_status=success`);
    } else {
      await prisma.chapterPurchase.update({ where: { id: purchase_id }, data: { payment_status: "failed" } }).catch((err) => console.error("[payment] DB update failed:", err));
      res.redirect(`${redirectBase}?chapter_status=failed`);
    }
  } catch (err) {
    console.error("bKash chapter callback error:", err);
    res.redirect(`${redirectBase}?chapter_status=failed`);
  }
});

// ── bKash full-audiobook (direct-gateway Order) callback ───────────────────
paymentsRestRouter.get("/bkash/callback-order", async (req, res) => {
  const frontendBase = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
  const { order_id, paymentID, status } = req.query as Record<string, string>;

  const order = order_id ? await prisma.order.findUnique({ where: { id: order_id }, include: { items: true } }) : null;
  const bookId = order?.items?.[0]?.book_id || "";
  const redirectBase = `${frontendBase}/b/${bookId}`;

  try {
    if (!order_id || !paymentID || status !== "success" || !order) {
      res.redirect(`${redirectBase}?audiobook_status=${status === "cancel" ? "cancelled" : "failed"}`);
      return;
    }

    const payment = await prisma.payment.findFirst({ where: { order_id } });
    const gateway = await prisma.paymentGateway.findUnique({ where: { gateway_key: payment?.method || "bkash" } });
    const cfg = asObject(gateway?.config);
    const cfgStr = (k: string) => getString(cfg, k);
    const appKey = cfgStr("app_key") || process.env.BKASH_APP_KEY;
    const appSecret = cfgStr("app_secret") || process.env.BKASH_APP_SECRET;
    const username = cfgStr("username") || process.env.BKASH_USERNAME;
    const password = cfgStr("password") || process.env.BKASH_PASSWORD;

    if (!appKey || !appSecret || !username || !password) {
      res.redirect(`${redirectBase}?audiobook_status=failed`); return;
    }

    const mode = (gateway?.mode === "live" || (!gateway?.mode && process.env.BKASH_APP_KEY)) ? "live" : "test";
    const baseUrl = mode === "live" ? "https://tokenized.pay.bka.sh/v1.2.0-beta" : "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

    const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", username, password },
      body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;
    const idToken = typeof tokenData.id_token === "string" ? tokenData.id_token : undefined;
    if (!idToken) { res.redirect(`${redirectBase}?audiobook_status=failed`); return; }

    const execRes = await fetch(`${baseUrl}/tokenized/checkout/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", authorization: idToken, "x-app-key": appKey },
      body: JSON.stringify({ paymentID }),
    });
    const execData = await execRes.json() as Record<string, unknown>;
    const txnId = typeof execData.trxID === "string" ? execData.trxID : paymentID;
    const execStatus = String(execData.statusCode || "").toLowerCase();

    if (execStatus === "0000") {
      await finalizePaidOrder({ orderId: order_id, paymentMethod: payment?.method || "bkash", transactionId: txnId });
      res.redirect(`${redirectBase}?audiobook_status=success`);
    } else {
      await prisma.payment.updateMany({ where: { order_id }, data: { status: "failed" } }).catch((err) => console.error("[payment] DB update failed:", err));
      res.redirect(`${redirectBase}?audiobook_status=failed`);
    }
  } catch (err) {
    console.error("bKash order callback error:", err);
    res.redirect(`${redirectBase}?audiobook_status=failed`);
  }
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
