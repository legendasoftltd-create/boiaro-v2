-- AlterTable
ALTER TABLE "user_purchases" ADD COLUMN "order_id" TEXT;

-- AddForeignKey
ALTER TABLE "user_purchases" ADD CONSTRAINT "user_purchases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
