-- AlterTable
ALTER TABLE "studio_sessions" ADD COLUMN "recording_mode" TEXT NOT NULL DEFAULT 'voice_only';

-- CreateTable
CREATE TABLE "studio_audio_assets" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "license_acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_audio_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_audio_assets_owner_user_id_category_idx" ON "studio_audio_assets"("owner_user_id", "category");

-- CreateTable
CREATE TABLE "studio_playlist_items" (
    "id" TEXT NOT NULL,
    "studio_session_id" TEXT NOT NULL,
    "audio_asset_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "played_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_playlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_playlist_items_studio_session_id_position_idx" ON "studio_playlist_items"("studio_session_id", "position");

-- AddForeignKey
ALTER TABLE "studio_playlist_items" ADD CONSTRAINT "studio_playlist_items_studio_session_id_fkey" FOREIGN KEY ("studio_session_id") REFERENCES "studio_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_playlist_items" ADD CONSTRAINT "studio_playlist_items_audio_asset_id_fkey" FOREIGN KEY ("audio_asset_id") REFERENCES "studio_audio_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
