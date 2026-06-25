-- CreateTable
CREATE TABLE "translators" (
    "id" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "genre" TEXT,
    "is_featured" BOOLEAN DEFAULT false,
    "is_trending" BOOLEAN DEFAULT false,
    "linked_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "phone" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "translators_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "books" ADD COLUMN "translator_id" TEXT;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_translator_id_fkey" FOREIGN KEY ("translator_id") REFERENCES "translators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
