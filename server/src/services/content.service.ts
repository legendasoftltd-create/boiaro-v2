import { prisma } from "../lib/prisma.js";
import { TRPCError } from "@trpc/server";

export const getEbookSignedUrl = async (
  userId: string,
  bookId: string
) => {
  if (!bookId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "book_id is required",
    });
  }

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      formats: true,
    },
  });

  if (!book) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Book not found",
    });
  }

  const ebookFormat = book.formats.find(
    (f) => f.format === "ebook"
  );

  if (!ebookFormat?.file_url) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Ebook file not found",
    });
  }

  /**
   *  ACCESS CHECK (purchase / subscription / free)
   */

  const purchase = await prisma.userPurchase.findFirst({
    where: {
      user_id: userId,
      book_id: bookId,
    },
  });

  const subscription = await prisma.userSubscription.findFirst({
    where: {
      user_id: userId,
      status: "active",
      end_date: {
        gt: new Date(),
      },
    },
  });

  const hasAccess =
    book.is_free || !!purchase || !!subscription;

  if (!hasAccess) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Access denied",
    });
  }

  /**
   *  SIGNED URL GENERATION (mock / replace with S3 / Cloudflare / Supabase)
   */

  const expiresIn = 300; // 5 minutes
  const expiresAt = Date.now() + expiresIn * 1000;

  const signedUrl = `${ebookFormat.file_url}?token=secure_token&expires=${expiresAt}`;

  return {
    signed_url: signedUrl,
    mime_type: "application/pdf",
    expires_in: expiresIn,
  };
};