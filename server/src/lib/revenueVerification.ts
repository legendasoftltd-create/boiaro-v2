/**
 * Mirrors `src/hooks/useUnifiedRevenue.ts` — keep in sync when revenue rules change.
 * Fixes a prior bug where `/settled|paid/i` matched `unpaid` (substring "paid").
 */

const EXCLUDED_STATUSES = new Set(["cancelled", "returned", "pending"]);

/** Non-COD: money received (excludes `confirmed` / in-flight until paid lifecycle). */
const MONEY_RECEIVED_STATUSES = new Set(["paid", "completed", "access_granted", "delivered"]);

const COD_SETTLED_STATUSES = new Set(["settled_to_merchant", "paid"]);

export type RevenueOrderFields = {
  status: string;
  payment_method?: string | null;
  cod_payment_status?: string | null;
};

export function isVerifiedRevenueOrder(order: RevenueOrderFields): boolean {
  if (EXCLUDED_STATUSES.has(order.status)) return false;

  if (order.payment_method === "cod") {
    return COD_SETTLED_STATUSES.has(String(order.cod_payment_status || ""));
  }

  return MONEY_RECEIVED_STATUSES.has(order.status);
}
