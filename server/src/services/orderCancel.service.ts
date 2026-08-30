import { prisma } from "../lib/prisma.js";
import * as redx from "./redx.service.js";
import { notifyUser } from "../lib/notify.js";

const TERMINAL_STATUSES = ["delivered", "returned", "cancelled", "refunded"];
// Statuses at which digital fulfillment (UserPurchase/ContentUnlock/ContributorEarning)
// has already happened — see the `shouldFulfill` block in orders.ts/rest/orders.ts placeOrder.
const FULFILLED_STATUSES = ["confirmed", "access_granted", "paid"];
// Once the courier has physically picked the parcel up, self-cancel closes —
// same cutoff as most delivery-based stores. Admin can still cancel past this.
const CUSTOMER_HARDCOPY_CUTOFF_STATUSES = ["pickup_received", "in_transit", "shipped"];

export class OrderCancelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderCancelError";
  }
}

/**
 * Standard cancellation policy for self-service (customer) cancels — admin is
 * exempt from all of these and only blocked by the terminal-status guard above.
 * - Hardcopy: no self-cancel once the courier has picked the parcel up.
 * - Digital: no self-cancel once the customer has actually opened the book —
 *   matches how most digital storefronts handle "no refund after consumption".
 */
async function assertCustomerCancellable(
  order: { user_id: string },
  items: { book_id: string | null; format: string }[],
  status: string | null,
  actor: "customer" | "admin"
) {
  if (actor !== "customer") return;

  const hasHardcopy = items.some((i) => i.format === "hardcopy");
  if (hasHardcopy && CUSTOMER_HARDCOPY_CUTOFF_STATUSES.includes(status ?? "")) {
    throw new OrderCancelError("This order has already shipped and can no longer be self-cancelled. Please contact support.");
  }

  for (const item of items) {
    if (!item.book_id) continue;
    if (item.format === "ebook") {
      const progress = await prisma.readingProgress.findUnique({
        where: { user_id_book_id: { user_id: order.user_id, book_id: item.book_id } },
      });
      if (progress) {
        throw new OrderCancelError("You've already started reading this book, so it can no longer be self-cancelled. Please contact support.");
      }
    } else if (item.format === "audiobook") {
      const progress = await prisma.listeningProgress.findUnique({
        where: { user_id_book_id: { user_id: order.user_id, book_id: item.book_id } },
      });
      if (progress) {
        throw new OrderCancelError("You've already started listening to this audiobook, so it can no longer be self-cancelled. Please contact support.");
      }
    }
  }
}

/**
 * Single source of truth for cancelling an order: reverses everything placeOrder
 * may have already granted (digital access, spent wallet coins, contributor
 * earnings), cancels any RedX parcel, and notifies the customer. Used by the
 * customer REST endpoint, the web tRPC mutation, and the admin status-update path
 * so all three cancel the same order the same way instead of drifting.
 */
export async function cancelOrder(
  orderId: string,
  opts: { changedBy: string; note?: string | null; actor: "customer" | "admin" }
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new OrderCancelError("Order not found");
  if (TERMINAL_STATUSES.includes(order.status ?? "")) {
    throw new OrderCancelError(`Cannot cancel an order with status: ${order.status}`);
  }
  await assertCustomerCancellable(order, order.items, order.status, opts.actor);

  const wasFulfilled = FULFILLED_STATUSES.includes(order.status ?? "");

  if (order.redx_tracking_id) {
    try {
      await redx.cancelParcel(order.redx_tracking_id, opts.note || `Cancelled by ${opts.actor}`);
    } catch (err) {
      console.error("[RedX] parcel cancellation failed for order", order.order_number, err);
    }
  }

  if (wasFulfilled) {
    const digitalItems = order.items.filter((i) => i.format !== "hardcopy");
    for (const item of digitalItems) {
      if (!item.book_id) continue;
      await prisma.userPurchase.updateMany({
        where: { order_id: order.id, book_id: item.book_id, format: item.format, status: { not: "cancelled" } },
        data: { status: "cancelled" },
      });
      // Legacy rows created before UserPurchase.order_id existed have no order
      // link — best-effort match by (user, book, format) so old orders can
      // still be cancelled cleanly.
      await prisma.userPurchase.updateMany({
        where: { order_id: null, user_id: order.user_id, book_id: item.book_id, format: item.format, status: { not: "cancelled" } },
        data: { status: "cancelled" },
      });
      await prisma.contentUnlock.updateMany({
        where: { user_id: order.user_id, book_id: item.book_id, format: item.format, status: { not: "revoked" } },
        data: { status: "revoked" },
      });
    }

    await prisma.contributorEarning.updateMany({
      where: { order_id: order.id, status: { not: "reversed" } },
      data: { status: "reversed" },
    });

    // Reverse the accounting income too. finalizePaidOrder writes a book_sale
    // income entry when an order is confirmed; cancelling used to revoke the
    // content and reverse contributor earnings but leave that entry standing,
    // so the ledger overstated income by the value of every order cancelled
    // after confirmation (and only a manual admin reversal could fix it).
    //
    // Same convention as admin.reverseAccountingLedgerEntry: a compensating
    // negative entry rather than a delete, so the original stays auditable.
    const incomeEntries = await prisma.accountingLedger.findMany({
      where: { order_id: order.id, type: "income", category: "book_sale" },
      select: { id: true, amount: true, description: true, book_id: true },
    });
    for (const entry of incomeEntries) {
      // Idempotent — cancelling twice must not reverse twice.
      const alreadyReversed = await prisma.accountingLedger.findFirst({
        where: { reference_type: "reversal", reference_id: entry.id },
        select: { id: true },
      });
      if (alreadyReversed) continue;
      await prisma.accountingLedger.create({
        data: {
          type: "income",
          category: "book_sale",
          description: `REVERSAL: order cancelled - ${order.order_number} (original: ${entry.id.slice(0, 8)})`,
          amount: -Math.abs(Number(entry.amount || 0)),
          entry_date: new Date(),
          source: "order_cancel",
          reference_type: "reversal",
          reference_id: entry.id,
          book_id: entry.book_id,
          order_id: order.id,
        },
      });
    }
  }

  // Refund spent wallet coins (dedup: skip if this order was already refunded once)
  const spendTxn = await prisma.coinTransaction.findFirst({
    where: { user_id: order.user_id, source: "order_payment", reference_id: order.id, type: "spend" },
  });
  if (spendTxn) {
    const alreadyRefunded = await prisma.coinTransaction.findFirst({
      where: { user_id: order.user_id, source: "order_cancel_refund", reference_id: order.id },
    });
    if (!alreadyRefunded) {
      const refundAmount = Math.abs(spendTxn.amount);
      await prisma.$transaction([
        prisma.coinTransaction.create({
          data: {
            user_id: order.user_id,
            amount: refundAmount,
            type: "refund",
            description: `Order cancelled - ${order.order_number}`,
            source: "order_cancel_refund",
            reference_id: order.id,
          },
        }),
        prisma.userCoin.upsert({
          where: { user_id: order.user_id },
          create: { user_id: order.user_id, balance: refundAmount, total_earned: refundAmount },
          update: { balance: { increment: refundAmount }, total_earned: { increment: refundAmount } },
        }),
      ]);
    }
  }

  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: "cancelled" } }),
    prisma.orderStatusHistory.create({
      data: {
        order_id: order.id,
        old_status: order.status,
        new_status: "cancelled",
        changed_by: opts.changedBy,
        note: opts.note || null,
      },
    }),
  ]);

  notifyUser(order.user_id, {
    title: "Order Cancelled",
    message: `Your order ${order.order_number} has been cancelled.${wasFulfilled ? " Access to any purchased items has been revoked." : ""}`,
    type: "order",
    link: "/orders",
    preferenceKey: "order_enabled",
  }).catch(() => null);

  return updatedOrder;
}
