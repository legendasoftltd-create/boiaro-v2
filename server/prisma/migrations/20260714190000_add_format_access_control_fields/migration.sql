-- Per-format subscription/purchase/free-access controls, license window, and
-- rights status — subscription permission must always be controlled at the
-- BookFormat level (never globally), per format.
ALTER TABLE "book_formats"
  ADD COLUMN "purchase_allowed" BOOLEAN DEFAULT true,
  ADD COLUMN "free_access" BOOLEAN DEFAULT false,
  ADD COLUMN "subscription_delay_days" INTEGER DEFAULT 0,
  ADD COLUMN "license_start_date" TIMESTAMP(3),
  ADD COLUMN "license_end_date" TIMESTAMP(3),
  ADD COLUMN "rights_status" TEXT NOT NULL DEFAULT 'active';

-- "Included Plans" — which specific subscription plans unlock a given format.
-- No rows for a format means unrestricted (any active plan works); this keeps
-- every existing subscriber_access=true format working for all plans with no
-- backfill needed. Restriction only applies once an admin explicitly picks plans.
CREATE TABLE "book_format_subscription_plans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "book_format_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "book_format_subscription_plans_book_format_id_fkey" FOREIGN KEY ("book_format_id") REFERENCES "book_formats"("id") ON DELETE CASCADE,
  CONSTRAINT "book_format_subscription_plans_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "book_format_subscription_plans_book_format_id_plan_id_key" ON "book_format_subscription_plans"("book_format_id", "plan_id");
