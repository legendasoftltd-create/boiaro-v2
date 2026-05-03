/**
 * Storage Sync Service
 *
 * Background job that runs every 30 seconds.
 * When S3 was down and files were saved locally, this service:
 *   1. Checks if S3 is now reachable (circuit half-open or closed).
 *   2. Uploads each queued local file to S3.
 *   3. Replaces every occurrence of the old local URL in the database with
 *      the new S3 URL across all URL-bearing tables.
 *   4. Deletes the local file.
 *   5. Removes the entry from the pending queue.
 */

import fs from "fs";
import {
  s3Configured,
  getCircuitState,
  uploadToS3,
  loadPendingQueue,
  removeFromPendingQueue,
  pendingQueueSize,
} from "../lib/s3.js";
import { prisma } from "../lib/prisma.js";

// ─── DB URL Patching ─────────────────────────────────────────────────────────
//
// Every table / field that stores a file URL must be listed here so that
// local fallback URLs are replaced with S3 URLs after a successful sync.

async function patchAllDbUrls(localUrl: string, s3Url: string): Promise<void> {
  await Promise.allSettled([
    // Books
    prisma.book.updateMany({ where: { cover_url: localUrl }, data: { cover_url: s3Url } }),

    // Book formats (ebook/audiobook/hardcopy file URLs)
    prisma.bookFormat.updateMany({ where: { file_url: localUrl }, data: { file_url: s3Url } }),

    // Audiobook tracks
    prisma.audiobookTrack.updateMany({ where: { audio_url: localUrl }, data: { audio_url: s3Url } }),

    // People
    prisma.author.updateMany({ where: { avatar_url: localUrl }, data: { avatar_url: s3Url } }),
    prisma.narrator.updateMany({ where: { avatar_url: localUrl }, data: { avatar_url: s3Url } }),
    prisma.publisher.updateMany({ where: { logo_url: localUrl }, data: { logo_url: s3Url } }),

    // User profiles
    prisma.profile.updateMany({ where: { avatar_url: localUrl }, data: { avatar_url: s3Url } }),
    prisma.rjProfile.updateMany({ where: { avatar_url: localUrl }, data: { avatar_url: s3Url } }),

    // Content / site
    prisma.adBanner.updateMany({ where: { image_url: localUrl }, data: { image_url: s3Url } }),
    prisma.heroBanner.updateMany({ where: { image_url: localUrl }, data: { image_url: s3Url } }),
    prisma.blogPost.updateMany({ where: { cover_image: localUrl }, data: { cover_image: s3Url } }),
    prisma.cmsPage.updateMany({ where: { featured_image: localUrl }, data: { featured_image: s3Url } }),
    prisma.notification.updateMany({ where: { image_url: localUrl }, data: { image_url: s3Url } }),

    // Radio / TTS / Gamification
    prisma.radioStation.updateMany({ where: { artwork_url: localUrl }, data: { artwork_url: s3Url } }),
    prisma.badgeDefinition.updateMany({ where: { icon_url: localUrl }, data: { icon_url: s3Url } }),
    prisma.ttsAudio.updateMany({ where: { audio_url: localUrl }, data: { audio_url: s3Url } }),

    // Ebook chapters
    prisma.ebookChapter.updateMany({ where: { file_url: localUrl }, data: { file_url: s3Url } }),
  ]);
}

// ─── Sync Loop ────────────────────────────────────────────────────────────────

let syncInProgress = false;

export async function runStorageSync(): Promise<void> {
  if (!s3Configured) return;           // nothing to sync: S3 never configured
  if (syncInProgress) return;          // previous run still going
  if (pendingQueueSize() === 0) return; // nothing waiting

  // Only proceed when circuit is not fully open (allow closed or half-open probe)
  const state = getCircuitState();
  if (state === "open") {
    console.debug("[storage-sync] circuit open — skipping sync attempt");
    return;
  }

  syncInProgress = true;
  const queue = loadPendingQueue();
  console.log(`[storage-sync] starting — ${queue.length} file(s) pending`);

  let uploaded = 0;
  let failed = 0;

  for (const entry of queue) {
    // Local file must still exist
    if (!fs.existsSync(entry.localPath)) {
      console.warn(`[storage-sync] local file missing, dropping from queue: ${entry.localPath}`);
      removeFromPendingQueue(entry.id);
      continue;
    }

    try {
      const buffer = fs.readFileSync(entry.localPath);
      const s3Url = await uploadToS3(buffer, entry.originalName, entry.mimeType, entry.options);

      // Patch all DB tables where the old local URL is stored
      await patchAllDbUrls(entry.localUrl, s3Url);
      console.log(`[storage-sync] ✓ synced ${entry.originalName} → ${s3Url}`);

      // Clean up local file
      try { fs.unlinkSync(entry.localPath); } catch {}

      removeFromPendingQueue(entry.id);
      uploaded++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[storage-sync] ✗ failed to sync ${entry.originalName}: ${msg}`);
      // Leave in queue — will retry on next interval
    }
  }

  console.log(`[storage-sync] done — ✓ ${uploaded} uploaded, ✗ ${failed} failed`);
  syncInProgress = false;
}

// ─── Service Start ────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 30_000; // 30 seconds
let _timer: ReturnType<typeof setInterval> | null = null;

export function startStorageSyncService(): void {
  if (!s3Configured) {
    console.log("[storage-sync] S3 not configured — sync service disabled");
    return;
  }
  if (_timer) return; // already running
  console.log("[storage-sync] service started (interval: 30s)");
  _timer = setInterval(runStorageSync, SYNC_INTERVAL_MS);
  // Also run immediately on startup to catch any files queued from previous session
  setImmediate(runStorageSync);
}

export function stopStorageSyncService(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
