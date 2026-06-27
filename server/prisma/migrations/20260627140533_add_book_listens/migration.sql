-- AlterTable
ALTER TABLE "books" ADD COLUMN "total_listens" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "book_listens" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "book_listens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_listens_user_id_book_id_key" ON "book_listens"("user_id", "book_id");

-- AddForeignKey
ALTER TABLE "book_listens" ADD CONSTRAINT "book_listens_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
