-- Make order_id nullable on payments (subscriptions don't have an order)
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;

-- Add subscription_id to payments
ALTER TABLE "payments" ADD COLUMN "subscription_id" TEXT;

-- Add foreign key from payments.subscription_id → user_subscriptions.id
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "user_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Change default status on user_subscriptions from 'active' to 'pending'
ALTER TABLE "user_subscriptions" ALTER COLUMN "status" SET DEFAULT 'pending';
