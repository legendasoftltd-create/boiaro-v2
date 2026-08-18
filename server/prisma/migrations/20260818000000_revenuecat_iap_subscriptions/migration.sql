-- RevenueCat IAP subscriptions (POST /subscriptions/subscribe-iap): extends
-- the existing IAP transaction ledger (previously book/chapter-only) to also
-- cover subscription purchases, and records what RevenueCat actually
-- verified onto the subscription itself.

-- book_id was required (every prior IAP transaction was a book/chapter
-- unlock) — a subscribe-iap transaction has no book at all.
ALTER TABLE "iap_transactions" ALTER COLUMN "book_id" DROP NOT NULL;
ALTER TABLE "iap_transactions" ADD COLUMN "subscription_id" TEXT;
ALTER TABLE "iap_transactions" ADD COLUMN "platform" TEXT;
ALTER TABLE "iap_transactions" ADD COLUMN "is_sandbox" BOOLEAN;
ALTER TABLE "iap_transactions" ADD COLUMN "purchase_date" TIMESTAMP(3);
ALTER TABLE "iap_transactions" ADD COLUMN "expires_date" TIMESTAMP(3);

ALTER TABLE "user_subscriptions" ADD COLUMN "store" TEXT;
ALTER TABLE "user_subscriptions" ADD COLUMN "is_sandbox" BOOLEAN;
ALTER TABLE "user_subscriptions" ADD COLUMN "purchase_date" TIMESTAMP(3);
ALTER TABLE "user_subscriptions" ADD COLUMN "expires_date" TIMESTAMP(3);
