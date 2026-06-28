-- CreateTable
CREATE TABLE "iap_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "track_id" TEXT,
    "product_id" TEXT,
    "store" TEXT NOT NULL DEFAULT 'app_store',
    "transaction_id" TEXT NOT NULL,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iap_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iap_transactions_transaction_id_key" ON "iap_transactions"("transaction_id");

-- CreateIndex
CREATE INDEX "iap_transactions_user_id_idx" ON "iap_transactions"("user_id");
