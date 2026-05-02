import { prisma } from "../lib/prisma.js";

export const checkMultiBookAccess = async (
  userId: string,
  bookId: string,
  format?: string | string[]
) => {
  const book = await prisma.book.findUnique({ where: { id: bookId } });

  if (!book) {
    return { error: "Book not found" };
  }

  const normalizedFormat = Array.isArray(format) ? format[0] : format;

  // Parallel checks: purchase, subscription, coin unlock
  const [purchase, subscription, coinUnlock] = await Promise.all([
    prisma.userPurchase.findFirst({
      where: {
        user_id: userId,
        book_id: bookId,
        status: "active",
        ...(normalizedFormat ? { format: normalizedFormat } : {}),
      },
    }),
    prisma.userSubscription.findFirst({
      where: {
        user_id: userId,
        status: "active",
        OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
      },
    }),
    normalizedFormat
      ? prisma.contentUnlock.findFirst({
          where: { user_id: userId, book_id: bookId, format: normalizedFormat, status: "active" },
        })
      : Promise.resolve(null),
  ]);

  const isFree = book.is_free;
  const hasPurchase = !!purchase;
  const hasSubscription = !!subscription;
  const hasCoinUnlock = !!coinUnlock;

  let has_access = false;
  let access_method = "none";

  if (isFree) {
    has_access = true;
    access_method = "free";
  } else if (hasCoinUnlock) {
    has_access = true;
    access_method = "coin";
  } else if (hasPurchase) {
    has_access = true;
    access_method = "purchase";
  } else if (hasSubscription) {
    has_access = true;
    access_method = "subscription";
  }

  // Preview info for audio/ebook formats
  let preview_percentage = 0;
  let preview_chapters = 0;
  let preview_available = false;

  if (normalizedFormat === "ebook" || normalizedFormat === "audiobook") {
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id: bookId, format: normalizedFormat },
      select: { preview_percentage: true, preview_chapters: true },
    });
    if (bookFormat) {
      preview_percentage = bookFormat.preview_percentage ?? 0;
      preview_chapters = bookFormat.preview_chapters ?? 0;
      preview_available = preview_percentage > 0 || preview_chapters > 0 || isFree;
    }
  }

  return {
    has_access,
    access_method,
    is_free: isFree,
    has_subscription: hasSubscription,
    has_purchase: hasPurchase,
    has_unlock: hasCoinUnlock,
    preview_available,
    preview_percentage,
    preview_chapters,
  };
};

export const getPreviewEligibility = async (bookId: string, format: string) => {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { formats: true },
  });

  if (!book) {
    return { error: "Book not found" };
  }

  const formatData = book.formats.find((f) => f.format === format);

  if (!formatData) {
    return { error: "Format not found" };
  }

  return {
    is_free: book.is_free,
    preview_percentage: formatData.preview_percentage ?? 0,
    preview_chapters: formatData.preview_chapters ?? 0,
    price: formatData.price ?? 0,
    guest_preview_allowed: true,
  };
};
