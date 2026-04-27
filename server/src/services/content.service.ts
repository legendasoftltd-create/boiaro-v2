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

  // Return the file URL directly — local PostgreSQL/disk storage
  const expiresIn = 300;

  return {
    signed_url: ebookFormat.file_url,
    mime_type: ebookFormat.file_url?.toLowerCase().endsWith(".epub") ? "application/epub+zip" : "application/pdf",
    expires_in: expiresIn,
  };
};