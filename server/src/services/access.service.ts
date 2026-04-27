import { prisma } from "../lib/prisma.js";

export const checkMultiBookAccess = async (
  userId: string,
  bookId: string,
  formats: string[]
) => {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
  });

  if (!book) {
    return {
      error: "Book not found",
    };
  }

  //  purchase check
  const purchase = await prisma.userPurchase.findFirst({
    where: {
      user_id: userId,
      book_id: bookId,
    },
  });

  //  subscription check (UserSubscription table)
  const subscription = await prisma.userSubscription.findFirst({
    where: {
      user_id: userId,
      status: "active",
      end_date: {
        gt: new Date(),
      },
    },
  });

  const isFree = book.is_free;
  const hasPurchase = !!purchase;
  const hasSubscription = !!subscription;

  let has_access = false;
  let access_method = "none";

  if (isFree) {
    has_access = true;
    access_method = "free";
  } else if (hasPurchase) {
    has_access = true;
    access_method = "purchase";
  } else if (hasSubscription) {
    has_access = true;
    access_method = "subscription";
  }

  return {
    has_access,
    access_method,
    is_free: isFree,
    has_subscription: hasSubscription,
    has_purchase: hasPurchase,
    has_unlock: false,
  };
};

export const getPreviewEligibility = async (
  bookId: string,
  format: string
) => {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      formats: true,
    },
  });

  if (!book) {
    return {
      error: "Book not found",
    };
  }

  const formatData = book.formats.find(
    (f) => f.format === format
  );

  if (!formatData) {
    return {
      error: "Format not found",
    };
  }

  return {
    is_free: book.is_free,

    //  from BookFormat table
    preview_percentage: formatData.preview_percentage ?? 0,
    preview_chapters: formatData.preview_chapters ?? 0,

    price: formatData.price ?? 0,

    guest_preview_allowed: true,
  };
};