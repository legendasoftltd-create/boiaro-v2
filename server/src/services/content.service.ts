import type { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { TRPCError } from "@trpc/server";
import { isS3Url, createPresignedGetUrl, s3Client, s3Configured } from "../lib/s3.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";

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
          status: { in: ["active", "cancelled"] },
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

export const streamEbookDownload = async (
  userId: string,
  bookId: string,
  res: Response
) => {
  if (!bookId) {
    res.status(400).json({ error: "book_id is required" });
    return;
  }

  const [book, ebookFormat] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId }, select: { is_free: true } }),
    prisma.bookFormat.findFirst({
      where: { book_id: bookId, format: "ebook", submission_status: "approved" },
      select: { file_url: true, price: true, preview_percentage: true },
    }),
  ]);

  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  if (!ebookFormat?.file_url) { res.status(404).json({ error: "Ebook file not found" }); return; }

  const isFreeContent = book.is_free || Number(ebookFormat.price ?? 0) <= 0;

  if (!isFreeContent) {
    const coinUnlock = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id: bookId, format: "ebook", status: "active" },
    });

    if (!coinUnlock) {
      const sub = await prisma.userSubscription.findFirst({
        where: {
          user_id: userId,
          status: { in: ["active", "cancelled"] },
          OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
        },
      });

      if (!sub) {
        const purchase = await prisma.userPurchase.findFirst({
          where: { user_id: userId, book_id: bookId, format: "ebook", status: "active" },
        });

        if (!purchase) {
          const previewPct = Number(ebookFormat.preview_percentage ?? 0);
          if (previewPct <= 0) {
            res.status(403).json({ error: "Access denied" });
            return;
          }
        }
      }
    }
  }

  const mimeType = ebookFormat.file_url.toLowerCase().endsWith(".epub")
    ? "application/epub+zip"
    : "application/pdf";
  const ext = ebookFormat.file_url.toLowerCase().endsWith(".epub") ? "epub" : "pdf";

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="book-${bookId}.${ext}"`);
  res.setHeader("Cache-Control", "no-store");

  if (s3Configured && isS3Url(ebookFormat.file_url)) {
    const urlObj = new URL(ebookFormat.file_url);
    const key = urlObj.pathname.replace(/^\//, "");
    const cmd = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key });
    const s3Res = await s3Client.send(cmd);
    const body = s3Res.Body as NodeJS.ReadableStream;
    if (s3Res.ContentLength) res.setHeader("Content-Length", s3Res.ContentLength);
    body.pipe(res);
  } else {
    const rawUrl = resolveFileUrl(ebookFormat.file_url);
    if (!rawUrl) { res.status(404).json({ error: "File not available" }); return; }
    const presigned = await createPresignedGetUrl(rawUrl, 300);
    res.redirect(302, presigned);
  }
};
