import { TRPCError } from "@trpc/server";
import { prisma } from "./prisma.js";

/**
 * Server-side pricing authority for checkout.
 *
 * Nothing the client sends about money is trusted: line prices come from
 * BookFormat.price, the coupon is re-resolved and re-validated here, and the
 * grand total is recomputed from those. A client-supplied total is only ever
 * used to *cross-check* and reject a mismatched request, never to charge.
 *
 * Shared by tRPC orders.placeOrder, REST POST /orders and REST
 * POST /coupons/validate so the three can't drift apart.
 */

export type CartFormat = "ebook" | "audiobook" | "hardcopy";

export interface CartItemInput {
  book_id: string;
  format: string;
  quantity?: number;
  /** Title, used only to make error messages readable. */
  title?: string;
}

export interface PricedItem {
  book_id: string;
  format: CartFormat;
  quantity: number;
  /** Authoritative unit price resolved from BookFormat.price. */
  price: number;
  book_format_id: string | null;
  line_total: number;
  /**
   * This line's share of the order-level coupon discount, allocated pro rata by
   * line value. `price` stays the list price; the revenue base for the line is
   * `line_total - discount_amount`.
   *
   * COMMERCIAL CONVENTION: allocating pro rata means contributors share the
   * cost of a discount in proportion to their line. The alternative — the
   * platform absorbing the whole discount — would instead deduct it from the
   * platform share only. Change it here if that is the business decision.
   */
  discount_amount: number;
  /** line_total - discount_amount. What earnings are actually computed on. */
  net_amount: number;
}

export interface OrderPricing {
  items: PricedItem[];
  subtotal: number;
  discount: number;
  coupon_id: string | null;
  coupon_code: string | null;
  shipping_cost: number;
  total: number;
}

function bad(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}

/** Round to 2dp so repeated float arithmetic can't drift into 0.30000000000000004. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Line pricing ─────────────────────────────────────────────────────────────

/**
 * Resolve every cart line against the catalogue. Throws if a format doesn't
 * exist, isn't available, or isn't purchasable — all of which previously
 * produced a silently mispriced order instead of a rejection.
 */
const VALID_FORMATS: readonly string[] = ["ebook", "audiobook", "hardcopy"];

/** Upper bound on a single order. Well above any real cart; stops a crafted
 *  request from building an unbounded OR query. */
const MAX_CART_LINES = 50;
/** Upper bound per line — hardcopy stock is checked separately, this just
 *  keeps an absurd quantity from reaching the pricing arithmetic. */
const MAX_LINE_QUANTITY = 100;

export async function priceCartItems(items: CartItemInput[]): Promise<PricedItem[]> {
  if (!Array.isArray(items) || items.length === 0) {
    throw bad("items array is required");
  }
  if (items.length > MAX_CART_LINES) {
    throw bad(`An order can contain at most ${MAX_CART_LINES} items`);
  }

  // Validate the format before it reaches Prisma. The tRPC path has a z.enum,
  // but the REST path takes items straight from the body — an unknown format
  // string used to reach the query and surface as an unhandled enum error
  // (HTTP 500) instead of a 400.
  for (const i of items) {
    if (!i.book_id || typeof i.book_id !== "string") throw bad("Each item needs a book_id");
    if (!VALID_FORMATS.includes(i.format)) {
      throw bad(`Unknown format "${i.format}" — expected ebook, audiobook or hardcopy`);
    }
  }

  // The same book+format twice would create two order lines and charge for
  // both, while only ever granting one unlock.
  const seen = new Set<string>();
  for (const i of items) {
    const key = `${i.book_id}:${i.format}`;
    if (seen.has(key)) throw bad(`"${i.title || i.book_id}" (${i.format}) appears twice in the order`);
    seen.add(key);
  }

  // One query for the whole cart rather than one per line (the previous code
  // issued two findFirst calls per item).
  const formats = await prisma.bookFormat.findMany({
    where: { OR: items.map((i) => ({ book_id: i.book_id, format: i.format as any })) },
    select: {
      id: true,
      book_id: true,
      format: true,
      price: true,
      is_available: true,
      purchase_allowed: true,
      book: { select: { title: true } },
    },
  });
  const byKey = new Map(formats.map((f) => [`${f.book_id}:${f.format}`, f]));

  return items.map((item) => {
    const label = item.title || item.book_id;
    const quantity = Math.trunc(Number(item.quantity ?? 1));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw bad(`Invalid quantity for "${label}" — must be between 1 and ${MAX_LINE_QUANTITY}`);
    }
    const fmt = byKey.get(`${item.book_id}:${item.format}`);
    if (!fmt) {
      throw bad(`"${label}" is not available in the ${item.format} format`);
    }
    if (fmt.is_available === false) {
      throw bad(`"${fmt.book?.title || label}" (${item.format}) is not currently available`);
    }
    if (fmt.purchase_allowed === false) {
      throw bad(`"${fmt.book?.title || label}" (${item.format}) is not available for purchase`);
    }

    const price = money(Math.max(0, Number(fmt.price ?? 0)));
    const lineTotal = money(price * quantity);
    return {
      book_id: item.book_id,
      format: item.format as CartFormat,
      quantity,
      price,
      book_format_id: fmt.id,
      line_total: lineTotal,
      // Filled in by allocateDiscount() once the coupon is known.
      discount_amount: 0,
      net_amount: lineTotal,
    };
  });
}

// ── Coupon ───────────────────────────────────────────────────────────────────

export interface CouponEvaluation {
  coupon_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  applies_to: string;
  eligible_amount: number;
  discount_amount: number;
}

export interface CouponContext {
  userId: string;
  code: string;
  /** Per-book eligible amounts — required to scope book/category coupons. */
  items: { book_id: string; format?: string; amount: number }[];
  subtotal: number;
}

/**
 * Full coupon validation + discount computation. Every rule that the
 * pre-checkout /coupons/validate endpoint applies is applied here too, because
 * this is the copy that actually decides what the customer is charged.
 */
export async function evaluateCoupon(ctx: CouponContext): Promise<CouponEvaluation> {
  const code = String(ctx.code || "").trim().toUpperCase();
  if (!code) throw bad("Coupon code is required");

  const coupon = await prisma.coupon.findFirst({
    where: { code, status: "active" },
    include: { books: { select: { book_id: true } } },
  });
  if (!coupon) throw bad("Invalid coupon code");

  const now = new Date();
  if (coupon.start_date && coupon.start_date > now) throw bad("Coupon not yet active");
  if (coupon.end_date && coupon.end_date < now) throw bad("Coupon has expired");
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
    throw bad("Coupon usage limit reached");
  }
  if (coupon.min_order_amount && ctx.subtotal < coupon.min_order_amount) {
    throw bad(`Minimum order amount ৳${coupon.min_order_amount} required`);
  }

  const formatsInCart = new Set(ctx.items.map((i) => i.format).filter(Boolean));
  if (coupon.applies_to === "hardcopy" && !formatsInCart.has("hardcopy")) {
    throw bad("This coupon is for hardcopy orders only");
  }
  if (coupon.applies_to === "ebook" && !formatsInCart.has("ebook")) {
    throw bad("This coupon is for ebook orders only");
  }
  if (coupon.applies_to === "audiobook" && !formatsInCart.has("audiobook")) {
    throw bad("This coupon is for audiobook orders only");
  }

  const cartIds = ctx.items.map((i) => i.book_id);
  let eligibleAmount = ctx.subtotal;

  if (coupon.applies_to === "books") {
    const allowed = new Set(coupon.books.map((b) => b.book_id));
    const eligible = ctx.items.filter((i) => allowed.has(i.book_id));
    if (eligible.length === 0) throw bad("This coupon is not valid for any book in your cart");
    eligibleAmount = eligible.reduce((s, i) => s + Number(i.amount), 0);
  } else if (coupon.applies_to === "category" && coupon.category_id) {
    const matching = await prisma.book.findMany({
      where: { id: { in: cartIds }, category_id: coupon.category_id },
      select: { id: true },
    });
    const matchingIds = new Set(matching.map((b) => b.id));
    const eligible = ctx.items.filter((i) => matchingIds.has(i.book_id));
    if (eligible.length === 0) throw bad("This coupon is not valid for any book in your cart");
    eligibleAmount = eligible.reduce((s, i) => s + Number(i.amount), 0);
  }

  if (coupon.per_user_limit && coupon.per_user_limit > 0) {
    const used = await prisma.couponUsage.count({
      where: { coupon_id: coupon.id, user_id: ctx.userId },
    });
    if (used >= coupon.per_user_limit) throw bad("You have already used this coupon");
  }

  if (coupon.first_order_only) {
    const orderCount = await prisma.order.count({
      where: { user_id: ctx.userId, status: { in: ["confirmed", "paid", "completed", "delivered"] } },
    });
    if (orderCount > 0) throw bad("This coupon is for first-time orders only");
  }

  const discountAmount =
    coupon.discount_type === "percentage"
      ? Math.min(eligibleAmount, (eligibleAmount * coupon.discount_value) / 100)
      : Math.min(eligibleAmount, coupon.discount_value);

  return {
    coupon_id: coupon.id,
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    applies_to: coupon.applies_to,
    eligible_amount: money(eligibleAmount),
    discount_amount: money(Math.max(0, discountAmount)),
  };
}

/**
 * Spread an order-level discount across the lines in proportion to line value,
 * giving the rounding remainder to the largest line so the parts always sum
 * back to the whole. Without this the discount lived only on the order, so
 * per-item earnings never saw it.
 */
export function allocateDiscount(items: PricedItem[], discount: number): PricedItem[] {
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  if (discount <= 0 || subtotal <= 0) {
    return items.map((i) => ({ ...i, discount_amount: 0, net_amount: i.line_total }));
  }

  const capped = Math.min(discount, subtotal);
  const allocated = items.map((i) => money((capped * i.line_total) / subtotal));
  const drift = money(capped - allocated.reduce((s, a) => s + a, 0));

  if (drift !== 0) {
    let biggest = 0;
    for (let i = 1; i < items.length; i++) {
      if (items[i].line_total > items[biggest].line_total) biggest = i;
    }
    allocated[biggest] = money(allocated[biggest] + drift);
  }

  return items.map((i, idx) => ({
    ...i,
    discount_amount: allocated[idx],
    net_amount: money(i.line_total - allocated[idx]),
  }));
}

// ── Whole-order pricing ──────────────────────────────────────────────────────

export interface PriceOrderParams {
  userId: string;
  items: CartItemInput[];
  couponCode?: string | null;
  /**
   * Shipping is quoted by the carrier integration, not by the catalogue, so it
   * is accepted from the client but clamped to >= 0. A negative value was the
   * only way it could be used to shrink the total; inflating it only ever
   * costs the customer more, and it is excluded from the earnings base.
   */
  shippingCost?: number | null;
  /**
   * Client's own figure, used purely as a cross-check. When it disagrees with
   * the server's, the order is rejected rather than silently repriced, so a
   * genuine catalogue price change mid-checkout surfaces instead of surprising
   * the customer at the gateway.
   */
  clientTotal?: number | null;
}

export async function priceOrder(params: PriceOrderParams): Promise<OrderPricing> {
  let items = await priceCartItems(params.items);
  const subtotal = money(items.reduce((s, i) => s + i.line_total, 0));

  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;

  if (params.couponCode) {
    const evaluated = await evaluateCoupon({
      userId: params.userId,
      code: params.couponCode,
      items: items.map((i) => ({ book_id: i.book_id, format: i.format, amount: i.line_total })),
      subtotal,
    });
    discount = evaluated.discount_amount;
    couponId = evaluated.coupon_id;
    couponCode = evaluated.code;
  }

  // Push the order-level discount down onto the lines so the revenue base of
  // the parts equals the revenue base of the whole.
  items = allocateDiscount(items, discount);

  const shipping = money(Math.max(0, Number(params.shippingCost ?? 0)));
  const total = money(Math.max(0, subtotal - discount + shipping));

  if (params.clientTotal !== undefined && params.clientTotal !== null) {
    const claimed = Number(params.clientTotal);
    if (Number.isFinite(claimed) && Math.abs(claimed - total) > 0.01) {
      throw bad(
        `Order total has changed — your cart shows ৳${claimed.toFixed(2)} but the current price is ৳${total.toFixed(2)}. Please refresh and try again.`
      );
    }
  }

  return {
    items,
    subtotal,
    discount,
    coupon_id: couponId,
    coupon_code: couponCode,
    shipping_cost: shipping,
    total,
  };
}
