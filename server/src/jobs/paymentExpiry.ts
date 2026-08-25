import { prisma } from "../lib/prisma.js";

// SSLCommerz/bKash/Nagad checkouts create an Order with status "pending" or
// "awaiting_payment" (the string differs depending on which code path
// created it — order vs subscription checkout — but both mean the same
// thing: gateway session opened, outcome not known yet) and leave it there
// until a success/fail/cancel callback or IPN resolves it. When the
// customer just closes the tab without finishing — the common case — none
// of those ever fire, and the row sits open forever. That's not itself a
// payment failure, but it's indistinguishable from one on the Live
// Monitoring dashboard, and it means abandoned checkouts accumulate without
// bound instead of settling into a final state.
//
// SSLCommerz's own gateway session expires long before this threshold, so
// by 3 hours a still-open row can only be a genuinely abandoned checkout,
// never a legitimate one still in progress. finalizePaidOrder's guard
// (routes/rest/payments.ts) is `status: { not: "confirmed" }` specifically
// so that a rare late IPN after this sweep runs still completes the order
// instead of being silently dropped.
const EXPIRY_THRESHOLD_MS = 3 * 60 * 60 * 1000;
const OPEN_ORDER_STATUSES = ["pending", "awaiting_payment"];

export async function runPaymentExpirySweep(): Promise<{ ordersExpired: number; subscriptionsExpired: number }> {
  const cutoff = new Date(Date.now() - EXPIRY_THRESHOLD_MS);

  const staleOrders = await prisma.order.findMany({
    where: {
      status: { in: OPEN_ORDER_STATUSES },
      payment_method: { not: "cod" }, // COD has no gateway step — "pending" there means awaiting delivery, not awaiting payment
      created_at: { lt: cutoff },
    },
    select: { id: true, status: true },
  });

  for (const { id, status } of staleOrders) {
    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data: { status: "payment_failed" },
      }),
      prisma.orderStatusHistory.create({
        data: { order_id: id, old_status: status, new_status: "payment_failed", note: "Auto-expired — no payment confirmation received" },
      }),
      prisma.payment.updateMany({
        where: { order_id: id, status: { in: OPEN_ORDER_STATUSES } },
        data: { status: "failed" },
      }),
    ]).catch((err) => console.error(`[paymentExpiry] failed to expire order ${id}:`, err?.message));
  }

  const staleSubscriptions = await prisma.userSubscription.findMany({
    where: { status: "pending", created_at: { lt: cutoff } },
    select: { id: true },
  });

  for (const { id } of staleSubscriptions) {
    const couponUsages = await prisma.couponUsage.findMany({ where: { subscription_id: id }, select: { coupon_id: true } });
    await prisma.$transaction([
      ...couponUsages.map((cu) => prisma.coupon.update({ where: { id: cu.coupon_id }, data: { used_count: { decrement: 1 } } })),
      prisma.couponUsage.deleteMany({ where: { subscription_id: id } }),
      prisma.payment.updateMany({ where: { subscription_id: id, status: "pending" }, data: { status: "failed" } }),
      prisma.userSubscription.update({ where: { id }, data: { status: "failed" } }),
    ]).catch((err) => console.error(`[paymentExpiry] failed to expire subscription ${id}:`, err?.message));
  }

  return { ordersExpired: staleOrders.length, subscriptionsExpired: staleSubscriptions.length };
}
