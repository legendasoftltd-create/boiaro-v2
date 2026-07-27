-- Ad Banners gain multi-image slide support: one AdBanner can now carry
-- several images, each with its own destination_url, that rotate in place
-- (mirrors the existing HeroBannerStrip carousel UX). Existing single-image
-- banners are migrated forward into a first slide so nothing regresses.

BEGIN;

-- CreateTable
CREATE TABLE "ad_banner_slides" (
    "id" TEXT NOT NULL,
    "banner_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "destination_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_banner_slides_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ad_banner_slides" ADD CONSTRAINT "ad_banner_slides_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "ad_banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing banner with an image becomes a single-slide banner,
-- carrying over its existing impressions/clicks so historical stats aren't lost.
INSERT INTO "ad_banner_slides" (id, banner_id, image_url, destination_url, display_order, impressions, clicks, created_at)
SELECT gen_random_uuid()::text, id, image_url, destination_url, 0, COALESCE(impressions, 0), COALESCE(clicks, 0), created_at
FROM "ad_banners"
WHERE image_url IS NOT NULL;

COMMIT;
