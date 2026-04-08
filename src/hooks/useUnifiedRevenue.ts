/**
 * Unified Revenue Logic — Single Source of Truth
 * 
 * REVENUE INCLUSION RULES (money actually received):
 * ─────────────────────────
 * 1. ONLINE PAYMENTS:
 *    → Count as revenue ONLY when payment_status = 'paid'
 *      OR order status IN ('paid', 'completed')
 *    → "confirmed", "delivered" alone do NOT count
 *
 * 2. COD (Cash on Delivery):
 *    → NEVER count confirmed/processing/delivered as revenue
 *    → Count ONLY when cod_payment_status IN ('settled_to_merchant', 'paid')
 *
 * 3. EXCLUDED statuses: pending, cancelled, returned
 *    Once online payment is confirmed, order counts through entire lifecycle
 *    (paid → confirmed → processing → shipped → delivered → completed)
 *
 * 4. Net revenue = total_amount (discount already deducted at order creation)
 * 
 * PROFIT RULES (Hardcopy / inventory_resale):
 * ─────────────────────────
 * profit = total_amount - (unit_cost × qty) - packaging_cost - fulfillment_cost
 * 
 * DATE FILTER PERIODS:
 * ─────────────────────
 * today, this_month, last_month, this_year, all
 * 
 * USED BY: AdminDashboard, AdminAnalytics, AdminFinancialReports, InvestorReport
 */

export type RevenuePeriod = "today" | "this_month" | "last_month" | "this_year" | "all";

/** Order statuses that definitively mean money was received (non-COD) */
const MONEY_RECEIVED_STATUSES = ["paid", "completed", "access_granted", "delivered"];

/** COD-specific payment statuses that mean merchant got the money */
const COD_SETTLED_STATUSES = ["settled_to_merchant", "paid"];

export interface RevenueOrder {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  payment_method?: string;
  cod_payment_status?: string;
  packaging_cost?: number;
  fulfillment_cost?: number;
  shipping_cost?: number;
  discount_amount?: number;
  user_id?: string;
  purchase_cost_per_unit?: number;
  is_purchased?: boolean;
}

/**
 * Get the sellable revenue from an order (excludes delivery/shipping charge).
 * Delivery fee is customer-paid pass-through, NOT platform revenue for profit calc.
 */
export function getOrderSellableAmount(order: RevenueOrder): number {
  return (order.total_amount || 0) - (order.shipping_cost || 0);
}

export interface OrderItemWithCost {
  order_id: string;
  book_id: string;
  format: string;
  unit_price: number;
  quantity: number;
  unit_cost?: number; // from book_formats join
  original_price?: number; // from book_formats – used for commission fallback
  publisher_commission_percent?: number; // from book_formats – used for commission fallback
}

/**
 * Core filter: Is this order counted as verified revenue?
 * Only counts when real money has been received by the platform.
 * 
 * payments.status = 'paid' is the single source of truth.
 * A DB trigger (trg_sync_order_on_payment_paid) automatically syncs
 * order status when payment is marked paid, so we can rely on order.status.
 */
export function isVerifiedRevenueOrder(order: RevenueOrder, log = false): boolean {
  const exclude = (reason: string) => {
    if (log) {
      console.debug("[revenue_exclude]", {
        order_id: order.id,
        status: order.status,
        payment_method: order.payment_method,
        reason,
      });
    }
    return false;
  };

  // Always exclude these regardless of payment
  const excludedStatuses = ["cancelled", "returned", "pending"];
  if (excludedStatuses.includes(order.status)) return exclude(`status_${order.status}`);

  // COD orders: only count when money is actually settled to merchant
  if (order.payment_method === "cod") {
    const settled = COD_SETTLED_STATUSES.includes(order.cod_payment_status || "");
    return settled || exclude(`cod_not_settled (cod_status=${order.cod_payment_status})`);
  }

  // Online/demo payments: count if order status confirms money received
  if (MONEY_RECEIVED_STATUSES.includes(order.status)) return true;

  // Everything else (confirmed, processing, in_transit, etc.) = no revenue
  return exclude(`status_not_paid (status=${order.status})`);
}

/**
 * Date period filter
 */
export function isInPeriod(dateStr: string, period: RevenuePeriod): boolean {
  if (period === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();

  switch (period) {
    case "today":
      return d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    case "this_month":
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    case "last_month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }
    case "this_year":
      return d.getFullYear() === now.getFullYear();
    default:
      return true;
  }
}

/**
 * Custom date range filter (for Analytics page)
 */
export function isInDateRange(dateStr: string, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && dateStr < dateFrom) return false;
  if (dateTo && dateStr > dateTo + "T23:59:59") return false;
  return true;
}

/**
 * Get verified revenue orders filtered by period
 */
export function getVerifiedRevenueOrders(
  orders: RevenueOrder[],
  period: RevenuePeriod = "all"
): RevenueOrder[] {
  return orders.filter(o => isVerifiedRevenueOrder(o) && isInPeriod(o.created_at, period));
}

/**
 * Calculate product revenue from verified orders (excludes delivery charge).
 * Delivery is customer-paid pass-through and NOT platform revenue for profit purposes.
 */
export function calculateNetRevenue(orders: RevenueOrder[]): number {
  return orders.reduce((sum, o) => sum + getOrderSellableAmount(o), 0);
}

/**
 * Calculate total delivery charges collected (for informational display only)
 */
export function calculateTotalDeliveryCharges(orders: RevenueOrder[]): number {
  return orders.reduce((sum, o) => sum + (o.shipping_cost || 0), 0);
}

/**
 * Calculate real profit for an order using hybrid model:
 * - If order.is_purchased = true: use order.purchase_cost_per_unit × total_qty
 * - Else: fallback to item-level unit_cost from book_formats
 * Delivery charge excluded (customer-paid pass-through).
 */
export function calculateOrderProfit(
  order: RevenueOrder,
  items: OrderItemWithCost[]
): number {
  const sellable = getOrderSellableAmount(order);

  let totalBuyingCost: number;
  if (order.is_purchased && (order.purchase_cost_per_unit ?? 0) > 0) {
    // Order-based purchase model: use order-level cost
    const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
    totalBuyingCost = (order.purchase_cost_per_unit!) * totalQty;
  } else {
    // Stock-based model: use item-level unit_cost, fall back to commission-based calc
    totalBuyingCost = items.reduce((s, i) => {
      const qty = i.quantity || 1;
      if ((i.unit_cost ?? 0) > 0) return s + i.unit_cost! * qty;
      // Fallback: buying price = original_price - (original_price × commission / 100)
      const orig = i.original_price ?? 0;
      const comm = i.publisher_commission_percent ?? 0;
      if (orig > 0 && comm > 0) return s + (orig - (orig * comm / 100)) * qty;
      return s;
    }, 0);
  }

  return sellable - totalBuyingCost - (order.packaging_cost || 0) - (order.fulfillment_cost || 0);
}

/**
 * Get the effective buying cost for a single item (unit_cost or commission fallback)
 */
export function getItemBuyingCost(item: OrderItemWithCost): number {
  if ((item.unit_cost ?? 0) > 0) return item.unit_cost!;
  const orig = item.original_price ?? 0;
  const comm = item.publisher_commission_percent ?? 0;
  if (orig > 0 && comm > 0) return orig - (orig * comm / 100);
  return 0;
}

/**
 * Calculate total profit across all verified orders
 */
export function calculateTotalProfit(
  orders: RevenueOrder[],
  allItems: OrderItemWithCost[]
): number {
  const itemsByOrder: Record<string, OrderItemWithCost[]> = {};
  allItems.forEach(i => {
    if (!itemsByOrder[i.order_id]) itemsByOrder[i.order_id] = [];
    itemsByOrder[i.order_id].push(i);
  });
  return orders.reduce((sum, o) => sum + calculateOrderProfit(o, itemsByOrder[o.id] || []), 0);
}

/**
 * Filter ledger income to exclude order-linked book_sale entries
 * (those are already counted via order-based Product Revenue)
 * Use this for "Other Income" in P&L to prevent double-counting.
 */
export function getLedgerOtherIncome(ledger: any[]): number {
  return ledger
    .filter(e => e.type === "income" && !(e.category === "book_sale" && e.order_id))
    .reduce((s: number, e: any) => s + Number(e.amount), 0);
}

/**
 * Detect duplicate ledger entries for the same order (diagnostic)
 */
export function detectDuplicateLedgerEntries(ledger: any[]): any[] {
  const seen = new Map<string, any>();
  const dupes: any[] = [];
  ledger.filter(e => e.type === "income" && e.order_id).forEach(e => {
    const key = `${e.order_id}_${e.category}`;
    if (seen.has(key)) {
      dupes.push({ existing: seen.get(key), duplicate: e });
      console.warn("[revenue_duplicate_ledger]", { order_id: e.order_id, category: e.category, amount: e.amount });
    } else {
      seen.set(key, e);
    }
  });
  return dupes;
}

/**
 * Revenue explanation for UI tooltips
 */
export const REVENUE_TOOLTIP = "Revenue = only orders where payment is confirmed (payments.status='paid'). Online: order status 'paid'/'access_granted'/'completed'. COD: only when settled to merchant. Excludes pending, processing, demo.";
