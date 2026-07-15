-- Premium TTS plan-gating and support-priority overrides. Both default to
-- preserving today's behavior: premium_tts_included=true means every existing
-- plan still grants premium voice to any active subscriber (unchanged), and
-- support_priority=NULL means tickets keep their current default flow.
ALTER TABLE "subscription_plans"
  ADD COLUMN "premium_tts_included" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "support_priority" TEXT;

-- Per-plan early-access override, decoupled from book_format_subscription_plans
-- (the "Included Plans" restriction list) so setting an override never
-- accidentally restricts which plans can access a format at all — it only
-- changes *when* a plan that already has access gets it. Absence of a row
-- means "use BookFormat.subscription_delay_days" (today's uniform behavior).
CREATE TABLE "book_format_early_access" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "book_format_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "delay_override_days" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "book_format_early_access_book_format_id_fkey" FOREIGN KEY ("book_format_id") REFERENCES "book_formats"("id") ON DELETE CASCADE,
  CONSTRAINT "book_format_early_access_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "book_format_early_access_book_format_id_plan_id_key" ON "book_format_early_access"("book_format_id", "plan_id");
