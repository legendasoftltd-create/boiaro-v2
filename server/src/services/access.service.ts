import { prisma } from "../lib/prisma.js";
import { checkBookFormatAccess, BookFormatKind } from "./bookAccess.service.js";

const SUBSCRIBER_FORMATS = new Set(["ebook", "audiobook"]);

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

  // A specific, eligible format is the well-defined case — delegate fully to the
  // consolidated per-format access engine (subscription is never global; it's
  // gated by this exact format's subscriber_access/delay/license/included plans).
  if (normalizedFormat && SUBSCRIBER_FORMATS.has(normalizedFormat)) {
    const access = await checkBookFormatAccess(userId, bookId, normalizedFormat as BookFormatKind);
    const preview_available =
      access.previewPercentage > 0 || access.previewChapters > 0 || access.isFree;

    return {
      has_access: access.hasAccess,
      access_method: access.method,
      is_free: access.isFree,
      has_subscription: access.method === "subscription",
      has_purchase: access.method === "purchase",
      has_unlock: access.method === "coin",
      subscriber_access: access.subscribable,
      preview_available,
      preview_percentage: access.previewPercentage,
      preview_chapters: access.previewChapters,
    };
  }

  // No format specified (or hardcopy/unrecognized) — fall back to a whole-book,
  // format-agnostic check: purchase and free-book status only. Subscription is
  // deliberately NOT granted here since it can never be evaluated without a
  // concrete format to gate against.
  const [purchase, coinUnlock] = await Promise.all([
    prisma.userPurchase.findFirst({
      where: {
        user_id: userId,
        book_id: bookId,
        status: "active",
        ...(normalizedFormat ? { format: normalizedFormat } : {}),
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
  }

  return {
    has_access,
    access_method,
    is_free: isFree,
    has_subscription: false,
    has_purchase: hasPurchase,
    has_unlock: hasCoinUnlock,
    subscriber_access: book.subscriber_access === true,
    preview_available: !!isFree,
    preview_percentage: 0,
    preview_chapters: 0,
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
