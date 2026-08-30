-- Pro-rata share of the order-level coupon discount, per line.
--
-- Contributor earnings were computed from the undiscounted line total while the
-- accounting ledger recorded the discounted order total, so a discounted order
-- reported two different revenue figures. Earnings now use
-- (price * quantity) - discount_amount, which reconciles with the ledger.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: allocate each historical order's discount across its lines pro rata
-- by line value, so existing orders reconcile the same way going forward.
UPDATE "order_items" oi
SET "discount_amount" = ROUND((
      COALESCE(o."discount_amount", 0)
      * (oi."price" * oi."quantity")
      / NULLIF(line_totals.order_total, 0)
    )::numeric, 2)
FROM "orders" o
JOIN (
  SELECT "order_id", SUM("price" * "quantity") AS order_total
  FROM "order_items"
  GROUP BY "order_id"
) AS line_totals ON line_totals."order_id" = o."id"
WHERE oi."order_id" = o."id"
  AND COALESCE(o."discount_amount", 0) > 0;
