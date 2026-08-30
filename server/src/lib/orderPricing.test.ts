import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guards the fix for the checkout pricing bypass: order totals and line prices
 * used to be taken verbatim from the client, so any cart could be bought for
 * any amount. These assert that the server prices the cart itself and that a
 * client-supplied total can only reject the order, never set it.
 */

const db = {
  bookFormat: { findMany: vi.fn() },
  coupon: { findFirst: vi.fn() },
  couponUsage: { count: vi.fn() },
  order: { count: vi.fn() },
  book: { findMany: vi.fn() },
};

vi.mock("./prisma.js", () => ({ prisma: db }));

const { priceOrder, priceCartItems, allocateDiscount } = await import("./orderPricing.js");

const FORMAT = (over: Record<string, unknown> = {}) => ({
  id: "fmt-1",
  book_id: "book-1",
  format: "ebook",
  price: 500,
  is_available: true,
  purchase_allowed: true,
  book: { title: "Test Book" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.bookFormat.findMany.mockResolvedValue([FORMAT()]);
  db.couponUsage.count.mockResolvedValue(0);
  db.order.count.mockResolvedValue(0);
  db.book.findMany.mockResolvedValue([]);
});

const CART = [{ book_id: "book-1", format: "ebook", quantity: 1 }];

describe("priceCartItems", () => {
  it("prices from the catalogue, ignoring anything the client claims", async () => {
    const items = await priceCartItems([{ book_id: "book-1", format: "ebook", quantity: 2 }]);
    expect(items[0].price).toBe(500);
    expect(items[0].line_total).toBe(1000);
    expect(items[0].book_format_id).toBe("fmt-1");
  });

  it("rejects a format that does not exist", async () => {
    db.bookFormat.findMany.mockResolvedValue([]);
    await expect(priceCartItems(CART)).rejects.toThrow(/not available in the ebook format/);
  });

  it("rejects an unavailable format", async () => {
    db.bookFormat.findMany.mockResolvedValue([FORMAT({ is_available: false })]);
    await expect(priceCartItems(CART)).rejects.toThrow(/not currently available/);
  });

  it("rejects a format that is not for sale", async () => {
    db.bookFormat.findMany.mockResolvedValue([FORMAT({ purchase_allowed: false })]);
    await expect(priceCartItems(CART)).rejects.toThrow(/not available for purchase/);
  });

  it("rejects a non-positive quantity", async () => {
    await expect(priceCartItems([{ book_id: "book-1", format: "ebook", quantity: 0 }]))
      .rejects.toThrow(/Invalid quantity/);
    await expect(priceCartItems([{ book_id: "book-1", format: "ebook", quantity: -3 }]))
      .rejects.toThrow(/Invalid quantity/);
  });

  it("rejects an empty cart", async () => {
    await expect(priceCartItems([])).rejects.toThrow(/items array is required/);
  });

  it("rejects an unknown format before it reaches the database", async () => {
    // The REST path takes items straight from the body, so an unknown format
    // string used to reach Prisma and surface as a 500 rather than a 400.
    await expect(priceCartItems([{ book_id: "book-1", format: "pdf" }]))
      .rejects.toThrow(/Unknown format "pdf"/);
    expect(db.bookFormat.findMany).not.toHaveBeenCalled();
  });

  it("rejects an item with no book_id", async () => {
    await expect(priceCartItems([{ book_id: "", format: "ebook" }]))
      .rejects.toThrow(/needs a book_id/);
  });

  it("rejects the same book and format listed twice", async () => {
    // Two identical lines would create two order lines and charge for both
    // while only ever granting one unlock.
    await expect(priceCartItems([
      { book_id: "book-1", format: "ebook" },
      { book_id: "book-1", format: "ebook" },
    ])).rejects.toThrow(/appears twice/);
  });

  it("allows the same book in two different formats", async () => {
    db.bookFormat.findMany.mockResolvedValue([
      FORMAT(),
      FORMAT({ id: "fmt-2", format: "audiobook", price: 300 }),
    ]);
    const items = await priceCartItems([
      { book_id: "book-1", format: "ebook" },
      { book_id: "book-1", format: "audiobook" },
    ]);
    expect(items).toHaveLength(2);
  });

  it("caps the number of lines in one order", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ book_id: `b${i}`, format: "ebook" }));
    await expect(priceCartItems(many)).rejects.toThrow(/at most 50 items/);
  });

  it("caps the quantity on a single line", async () => {
    await expect(priceCartItems([{ book_id: "book-1", format: "ebook", quantity: 100000 }]))
      .rejects.toThrow(/must be between 1 and 100/);
  });
});

describe("priceOrder", () => {
  it("computes the total from the catalogue", async () => {
    const p = await priceOrder({ userId: "u1", items: CART });
    expect(p.subtotal).toBe(500);
    expect(p.total).toBe(500);
    expect(p.discount).toBe(0);
  });

  it("rejects an order whose client total disagrees with the server's", async () => {
    // The original defect, as an assertion: a BDT 1 total for a BDT 500 book.
    await expect(priceOrder({ userId: "u1", items: CART, clientTotal: 1 }))
      .rejects.toThrow(/Order total has changed/);
  });

  it("accepts a client total that matches", async () => {
    const p = await priceOrder({ userId: "u1", items: CART, clientTotal: 500 });
    expect(p.total).toBe(500);
  });

  it("never lets negative shipping shrink the total", async () => {
    const p = await priceOrder({ userId: "u1", items: CART, shippingCost: -400 });
    expect(p.shipping_cost).toBe(0);
    expect(p.total).toBe(500);
  });

  it("adds positive shipping", async () => {
    const p = await priceOrder({ userId: "u1", items: CART, shippingCost: 60 });
    expect(p.total).toBe(560);
  });

  it("computes the discount from the coupon, not from the client", async () => {
    db.coupon.findFirst.mockResolvedValue({
      id: "c1", code: "SAVE10", status: "active", discount_type: "percentage",
      discount_value: 10, applies_to: "all", start_date: null, end_date: null,
      usage_limit: null, used_count: 0, min_order_amount: null, per_user_limit: null,
      first_order_only: false, category_id: null, books: [],
    });
    const p = await priceOrder({ userId: "u1", items: CART, couponCode: "SAVE10" });
    expect(p.discount).toBe(50);
    expect(p.total).toBe(450);
    expect(p.coupon_id).toBe("c1");
  });

  it("refuses an expired coupon", async () => {
    db.coupon.findFirst.mockResolvedValue({
      id: "c1", code: "OLD", status: "active", discount_type: "percentage",
      discount_value: 50, applies_to: "all", start_date: null,
      end_date: new Date("2020-01-01"), usage_limit: null, used_count: 0,
      min_order_amount: null, per_user_limit: null, first_order_only: false,
      category_id: null, books: [],
    });
    await expect(priceOrder({ userId: "u1", items: CART, couponCode: "OLD" }))
      .rejects.toThrow(/expired/);
  });

  it("refuses a coupon that has hit its usage limit", async () => {
    db.coupon.findFirst.mockResolvedValue({
      id: "c1", code: "MAXED", status: "active", discount_type: "fixed",
      discount_value: 100, applies_to: "all", start_date: null, end_date: null,
      usage_limit: 5, used_count: 5, min_order_amount: null, per_user_limit: null,
      first_order_only: false, category_id: null, books: [],
    });
    await expect(priceOrder({ userId: "u1", items: CART, couponCode: "MAXED" }))
      .rejects.toThrow(/usage limit/);
  });

  it("refuses an unknown coupon code", async () => {
    db.coupon.findFirst.mockResolvedValue(null);
    await expect(priceOrder({ userId: "u1", items: CART, couponCode: "NOPE" }))
      .rejects.toThrow(/Invalid coupon code/);
  });

  it("caps a fixed discount at the eligible amount so the total never goes negative", async () => {
    db.coupon.findFirst.mockResolvedValue({
      id: "c1", code: "HUGE", status: "active", discount_type: "fixed",
      discount_value: 999999, applies_to: "all", start_date: null, end_date: null,
      usage_limit: null, used_count: 0, min_order_amount: null, per_user_limit: null,
      first_order_only: false, category_id: null, books: [],
    });
    const p = await priceOrder({ userId: "u1", items: CART, couponCode: "HUGE" });
    expect(p.discount).toBe(500);
    expect(p.total).toBe(0);
  });
});

describe("allocateDiscount", () => {
  /**
   * Guards the fix for the reporting divergence: the order-level discount used
   * to live only on the order, so contributor earnings were computed on gross
   * line totals while the ledger recorded the discounted total. The parts have
   * to sum back to the whole, exactly.
   */
  const line = (id: string, total: number) => ({
    book_id: id, format: "ebook" as const, quantity: 1, price: total,
    book_format_id: `fmt-${id}`, line_total: total, discount_amount: 0, net_amount: total,
  });

  it("is a no-op when there is no discount", () => {
    const out = allocateDiscount([line("a", 300), line("b", 200)], 0);
    expect(out.map((i) => i.discount_amount)).toEqual([0, 0]);
    expect(out.map((i) => i.net_amount)).toEqual([300, 200]);
  });

  it("splits the discount in proportion to line value", () => {
    const out = allocateDiscount([line("a", 300), line("b", 100)], 40);
    expect(out[0].discount_amount).toBe(30);
    expect(out[1].discount_amount).toBe(10);
    expect(out[0].net_amount).toBe(270);
    expect(out[1].net_amount).toBe(90);
  });

  it("always sums back to the full discount, even with awkward rounding", () => {
    for (const discount of [10, 33.33, 99.99, 1, 0.01]) {
      const out = allocateDiscount([line("a", 33.33), line("b", 33.33), line("c", 33.34)], discount);
      const sum = out.reduce((s, i) => s + i.discount_amount, 0);
      expect(Math.abs(sum - discount)).toBeLessThan(0.005);
    }
  });

  it("keeps the earnings base equal to the ledger base", () => {
    // The ledger records subtotal - discount. The sum of line net amounts,
    // which is what earnings are computed on, must equal it.
    const items = [line("a", 499.5), line("b", 250.25), line("c", 0.25)];
    const subtotal = items.reduce((s, i) => s + i.line_total, 0);
    const discount = 125.75;
    const out = allocateDiscount(items, discount);
    const earningsBase = out.reduce((s, i) => s + i.net_amount, 0);
    expect(Math.abs(earningsBase - (subtotal - discount))).toBeLessThan(0.005);
  });

  it("never allocates more than the line is worth", () => {
    const out = allocateDiscount([line("a", 100), line("b", 50)], 999);
    for (const i of out) {
      expect(i.discount_amount).toBeLessThanOrEqual(i.line_total + 0.005);
      expect(i.net_amount).toBeGreaterThanOrEqual(-0.005);
    }
  });

  it("handles a single line", () => {
    const out = allocateDiscount([line("a", 500)], 50);
    expect(out[0].discount_amount).toBe(50);
    expect(out[0].net_amount).toBe(450);
  });
});
