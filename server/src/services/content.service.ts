import { prisma } from "../lib/prisma.js";
import { TRPCError } from "@trpc/server";
import { isS3Url, createPresignedGetUrl } from "../lib/s3.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

async function toServeUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (isS3Url(url)) return createPresignedGetUrl(url, 3600);
  return resolveFileUrl(url);
}

export const getEbookSignedUrl = async (userId: string, bookId: string) => {
  if (!bookId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "book_id is required" });
  }

  const [book, ebookFormat] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId }, select: { is_free: true } }),
    prisma.bookFormat.findFirst({
      where: { book_id: bookId, format: "ebook", submission_status: "approved" },
      select: { file_url: true, price: true, preview_percentage: true },
    }),
  ]);

  if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
  if (!ebookFormat?.file_url) throw new TRPCError({ code: "NOT_FOUND", message: "Ebook file not found" });

  const isFreeContent = book.is_free || Number(ebookFormat.price ?? 0) <= 0;

  if (!isFreeContent) {
    // Check coin unlock
    const coinUnlock = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id: bookId, format: "ebook", status: "active" },
    });

    if (!coinUnlock) {
      // Check subscription
      const sub = await prisma.userSubscription.findFirst({
        where: {
          user_id: userId,
          status: "active",
          OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
        },
      });

      if (!sub) {
        // Check purchase
        const purchase = await prisma.userPurchase.findFirst({
          where: { user_id: userId, book_id: bookId, format: "ebook", status: "active" },
        });

        if (!purchase) {
          const previewPct = Number(ebookFormat.preview_percentage ?? 0);
          if (previewPct <= 0) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          // Has preview — fall through to return presigned URL
        }
      }
    }
  }

  const servedUrl = await toServeUrl(ebookFormat.file_url);
  const mimeType = ebookFormat.file_url.toLowerCase().endsWith(".epub")
    ? "application/epub+zip"
    : "application/pdf";

  return {
    signed_url: servedUrl,
    mime_type: mimeType,
    expires_in: 3600,
    preview_percentage: ebookFormat.preview_percentage ?? null,
  };
};
