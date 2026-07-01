-- AlterTable: add category_id to coupons
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "category_id" TEXT;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: coupon_books join table
CREATE TABLE IF NOT EXISTS "coupon_books" (
    "id"        TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "book_id"   TEXT NOT NULL,
    CONSTRAINT "coupon_books_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "coupon_books" ADD CONSTRAINT "coupon_books_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupon_books" ADD CONSTRAINT "coupon_books_book_id_fkey"
  FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "coupon_books_coupon_id_book_id_key" ON "coupon_books"("coupon_id", "book_id");
