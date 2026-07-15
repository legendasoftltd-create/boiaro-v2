import { prisma } from "../lib/prisma.js";

/**
 * Single source of truth for "can this user read/listen/download this book format?"
 *
 * Subscription access is never global — it is always evaluated per BookFormat
 * (eBook / Audiobook / Hardcopy), and Hardcopy can never be unlocked via
 * subscription. This replaces the several independent access-check
 * implementations that previously existed across wallet.ts, content.ts,
 * access.service.ts, content.service.ts and the REST chapter/audio routes.
 */

export type AccessMethod = "free" | "purchase" | "coin" | "subscription" | "none";

export type AccessDenyReason =
  | "format_unavailable"
  | "not_applicable_hardcopy"
  | "subscription_not_allowed"
  | "no_active_subscription"
  | "plan_not_included"
  | "rights_inactive"
  | "license_not_started"
  | "license_expired"
  | "subscription_delay_active"
  | "no_access";

export type BookFormatKind = "ebook" | "audiobook" | "hardcopy";

export interface BookFormatAccessResult {
  hasAccess: boolean;
  method: AccessMethod;
  reason?: AccessDenyReason;
  isFree: boolean;
  hasPurchase: boolean;
  hasCoinUnlock: boolean;
  hasActiveSubscription: boolean;
  previewPercentage: number;
  previewChapters: number;
  /** Whether "Buy" should be offered for this format, independent of this user's state. */
  buyable: boolean;
  /** Whether this format is subscription-eligible at all (subscriber_access), independent of this user's state. */
  subscribable: boolean;
}

export const ACTIVE_SUBSCRIPTION_WHERE = (userId: string) => ({
  user_id: userId,
  status: { in: ["active", "cancelled"] },
  OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
});

export interface ActiveSubscriptionPlanOverrides {
  plan_id: string;
  premium_tts_included: boolean;
  support_priority: string | null;
}

// Shared by the TTS access check and support-ticket creation — both only need
// to know "is there an active subscription, and what does its plan say" for
// features that (unlike book-format access) aren't scoped to a specific book.
export async function getActiveSubscriptionPlanOverrides(
  userId: string
): Promise<ActiveSubscriptionPlanOverrides | null> {
  const subscription = await prisma.userSubscription.findFirst({
    where: ACTIVE_SUBSCRIPTION_WHERE(userId),
    include: { plan: { select: { premium_tts_included: true, support_priority: true } } },
    orderBy: { created_at: "desc" },
  });
  if (!subscription) return null;
  return {
    plan_id: subscription.plan_id,
    premium_tts_included: subscription.plan.premium_tts_included,
    support_priority: subscription.plan.support_priority,
  };
}

function denyResult(reason: AccessDenyReason, extra: Partial<BookFormatAccessResult> = {}): BookFormatAccessResult {
  return {
    hasAccess: false,
    method: "none",
    reason,
    isFree: false,
    hasPurchase: false,
    hasCoinUnlock: false,
    hasActiveSubscription: false,
    previewPercentage: 0,
    previewChapters: 0,
    buyable: false,
    subscribable: false,
    ...extra,
  };
}

export async function checkBookFormatAccess(
  userId: string | null | undefined,
  bookId: string,
  format: BookFormatKind
): Promise<BookFormatAccessResult> {
  // Step 0 — Hardcopy never participates in subscription logic, regardless of
  // any stored subscriber_access value (defense in depth alongside the
  // application-layer guard on the admin/creator mutations).
  if (format === "hardcopy") {
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id: bookId, format: "hardcopy", submission_status: "approved" },
      select: { is_available: true, purchase_allowed: true, price: true },
    });
    const buyable =
      Boolean(bookFormat?.is_available) &&
      bookFormat?.purchase_allowed !== false &&
      Number(bookFormat?.price ?? 0) > 0;
    return denyResult("not_applicable_hardcopy", { buyable });
  }

  const [book, bookFormat] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId }, select: { published_date: true, created_at: true } }),
    prisma.bookFormat.findFirst({
      where: { book_id: bookId, format, submission_status: "approved" },
      select: {
        id: true,
        is_available: true,
        purchase_allowed: true,
        free_access: true,
        subscriber_access: true,
        subscription_delay_days: true,
        license_start_date: true,
        license_end_date: true,
        rights_status: true,
        price: true,
        coin_price: true,
        preview_percentage: true,
        preview_chapters: true,
        audiobook_tracks:
          format === "audiobook" ? { select: { chapter_price: true, chapter_taka_price: true } } : false,
      },
    }),
  ]);

  // Step 1 — format must exist and be available.
  if (!book || !bookFormat || bookFormat.is_available === false) {
    return denyResult("format_unavailable");
  }

  const previewPercentage = bookFormat.preview_percentage ?? 0;
  const previewChapters = bookFormat.preview_chapters ?? 0;
  const buyable =
    bookFormat.purchase_allowed !== false &&
    (Number(bookFormat.price ?? 0) > 0 || Number(bookFormat.coin_price ?? 0) > 0);
  const subscribable = bookFormat.subscriber_access === true;
  const common = { previewPercentage, previewChapters, buyable, subscribable };

  // Explicit per-chapter pricing always wins over the format-level free_access flag —
  // otherwise a format-level toggle would silently unlock chapters priced individually.
  const hasChapterPricing =
    format === "audiobook" &&
    (bookFormat as any).audiobook_tracks?.some(
      (t: any) => Number(t.chapter_price ?? 0) > 0 || Number(t.chapter_taka_price ?? 0) > 0
    );

  // Step 2 — free access (per-format; never a global/whole-book flag). A format with
  // no price at all is treated as free the same way, matching this codebase's existing
  // convention everywhere else — free_access is the explicit admin control, price<=0
  // is the implicit fallback for formats nobody has priced.
  const isImplicitlyFree = Number(bookFormat.price ?? 0) <= 0 && Number(bookFormat.coin_price ?? 0) <= 0;
  if (!hasChapterPricing && (bookFormat.free_access === true || isImplicitlyFree)) {
    return { hasAccess: true, method: "free", isFree: true, hasPurchase: false, hasCoinUnlock: false, hasActiveSubscription: false, ...common };
  }

  if (!userId) {
    return denyResult("no_access", common);
  }

  // Step 3 — purchase access (coin unlock or cash purchase). Always wins regardless
  // of subscription-specific gates (delay/license/included-plans) below.
  const [coinUnlock, purchase] = await Promise.all([
    prisma.contentUnlock.findFirst({ where: { user_id: userId, book_id: bookId, format, status: "active" } }),
    prisma.userPurchase.findFirst({ where: { user_id: userId, book_id: bookId, format, status: "active" } }),
  ]);
  if (coinUnlock) {
    return { hasAccess: true, method: "coin", isFree: false, hasPurchase: false, hasCoinUnlock: true, hasActiveSubscription: false, ...common };
  }
  if (purchase) {
    return { hasAccess: true, method: "purchase", isFree: false, hasPurchase: true, hasCoinUnlock: false, hasActiveSubscription: false, ...common };
  }

  // Step 4 — subscription must be allowed for this specific format.
  if (!subscribable) {
    return denyResult("subscription_not_allowed", common);
  }

  // Step 5 — user must have an active subscription.
  const subscription = await prisma.userSubscription.findFirst({ where: ACTIVE_SUBSCRIPTION_WHERE(userId) });
  if (!subscription) {
    return denyResult("no_active_subscription", common);
  }

  // Step 6 — Included Plans: no rows for this format means unrestricted (any active
  // plan works); otherwise the user's plan must be one of the included plans.
  const includedPlans = await prisma.bookFormatSubscriptionPlan.findMany({
    where: { book_format_id: bookFormat.id },
    select: { plan_id: true },
  });
  if (includedPlans.length > 0 && !includedPlans.some(p => p.plan_id === subscription.plan_id)) {
    return denyResult("plan_not_included", { hasActiveSubscription: true, ...common });
  }

  // Step 7 — license window + rights status.
  const now = new Date();
  if (bookFormat.rights_status !== "active") {
    return denyResult("rights_inactive", { hasActiveSubscription: true, ...common });
  }
  if (bookFormat.license_start_date && bookFormat.license_start_date > now) {
    return denyResult("license_not_started", { hasActiveSubscription: true, ...common });
  }
  if (bookFormat.license_end_date && bookFormat.license_end_date < now) {
    return denyResult("license_expired", { hasActiveSubscription: true, ...common });
  }

  // Step 8 — subscription delay since release. A per-plan Early Access override
  // (if one exists for this format+plan) replaces the format-level default —
  // e.g. a Premium-only override of 0 days while everyone else waits the
  // format's normal delay. null = "Never" for whichever value applies.
  const earlyAccessOverride = await prisma.bookFormatEarlyAccess.findUnique({
    where: { book_format_id_plan_id: { book_format_id: bookFormat.id, plan_id: subscription.plan_id } },
  });
  const effectiveDelayDays = earlyAccessOverride ? earlyAccessOverride.delay_override_days : bookFormat.subscription_delay_days;
  if (effectiveDelayDays === null) {
    return denyResult("subscription_delay_active", { hasActiveSubscription: true, ...common });
  }
  const releaseDate = book.published_date ?? book.created_at;
  const delayMs = effectiveDelayDays * 24 * 60 * 60 * 1000;
  if (now.getTime() - releaseDate.getTime() < delayMs) {
    return denyResult("subscription_delay_active", { hasActiveSubscription: true, ...common });
  }

  return { hasAccess: true, method: "subscription", isFree: false, hasPurchase: false, hasCoinUnlock: false, hasActiveSubscription: true, ...common };
}
