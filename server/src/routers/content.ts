import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { isS3Url, createPresignedGetUrl } from "../lib/s3.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";
import { checkBookFormatAccess } from "../services/bookAccess.service.js";

async function toServeUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  // Private content on S3 → time-limited presigned URL
  if (isS3Url(url)) return createPresignedGetUrl(url, 3600);
  // Local storage → resolve to absolute URL (handles localhost and relative paths)
  return resolveFileUrl(url);
}

export const contentRouter = router({
  /**
   * Returns a signed URL for an audiobook track.
   * For tracks stored as direct HTTPS URLs, this returns the URL unchanged.
   * For relative paths (R2/S3), this will generate a signed URL once storage is configured.
   */
  getSignedUrl: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      contentType: z.enum(["ebook", "audiobook"]),
      trackNumber: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { bookId, contentType, trackNumber } = input;
      const formatRecord = await prisma.bookFormat.findFirst({
        where: { book_id: bookId, format: contentType, submission_status: "approved" },
        select: { file_url: true, preview_percentage: true },
      });

      // hasWholeBookAccess tracks real entitlement to the FULL file — distinct
      // from merely being allowed to view a preview track/clip below.
      const access = await checkBookFormatAccess(ctx.userId, bookId, contentType);
      let hasWholeBookAccess = access.hasAccess;
      let hasDirectChapterUnlock = false;

      if (!hasWholeBookAccess) {
        // Check chapter-level unlock for audiobooks
        if (contentType === "audiobook" && trackNumber !== undefined) {
          const track = await prisma.audiobookTrack.findFirst({
            where: { book_format: { book_id: bookId }, track_number: trackNumber },
          });
          if (!track?.is_preview) {
            const chapterUnlock = await prisma.contentUnlock.findFirst({
              where: {
                user_id: ctx.userId,
                book_id: bookId,
                format: `audiobook_chapter_${track?.id}`,
                status: "active",
              },
            });
            if (!chapterUnlock) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
            hasDirectChapterUnlock = true;
          }
        } else if (contentType === "ebook") {
          // Allow the URL to be returned for preview if preview_percentage > 0.
          // The client-side useEbookAccess hook enforces the page limit.
          const previewPct = Number(formatRecord?.preview_percentage ?? 0);
          if (previewPct <= 0) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          // previewPct > 0 → fall through and return the URL so the reader can show the preview
        } else {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }

      // Return the content URL (presigned if stored on S3)
      if (contentType === "ebook") {
        return { url: await toServeUrl(formatRecord?.file_url) };
      }

      if (contentType === "audiobook" && trackNumber !== undefined) {
        const track = await prisma.audiobookTrack.findFirst({
          where: { book_format: { book_id: bookId }, track_number: trackNumber },
        });
        if (!track?.audio_url) return { url: null };
        // A preview track must serve the trimmed clip — never the full file —
        // unless the user has real entitlement to the whole book/chapter, so
        // the listening cap can't be bypassed by backgrounding the app or any
        // other client-side trick. Falls back to the full file only if the
        // clip hasn't been generated yet (e.g. track was just created).
        const usePreviewClip = track.is_preview === true && !hasWholeBookAccess && !hasDirectChapterUnlock && Boolean(track.preview_audio_url);
        return { url: await toServeUrl(usePreviewClip ? track.preview_audio_url : track.audio_url) };
      }

      return { url: null };
    }),

  batchSignedUrls: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { bookId } = input;
      const [access, tracks] = await Promise.all([
        checkBookFormatAccess(ctx.userId, bookId, "audiobook"),
        prisma.audiobookTrack.findMany({
          where: { book_format: { book_id: bookId }, status: "active" },
          orderBy: { track_number: "asc" },
        }),
      ]);

      // Whole-book entitlement: free/coin unlock/purchase/subscription, per
      // the consolidated access engine. (Per-chapter coin unlocks are checked
      // individually below, same as getSignedUrl.)
      const hasWholeBookAccess = access.hasAccess;

      let unlockedChapterIds = new Set<string>();
      if (!hasWholeBookAccess) {
        const chapterUnlocks = await prisma.contentUnlock.findMany({
          where: { user_id: ctx.userId, book_id: bookId, status: "active", format: { startsWith: "audiobook_chapter_" } },
          select: { format: true },
        });
        unlockedChapterIds = new Set(chapterUnlocks.map(u => u.format.replace("audiobook_chapter_", "")));
      }

      const urls: Record<number, string | null> = {};
      for (const t of tracks) {
        const hasDirectUnlock = unlockedChapterIds.has(t.id);
        const canAccess = hasWholeBookAccess || t.is_preview === true || hasDirectUnlock;
        if (!canAccess) { urls[t.track_number] = null; continue; }
        // Preview tracks serve the trimmed clip — never the full file — unless
        // the user has real entitlement, so the cap can't be bypassed by any
        // client-side trick. Falls back to the full file if no clip exists yet.
        const usePreviewClip = t.is_preview === true && !hasWholeBookAccess && !hasDirectUnlock && Boolean(t.preview_audio_url);
        urls[t.track_number] = await toServeUrl(usePreviewClip ? t.preview_audio_url : t.audio_url);
      }
      return { urls };
    }),

  logAccess: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      contentType: z.string(),
      accessGranted: z.boolean(),
      denialReason: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      prisma.contentAccessLog.create({
        data: {
          user_id: ctx.userId,
          book_id: input.bookId,
          content_type: input.contentType,
          access_granted: input.accessGranted,
          denial_reason: input.denialReason ?? null,
        },
      })
    ),

  ebookContent: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [access, ebookFormat] = await Promise.all([
        checkBookFormatAccess(ctx.userId, input.bookId, "ebook"),
        prisma.bookFormat.findFirst({
          where: { book_id: input.bookId, format: "ebook", submission_status: "approved" },
          select: { file_url: true, preview_percentage: true },
        }),
      ]);
      if (!access.hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      return { file_url: await toServeUrl(ebookFormat?.file_url), preview_percentage: ebookFormat?.preview_percentage ?? null };
    }),
});
