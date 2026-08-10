-- AlterTable
ALTER TABLE "payment_gateways" ADD COLUMN "web_enabled" BOOLEAN NOT NULL DEFAULT true;

-- Data fix: RevenueCat is Apple IAP only, has no web implementation, and
-- must never be offered on web checkout.
UPDATE "payment_gateways" SET "web_enabled" = false WHERE "gateway_key" = 'revenuecat';
