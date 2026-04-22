import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

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

      // Check access: coin unlock, purchase, or subscription
      const coinUnlock = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: bookId, format: contentType, status: "active" },
      });

      if (!coinUnlock) {
        const sub = await prisma.userSubscription.findFirst({
          where: { user_id: ctx.userId, status: "active", OR: [{ end_date: null }, { end_date: { gte: new Date() } }] },
        });
        if (!sub) {
          const purchase = await prisma.userPurchase.findFirst({
            where: { user_id: ctx.userId, book_id: bookId, format: contentType, status: "active" },
          });
          if (!purchase) {
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
              }
            } else {
              throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
            }
          }
        }
      }

      // Return the content URL
      if (contentType === "ebook") {
        const fmt = await prisma.bookFormat.findFirst({
          where: { book_id: bookId, format: "ebook", submission_status: "approved" },
          select: { file_url: true },
        });
        return { url: fmt?.file_url ?? null };
      }

      if (contentType === "audiobook" && trackNumber !== undefined) {
        const track = await prisma.audiobookTrack.findFirst({
          where: { book_format: { book_id: bookId }, track_number: trackNumber },
        });
        if (!track?.audio_url) return { url: null };
        if (/^https?:\/\//i.test(track.audio_url)) return { url: track.audio_url };
        // TODO: Generate R2/S3 signed URL when storage is configured
        return { url: null };
      }

      return { url: null };
    }),

  batchSignedUrls: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tracks = await prisma.audiobookTrack.findMany({
        where: { book_format: { book_id: input.bookId }, status: "active" },
        orderBy: { track_number: "asc" },
      });

      const urls: Record<number, string | null> = {};
      for (const t of tracks) {
        if (t.audio_url && /^https?:\/\//i.test(t.audio_url)) {
          urls[t.track_number] = t.audio_url;
        } else {
          urls[t.track_number] = null; // TODO: R2/S3 signed URL
        }
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
      // Verify access
      const hasAccess = await prisma.contentUnlock.findFirst({
        where: { user_id: ctx.userId, book_id: input.bookId, format: "ebook", status: "active" },
      });
      if (!hasAccess) {
        const sub = await prisma.userSubscription.findFirst({
          where: { user_id: ctx.userId, status: "active", OR: [{ end_date: null }, { end_date: { gte: new Date() } }] },
        });
        if (!sub) {
          const purchase = await prisma.userPurchase.findFirst({
            where: { user_id: ctx.userId, book_id: input.bookId, format: "ebook", status: "active" },
          });
          if (!purchase) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }

      const fmt = await prisma.bookFormat.findFirst({
        where: { book_id: input.bookId, format: "ebook", submission_status: "approved" },
        select: { file_url: true, preview_percentage: true },
      });
      return { file_url: fmt?.file_url ?? null, preview_percentage: fmt?.preview_percentage ?? null };
    }),
});
