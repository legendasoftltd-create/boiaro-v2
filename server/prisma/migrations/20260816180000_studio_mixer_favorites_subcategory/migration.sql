-- Mixer library completion: finer jingle/SFX taxonomy + per-RJ favourites.
ALTER TABLE "studio_audio_assets" ADD COLUMN "subcategory" TEXT;

CREATE TABLE "studio_asset_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "audio_asset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_asset_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "studio_asset_favorites_user_id_audio_asset_id_key" ON "studio_asset_favorites"("user_id", "audio_asset_id");

ALTER TABLE "studio_asset_favorites" ADD CONSTRAINT "studio_asset_favorites_audio_asset_id_fkey" FOREIGN KEY ("audio_asset_id") REFERENCES "studio_audio_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
