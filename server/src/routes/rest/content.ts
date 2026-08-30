import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth.js";
import { getEbookSignedUrl, streamEbookDownload } from "../../services/content.service.js";
import { prisma } from "../../lib/prisma.js";
import { s3Configured, createPresignedGetUrl, isS3Url } from "../../lib/s3.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";
import { checkBookFormatAccess } from "../../services/bookAccess.service.js";

const AUDIO_URL_TTL = 3600; // seconds

/**
 * Real, time-limited S3 presigned URL — the same treatment /secure-audio and
 * the tRPC content router already give. These two endpoints used to return
 * `<public url>?token=secure_token&expires=<ms>`: a literal placeholder over an
 * object in the public-read audio/* prefix, so the bare URL played for anyone,
 * forever, and the `expires` value was never checked by anything.
 */
async function toSignedAudioUrl(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl) return null;
  const resolved = resolveFileUrl(rawUrl);
  if (!resolved) return null;
  if (s3Configured && isS3Url(resolved)) {
    try {
      return await createPresignedGetUrl(resolved, AUDIO_URL_TTL);
    } catch {
      return null;
    }
  }
  // Local/CDN storage — nothing to sign against.
  return resolved;
}

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

contentRestRouter.post("/audio-url", requireAuth, async (req: AuthenticatedRequest, res) => {
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
    if (!track.is_preview) {
      const access = await checkBookFormatAccess(req.auth.userId, book_id, "audiobook");
      if (!access.hasAccess) {
        res.status(403).json({ error: "Chapter not unlocked" });
        return;
      }
    }
    const signedUrl = await toSignedAudioUrl(track.audio_url);
    if (!signedUrl) {
      res.status(404).json({ error: "Track audio is unavailable" });
      return;
    }
    res.json({ signed_url: signedUrl, expires_in: AUDIO_URL_TTL });
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
    const [access, tracks] = await Promise.all([
      checkBookFormatAccess(req.auth.userId, book_id, "audiobook"),
      prisma.audiobookTrack.findMany({
        where: { book_format_id: bookFormat.id, status: "active" },
        orderBy: { track_number: "asc" },
        select: { track_number: true, audio_url: true, is_preview: true },
      }),
    ]);
    res.json({
      tracks: await Promise.all(
        tracks.map(async (t) => {
          const playable = access.hasAccess || t.is_preview === true;
          return {
            track_number: t.track_number,
            signed_url: playable ? await toSignedAudioUrl(t.audio_url) : null,
            expires_in: AUDIO_URL_TTL,
          };
        })
      ),
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
        book_format: { select: { book_id: true } },
      },
    });
    if (!track?.audio_url) {
      res.status(404).json({ error: "Track not found" });
      return;
    }

    const isPreview = Boolean(track.is_preview);

    // Only a genuine preview track skips the entitlement check.
    //
    // This used to also skip it whenever `chapter_price` was unset, under a
    // variable called `isFree` — but an empty chapter_price means "this chapter
    // isn't sold individually", not "this chapter is free". Every audiobook
    // that prices at the format level (the normal case) has no chapter_price on
    // any track, so every one of its chapters was served to anyone who asked,
    // unauthenticated. Whether the content is free is a question only the
    // access engine can answer, and it answers it correctly for an anonymous
    // caller too: a genuinely free format returns hasAccess before it ever
    // needs a user id.
    if (!isPreview) {
      const userId = req.auth?.userId ?? null;
      const bookId = track.book_format.book_id;

      // Check per-chapter unlock first (cheaper, and independent of whole-format state)
      const chapterUnlock = userId
        ? await prisma.contentUnlock.findFirst({
            where: { user_id: userId, book_id: bookId, format: `audiobook_chapter_${trackId}`, status: "active" },
          })
        : null;

      if (!chapterUnlock) {
        // Whole-format entitlement (free / coin unlock / purchase / active subscription),
        // per the consolidated access engine — subscription is gated by this format's
        // own subscriber_access, delay, license window and included plans.
        const access = await checkBookFormatAccess(userId, bookId, "audiobook");
        if (!access.hasAccess) {
          if (!userId) {
            res.status(401).json({ error: "Authentication required" });
          } else {
            res.status(403).json({ error: "Chapter not unlocked" });
          }
          return;
        }
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