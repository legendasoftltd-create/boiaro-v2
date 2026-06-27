import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth.js";
import { getEbookSignedUrl, streamEbookDownload } from "../../services/content.service.js";
import { prisma } from "../../lib/prisma.js";
import { s3Configured, createPresignedGetUrl, isS3Url } from "../../lib/s3.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";

export const contentRestRouter = Router();

contentRestRouter.get("/download/ebook/:bookId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await streamEbookDownload(req.auth.userId, req.params.bookId as string, res);
  } catch (error) {
    sendHttpError(res, error);
  }
});

contentRestRouter.post("/ebook-url", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId;
    const { book_id } = req.body;
    const result = await getEbookSignedUrl(userId, book_id);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

contentRestRouter.post("/audio-url", async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, track_number = 1 } = req.body;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id, format: "audiobook" },
      select: { id: true },
    });
    if (!bookFormat) {
      res.status(404).json({ error: "Audiobook format not found" });
      return;
    }
    const track = await prisma.audiobookTrack.findFirst({
      where: { book_format_id: bookFormat.id, track_number: Number(track_number) },
      select: { audio_url: true, is_preview: true },
    });
    if (!track?.audio_url) {
      res.status(404).json({ error: "Track not found" });
      return;
    }
    const expires = Date.now() + 300_000;
    const resolvedUrl = resolveFileUrl(track.audio_url)!;
    res.json({
      signed_url: `${resolvedUrl}?token=secure_token&expires=${expires}`,
      expires_in: 300,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

contentRestRouter.post("/batch-audio-urls", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id } = req.body;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id, format: "audiobook" },
      select: { id: true },
    });
    if (!bookFormat) {
      res.status(404).json({ error: "Audiobook format not found" });
      return;
    }
    const tracks = await prisma.audiobookTrack.findMany({
      where: { book_format_id: bookFormat.id, status: "active" },
      orderBy: { track_number: "asc" },
      select: { track_number: true, audio_url: true },
    });
    const expires = Date.now() + 300_000;
    res.json({
      tracks: tracks.map((t) => ({
        track_number: t.track_number,
        signed_url: t.audio_url ? `${resolveFileUrl(t.audio_url)}?token=secure_token&expires=${expires}` : null,
        expires_in: 300,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/content/secure-audio/:trackId ──────────────────────────────
// Returns a short-lived signed audio URL after verifying access rights.
// For preview tracks — no auth required.
// For locked chapters — user must have an active unlock or full-book access.
contentRestRouter.get("/secure-audio/:trackId", async (req: AuthenticatedRequest, res) => {
  try {
    const trackId = String(req.params.trackId);
    const track = await prisma.audiobookTrack.findUnique({
      where: { id: trackId },
      select: {
        audio_url: true,
        is_preview: true,
        chapter_price: true,
        book_format: { select: { id: true, book_id: true, coin_price: true } },
      },
    });
    if (!track?.audio_url) {
      res.status(404).json({ error: "Track not found" });
      return;
    }

    const isPreview = Boolean(track.is_preview);
    const isFree = !track.chapter_price || track.chapter_price <= 0;

    if (!isPreview && !isFree) {
      // Require auth for paid chapters
      const userId = req.auth?.userId;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const bookId = track.book_format.book_id;

      // Check full-book unlock
      const fullUnlock = await prisma.contentUnlock.findFirst({
        where: { user_id: userId, book_id: bookId, format: "audiobook", status: "active" },
      });
      // Check per-chapter unlock
      const chapterUnlock = !fullUnlock
        ? await prisma.contentUnlock.findFirst({
            where: { user_id: userId, book_id: bookId, format: `audiobook_chapter_${trackId}`, status: "active" },
          })
        : null;
      // Check if book is free for the user (via subscription or book flag) — but the
      // book-level flag never overrides a chapter that has its own explicit price.
      const hasChapterPrice = Number(track.chapter_price ?? 0) > 0;
      const book = !fullUnlock && !chapterUnlock && !hasChapterPrice
        ? await prisma.book.findUnique({ where: { id: bookId }, select: { is_free: true } })
        : null;

      if (!fullUnlock && !chapterUnlock && !Boolean(book?.is_free)) {
        res.status(403).json({ error: "Chapter not unlocked" });
        return;
      }
    }

    // Generate signed URL if S3, otherwise return public URL
    const rawUrl = track.audio_url;
    const EXPIRES_SECONDS = 3600; // 1 hour
    const signedUrl = s3Configured && isS3Url(rawUrl)
      ? await createPresignedGetUrl(rawUrl, EXPIRES_SECONDS)
      : resolveFileUrl(rawUrl) ?? rawUrl;

    res.json({ url: signedUrl, expires_in: s3Configured ? EXPIRES_SECONDS : null });
  } catch (error) {
    sendHttpError(res, error);
  }
});