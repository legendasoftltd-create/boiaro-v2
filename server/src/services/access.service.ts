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

  // Subscription only unlocks ebook and audiobook formats
  const SUBSCRIBER_FORMATS = new Set(["ebook", "audiobook"]);
  const formatEligibleForSubscription = !normalizedFormat || SUBSCRIBER_FORMATS.has(normalizedFormat);
  // Book-level master toggle — must be explicitly true
  const bookAllowsSubscription = book.subscriber_access === true;

  // Parallel checks: purchase, subscription (+ format record for subscriber_access), coin unlock
  const [purchase, subscription, bookFormat, coinUnlock] = await Promise.all([
    prisma.userPurchase.findFirst({
      where: {
        user_id: userId,
        book_id: bookId,
        status: "active",
        ...(normalizedFormat ? { format: normalizedFormat } : {}),
      },
    }),
    formatEligibleForSubscription && bookAllowsSubscription
      ? prisma.userSubscription.findFirst({
          where: {
            user_id: userId,
            status: "active",
            OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
          },
        })
      : Promise.resolve(null),
    // Fetch format record to check format-level subscriber_access and preview settings
    normalizedFormat
      ? prisma.bookFormat.findFirst({
          where: { book_id: bookId, format: normalizedFormat as any },
          select: { preview_percentage: true, preview_chapters: true, subscriber_access: true },
        })
      : Promise.resolve(null),
    normalizedFormat
      ? prisma.contentUnlock.findFirst({
          where: { user_id: userId, book_id: bookId, format: normalizedFormat, status: "active" },
        })
      : Promise.resolve(null),
  ]);

  // Format-level subscriber_access check — must be explicitly true
  const formatAllowsSubscription = bookFormat?.subscriber_access === true;

  const isFree = book.is_free;
  const hasPurchase = !!purchase;
  // Subscription grants access only when both book and format have subscriber_access enabled
  const hasSubscription = !!subscription && formatAllowsSubscription;
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

  // Preview info — reuse already-fetched bookFormat record
  let preview_percentage = 0;
  let preview_chapters = 0;
  let preview_available = false;

  if (bookFormat && (normalizedFormat === "ebook" || normalizedFormat === "audiobook")) {
    preview_percentage = bookFormat.preview_percentage ?? 0;
    preview_chapters = bookFormat.preview_chapters ?? 0;
    preview_available = preview_percentage > 0 || preview_chapters > 0 || !!isFree;
  }


  return {
    has_access,
    access_method,
    is_free: isFree,
    has_subscription: hasSubscription,
    has_purchase: hasPurchase,
    has_unlock: hasCoinUnlock,
    subscriber_access: bookAllowsSubscription && (bookFormat ? formatAllowsSubscription : false),
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
