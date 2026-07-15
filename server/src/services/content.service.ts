import type { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { TRPCError } from "@trpc/server";
import { isS3Url, createPresignedGetUrl, s3Client, s3Configured } from "../lib/s3.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { checkBookFormatAccess } from "./bookAccess.service.js";

async function toServeUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (isS3Url(url)) return createPresignedGetUrl(url, 3600);
  return resolveFileUrl(url);
}

export const getEbookSignedUrl = async (userId: string, bookId: string) => {
  if (!bookId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "book_id is required" });
  }

  const [access, ebookFormat] = await Promise.all([
    checkBookFormatAccess(userId, bookId, "ebook"),
    prisma.bookFormat.findFirst({
      where: { book_id: bookId, format: "ebook", submission_status: "approved" },
      select: { file_url: true, preview_percentage: true },
    }),
  ]);

  if (!ebookFormat?.file_url) throw new TRPCError({ code: "NOT_FOUND", message: "Ebook file not found" });

  if (!access.hasAccess) {
    const previewPct = Number(ebookFormat.preview_percentage ?? 0);
    if (previewPct <= 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    }
    // Has preview — fall through to return presigned URL
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

  const [access, ebookFormat] = await Promise.all([
    checkBookFormatAccess(userId, bookId, "ebook"),
    prisma.bookFormat.findFirst({
      where: { book_id: bookId, format: "ebook", submission_status: "approved" },
      select: { file_url: true, preview_percentage: true },
    }),
  ]);

  if (!ebookFormat?.file_url) { res.status(404).json({ error: "Ebook file not found" }); return; }

  if (!access.hasAccess) {
    const previewPct = Number(ebookFormat.preview_percentage ?? 0);
    if (previewPct <= 0) {
      res.status(403).json({ error: "Access denied" });
      return;
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
