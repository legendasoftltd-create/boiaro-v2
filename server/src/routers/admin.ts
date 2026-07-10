import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import { calculateOrderEarnings } from "../lib/earnings.js";
import { isVerifiedRevenueOrder } from "../lib/revenueVerification.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";
import { sendMail, sendNotificationEmail, testSmtpConnection } from "../lib/mailer.js";
import { sendSslWirelessSms } from "../lib/sms.js";
import { sendPushToTokens, testFirebaseCredentials, invalidateFirebaseCache } from "../lib/firebase.js";
import { notifyUser } from "../lib/notify.js";
import { createPresignedDownloadUrl, isS3Url } from "../lib/s3.js";
import { resolveFileUrl as resolveUrl } from "../lib/mediaUrl.js";
import { computePreviewTargetSeconds, generatePreviewClip, regeneratePreviewClipsForFormat } from "../lib/audioPreview.js";

function orderSellableAmount(order: { total_amount?: number | null; shipping_cost?: number | null }) {
  return Math.max(0, Number(order.total_amount || 0) - Number(order.shipping_cost || 0));
}

function audit(actorId: string, action: string, targetId?: string, targetType?: string, details?: object) {
  prisma.auditLog.create({ data: { actor_id: actorId, action, target_id: targetId, target_type: targetType, details: details as any } }).catch(() => {});
}

/** Recompute and persist rating + reviews_count on the Book after a review status change. */
async function syncBookRatingStats(bookId: string) {
  const [{ _avg }, reviewsCount] = await Promise.all([
    prisma.review.aggregate({
      where: { book_id: bookId, status: "approved" },
      _avg: { rating: true },
    }),
    prisma.review.count({ where: { book_id: bookId, status: "approved" } }),
  ]);
  await prisma.book.update({
    where: { id: bookId },
    data: {
      rating: Number((_avg.rating ?? 0).toFixed(1)),
      reviews_count: reviewsCount,
    },
  });
}

function orderItemSaleAmount(item: { price?: number | null; quantity?: number | null }) {
  return Number(item.price || 0) * Number(item.quantity || 1);
}

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = await prisma.userRole.findFirst({
    where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } },
  });
  if (!role) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const HOMEPAGE_SECTION_DEFAULTS: Array<{
  section_key: string;
  title: string;
  subtitle: string | null;
  is_enabled: boolean;
  sort_order: number;
  display_source: string | null;
}> = [
  { section_key: "hero", title: "Hero Banner", subtitle: null, is_enabled: true, sort_order: 1, display_source: null },
  { section_key: "continue_reading", title: "পড়া চালিয়ে যান", subtitle: null, is_enabled: true, sort_order: 2, display_source: null },
  { section_key: "continue_listening", title: "শোনা চালিয়ে যান", subtitle: null, is_enabled: true, sort_order: 3, display_source: null },
  { section_key: "recently_viewed", title: "সম্প্রতি দেখা", subtitle: null, is_enabled: true, sort_order: 4, display_source: null },
  { section_key: "recommended_for_you", title: "আপনার জন্য", subtitle: "AI সাজেশন", is_enabled: true, sort_order: 5, display_source: null },
  { section_key: "because_you_read", title: "আপনি যা পড়েছেন", subtitle: null, is_enabled: true, sort_order: 6, display_source: null },
  { section_key: "featured_books", title: "নতুন প্রকাশনা", subtitle: "সদ্য প্রকাশিত বইসমূহ", is_enabled: true, sort_order: 7, display_source: null },
  { section_key: "trending_books", title: "ট্রেন্ডিং বই", subtitle: "জনপ্রিয় বইসমূহ", is_enabled: true, sort_order: 8, display_source: null },
  { section_key: "top_10_most_read", title: "সর্বাধিক পঠিত ১০", subtitle: null, is_enabled: true, sort_order: 9, display_source: null },
  { section_key: "editors_pick", title: "সম্পাদকের পছন্দ", subtitle: null, is_enabled: true, sort_order: 10, display_source: null },
  { section_key: "popular_audiobooks", title: "জনপ্রিয় অডিওবুক", subtitle: "শুনুন আপনার পছন্দের বই", is_enabled: true, sort_order: 11, display_source: null },
  { section_key: "audiobooks", title: "অডিওবুক সমূহ", subtitle: null, is_enabled: true, sort_order: 12, display_source: null },
  { section_key: "hard_copies", title: "হার্ড কপি", subtitle: "সংগ্রহে রাখুন", is_enabled: true, sort_order: 13, display_source: null },
  { section_key: "free_books", title: "ফ্রি বই", subtitle: "বিনামূল্যে পড়ুন", is_enabled: true, sort_order: 14, display_source: null },
  { section_key: "categories", title: "ক্যাটাগরি", subtitle: "বিষয় অনুযায়ী বই খুঁজুন", is_enabled: true, sort_order: 15, display_source: null },
  { section_key: "authors", title: "জনপ্রিয় লেখক", subtitle: "আমাদের প্রিয় লেখকগণ", is_enabled: true, sort_order: 16, display_source: null },
  { section_key: "narrators", title: "জনপ্রিয় কথক", subtitle: null, is_enabled: true, sort_order: 17, display_source: null },
  { section_key: "translators", title: "জনপ্রিয় অনুবাদক", subtitle: null, is_enabled: true, sort_order: 18, display_source: null },
  { section_key: "live_radio", title: "Live Radio", subtitle: "Listen to live streaming now", is_enabled: false, sort_order: 19, display_source: null },
  { section_key: "blog", title: "ব্লগ ও আর্টিকেল", subtitle: "আমাদের সাম্প্রতিক লেখা", is_enabled: true, sort_order: 20, display_source: null },
  { section_key: "app_download", title: "অ্যাপ ডাউনলোড", subtitle: null, is_enabled: true, sort_order: 21, display_source: null },
  { section_key: "category_sections", title: "ক্যাটাগরি সেকশন", subtitle: "বিভাগ অনুযায়ী বই", is_enabled: true, sort_order: 22, display_source: null },
];

const APP_ROLE_VALUES = ["admin", "moderator", "user", "writer", "publisher", "narrator", "translator", "rj"] as const;
const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;

export const adminRouter = router({
  // ── Books ───────────────────────────────────────────────────────────────────
  listBooks: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const books = await prisma.book.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.status ? { submission_status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        include: {
          author: { select: { id: true, name: true } },
          translator: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, name_bn: true } },
          publisher: { select: { id: true, name: true } },
          formats: {
            select: {
              id: true,
              book_id: true,
              format: true,
              price: true,
              stock_count: true,
              narrator_id: true,
              narrator_ids: true,
              submission_status: true,
              narrator: { select: { id: true, name: true } },
            },
          },
        },
      });
      let nextCursor: string | undefined;
      if (books.length > input.limit) nextCursor = books.pop()!.id;

      const allNarratorIds = [...new Set(books.flatMap((b) => b.formats.flatMap((f) => f.narrator_ids || [])))];
      const narratorRows = allNarratorIds.length > 0
        ? await prisma.narrator.findMany({ where: { id: { in: allNarratorIds } }, select: { id: true, name: true } })
        : [];
      const narratorById = new Map(narratorRows.map((n) => [n.id, n]));
      const booksWithNarrators = books.map((b) => ({
        ...b,
        formats: b.formats.map((f) => ({
          ...f,
          narrators: (f.narrator_ids || []).map((nid) => narratorById.get(nid)).filter(Boolean),
        })),
      }));
      return { books: booksWithNarrators, nextCursor };
    }),

  listBookContributorCounts: adminProcedure.query(async () => {
    const grouped = await prisma.bookContributor.groupBy({
      by: ["book_id"],
      _count: { book_id: true },
    });
    return grouped.map((row) => ({ book_id: row.book_id, count: row._count.book_id }));
  }),

  listBookFormatsByBook: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .query(({ input }) =>
      prisma.bookFormat.findMany({
        where: { book_id: input.bookId },
        select: {
          id: true,
          book_id: true,
          format: true,
          price: true,
          original_price: true,
          discount: true,
          pages: true,
          duration: true,
          file_size: true,
          file_url: true,
          chapters_count: true,
          preview_chapters: true,
          preview_percentage: true,
          audio_quality: true,
          binding: true,
          dimensions: true,
          weight: true,
          weight_kg_per_copy: true,
          delivery_days: true,
          in_stock: true,
          stock_count: true,
          is_available: true,
          narrator_id: true,
          narrator_ids: true,
          submission_status: true,
          printing_cost: true,
          unit_cost: true,
          default_packaging_cost: true,
          publisher_commission_percent: true,
          submitted_by: true,
          publisher_id: true,
          payout_model: true,
          isbn: true,
          created_at: true,
          updated_at: true,
          publisher: { select: { name: true } },
          narrator: { select: { name: true } },
        },
      })
    ),

  getBookFormatPrice: adminProcedure
    .input(z.object({ formatId: z.string() }))
    .query(({ input }) =>
      prisma.bookFormat.findUnique({
        where: { id: input.formatId },
        select: { price: true },
      })
    ),

  getBookDownloadUrl: adminProcedure
    .input(z.object({
      bookFormatId: z.string().optional(),
      trackId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      let fileUrl: string | null = null;
      let filename = "download";

      if (input.trackId) {
        const track = await prisma.audiobookTrack.findUnique({
          where: { id: input.trackId },
          select: { audio_url: true, title: true, track_number: true },
        });
        if (!track?.audio_url) throw new TRPCError({ code: "NOT_FOUND", message: "Track file not found" });
        fileUrl = track.audio_url;
        filename = `track-${track.track_number ?? ""}-${(track.title || "audio").replace(/[^a-z0-9]/gi, "_")}.mp3`;
      } else if (input.bookFormatId) {
        const format = await prisma.bookFormat.findUnique({
          where: { id: input.bookFormatId },
          select: { file_url: true, format: true, book: { select: { title: true, slug: true } } },
        });
        if (!format?.file_url) throw new TRPCError({ code: "NOT_FOUND", message: "File not found for this format" });
        fileUrl = format.file_url;
        const safeTitle = (format.book?.slug || format.book?.title || "book").replace(/[^a-z0-9]/gi, "_");
        const ext = format.format === "ebook" ? "epub" : "pdf";
        filename = `${safeTitle}.${ext}`;
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Provide bookFormatId or trackId" });
      }

      // If S3 — return a signed download URL (forces browser to download)
      if (isS3Url(fileUrl)) {
        const url = await createPresignedDownloadUrl(fileUrl, filename, 3600);
        return { url, filename };
      }

      // For local/CDN URLs — resolve and return directly
      const resolved = resolveUrl(fileUrl) ?? fileUrl;
      return { url: resolved, filename };
    }),

  setBookActiveStatus: adminProcedure
    .input(z.object({ id: z.string(), is_active: z.boolean() }))
    .mutation(({ input }) =>
      prisma.book.update({ where: { id: input.id }, data: { is_active: input.is_active } })
    ),

  setBookSubscriberAccess: adminProcedure
    .input(z.object({ id: z.string(), subscriber_access: z.boolean() }))
    .mutation(async ({ input }) => {
      await prisma.$transaction([
        prisma.book.update({ where: { id: input.id }, data: { subscriber_access: input.subscriber_access } }),
        // Cascade to all ebook/audiobook formats so both gates are in sync
        prisma.bookFormat.updateMany({
          where: { book_id: input.id, format: { in: ["ebook", "audiobook"] } },
          data: { subscriber_access: input.subscriber_access },
        }),
      ]);
    }),

  upsertBook: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        title: z.string().min(1).transform((s) => s.trim()),
        title_en: z.string().optional().nullable().transform((s) => s?.trim() ?? s),
        slug: z.string().min(1).transform((s) => s.trim()),
        description: z.string().optional().nullable(),
        description_bn: z.string().optional().nullable(),
        author_id: z.string().optional().nullable(),
        translator_id: z.string().optional().nullable(),
        category_id: z.string().optional().nullable(),
        publisher_id: z.string().optional().nullable(),
        cover_url: z.string().optional().nullable(),
        is_active: z.boolean().optional(),
        is_featured: z.boolean().optional(),
        is_bestseller: z.boolean().optional(),
        is_new: z.boolean().optional(),
        is_free: z.boolean().optional(),
        subscriber_access: z.boolean().optional(),
        language: z.string().optional().nullable(),
        tags: z.array(z.string()).nullable().optional(),
        submission_status: z.string().optional().nullable(),
        published_date: z.string().optional().nullable(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { id, author_id, translator_id, category_id, publisher_id, published_date, ...data } = input;
      const normalizedTags =
        data.tags === undefined ? undefined : data.tags === null ? [] : data.tags;
      const parsedPublishedDate = published_date ? new Date(published_date) : null;

      const relationData = {
        author: author_id ? { connect: { id: author_id } } : { disconnect: true },
        translator: translator_id ? { connect: { id: translator_id } } : { disconnect: true },
        category: category_id ? { connect: { id: category_id } } : { disconnect: true },
        publisher: publisher_id ? { connect: { id: publisher_id } } : { disconnect: true },
      };

      if (id) {
        return prisma.book.update({
          where: { id },
          data: {
            ...data,
            published_date: parsedPublishedDate,
            ...(data.submission_status === "pending" ? { submitted_by: ctx.userId } : {}),
            ...(normalizedTags !== undefined ? { tags: { set: normalizedTags } } : {}),
            ...relationData,
          } as any,
        });
      }

      return prisma.book.create({
        data: {
          ...data,
          published_date: parsedPublishedDate,
          submission_status: data.submission_status ?? "pending",
          submitted_by: ctx.userId,
          ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
          ...(author_id ? { author: { connect: { id: author_id } } } : {}),
          ...(translator_id ? { translator: { connect: { id: translator_id } } } : {}),
          ...(category_id ? { category: { connect: { id: category_id } } } : {}),
          ...(publisher_id ? { publisher: { connect: { id: publisher_id } } } : {}),
        } as any,
      });
    }),

  savePremiumVoiceSettings: adminProcedure
    .input(
      z.object({
        book_id: z.string(),
        premium_voice_enabled: z.boolean(),
        voice_access_type: z.string(),
        voice_coin_price: z.number().int().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.book.update({
        where: { id: input.book_id },
        data: {
          premium_voice_enabled: input.premium_voice_enabled,
          voice_access_type: input.voice_access_type,
          voice_coin_price: input.voice_coin_price ?? null,
        } as any,
      })
    ),

  deleteBookWithFormats: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) =>
      prisma.$transaction(async (tx: any) => {
        const formatIds = (
          await tx.bookFormat.findMany({
            where: { book_id: input.id },
            select: { id: true },
          })
        ).map((f) => f.id);

        const commentIds = (
          await tx.bookComment.findMany({
            where: { book_id: input.id },
            select: { id: true },
          })
        ).map((c) => c.id);

        if (commentIds.length > 0) {
          await tx.commentLike.deleteMany({ where: { comment_id: { in: commentIds } } });
          await tx.bookComment.deleteMany({ where: { id: { in: commentIds } } });
        }

        // Clear nullable references first so historical orders and presence survive.
        if (formatIds.length > 0) {
          await tx.orderItem.updateMany({
            where: { book_format_id: { in: formatIds } },
            data: { book_format_id: null },
          });
        }
        await tx.userPresence.updateMany({
          where: { current_book_id: input.id },
          data: { current_book_id: null },
        });

        // Remove direct book/format dependents.
        await tx.bookmark.deleteMany({ where: { book_id: input.id } });
        await tx.bookRead.deleteMany({ where: { book_id: input.id } });
        await tx.review.deleteMany({ where: { book_id: input.id } });
        await tx.readingProgress.deleteMany({ where: { book_id: input.id } });
        await tx.listeningProgress.deleteMany({ where: { book_id: input.id } });
        await tx.contentUnlock.deleteMany({ where: { book_id: input.id } });
        await tx.dailyBookStat.deleteMany({ where: { book_id: input.id } });
        await tx.bookContributor.deleteMany({ where: { book_id: input.id } });

        // Best-effort cleanup for auxiliary tables keyed by book_id without Prisma relations.
        await tx.accountingLedger.deleteMany({ where: { book_id: input.id } });
        await tx.contentAccessLog.deleteMany({ where: { book_id: input.id } });
        await tx.contentAccessToken.deleteMany({ where: { book_id: input.id } });
        await tx.contentConsumptionTime.deleteMany({ where: { book_id: input.id } });
        await tx.contentEditRequest.deleteMany({ where: { book_id: input.id } });
        await tx.contributorEarning.deleteMany({ where: { book_id: input.id } });
        await tx.formatRevenueSplit.deleteMany({ where: { book_id: input.id } });
        await tx.userPurchase.deleteMany({ where: { book_id: input.id } });

        if (formatIds.length > 0) {
          await tx.audiobookTrack.deleteMany({ where: { book_format_id: { in: formatIds } } });
          await tx.ebookChapter.deleteMany({ where: { book_format_id: { in: formatIds } } });
          await tx.bookFormat.deleteMany({ where: { id: { in: formatIds } } });
        }

        await tx.book.delete({ where: { id: input.id } });
      })
    ),

  upsertBookFormat: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        book_id: z.string(),
        format: z.string(),
        narrator_id: z.string().nullable().optional(),
        narrator_ids: z.array(z.string()).optional(),
        price: z.number().nullable().optional(),
        original_price: z.number().nullable().optional(),
        discount: z.number().nullable().optional(),
        pages: z.number().int().nullable().optional(),
        duration: z.string().nullable().optional(),
        file_size: z.string().nullable().optional(),
        file_url: z.string().nullable().optional(),
        chapters_count: z.number().int().nullable().optional(),
        preview_chapters: z.number().int().nullable().optional(),
        preview_percentage: z.number().nullable().optional(),
        audio_quality: z.string().nullable().optional(),
        binding: z.string().nullable().optional(),
        dimensions: z.string().nullable().optional(),
        weight: z.string().nullable().optional(),
        weight_kg_per_copy: z.number().nullable().optional(),
        delivery_days: z.number().int().nullable().optional(),
        in_stock: z.boolean().nullable().optional(),
        stock_count: z.number().int().nullable().optional(),
        is_available: z.boolean().nullable().optional(),
        subscriber_access: z.boolean().nullable().optional(),
        submission_status: z.string().nullable().optional(),
        printing_cost: z.number().nullable().optional(),
        unit_cost: z.number().nullable().optional(),
        default_packaging_cost: z.number().nullable().optional(),
        publisher_commission_percent: z.number().nullable().optional(),
        submitted_by: z.string().nullable().optional(),
        publisher_id: z.string().nullable().optional(),
        payout_model: z.string().nullable().optional(),
        isbn: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      // narrator_id (single FK) stays in sync with the first entry of narrator_ids
      // so existing single-narrator displays across the app keep working.
      if (data.narrator_ids !== undefined) {
        (data as any).narrator_id = data.narrator_ids[0] ?? null;
      }
      if (id) {
        const updated = await prisma.bookFormat.update({
          where: { id },
          data: {
            ...data,
            ...(data.submission_status === "pending" ? { submitted_by: data.submitted_by ?? ctx.userId } : {}),
          } as any,
        });
        // The preview-clip cut point depends on duration × preview_chapters%.
        // If either changed, regenerate clips so they stay in sync — don't
        // block the admin response on ffmpeg/upload time.
        if (updated.format === "audiobook" && (data.duration !== undefined || data.preview_chapters !== undefined)) {
          regeneratePreviewClipsForFormat(updated.id)
            .catch((err) => console.error(`[audioPreview] regeneration failed for format ${updated.id}:`, err));
        }
        return updated;
      }
      const existing = await prisma.bookFormat.findFirst({
        where: { book_id: data.book_id, format: data.format as any },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `This book already has a ${data.format} format. Edit the existing one instead.` });
      }
      const finalStatus = data.submission_status ?? "pending";
      const fmt = await prisma.bookFormat.create({
        data: {
          ...data,
          submission_status: finalStatus,
          submitted_by: data.submitted_by ?? ctx.userId,
        } as any,
      });
      // If format is approved, ensure the book is live too
      if (finalStatus === "approved") {
        await prisma.book.update({
          where: { id: data.book_id },
          data: { submission_status: "approved" },
        });
      }
      return fmt;
    }),

  setBookFormatAvailability: adminProcedure
    .input(z.object({ id: z.string(), isAvailable: z.boolean() }))
    .mutation(({ input }) =>
      prisma.bookFormat.update({
        where: { id: input.id },
        data: { is_available: input.isAvailable },
      })
    ),

  deleteBookFormatCascade: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) =>
      prisma.$transaction([
        prisma.audiobookTrack.deleteMany({ where: { book_format_id: input.id } }),
        prisma.bookFormat.delete({ where: { id: input.id } }),
      ])
    ),

  addAudiobookTrackAdmin: adminProcedure
    .input(
      z.object({
        book_format_id: z.string(),
        title: z.string().min(1),
        audio_url: z.string().nullable().optional(),
        track_number: z.number().int(),
        duration: z.string().nullable().optional(),
        is_preview: z.boolean().optional(),
        status: z.string().optional(),
        media_type: z.string().optional(),
        chapter_price: z.number().nullable().optional(),
        chapter_taka_price: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const track = await prisma.audiobookTrack.create({
        data: {
          ...input,
          created_by: ctx.userId,
        } as any,
      });
      // Fire-and-forget: generate the trimmed preview clip so playback can
      // never exceed the preview window, even if the client-side limit is
      // bypassed. Don't block the admin response on ffmpeg/upload time.
      if (track.is_preview && track.audio_url && track.media_type === "audio") {
        computePreviewTargetSeconds(track.book_format_id)
          .then((seconds) => generatePreviewClip(track.id, seconds))
          .catch((err) => console.error(`[audioPreview] generation failed for new track ${track.id}:`, err));
      }
      return track;
    }),

  updateAudiobookTrackAdmin: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().min(1), chapter_price: z.number().nullable().optional(), chapter_taka_price: z.number().nullable().optional() }))
    .mutation(({ input }) =>
      prisma.audiobookTrack.update({
        where: { id: input.id },
        data: { title: input.title, chapter_price: input.chapter_price ?? null, chapter_taka_price: input.chapter_taka_price ?? null },
      })
    ),

  deleteAudiobookTrackAdmin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.audiobookTrack.delete({ where: { id: input.id } })),

  createAccountingLedgerEntry: adminProcedure
    .input(
      z.object({
        type: z.string(),
        category: z.string(),
        description: z.string().nullable().optional(),
        amount: z.number(),
        entry_date: z.string().optional(),
        book_id: z.string().nullable().optional(),
        reference_type: z.string().nullable().optional(),
        reference_id: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.accountingLedger.create({
        data: {
          type: input.type,
          category: input.category,
          description: input.description ?? null,
          amount: input.amount,
          entry_date: input.entry_date ? new Date(input.entry_date) : new Date(),
          book_id: input.book_id ?? null,
          reference_type: input.reference_type ?? "manual_entry",
          reference_id: input.reference_id ?? null,
          source: "manual",
          created_by: ctx.userId,
        },
      })
    ),

  listAccountingLedgerEntries: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(500) }).optional())
    .query(({ input }) =>
      prisma.accountingLedger.findMany({
        orderBy: [{ entry_date: "desc" }, { created_at: "desc" }],
        take: input?.limit ?? 500,
      })
    ),

  reverseAccountingLedgerEntry: adminProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await prisma.accountingLedger.findUnique({ where: { id: input.entryId } });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Ledger entry not found" });
      return prisma.accountingLedger.create({
        data: {
          type: entry.type,
          category: entry.category,
          description: `REVERSAL: ${entry.description || entry.category} (original: ${entry.id.slice(0, 8)})`,
          amount: -Math.abs(Number(entry.amount || 0)),
          entry_date: new Date(),
          source: "manual",
          created_by: ctx.userId,
          reference_type: "reversal",
          reference_id: entry.id,
          book_id: entry.book_id,
          order_id: entry.order_id,
        },
      });
    }),

  listWallets: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(200) }).optional())
    .query(async ({ input }) => {
      const wallets = await prisma.userCoin.findMany({
        orderBy: { balance: "desc" },
        take: input?.limit ?? 200,
      });
      const userIds = [...new Set(wallets.map((w) => w.user_id))];
      const profiles = userIds.length
        ? await prisma.profile.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, display_name: true, avatar_url: true },
          })
        : [];
      const profileMap = Object.fromEntries(
        profiles.map((profile) => [profile.user_id, { display_name: profile.display_name, avatar_url: resolveFileUrl(profile.avatar_url) }])
      );
      return wallets.map((wallet) => ({
        ...wallet,
        profiles: profileMap[wallet.user_id] || null,
      }));
    }),

  listCoinTransactions: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(200) }).optional())
    .query(({ input }) =>
      prisma.coinTransaction.findMany({
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 200,
      })
    ),

  listCoinTransactionsByUser: adminProcedure
    .input(z.object({ userId: z.string().min(1), limit: z.number().min(1).max(500).default(50) }))
    .query(({ input }) =>
      prisma.coinTransaction.findMany({
        where: { user_id: input.userId },
        orderBy: { created_at: "desc" },
        take: input.limit,
      })
    ),

  adjustUserCoins: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number().int(),
        type: z.string().default("adjustment"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await prisma.$transaction(async (tx: any) => {
        const wallet = await tx.userCoin.findUnique({ where: { user_id: input.userId } });
        if (!wallet) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
        }
        const newBalance = wallet.balance + input.amount;
        if (newBalance < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
        }
        const updatedWallet = await tx.userCoin.update({
          where: { user_id: input.userId },
          data: {
            balance: newBalance,
            total_earned: input.amount > 0 ? wallet.total_earned + input.amount : wallet.total_earned,
            total_spent: input.amount < 0 ? wallet.total_spent + Math.abs(input.amount) : wallet.total_spent,
          },
        });
        await tx.coinTransaction.create({
          data: {
            user_id: input.userId,
            amount: input.amount,
            type: input.type,
            description: input.description || `Admin adjustment: ${input.amount}`,
            source: "admin",
          },
        });
        return updatedWallet;
      });
      audit(ctx.userId, "adjust_coins", input.userId, "user", { amount: input.amount, description: input.description });
      return result;
    }),

  listReferrals: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(200) }).optional())
    .query(({ input }) =>
      prisma.referral.findMany({
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 200,
      })
    ),

  approveBook: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const formatCount = await prisma.bookFormat.count({
        where: { book_id: input.bookId, submission_status: "approved", is_available: true },
      });
      if (formatCount === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Book must have at least one approved, available format before it can be approved" });
      }
      const book = await prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "approved" },
      });
      audit(ctx.userId, "approve_book", input.bookId, "book");
      return book;
    }),

  rejectBook: adminProcedure
    .input(z.object({ bookId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const book = await prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "rejected" },
      });
      audit(ctx.userId, "reject_book", input.bookId, "book", { reason: input.reason });
      return book;
    }),

  // ── Users ───────────────────────────────────────────────────────────────────
  listUsers: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional(), search: z.string().optional() }))
    .query(async ({ input }) => {
      const users = await prisma.user.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.search
          ? {
              OR: [
                { email: { contains: input.search, mode: "insensitive" } },
                { profile: { display_name: { contains: input.search, mode: "insensitive" } } },
                { profile: { phone: { contains: input.search, mode: "insensitive" } } },
              ],
            }
          : undefined,
        orderBy: { created_at: "desc" },
        include: {
          profile: {
            select: {
              display_name: true,
              avatar_url: true,
              phone: true,
              is_active: true,
              deleted_at: true,
              deleted_reason: true,
            },
          },
          roles: true,
        },
      });
      const userIds = users.map((user) => user.id);
      const [orderCounts, activeSubscriptions] = await Promise.all([
        userIds.length > 0
          ? prisma.order.groupBy({
              by: ["user_id"],
              where: { user_id: { in: userIds } },
              _count: { user_id: true },
            })
          : [],
        userIds.length > 0
          ? prisma.userSubscription.findMany({
              where: { user_id: { in: userIds }, status: "active" },
              select: { user_id: true },
            })
          : [],
      ]);
      const orderCountByUserId = Object.fromEntries(
        orderCounts.map((item) => [item.user_id, item._count.user_id])
      );
      const activeSubscriptionUserIds = new Set(activeSubscriptions.map((item) => item.user_id));

      const usersWithStats = users.map((user) => ({
        ...user,
        order_count: orderCountByUserId[user.id] ?? 0,
        has_active_sub: activeSubscriptionUserIds.has(user.id),
      }));

      let nextCursor: string | undefined;
      if (usersWithStats.length > input.limit) nextCursor = usersWithStats.pop()!.id;
      return { users: usersWithStats, nextCursor };
    }),

  getUserStats: adminProcedure.query(async () => {
    const [total, creators, verified, deleted] = await Promise.all([
      prisma.user.count({
        where: {
          profile: {
            is: {
              deleted_at: null,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          profile: {
            is: {
              deleted_at: null,
            },
          },
          roles: {
            some: {
              role: {
                in: ["writer", "publisher", "narrator", "translator"],
              },
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          email_verified: true,
          profile: {
            is: {
              deleted_at: null,
            },
          },
        },
      }),
      prisma.profile.count({
        where: {
          deleted_at: {
            not: null,
          },
        },
      }),
    ]);

    return { total, creators, verified, deleted };
  }),

  updateUserBasic: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        displayName: z.string().min(1),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      await prisma.user.update({
        where: { id: input.userId },
        data: { email: input.email },
      });
      return prisma.profile.update({
        where: { user_id: input.userId },
        data: { display_name: input.displayName },
      });
    }),

  updateUserStatus: adminProcedure
    .input(z.object({ userId: z.string(), isActive: z.boolean() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: { is_active: input.isActive },
      })
    ),

  softDeleteUser: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string().optional() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_reason: input.reason ?? null,
        },
      })
    ),

  restoreUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: {
          is_active: true,
          deleted_at: null,
          deleted_reason: null,
        },
      })
    ),

  // ── Orders ──────────────────────────────────────────────────────────────────
  listOrders: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const orders = await prisma.order.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        include: {
          items: {
            select: {
              id: true,
              order_id: true,
              format: true,
              price: true,
              quantity: true,
              book_id: true,
            },
          },
          payments: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              method: true,
              transaction_id: true,
              created_at: true,
            },
          },
        },
      });
      const missingNameUserIds = [
        ...new Set(orders.filter((order) => !order.shipping_name && !!order.user_id).map((order) => order.user_id)),
      ];
      const profiles = missingNameUserIds.length
        ? await prisma.profile.findMany({
            where: { user_id: { in: missingNameUserIds } },
            select: { user_id: true, display_name: true, phone: true },
          })
        : [];
      const profileMap = Object.fromEntries(
        profiles.map((profile) => [
          profile.user_id,
          {
            display_name: profile.display_name ?? null,
            phone: profile.phone ?? null,
          },
        ])
      );
      const enrichedOrders = orders.map((order) => ({
        ...order,
        _customerName:
          order.shipping_name || profileMap[order.user_id]?.display_name || order.user_id?.slice(0, 8) || "Unknown",
        _customerPhone: order.shipping_phone || profileMap[order.user_id]?.phone || null,
        _payment: order.payments?.[0] ?? null,
      }));
      let nextCursor: string | undefined;
      if (enrichedOrders.length > input.limit) nextCursor = enrichedOrders.pop()!.id;
      return { orders: enrichedOrders, nextCursor };
    }),

  orderDetail: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        include: {
          items: true,
          payments: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { status: true, method: true, transaction_id: true },
          },
          status_history: {
            orderBy: { created_at: "desc" },
            select: { id: true, old_status: true, new_status: true, created_at: true, note: true, changed_by: true },
          },
        },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const shipment = await prisma.shipment.findFirst({
        where: { order_id: input.orderId },
        orderBy: { created_at: "desc" },
      });
      const shipmentEvents = shipment
        ? await prisma.shipmentEvent.findMany({
            where: { shipment_id: shipment.id },
            orderBy: { created_at: "desc" },
          })
        : [];
      const bookIds = [...new Set(order.items.map((item) => item.book_id).filter(Boolean) as string[])];
      const books = bookIds.length
        ? await prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: { id: true, title: true, cover_url: true },
          })
        : [];
      const bookMap = Object.fromEntries(books.map((book) => [book.id, { ...book, cover_url: resolveFileUrl(book.cover_url) }]));

      return {
        order,
        items: order.items.map((item) => ({
          ...item,
          books: item.book_id ? bookMap[item.book_id] ?? null : null,
        })),
        payment: order.payments[0] ?? null,
        statusHistory: order.status_history,
        shipment: shipment
          ? {
              ...shipment,
              courier_name: shipment.carrier,
              tracking_code: shipment.tracking_number,
              provider_code: shipment.carrier || "manual",
              parcel_id: shipment.id,
            }
          : null,
        shipmentEvents,
      };
    }),

  updateOrderStatus: adminProcedure
    .input(z.object({ orderId: z.string(), status: z.string(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      // Cancel RedX parcel when order is cancelled
      if (input.status === "cancelled" && order.redx_tracking_id) {
        try {
          const { cancelParcel } = await import("../services/redx.service.js");
          await cancelParcel(order.redx_tracking_id, "Cancelled by admin");
        } catch (err) {
          console.error("[RedX] parcel cancellation failed for order", order.order_number, err);
        }
      }

      // Reverse contributor earnings when cancelling a previously-confirmed order
      if (input.status === "cancelled" && order.status === "confirmed") {
        await prisma.contributorEarning.updateMany({
          where: { order_id: input.orderId, status: { not: "reversed" } },
          data: { status: "reversed" },
        });
      }

      return prisma.$transaction([
        prisma.order.update({ where: { id: input.orderId }, data: { status: input.status } }),
        prisma.orderStatusHistory.create({
          data: {
            order_id: input.orderId,
            old_status: order.status,
            new_status: input.status,
            changed_by: ctx.userId,
            note: input.note,
          },
        }),
      ]);
    }),

  updateCodPaymentStatus: adminProcedure
    .input(z.object({ orderId: z.string(), codPaymentStatus: z.string() }))
    .mutation(async ({ input }) => {
      const order = await prisma.order.update({
        where: { id: input.orderId },
        data: { cod_payment_status: input.codPaymentStatus },
      });
      if (["settled_to_merchant", "paid"].includes(input.codPaymentStatus)) {
        await calculateOrderEarnings(input.orderId);
      }
      return order;
    }),

  markCodPaid: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await prisma.$transaction([
        prisma.payment.updateMany({
          where: { order_id: input.orderId, method: "cod" },
          data: {
            status: "paid",
            transaction_id: `COD-MANUAL-${input.orderId.slice(0, 8).toUpperCase()}`,
          },
        }),
        prisma.order.update({
          where: { id: input.orderId },
          data: { cod_payment_status: "settled_to_merchant" },
        }),
        prisma.paymentEvent.create({
          data: {
            order_id: input.orderId,
            event_type: "cod_manual_settle",
            status: "paid",
            raw_response: { settled_by: ctx.userId } as any,
          },
        }),
      ]);
      await calculateOrderEarnings(input.orderId);
      return result;
    }),

  markOrderPurchased: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        purchaseCostPerUnit: z.number().nonnegative(),
        packagingCost: z.number().nonnegative().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      const orderItems = await prisma.orderItem.findMany({
        where: { order_id: input.orderId, format: "hardcopy" },
        select: { quantity: true, book_id: true },
      });
      const totalQty = orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
      const totalCogs = totalQty * input.purchaseCostPerUnit;
      const totalExpenseAmount = totalCogs + input.packagingCost;
      const bookIds = [...new Set(orderItems.map((item) => item.book_id).filter(Boolean) as string[])];
      const books = bookIds.length
        ? await prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: { title: true },
          })
        : [];
      const packagingNote = input.packagingCost > 0 ? ` + packaging ৳${input.packagingCost}` : "";
      const description = `Order-based purchase: ${
        books.map((book) => book.title).join(", ") || "Book"
      } — ${totalQty} × ৳${input.purchaseCostPerUnit}${packagingNote} (Order #${order.order_number || input.orderId.slice(0, 8)})`;

      return prisma.$transaction([
        prisma.order.update({
          where: { id: input.orderId },
          data: {
            purchase_cost_per_unit: input.purchaseCostPerUnit,
            packaging_cost: input.packagingCost,
            is_purchased: true,
          },
        }),
        prisma.accountingLedger.create({
          data: {
            type: "expense",
            category: "cost_of_goods_sold",
            description,
            amount: totalExpenseAmount,
            entry_date: new Date(),
            order_id: input.orderId,
            reference_type: "order",
            reference_id: input.orderId,
            created_by: ctx.userId,
          },
        }),
      ]);
    }),

  createShipment: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await prisma.shipment.findFirst({ where: { order_id: input.orderId } });
      if (existing) return existing;
      return prisma.shipment.create({
        data: {
          order_id: input.orderId,
          status: "created",
        },
      });
    }),

  updateShipment: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        shipmentId: z.string(),
        status: z.string(),
        courierName: z.string().nullable().optional(),
        trackingCode: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const old = await prisma.shipment.findUnique({ where: { id: input.shipmentId } });
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await prisma.shipment.update({
        where: { id: input.shipmentId },
        data: {
          status: input.status,
          carrier: input.courierName ?? old.carrier,
          tracking_number: input.trackingCode ?? old.tracking_number,
        },
      });
      await prisma.shipmentEvent.create({
        data: {
          shipment_id: input.shipmentId,
          status: input.status,
          description: `Manual update: ${old.status} → ${input.status}`,
        },
      });
      const shipToOrder: Record<string, string> = {
        picked_up: "pickup_received",
        in_transit: "in_transit",
        delivered: "delivered",
      };
      if (shipToOrder[input.status]) {
        await prisma.order.update({
          where: { id: input.orderId },
          data: { status: shipToOrder[input.status] },
        });
      }
      return updated;
    }),

  // Manually create a RedX parcel for an order (re-trigger if it failed silently)
  createRedxParcel: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (!order.redx_area_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Order has no RedX area ID — cannot create parcel" });

      const { createParcel } = await import("../services/redx.service.js");
      const pickupStoreId = process.env.REDX_PICKUP_STORE_ID ? Number(process.env.REDX_PICKUP_STORE_ID) : undefined;
      const weightGrams = String(Math.round((order.total_weight ?? 0.5) * 1000));
      const isCod = order.payment_method === "cod";

      const { tracking_id } = await createParcel({
        customer_name: order.shipping_name ?? "Customer",
        customer_phone: order.shipping_phone ?? "",
        delivery_area: order.shipping_area ?? "",
        delivery_area_id: order.redx_area_id,
        customer_address: order.shipping_address ?? "",
        cash_collection_amount: String(isCod ? (order.total_amount ?? 0) : 0),
        parcel_weight: weightGrams,
        merchant_invoice_id: order.order_number,
        value: String(order.total_amount ?? 0),
        pickup_store_id: pickupStoreId,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { redx_tracking_id: tracking_id },
      });

      return { tracking_id };
    }),

  // ── Role Applications ───────────────────────────────────────────────────────
  listRoleApplications: adminProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(({ input }) =>
      prisma.roleApplication.findMany({
        where: input.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
      })
    ),

  approveRoleApplication: adminProcedure
    .input(z.object({ applicationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await prisma.roleApplication.findUnique({ where: { id: input.applicationId } });
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const role = app.applied_role;
      const userId = app.user_id;
      const displayName = app.display_name || "Unknown";

      await prisma.$transaction(async (tx: any) => {
        await tx.roleApplication.update({
          where: { id: input.applicationId },
          data: { status: "approved", reviewed_by: ctx.userId, verified: true, reviewed_at: new Date() },
        });
        await tx.userRole.upsert({
          where: { user_id_role: { user_id: userId, role: role as any } },
          create: { user_id: userId, role: role as any },
          update: {},
        });
      });

      if (role === "writer") {
        const existing = await prisma.author.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.author.create({ data: { name: displayName, user_id: userId, status: "active" } });
      } else if (role === "publisher") {
        const existing = await prisma.publisher.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.publisher.create({ data: { name: displayName, user_id: userId } });
      } else if (role === "narrator") {
        const existing = await prisma.narrator.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.narrator.create({ data: { name: displayName, user_id: userId, status: "active" } });
      } else if (role === "translator") {
        const existing = await prisma.translator.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.translator.create({ data: { name: displayName, user_id: userId, status: "active" } });
      } else if (role === "rj") {
        const existing = await prisma.rjProfile.findFirst({ where: { user_id: userId } });
        if (!existing) await prisma.rjProfile.create({ data: { user_id: userId, stage_name: displayName, is_approved: true } });
        else await prisma.rjProfile.update({ where: { user_id: userId }, data: { is_approved: true } });
      }

      if (app.display_name) {
        await prisma.profile.updateMany({ where: { user_id: userId }, data: { display_name: app.display_name } });
      }

      return { success: true };
    }),

  listAdminRoles: adminProcedure.query(() =>
    prisma.adminRole.findMany({
      orderBy: { created_at: "asc" },
    })
  ),

  upsertAdminRole: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(2).optional(),
        label: z.string().min(1),
        description: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.id) {
        return prisma.adminRole.update({
          where: { id: input.id },
          data: {
            label: input.label,
            description: input.description ?? null,
          },
        });
      }

      if (!input.name) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Role name is required for new roles" });
      }

      return prisma.adminRole.create({
        data: {
          name: input.name.trim().toLowerCase(),
          label: input.label,
          description: input.description ?? null,
        },
      });
    }),

  deleteAdminRole: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const linkedCount = await prisma.adminUserRole.count({ where: { admin_role_id: input.id } });
      if (linkedCount > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a role assigned to users" });
      }
      return prisma.adminRole.delete({ where: { id: input.id } });
    }),

  listAdminRolePermissions: adminProcedure
    .input(z.object({ roleId: z.string() }))
    .query(async ({ input }) => {
      const rows = await prisma.adminRolePermission.findMany({
        where: { admin_role_id: input.roleId },
      });
      // Return in the same shape the frontend expects
      return rows.map((r) => ({ permission_key: r.permission_key, is_allowed: r.is_allowed }));
    }),

  replaceAdminRolePermissions: adminProcedure
    .input(
      z.object({
        roleId: z.string(),
        modules: z.array(
          z.object({
            module: z.string(),
            can_view: z.boolean(),
            can_create: z.boolean(),
            can_edit: z.boolean(),
            can_delete: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const role = await prisma.adminRole.findUnique({ where: { id: input.roleId }, select: { id: true } });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });

      const keys = input.modules.flatMap((entry) =>
        PERMISSION_ACTIONS.filter((action) => entry[`can_${action}` as const]).map((action) =>
          `${entry.module}:${action}`
        )
      );

      await prisma.$transaction([
        prisma.adminRolePermission.deleteMany({ where: { admin_role_id: input.roleId } }),
        ...(keys.length
          ? [
              prisma.adminRolePermission.createMany({
                data: keys.map((key) => ({ admin_role_id: input.roleId, permission_key: key, is_allowed: true })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
      return { success: true };
    }),

  listAdminUserRoles: adminProcedure.query(async () => {
    const rows = await prisma.adminUserRole.findMany({
      orderBy: { created_at: "desc" },
      include: { admin_role: { select: { label: true, name: true } } },
    });
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const profiles = userIds.length
      ? await prisma.profile.findMany({
          where: { user_id: { in: userIds } },
          select: { user_id: true, display_name: true },
        })
      : [];
    const emails = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.user_id, p.display_name]));
    const emailMap = new Map(emails.map((u) => [u.id, u.email]));
    return rows.map((r) => ({
      ...r,
      user_email: emailMap.get(r.user_id) ?? null,
      user_name: profileMap.get(r.user_id) ?? null,
    }));
  }),

  assignAdminRoleToUser: adminProcedure
    .input(
      z.object({
        user_id: z.string(),
        admin_role_id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const [existing, role] = await Promise.all([
        prisma.adminUserRole.findFirst({ where: { user_id: input.user_id } }),
        prisma.adminRole.findUnique({ where: { id: input.admin_role_id }, select: { name: true } }),
      ]);
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });

      const result = existing
        ? await prisma.adminUserRole.update({
            where: { id: existing.id },
            data: { admin_role_id: input.admin_role_id, is_active: true },
          })
        : await prisma.adminUserRole.create({
            data: { user_id: input.user_id, admin_role_id: input.admin_role_id, is_active: true },
          });

      if (APP_ROLE_VALUES.includes(role.name as (typeof APP_ROLE_VALUES)[number])) {
        // Named app role (admin/moderator/writer/etc.) — sync directly
        await prisma.userRole.upsert({
          where: { user_id_role: { user_id: input.user_id, role: role.name as (typeof APP_ROLE_VALUES)[number] } },
          create: { user_id: input.user_id, role: role.name as (typeof APP_ROLE_VALUES)[number] },
          update: {},
        });
      } else {
        // Custom admin role — grant moderator as the base app role so the
        // user can enter the admin panel. myPermissions will enforce their
        // actual permissions from admin_role_permissions.
        await prisma.userRole.upsert({
          where: { user_id_role: { user_id: input.user_id, role: "moderator" } },
          create: { user_id: input.user_id, role: "moderator" },
          update: {},
        });
      }

      return result;
    }),

  setAdminUserRoleActive: adminProcedure
    .input(z.object({ id: z.string(), is_active: z.boolean() }))
    .mutation(({ input }) =>
      prisma.adminUserRole.update({
        where: { id: input.id },
        data: { is_active: input.is_active },
      })
    ),

  searchUsersForRoleAssign: adminProcedure
    .input(z.object({ search: z.string().min(1) }))
    .query(async ({ input }) => {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: input.search, mode: "insensitive" } },
            { profile: { display_name: { contains: input.search, mode: "insensitive" } } },
          ],
        },
        take: 8,
        select: {
          id: true,
          email: true,
          profile: { select: { display_name: true } },
        },
        orderBy: { created_at: "desc" },
      });
      return users.map((u) => ({ id: u.id, email: u.email, display_name: u.profile?.display_name ?? null }));
    }),

  // ── Permissions ─────────────────────────────────────────────────────────────
  myPermissions: protectedProcedure.query(async ({ ctx }) => {
    const PERM_MODULES = [
      "books", "content", "users", "orders", "payments", "revenue", "reports",
      "support", "settings", "roles", "email", "notifications", "analytics",
      "cms", "subscriptions", "coupons", "shipping", "withdrawals",
    ];

    // 1. Check for an active custom admin role assignment first
    const customAssignment = await prisma.adminUserRole.findFirst({
      where: { user_id: ctx.userId, is_active: true },
      include: { admin_role: { include: { admin_permissions: true } } },
    });

    if (customAssignment && customAssignment.admin_role.admin_permissions.length > 0) {
      const perms = customAssignment.admin_role.admin_permissions;
      return {
        roleName: customAssignment.admin_role.name,
        isSuperAdmin: false,
        permissions: PERM_MODULES.map((m) => ({
          module: m,
          can_view:   perms.some(p => p.permission_key === `${m}:view`   && p.is_allowed),
          can_create: perms.some(p => p.permission_key === `${m}:create` && p.is_allowed),
          can_edit:   perms.some(p => p.permission_key === `${m}:edit`   && p.is_allowed),
          can_delete: perms.some(p => p.permission_key === `${m}:delete` && p.is_allowed),
        })),
      };
    }

    // 2. Fall back to system AppRole (admin / moderator)
    const appRole = await prisma.userRole.findFirst({
      where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } },
      orderBy: { role: "asc" }, // "admin" < "moderator" — prefer admin
    });
    if (!appRole) return { roleName: null, permissions: [], isSuperAdmin: false };

    if (appRole.role === "admin") {
      return {
        roleName: "super_admin",
        isSuperAdmin: true,
        permissions: PERM_MODULES.map((m) => ({ module: m, can_view: true, can_create: true, can_edit: true, can_delete: true })),
      };
    }

    // 3. Moderator — read from role_permissions table first
    const dbPerms = await prisma.rolePermission.findMany({ where: { role: "moderator" } });

    if (dbPerms.length > 0) {
      return {
        roleName: "moderator",
        isSuperAdmin: false,
        permissions: PERM_MODULES.map((m) => ({
          module: m,
          can_view:   dbPerms.some(p => p.permission_key === `${m}:view`   && p.is_allowed),
          can_create: dbPerms.some(p => p.permission_key === `${m}:create` && p.is_allowed),
          can_edit:   dbPerms.some(p => p.permission_key === `${m}:edit`   && p.is_allowed),
          can_delete: dbPerms.some(p => p.permission_key === `${m}:delete` && p.is_allowed),
        })),
      };
    }

    // 4. Fallback hardcoded defaults (used until role_permissions are seeded)
    const RESTRICTED = ["roles", "settings"];
    return {
      roleName: "moderator",
      isSuperAdmin: false,
      permissions: PERM_MODULES.map((m) => ({
        module: m,
        can_view:   true,
        can_create: !RESTRICTED.includes(m),
        can_edit:   !RESTRICTED.includes(m),
        can_delete: false,
      })),
    };
  }),

  // Allow super-admin to update the role_permissions table for a given AppRole
  setRolePermissions: adminProcedure
    .input(z.object({
      role: z.enum(["moderator", "admin"]),
      permissions: z.array(z.object({
        module: z.string(),
        can_view:   z.boolean(),
        can_create: z.boolean(),
        can_edit:   z.boolean(),
        can_delete: z.boolean(),
      })),
    }))
    .mutation(async ({ input }) => {
      const pairs: { key: string; allowed: boolean }[] = [];
      for (const p of input.permissions) {
        pairs.push(
          { key: `${p.module}:view`,   allowed: p.can_view },
          { key: `${p.module}:create`, allowed: p.can_create },
          { key: `${p.module}:edit`,   allowed: p.can_edit },
          { key: `${p.module}:delete`, allowed: p.can_delete },
        );
      }
      await Promise.all(pairs.map(({ key, allowed }) =>
        prisma.rolePermission.upsert({
          where: { role_permission_key: { role: input.role as any, permission_key: key } },
          create: { role: input.role as any, permission_key: key, is_allowed: allowed },
          update: { is_allowed: allowed },
        })
      ));
      return { success: true };
    }),

  // ── Content Edit Requests ───────────────────────────────────────────────────
  submitEditRequest: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(["book", "book_format"]),
        contentId: z.string(),
        proposedChanges: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { contentType, contentId, proposedChanges } = input;
      const existing = await prisma.contentEditRequest.findFirst({
        where: { book_id: contentId, request_type: contentType, user_id: ctx.userId, status: "pending" },
      });
      if (existing) {
        return prisma.contentEditRequest.update({
          where: { id: existing.id },
          data: { details: JSON.stringify(proposedChanges) },
        });
      }
      return prisma.contentEditRequest.create({
        data: {
          book_id: contentId,
          user_id: ctx.userId,
          request_type: contentType,
          details: JSON.stringify(proposedChanges),
          status: "pending",
        },
      });
    }),

  checkPendingEditRequest: protectedProcedure
    .input(z.object({ contentType: z.string(), contentId: z.string() }))
    .query(({ ctx, input }) =>
      prisma.contentEditRequest.findFirst({
        where: { book_id: input.contentId, request_type: input.contentType, user_id: ctx.userId, status: "pending" },
        select: { id: true, status: true, created_at: true },
      })
    ),

  // ── Creator Account Management ──────────────────────────────────────────────
  createCreator: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["writer", "publisher", "narrator", "translator"]),
        profileTable: z.enum(["authors", "publishers", "narrators", "translators"]),
        profileData: z.record(z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const { email, password, role, profileTable, profileData } = input;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });

      const password_hash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          email,
          password_hash,
          profile: {
            create: {
              display_name: (profileData.name as string) ?? null,
              referral_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
            },
          },
          roles: { create: { role: role as any } },
        },
      });

      if (profileTable === "authors") {
        await prisma.author.create({ data: { ...(profileData as any), user_id: user.id } });
      } else if (profileTable === "publishers") {
        await prisma.publisher.create({ data: { ...(profileData as any), user_id: user.id } });
      } else if (profileTable === "translators") {
        await prisma.translator.create({ data: { ...(profileData as any), user_id: user.id } });
      } else {
        await prisma.narrator.create({ data: { ...(profileData as any), user_id: user.id } });
      }

      return { message: "Creator account created successfully", userId: user.id };
    }),

  linkCreatorProfile: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["writer", "publisher", "narrator", "translator"]),
        profileTable: z.enum(["authors", "publishers", "narrators", "translators"]),
        profileId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { email, role, profileTable, profileId } = input;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      if (profileTable === "authors") {
        await prisma.author.update({ where: { id: profileId }, data: { user_id: user.id, linked_at: new Date() } });
      } else if (profileTable === "publishers") {
        await prisma.publisher.update({ where: { id: profileId }, data: { user_id: user.id, linked_at: new Date() } });
      } else if (profileTable === "translators") {
        await prisma.translator.update({ where: { id: profileId }, data: { user_id: user.id, linked_at: new Date() } });
      } else {
        await prisma.narrator.update({ where: { id: profileId }, data: { user_id: user.id, linked_at: new Date() } });
      }

      await prisma.userRole.upsert({
        where: { user_id_role: { user_id: user.id, role: role as any } },
        create: { user_id: user.id, role: role as any },
        update: {},
      });

      return { message: "Profile linked successfully" };
    }),

  unlinkCreatorProfile: adminProcedure
    .input(
      z.object({
        profileTable: z.enum(["authors", "publishers", "narrators", "translators"]),
        profileId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const roleByTable: Record<"authors" | "publishers" | "narrators" | "translators", "writer" | "publisher" | "narrator" | "translator"> = {
        authors: "writer",
        publishers: "publisher",
        narrators: "narrator",
        translators: "translator",
      };
      const targetRole = roleByTable[input.profileTable];

      let previousUserId: string | null | undefined;
      if (input.profileTable === "authors") {
        const row = await prisma.author.findUnique({ where: { id: input.profileId }, select: { user_id: true } });
        previousUserId = row?.user_id;
        await prisma.author.update({ where: { id: input.profileId }, data: { user_id: null, linked_at: null } });
      } else if (input.profileTable === "publishers") {
        const row = await prisma.publisher.findUnique({ where: { id: input.profileId }, select: { user_id: true } });
        previousUserId = row?.user_id;
        await prisma.publisher.update({ where: { id: input.profileId }, data: { user_id: null, linked_at: null } });
      } else if (input.profileTable === "translators") {
        const row = await prisma.translator.findUnique({ where: { id: input.profileId }, select: { user_id: true } });
        previousUserId = row?.user_id;
        await prisma.translator.update({ where: { id: input.profileId }, data: { user_id: null, linked_at: null } });
      } else {
        const row = await prisma.narrator.findUnique({ where: { id: input.profileId }, select: { user_id: true } });
        previousUserId = row?.user_id;
        await prisma.narrator.update({ where: { id: input.profileId }, data: { user_id: null, linked_at: null } });
      }

      if (previousUserId) {
        const [linkedAuthor, linkedPublisher, linkedNarrator, linkedTranslator] = await Promise.all([
          targetRole === "writer"
            ? prisma.author.count({ where: { user_id: previousUserId } })
            : Promise.resolve(0),
          targetRole === "publisher"
            ? prisma.publisher.count({ where: { user_id: previousUserId } })
            : Promise.resolve(0),
          targetRole === "narrator"
            ? prisma.narrator.count({ where: { user_id: previousUserId } })
            : Promise.resolve(0),
          targetRole === "translator"
            ? prisma.translator.count({ where: { user_id: previousUserId } })
            : Promise.resolve(0),
        ]);
        const stillLinkedForRole =
          targetRole === "writer" ? linkedAuthor > 0 : targetRole === "publisher" ? linkedPublisher > 0 : targetRole === "narrator" ? linkedNarrator > 0 : linkedTranslator > 0;

        if (!stillLinkedForRole) {
          await prisma.userRole.deleteMany({ where: { user_id: previousUserId, role: targetRole as any } });
        }
      }

      return { message: "Account unlinked successfully" };
    }),

  // ── Translators ──────────────────────────────────────────────────────────────
  listTranslators: adminProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(({ input }) =>
      prisma.translator.findMany({
        where: input.search
          ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { name_en: { contains: input.search, mode: "insensitive" } }] }
          : undefined,
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      })
    ),

  createTranslator: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      name_en: z.string().optional(),
      bio: z.string().optional(),
      genre: z.string().optional(),
      avatar_url: z.string().optional(),
      phone: z.string().optional(),
      is_featured: z.boolean().optional(),
      is_trending: z.boolean().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => prisma.translator.create({ data: input as any })),

  updateTranslator: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      name_en: z.string().optional(),
      bio: z.string().optional(),
      genre: z.string().optional(),
      avatar_url: z.string().optional(),
      phone: z.string().optional(),
      is_featured: z.boolean().optional(),
      is_trending: z.boolean().optional(),
      priority: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.translator.update({ where: { id }, data: data as any });
    }),

  deleteTranslator: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.translator.delete({ where: { id: input.id } })),

  searchCreatorLinkCandidates: adminProcedure
    .input(z.object({ query: z.string().min(2) }))
    .mutation(async ({ input }) => {
      const q = input.query.trim();
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { profile: { display_name: { contains: q, mode: "insensitive" } } },
            { profile: { phone: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: 25,
        orderBy: { created_at: "desc" },
        include: {
          profile: { select: { display_name: true, avatar_url: true, phone: true } },
          roles: true,
        },
      });
      const userIds = users.map((u) => u.id);
      const [authors, publishers, narrators] = await Promise.all([
        userIds.length
          ? prisma.author.findMany({
              where: { user_id: { in: userIds } },
              select: { user_id: true, id: true, name: true },
            })
          : [],
        userIds.length
          ? prisma.publisher.findMany({
              where: { user_id: { in: userIds } },
              select: { user_id: true, id: true, name: true },
            })
          : [],
        userIds.length
          ? prisma.narrator.findMany({
              where: { user_id: { in: userIds } },
              select: { user_id: true, id: true, name: true },
            })
          : [],
      ]);

      const linksByUser: Record<string, Array<{ type: string; name: string }>> = {};
      authors.forEach((a) => {
        if (!a.user_id) return;
        if (!linksByUser[a.user_id]) linksByUser[a.user_id] = [];
        linksByUser[a.user_id].push({ type: "author", name: a.name });
      });
      publishers.forEach((p) => {
        if (!p.user_id) return;
        if (!linksByUser[p.user_id]) linksByUser[p.user_id] = [];
        linksByUser[p.user_id].push({ type: "publisher", name: p.name });
      });
      narrators.forEach((n) => {
        if (!n.user_id) return;
        if (!linksByUser[n.user_id]) linksByUser[n.user_id] = [];
        linksByUser[n.user_id].push({ type: "narrator", name: n.name });
      });

      return users.map((u) => ({
        user_id: u.id,
        email: u.email,
        display_name: u.profile?.display_name || u.email,
        avatar_url: resolveFileUrl(u.profile?.avatar_url ?? null),
        phone: u.profile?.phone ?? null,
        roles: u.roles.map((r) => r.role),
        existing_links: linksByUser[u.id] || [],
      }));
    }),

  // ── Authors CRUD ────────────────────────────────────────────────────────────
  listAuthors: adminProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(({ input }) =>
      prisma.author.findMany({
        where: input.search
          ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { name_en: { contains: input.search, mode: "insensitive" } }] }
          : undefined,
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      })
    ),

  createAuthor: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      name_en: z.string().optional(),
      bio: z.string().optional(),
      genre: z.string().optional(),
      avatar_url: z.string().optional(),
      phone: z.string().optional(),
      is_featured: z.boolean().optional(),
      is_trending: z.boolean().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => prisma.author.create({ data: input as any })),

  updateAuthor: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      name_en: z.string().optional(),
      bio: z.string().optional(),
      genre: z.string().optional(),
      avatar_url: z.string().optional(),
      phone: z.string().optional(),
      is_featured: z.boolean().optional(),
      is_trending: z.boolean().optional(),
      priority: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.author.update({ where: { id }, data: data as any });
    }),

  deleteAuthor: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.author.delete({ where: { id: input.id } })),

  // ── Site Settings ───────────────────────────────────────────────────────────
  updateSiteSetting: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input }) =>
      prisma.siteSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      })
    ),

  // ── Narrators ────────────────────────────────────────────────────────────────
  listNarrators: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.narrator.findMany({
        where: input?.search
          ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { name_en: { contains: input.search, mode: "insensitive" } }] }
          : undefined,
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      })
    ),

  createNarrator: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), bio: z.string().optional(), specialty: z.string().optional(), avatar_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional() }))
    .mutation(({ input }) => prisma.narrator.create({ data: input as any })),

  updateNarrator: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), name_en: z.string().optional(), bio: z.string().optional(), specialty: z.string().optional(), avatar_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.narrator.update({ where: { id }, data });
    }),

  deleteNarrator: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.narrator.delete({ where: { id: input.id } })),

  // ── Publishers ───────────────────────────────────────────────────────────────
  listPublishers: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.publisher.findMany({
        where: input?.search
          ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { name_en: { contains: input.search, mode: "insensitive" } }] }
          : undefined,
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      })
    ),

  createPublisher: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), description: z.string().optional(), logo_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_verified: z.boolean().optional(), priority: z.number().optional() }))
    .mutation(({ input }) => prisma.publisher.create({ data: input as any })),

  updatePublisher: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), name_en: z.string().optional(), description: z.string().optional(), logo_url: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), is_featured: z.boolean().optional(), is_verified: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.publisher.update({ where: { id }, data });
    }),

  deletePublisher: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.publisher.delete({ where: { id: input.id } })),

  // ── Categories ───────────────────────────────────────────────────────────────
  listCategories: adminProcedure.query(() =>
    prisma.category.findMany({ orderBy: [{ priority: "desc" }, { name: "asc" }] })
  ),

  createCategory: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), priority: z.number().optional() }))
    .mutation(({ input }) => prisma.category.create({ data: input as any })),

  updateCategory: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.category.update({ where: { id }, data });
    }),

  deleteCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.category.delete({ where: { id: input.id } })),

  // ── Homepage Sections ─────────────────────────────────────────────────────────
  listHomepageSections: adminProcedure.query(async () => {
    const existing = await prisma.homepageSection.findMany({ orderBy: { sort_order: "asc" } });
    if (existing.length > 0) return existing;

    await prisma.homepageSection.createMany({
      data: HOMEPAGE_SECTION_DEFAULTS,
      skipDuplicates: true,
    });

    return prisma.homepageSection.findMany({ orderBy: { sort_order: "asc" } });
  }),

  resetHomepageSections: adminProcedure
    .input(z.object({ hardReset: z.boolean().default(false) }).optional())
    .mutation(async ({ input }) => {
      if (input?.hardReset) {
        await prisma.homepageSection.deleteMany({});
      }
      await prisma.homepageSection.createMany({
        data: HOMEPAGE_SECTION_DEFAULTS,
        skipDuplicates: true,
      });
      return { success: true };
    }),

  updateHomepageSection: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().optional(), subtitle: z.string().optional(), is_enabled: z.boolean().optional(), sort_order: z.number().optional(), display_source: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.homepageSection.update({ where: { id }, data });
    }),

  // ── Reviews ──────────────────────────────────────────────────────────────────
  listReviews: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.review.findMany({
        where: input?.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        include: { book: { select: { id: true, title: true } } },
      })
    ),

  approveReview: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const review = await prisma.review.findUnique({ where: { id: input.id }, select: { book_id: true } });
      const updated = await prisma.review.update({ where: { id: input.id }, data: { status: "approved" } });
      if (review?.book_id) await syncBookRatingStats(review.book_id);
      return updated;
    }),

  rejectReview: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const review = await prisma.review.findUnique({ where: { id: input.id }, select: { book_id: true } });
      const updated = await prisma.review.update({ where: { id: input.id }, data: { status: "rejected" } });
      if (review?.book_id) await syncBookRatingStats(review.book_id);
      return updated;
    }),

  // ── Ad Config ────────────────────────────────────────────────────────────────
  adConfig: adminProcedure.query(() =>
    prisma.platformSetting.findMany({
      where: { key: { startsWith: "ad_" } },
    })
  ),

  // ── Site Settings by category ─────────────────────────────────────────────────
  siteSettingsByCategory: adminProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(() => prisma.siteSetting.findMany({ orderBy: { key: "asc" } })),

  // ── Dashboard counts ──────────────────────────────────────────────────────────
  dashboard: adminProcedure.query(async () => {
    const [users, books, orders, pendingReviews, roleApplications] = await Promise.all([
      prisma.user.count(),
      prisma.book.count({ where: { submission_status: "approved" } }),
      prisma.order.count(),
      prisma.review.count({ where: { status: "pending" } }),
      prisma.roleApplication.count({ where: { status: "pending" } }),
    ]);
    return { users, books, orders, pendingReviews, roleApplications };
  }),

  // ── Activity / System Logs ────────────────────────────────────────────────────
  activityLogs: adminProcedure
    .input(z.object({ limit: z.number().default(50), cursor: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.adminActivityLog.findMany({
        take: input?.limit ?? 50,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        orderBy: { created_at: "desc" },
      })
    ),

  // ── Notifications ─────────────────────────────────────────────────────────────
  listNotifications: adminProcedure.query(() =>
    prisma.notification.findMany({
      orderBy: { created_at: "desc" },
    })
  ),

  createNotification: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.string().default("system"),
        audience: z.string().default("all"),
        targetUserId: z.string().nullable().optional(),
        priority: z.string().default("normal"),
        link: z.string().nullable().optional(),
        channel: z.string().default("in_app"),
        scheduledAt: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.notification.create({
        data: {
          title: input.title,
          message: input.message,
          type: input.type,
          audience: input.audience,
          target_user_id: input.audience === "specific" ? input.targetUserId ?? null : null,
          priority: input.priority,
          link: input.link ?? null,
          channel: input.channel,
          scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : null,
          created_by: ctx.userId,
          status: input.scheduledAt ? "scheduled" : "draft",
        },
      })
    ),

  updateNotification: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.string().default("system"),
        audience: z.string().default("all"),
        targetUserId: z.string().nullable().optional(),
        priority: z.string().default("normal"),
        link: z.string().nullable().optional(),
        channel: z.string().default("in_app"),
        scheduledAt: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.notification.update({
        where: { id: input.id },
        data: {
          title: input.title,
          message: input.message,
          type: input.type,
          audience: input.audience,
          target_user_id: input.audience === "specific" ? input.targetUserId ?? null : null,
          priority: input.priority,
          link: input.link ?? null,
          channel: input.channel,
          scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : null,
          status: input.scheduledAt ? "scheduled" : "draft",
        },
      })
    ),

  deleteNotification: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.notification.delete({ where: { id: input.id } })),

  sendNotification: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const notification = await prisma.notification.findUnique({ where: { id: input.id } });
      if (!notification) throw new TRPCError({ code: "NOT_FOUND" });

      let userIds: string[] = [];
      if (notification.audience === "specific" && notification.target_user_id) {
        userIds = [notification.target_user_id];
      } else if (notification.audience === "all") {
        const users = await prisma.user.findMany({ select: { id: true } });
        userIds = users.map((user) => user.id);
      } else {
        const roles = await prisma.userRole.findMany({
          where: { role: notification.audience as any },
          select: { user_id: true },
        });
        userIds = [...new Set<string>(roles.map((role) => role.user_id as string))];
      }

      if (!userIds.length) return { sent: 0 };

      await prisma.userNotification.createMany({
        data: userIds.map((userId) => ({
          user_id: userId,
          notification_id: notification.id,
        })),
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "sent", sent_at: new Date() },
      });

      // Fire FCM push when enabled — reads config from DB dynamically
      const pushEnabledRow = await prisma.platformSetting.findUnique({
        where: { key: "firebase_push_enabled" },
      });
      const pushEnabled = pushEnabledRow?.value !== "false";
      let tokens: string[] = [];
      if (pushEnabled) {
        const optedOutRows = await prisma.notificationPreference.findMany({
          where: { user_id: { in: userIds }, push_enabled: false },
          select: { user_id: true },
        });
        const optedOutIds = new Set(optedOutRows.map((r) => r.user_id));
        const eligibleUserIds = userIds.filter((id) => !optedOutIds.has(id));
        const tokenRows = eligibleUserIds.length
          ? await (prisma as any).devicePushToken.findMany({
              where: { user_id: { in: eligibleUserIds } },
              select: { token: true },
            })
          : [];
        tokens = tokenRows.map((r: any) => r.token);
      }
      const pushSent = await sendPushToTokens(tokens, {
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        imageUrl: notification.image_url,
        notificationId: notification.id,
      });

      return { sent: userIds.length, push_sent: pushSent };
    }),

  // ── Notification Templates ───────────────────────────────────────────────────
  listNotificationTemplates: adminProcedure.query(() =>
    prisma.notificationTemplate.findMany({
      orderBy: { created_at: "desc" },
    })
  ),

  createNotificationTemplate: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        title: z.string().min(1),
        message: z.string().default(""),
        type: z.string().default("system"),
        channel: z.string().default("in_app"),
        ctaText: z.string().nullable().optional(),
        ctaLink: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.notificationTemplate.create({
        data: {
          name: input.name,
          title: input.title,
          message: input.message,
          type: input.type,
          channel: input.channel,
          cta_text: input.ctaText ?? null,
          cta_link: input.ctaLink ?? null,
        },
      })
    ),

  updateNotificationTemplate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        title: z.string().min(1),
        message: z.string().default(""),
        type: z.string().default("system"),
        channel: z.string().default("in_app"),
        ctaText: z.string().nullable().optional(),
        ctaLink: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.notificationTemplate.update({
        where: { id: input.id },
        data: {
          name: input.name,
          title: input.title,
          message: input.message,
          type: input.type,
          channel: input.channel,
          cta_text: input.ctaText ?? null,
          cta_link: input.ctaLink ?? null,
        },
      })
    ),

  deleteNotificationTemplate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.notificationTemplate.delete({ where: { id: input.id } })),

  listSupportTickets: adminProcedure.query(async () => {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { created_at: "desc" },
      include: { replies: { select: { id: true } } },
    });
    const userIds = [...new Set(tickets.map((t) => t.user_id).filter(Boolean))];
    const [users, profiles] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
      userIds.length ? prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true, phone: true } }) : [],
    ]);
    const userEmailById = Object.fromEntries(users.map((u) => [u.id, u.email]));
    const profileByUserId = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
    return tickets.map((t) => ({
      ...t,
      ticket_number: `TKT-${t.id.slice(0, 8).toUpperCase()}`,
      type: "ticket",
      message: t.description,
      user_name: profileByUserId[t.user_id]?.display_name || "User",
      user_email: userEmailById[t.user_id] || null,
      user_phone: profileByUserId[t.user_id]?.phone || null,
      replies_count: t.replies.length,
    }));
  }),

  getSupportTicketDetail: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const ticket = await prisma.supportTicket.findUnique({ where: { id: input.id } });
      if (!ticket) return null;
      const [user, profile] = await Promise.all([
        prisma.user.findUnique({ where: { id: ticket.user_id }, select: { email: true } }),
        prisma.profile.findUnique({ where: { user_id: ticket.user_id }, select: { display_name: true, phone: true } }),
      ]);
      return {
        ...ticket,
        ticket_number: `TKT-${ticket.id.slice(0, 8).toUpperCase()}`,
        type: "ticket",
        message: ticket.description,
        attachment_url: null,
        user_name: profile?.display_name || "User",
        user_email: user?.email || null,
        user_phone: profile?.phone || null,
      };
    }),

  listSupportTicketReplies: adminProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ input }) => {
      const replies = await prisma.ticketReply.findMany({
        where: { ticket_id: input.ticketId },
        orderBy: { created_at: "asc" },
      });
      const userIds = [...new Set(replies.map((r) => r.user_id).filter(Boolean))];
      const profiles = userIds.length
        ? await prisma.profile.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, display_name: true },
          })
        : [];
      const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.display_name || "User"]));
      return replies.map((r) => ({
        ...r,
        is_admin: r.is_staff,
        is_internal: r.is_staff && (r.message || "").startsWith("[Internal] "),
        sender_name: r.is_staff ? "Admin" : profileMap[r.user_id] || "User",
        message: r.is_staff && (r.message || "").startsWith("[Internal] ") ? (r.message || "").replace(/^\[Internal\]\s*/, "") : r.message,
      }));
    }),

  updateSupportTicket: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string().optional(),
        priority: z.string().optional(),
        assigned_to: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.supportTicket.update({
        where: { id },
        data,
      });
    }),

  addSupportTicketReply: adminProcedure
    .input(
      z.object({
        ticketId: z.string(),
        userId: z.string(),
        message: z.string().min(1),
        isInternal: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const reply = await prisma.ticketReply.create({
        data: {
          ticket_id: input.ticketId,
          user_id: input.userId,
          message: input.isInternal ? `[Internal] ${input.message}` : input.message,
          is_staff: true,
        },
      });

      // Notify the ticket owner — internal notes are staff-only and never sent.
      if (!input.isInternal) {
        const ticket = await prisma.supportTicket.findUnique({
          where: { id: input.ticketId },
          select: { user_id: true, subject: true },
        });
        if (ticket) {
          await notifyUser(ticket.user_id, {
            title: "আপনার সাপোর্ট টিকেটে রিপ্লাই এসেছে",
            message: `"${ticket.subject}" — ${input.message}`,
            type: "support",
            link: `/support/tickets/${input.ticketId}`,
            preferenceKey: "support_enabled",
          });
        }
      }

      return reply;
    }),

  listEmailTemplates: adminProcedure.query(async () => {
    const rows = await prisma.emailTemplate.findMany({ orderBy: { created_at: "asc" } });
    return rows.map((row) => ({
      ...row,
      body_html: row.body,
      body_text: row.body,
      status: row.is_active ? "active" : "inactive",
    }));
  }),

  upsertEmailTemplate: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        template_type: z.string().min(1),
        subject: z.string().min(1),
        body_html: z.string().default(""),
        body_text: z.string().default(""),
        status: z.enum(["active", "inactive"]).default("active"),
      })
    )
    .mutation(async ({ input }) => {
      const variables = Array.from(new Set((input.body_html.match(/\{\{(.*?)\}\}/g) || []).map((s) => s.replace(/[{}]/g, "").trim())));
      const data = {
        name: input.name,
        template_type: input.template_type,
        subject: input.subject,
        body: input.body_html || input.body_text || "",
        variables,
        is_active: input.status === "active",
      };
      if (input.id) {
        return prisma.emailTemplate.update({ where: { id: input.id }, data });
      }
      return prisma.emailTemplate.create({ data });
    }),

  deleteEmailTemplate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.emailTemplate.delete({ where: { id: input.id } })),

  getActiveEmailTemplate: adminProcedure
    .input(z.object({ templateType: z.string().min(1) }))
    .query(({ input }) =>
      prisma.emailTemplate.findFirst({
        where: { template_type: input.templateType, is_active: true },
        select: { subject: true, body: true },
      })
    ),

  logEmailEvent: adminProcedure
    .input(
      z.object({
        recipient_email: z.string().email(),
        template_type: z.string().min(1),
        subject: z.string().min(1),
        status: z.string().default("sent"),
        error_message: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.emailLog.create({
        data: {
          recipient_email: input.recipient_email,
          template_type: input.template_type,
          subject: input.subject,
          status: input.status,
          error_message: input.error_message ?? null,
          sent_at: input.status === "sent" ? new Date() : null,
        },
      })
    ),

  listEmailLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(200) }).optional())
    .query(({ input }) =>
      prisma.emailLog.findMany({
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 200,
      })
    ),

  sendTestEmail: adminProcedure
    .input(z.object({ recipientEmail: z.string().email() }))
    .mutation(async ({ input }) => {
      const result = await sendMail({
        to: input.recipientEmail,
        subject: "BoiAro Email Test",
        html: `<div style="font-family:sans-serif;padding:24px"><h2 style="color:#6d28d9">BoiAro Email Test</h2><p>Your SMTP configuration is working correctly!</p></div>`,
        text: "Your SMTP configuration is working correctly!",
      });
      await prisma.emailLog.create({
        data: {
          recipient_email: input.recipientEmail,
          template_type: "test-email",
          subject: "BoiAro Email Test",
          status: result.success ? "sent" : "failed",
          error_message: result.error ?? null,
          sent_at: result.success ? new Date() : null,
        },
      });
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      return { success: true };
    }),

  getSmtpSettings: adminProcedure.query(async () => {
    const keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_from_email", "smtp_from_name", "smtp_secure"];
    const settings = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }),

  saveSmtpSettings: adminProcedure
    .input(
      z.object({
        smtp_host: z.string().min(1),
        smtp_port: z.string().default("587"),
        smtp_user: z.string().min(1),
        smtp_pass: z.string().optional(),
        smtp_from_email: z.string().email(),
        smtp_from_name: z.string().default("BoiAro"),
        smtp_secure: z.string().default("false"),
      })
    )
    .mutation(async ({ input }) => {
      const pairs = Object.entries(input)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([key, value]) => ({ key, value: value as string }));
      await Promise.all(
        pairs.map((s) =>
          prisma.platformSetting.upsert({
            where: { key: s.key },
            create: { key: s.key, value: s.value },
            update: { value: s.value },
          })
        )
      );
      return { success: true };
    }),

  testSmtpConnection: adminProcedure.mutation(async () => {
    return testSmtpConnection();
  }),

  // ── Firebase Push Settings ──────────────────────────────────────────────────
  getFirebaseSettings: adminProcedure.query(async () => {
    const keys = [
      "firebase_service_account_json",
      "firebase_push_enabled",
      "firebase_web_api_key",
      "firebase_web_auth_domain",
      "firebase_web_project_id",
      "firebase_web_storage_bucket",
      "firebase_web_messaging_sender_id",
      "firebase_web_app_id",
      "firebase_web_vapid_key",
    ];
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      service_account_json: map["firebase_service_account_json"] ?? "",
      push_enabled: map["firebase_push_enabled"] !== "false",
      web_api_key: map["firebase_web_api_key"] ?? "",
      web_auth_domain: map["firebase_web_auth_domain"] ?? "",
      web_project_id: map["firebase_web_project_id"] ?? "",
      web_storage_bucket: map["firebase_web_storage_bucket"] ?? "",
      web_messaging_sender_id: map["firebase_web_messaging_sender_id"] ?? "",
      web_app_id: map["firebase_web_app_id"] ?? "",
      web_vapid_key: map["firebase_web_vapid_key"] ?? "",
    };
  }),

  saveFirebaseSettings: adminProcedure
    .input(
      z.object({
        service_account_json: z.string(),
        push_enabled: z.boolean().default(true),
        web_api_key: z.string().optional(),
        web_auth_domain: z.string().optional(),
        web_project_id: z.string().optional(),
        web_storage_bucket: z.string().optional(),
        web_messaging_sender_id: z.string().optional(),
        web_app_id: z.string().optional(),
        web_vapid_key: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const entries: [string, string][] = [
        ["firebase_service_account_json", input.service_account_json],
        ["firebase_push_enabled", String(input.push_enabled)],
        ["firebase_web_api_key", input.web_api_key ?? ""],
        ["firebase_web_auth_domain", input.web_auth_domain ?? ""],
        ["firebase_web_project_id", input.web_project_id ?? ""],
        ["firebase_web_storage_bucket", input.web_storage_bucket ?? ""],
        ["firebase_web_messaging_sender_id", input.web_messaging_sender_id ?? ""],
        ["firebase_web_app_id", input.web_app_id ?? ""],
        ["firebase_web_vapid_key", input.web_vapid_key ?? ""],
      ];
      await Promise.all(
        entries.map(([key, value]) =>
          prisma.platformSetting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
          })
        )
      );
      invalidateFirebaseCache();
      return { success: true };
    }),

  testFirebasePush: adminProcedure.mutation(async () => {
    return testFirebaseCredentials();
  }),

  listSystemAlerts: adminProcedure.query(async () => {
    const logs = await prisma.systemLog.findMany({
      where: { level: { in: ["warn", "error", "critical"] } },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return logs.map((log) => {
      const meta = (log.metadata || {}) as Record<string, any>;
      const severity = log.level === "critical" ? "critical" : log.level === "error" ? "warning" : "info";
      return {
        id: log.id,
        alert_type: log.module || "system",
        severity,
        title: meta.title || `${(log.module || "System").toUpperCase()} alert`,
        message: log.message,
        metric_value: typeof meta.metric_value === "number" ? meta.metric_value : null,
        threshold: typeof meta.threshold === "number" ? meta.threshold : null,
        is_resolved: Boolean(meta.is_resolved),
        resolved_at: meta.resolved_at || null,
        created_at: log.created_at,
      };
    });
  }),

  resolveSystemAlert: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const current = await prisma.systemLog.findUnique({
        where: { id: input.id },
        select: { metadata: true },
      });
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      const existing = (current.metadata || {}) as Record<string, any>;
      return prisma.systemLog.update({
        where: { id: input.id },
        data: {
          metadata: {
            ...existing,
            is_resolved: true,
            resolved_at: new Date().toISOString(),
          } as any,
        },
      });
    }),

  runSystemAlertCheck: adminProcedure.mutation(async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const errorCount = await prisma.systemLog.count({
      where: { created_at: { gte: oneHourAgo }, level: { in: ["error", "critical"] } },
    });
    return {
      alerts_found: errorCount,
      alerts_inserted: 0,
    };
  }),

  // ── User detail + role update ─────────────────────────────────────────────────
  getAdminUserDetailPage: adminProcedure
    .input(z.object({ type: z.enum(["user", "author", "narrator", "publisher", "translator"]), id: z.string() }))
    .query(async ({ input }) => {
      const roleByType = {
        author: "writer",
        narrator: "narrator",
        publisher: "publisher",
        translator: "translator",
      } as const;

      if (input.type === "user") {
        const user = await prisma.user.findUnique({
          where: { id: input.id },
          include: { profile: true, roles: true },
        });
        if (!user || !user.profile) return null;

        return {
          record: user.profile,
          profile: user.profile,
          roles: user.roles.map((r) => r.role),
          authMeta: {
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: null,
            email_confirmed_at: user.email_verified ? user.updated_at : null,
          },
          application: null,
          books: [],
          earnings: [],
          withdrawals: [],
        };
      }

      const record =
        input.type === "author"
          ? await prisma.author.findUnique({ where: { id: input.id } })
          : input.type === "narrator"
            ? await prisma.narrator.findUnique({ where: { id: input.id } })
            : input.type === "translator"
              ? await prisma.translator.findUnique({ where: { id: input.id } })
              : await prisma.publisher.findUnique({ where: { id: input.id } });
      if (!record) return null;

      if (!record.user_id) {
        return {
          record,
          profile: null,
          roles: [],
          authMeta: null,
          application: null,
          books: [],
          earnings: [],
          withdrawals: [],
        };
      }

      const [user, app, books, earnings, withdrawals] = await Promise.all([
        prisma.user.findUnique({
          where: { id: record.user_id },
          include: { profile: true, roles: true },
        }),
        prisma.roleApplication.findFirst({
          where: { user_id: record.user_id, applied_role: roleByType[input.type] },
          orderBy: { created_at: "desc" },
        }),
        prisma.book.findMany({
          where: { submitted_by: record.user_id },
          select: { id: true, title: true, cover_url: true, submission_status: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: 20,
        }),
        prisma.contributorEarning.findMany({
          where: { user_id: record.user_id },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.withdrawalRequest.findMany({
          where: { user_id: record.user_id },
          orderBy: { created_at: "desc" },
          take: 20,
        }),
      ]);

      return {
        record,
        profile: user?.profile || null,
        roles: (user?.roles || []).map((r) => r.role),
        authMeta: user
          ? {
              email: user.email,
              created_at: user.created_at,
              last_sign_in_at: null,
              email_confirmed_at: user.email_verified ? user.updated_at : null,
            }
          : null,
        application: app,
        books,
        earnings,
        withdrawals,
      };
    }),

  updateAdminUserProfile: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        display_name: z.string().optional(),
        bio: z.string().optional(),
        avatar_url: z.string().optional(),
        phone: z.string().optional().nullable(),
      })
    )
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: {
          display_name: input.display_name,
          bio: input.bio,
          avatar_url: input.avatar_url,
          phone: input.phone ?? undefined,
        },
      })
    ),

  updateAdminCreatorProfile: adminProcedure
    .input(
      z.object({
        type: z.enum(["author", "narrator", "publisher", "translator"]),
        id: z.string(),
        name: z.string().optional(),
        name_en: z.string().optional(),
        email: z.string().optional(),
        status: z.string().optional(),
        priority: z.number().optional(),
        is_featured: z.boolean().optional(),
        is_trending: z.boolean().optional(),
        bio: z.string().optional(),
        avatar_url: z.string().optional(),
        genre: z.string().optional(),
        specialty: z.string().optional(),
        rating: z.number().optional(),
        is_verified: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.type === "author") {
        return prisma.author.update({
          where: { id: input.id },
          data: {
            name: input.name,
            name_en: input.name_en,
            email: input.email,
            status: input.status,
            priority: input.priority,
            is_featured: input.is_featured,
            is_trending: input.is_trending,
            bio: input.bio,
            avatar_url: input.avatar_url,
            genre: input.genre,
          },
        });
      }
      if (input.type === "narrator") {
        return prisma.narrator.update({
          where: { id: input.id },
          data: {
            name: input.name,
            name_en: input.name_en,
            email: input.email,
            status: input.status,
            priority: input.priority,
            is_featured: input.is_featured,
            is_trending: input.is_trending,
            bio: input.bio,
            avatar_url: input.avatar_url,
            specialty: input.specialty,
            rating: input.rating,
          },
        });
      }
      if (input.type === "translator") {
        return prisma.translator.update({
          where: { id: input.id },
          data: {
            name: input.name,
            name_en: input.name_en,
            email: input.email,
            status: input.status,
            priority: input.priority,
            is_featured: input.is_featured,
            is_trending: input.is_trending,
            bio: input.bio,
            avatar_url: input.avatar_url,
            genre: input.genre,
          },
        });
      }
      return prisma.publisher.update({
        where: { id: input.id },
        data: {
          name: input.name,
          name_en: input.name_en,
          email: input.email,
          status: input.status,
          priority: input.priority,
          is_featured: input.is_featured,
          description: input.bio,
          logo_url: input.avatar_url,
          is_verified: input.is_verified,
        },
      });
    }),

  setUserTempPassword: adminProcedure
    .input(z.object({ userId: z.string(), tempPassword: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const password_hash = await bcrypt.hash(input.tempPassword, 12);
      return prisma.user.update({
        where: { id: input.userId },
        data: { password_hash },
        select: { id: true },
      });
    }),

  listCreatorPermissionUsers: adminProcedure.query(async () => {
    const roleUsers = await prisma.userRole.findMany({
      where: { role: { in: ["writer", "publisher", "narrator", "translator"] } },
      select: { user_id: true, role: true },
    });
    const userIds = [...new Set(roleUsers.map((r) => r.user_id))];
    if (!userIds.length) return [];
    const profiles = await prisma.profile.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, display_name: true },
    });
    const roleMap: Record<string, string[]> = {};
    roleUsers.forEach((r) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });
    return profiles.map((p) => ({
      ...p,
      roles: roleMap[p.user_id] || [],
    }));
  }),

  getUserPermissionOverrides: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) =>
      prisma.userPermissionOverride.findMany({
        where: { user_id: input.userId },
        select: { permission_key: true, is_allowed: true },
      })
    ),

  replaceUserPermissionOverrides: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        grantedBy: z.string().optional(),
        overrides: z.array(
          z.object({
            permission_key: z.string(),
            is_allowed: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      await prisma.$transaction([
        prisma.userPermissionOverride.deleteMany({ where: { user_id: input.userId } }),
        ...(input.overrides.length
          ? [
              prisma.userPermissionOverride.createMany({
                data: input.overrides.map((o) => ({
                  user_id: input.userId,
                  permission_key: o.permission_key,
                  is_allowed: o.is_allowed,
                  granted_by: input.grantedBy ?? null,
                })),
              }),
            ]
          : []),
      ]);
      return { success: true };
    }),

  getUserDetail: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) =>
      prisma.user.findUnique({
        where: { id: input.id },
        include: {
          profile: true,
          roles: true,
        },
      })
    ),

  getUserProfileModalData: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [user, wallet, subscription, orders, payments, coinTxns, earnings] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.userId },
          include: { profile: true, roles: true },
        }),
        prisma.userCoin.findUnique({
          where: { user_id: input.userId },
          select: { balance: true, total_earned: true, total_spent: true },
        }),
        prisma.userSubscription.findFirst({
          where: { user_id: input.userId, status: "active" },
          include: { plan: { select: { name: true, price: true } } },
          orderBy: { created_at: "desc" },
        }),
        prisma.order.findMany({
          where: { user_id: input.userId },
          select: {
            id: true,
            order_number: true,
            status: true,
            total_amount: true,
            payment_method: true,
            cod_payment_status: true,
            created_at: true,
            shipping_name: true,
            shipping_address: true,
            shipping_district: true,
            shipping_phone: true,
          },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.payment.findMany({
          where: { user_id: input.userId },
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            transaction_id: true,
            created_at: true,
            order_id: true,
          },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.coinTransaction.findMany({
          where: { user_id: input.userId },
          select: { id: true, amount: true, type: true, description: true, source: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        prisma.contributorEarning.findMany({
          where: { user_id: input.userId },
          select: { id: true, earned_amount: true, role: true, format: true, status: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
      ]);

      const profile = user?.profile
        ? {
            ...user.profile,
            email: user.email,
          }
        : null;

      return {
        profile,
        roles: (user?.roles || []).map((r) => r.role),
        wallet,
        subscription: subscription
          ? {
              ...subscription,
              subscription_plans: subscription.plan,
            }
          : null,
        orders,
        payments,
        coinTxns,
        earnings,
      };
    }),

  getCreatorLinksByUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [authors, publishers, narrators, translators] = await Promise.all([
        prisma.author.findMany({
          where: { user_id: input.userId },
          select: { id: true, name: true, name_en: true, avatar_url: true, status: true },
          orderBy: { linked_at: "desc" },
        }),
        prisma.publisher.findMany({
          where: { user_id: input.userId },
          select: { id: true, name: true, name_en: true, logo_url: true, status: true },
          orderBy: { linked_at: "desc" },
        }),
        prisma.narrator.findMany({
          where: { user_id: input.userId },
          select: { id: true, name: true, name_en: true, avatar_url: true, status: true },
          orderBy: { linked_at: "desc" },
        }),
        prisma.translator.findMany({
          where: { user_id: input.userId },
          select: { id: true, name: true, name_en: true, avatar_url: true, status: true },
          orderBy: { linked_at: "desc" },
        }),
      ]);

      return {
        authors: authors.map((a) => ({ ...a, avatar_url: resolveFileUrl(a.avatar_url) })),
        publishers: publishers.map((p) => ({ ...p, logo_url: resolveFileUrl(p.logo_url) })),
        narrators: narrators.map((n) => ({ ...n, avatar_url: resolveFileUrl(n.avatar_url) })),
        translators: translators.map((t) => ({ ...t, avatar_url: resolveFileUrl(t.avatar_url) })),
      };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.string(), role: z.string(), action: z.enum(["add", "remove"]) }))
    .mutation(async ({ input }) => {
      if (input.action === "add") {
        await prisma.userRole.upsert({
          where: { user_id_role: { user_id: input.userId, role: input.role as any } },
          create: { user_id: input.userId, role: input.role as any },
          update: {},
        });

        // Auto-create the corresponding creator profile if none is linked yet
        const [profile, user] = await Promise.all([
          prisma.profile.findUnique({
            where: { user_id: input.userId },
            select: { display_name: true, full_name: true, avatar_url: true, bio: true, phone: true, specialty: true, genre: true },
          }),
          prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
        ]);
        const name = profile?.display_name || profile?.full_name || user?.email?.split("@")[0] || "Creator";

        if (input.role === "writer") {
          const existing = await prisma.author.findFirst({ where: { user_id: input.userId } });
          if (!existing) {
            await prisma.author.create({
              data: {
                name,
                user_id: input.userId,
                avatar_url: profile?.avatar_url ?? null,
                bio: profile?.bio ?? null,
                phone: profile?.phone ?? null,
                genre: profile?.genre ?? null,
                linked_at: new Date(),
              },
            });
          }
        } else if (input.role === "narrator") {
          const existing = await prisma.narrator.findFirst({ where: { user_id: input.userId } });
          if (!existing) {
            await prisma.narrator.create({
              data: {
                name,
                user_id: input.userId,
                avatar_url: profile?.avatar_url ?? null,
                bio: profile?.bio ?? null,
                phone: profile?.phone ?? null,
                specialty: profile?.specialty ?? null,
                linked_at: new Date(),
              },
            });
          }
        } else if (input.role === "publisher") {
          const existing = await prisma.publisher.findFirst({ where: { user_id: input.userId } });
          if (!existing) {
            await prisma.publisher.create({
              data: {
                name,
                user_id: input.userId,
                logo_url: profile?.avatar_url ?? null,
                description: profile?.bio ?? null,
                phone: profile?.phone ?? null,
                linked_at: new Date(),
              },
            });
          }
        } else if (input.role === "translator") {
          const existing = await prisma.translator.findFirst({ where: { user_id: input.userId } });
          if (!existing) {
            await prisma.translator.create({
              data: {
                name,
                user_id: input.userId,
                avatar_url: profile?.avatar_url ?? null,
                bio: profile?.bio ?? null,
                phone: profile?.phone ?? null,
                genre: profile?.genre ?? null,
                status: "active",
                linked_at: new Date(),
              },
            });
          }
        } else if (input.role === "rj") {
          const existing = await prisma.rjProfile.findUnique({ where: { user_id: input.userId } });
          if (!existing) {
            await prisma.rjProfile.create({
              data: {
                stage_name: name,
                user_id: input.userId,
                avatar_url: profile?.avatar_url ?? null,
                bio: profile?.bio ?? null,
                phone: profile?.phone ?? null,
                specialty: profile?.specialty ?? null,
              },
            });
          }
        }
      } else {
        await prisma.userRole.deleteMany({ where: { user_id: input.userId, role: input.role as any } });
      }
    }),

  // ── Blog Posts ────────────────────────────────────────────────────────────────
  listBlogPosts: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) =>
      prisma.blogPost.findMany({
        where: input?.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
      })
    ),

  createBlogPost: adminProcedure
    .input(z.object({ title: z.string().min(1), slug: z.string().min(1), content: z.string().default(""), excerpt: z.string().optional(), cover_image: z.string().optional(), category: z.string().optional(), tags: z.array(z.string()).default([]), status: z.string().default("draft"), author_name: z.string().optional(), is_featured: z.boolean().optional(), seo_title: z.string().optional(), seo_description: z.string().optional(), seo_keywords: z.string().optional(), publish_date: z.string().optional() }))
    .mutation(({ input }) => {
      const { publish_date, ...data } = input;
      return prisma.blogPost.create({ data: { ...data, ...(publish_date ? { publish_date: new Date(publish_date) } : {}) } as any });
    }),

  updateBlogPost: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().optional(), slug: z.string().optional(), content: z.string().optional(), excerpt: z.string().optional(), cover_image: z.string().optional(), category: z.string().optional(), tags: z.array(z.string()).optional(), status: z.string().optional(), author_name: z.string().optional(), is_featured: z.boolean().optional(), seo_title: z.string().optional(), seo_description: z.string().optional(), seo_keywords: z.string().optional(), publish_date: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, publish_date, ...data } = input;
      return prisma.blogPost.update({ where: { id }, data: { ...data, ...(publish_date ? { publish_date: new Date(publish_date) } : {}) } as any });
    }),

  deleteBlogPost: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.blogPost.delete({ where: { id: input.id } })),

  // ── Roles list ────────────────────────────────────────────────────────────────
  listRoles: adminProcedure.query(() =>
    prisma.userRole.groupBy({
      by: ["role"],
      _count: { role: true },
    })
  ),

  // ── Admin Activity Log ──────────────────────────────────────────────────────
  logAction: adminProcedure
    .input(
      z.object({
        action: z.string(),
        module: z.string().optional(),
        targetId: z.string().optional(),
        targetType: z.string().optional(),
        details: z.string().optional(),
        riskLevel: z.string().default("low"),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.adminActivityLog.create({
        data: {
          user_id: ctx.userId,
          action: input.action,
          module: input.module,
          target_id: input.targetId,
          target_type: input.targetType,
          details: input.details,
          risk_level: input.riskLevel,
          status: "success",
        },
      })
    ),

  // ── Categories (enhanced with is_trending) ─────────────────────────────────
  createCategoryFull: adminProcedure
    .input(z.object({ name: z.string().min(1), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => prisma.category.create({ data: input as any })),

  updateCategoryFull: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), name_en: z.string().optional(), name_bn: z.string().optional(), slug: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), is_featured: z.boolean().optional(), is_trending: z.boolean().optional(), priority: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.category.update({ where: { id }, data });
    }),

  // ── Homepage Sections bulk update ──────────────────────────────────────────
  bulkUpdateHomepageSections: adminProcedure
    .input(z.array(z.object({ id: z.string(), title: z.string(), subtitle: z.string().nullable().optional(), is_enabled: z.boolean(), sort_order: z.number() })))
    .mutation(async ({ input }) => {
      await Promise.all(input.map(s =>
        prisma.homepageSection.update({ where: { id: s.id }, data: { title: s.title, subtitle: s.subtitle, is_enabled: s.is_enabled, sort_order: s.sort_order } })
      ));
      return { success: true };
    }),

  // ── Homepage Category Sections ────────────────────────────────────────────
  getHomepageCategorySections: adminProcedure.query(() =>
    prisma.homepageCategorySection.findMany({
      orderBy: { sort_order: "asc" },
      include: { category: { select: { id: true, name: true, name_bn: true, slug: true } } },
    })
  ),

  saveHomepageCategorySections: adminProcedure
    .input(z.array(z.object({
      id: z.string().optional(),
      category_id: z.string(),
      title: z.string().nullable().optional(),
      subtitle: z.string().nullable().optional(),
      book_limit: z.number().min(1).max(50).default(8),
      sort_order: z.number(),
    })))
    .mutation(async ({ input }) => {
      const incoming = input.map((r, i) => ({ ...r, sort_order: i + 1 }));
      const incomingIds = incoming.filter(r => r.id).map(r => r.id as string);

      // Delete rows that were removed
      await prisma.homepageCategorySection.deleteMany({
        where: { id: { notIn: incomingIds } },
      });

      // Upsert each row
      await Promise.all(incoming.map(r => {
        const data = {
          category_id: r.category_id,
          title: r.title ?? null,
          subtitle: r.subtitle ?? null,
          book_limit: r.book_limit,
          sort_order: r.sort_order,
        };
        if (r.id) {
          return prisma.homepageCategorySection.update({ where: { id: r.id }, data });
        }
        return prisma.homepageCategorySection.create({ data });
      }));

      return { success: true };
    }),

  // ── Hero Banners CRUD ──────────────────────────────────────────────────────
  listHeroBanners: adminProcedure.query(() =>
    prisma.heroBanner.findMany({ orderBy: { sort_order: "asc" } })
  ),

  upsertHeroBanner: adminProcedure
    .input(z.object({ id: z.string().optional(), title: z.string().min(1), subtitle: z.string().nullable().optional(), cta_text: z.string().nullable().optional(), cta_link: z.string().nullable().optional(), image_url: z.string().nullable().optional(), is_active: z.boolean().default(true), sort_order: z.number().default(0) }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if (id) return prisma.heroBanner.update({ where: { id }, data });
      return prisma.heroBanner.create({ data: data as any });
    }),

  deleteHeroBanner: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.heroBanner.delete({ where: { id: input.id } })),

  // ── CMS Pages CRUD ──────────────────────────────────────────────────────────
  listCmsPages: adminProcedure.query(() =>
    prisma.cmsPage.findMany({ orderBy: { updated_at: "desc" } })
  ),

  createCmsPage: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        slug: z.string().min(1),
        content: z.string().default(""),
        featured_image: z.string().nullable().optional(),
        status: z.string().default("draft"),
        seo_title: z.string().nullable().optional(),
        seo_description: z.string().nullable().optional(),
        seo_keywords: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.cmsPage.create({
        data: {
          title: input.title,
          slug: input.slug,
          content: input.content,
          status: input.status,
          featured_image: input.featured_image ?? null,
          seo_title: input.seo_title ?? null,
          seo_description: input.seo_description ?? null,
          seo_keywords: input.seo_keywords ?? null,
        },
      })
    ),

  updateCmsPage: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        slug: z.string().min(1),
        content: z.string().default(""),
        featured_image: z.string().nullable().optional(),
        status: z.string().default("draft"),
        seo_title: z.string().nullable().optional(),
        seo_description: z.string().nullable().optional(),
        seo_keywords: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.cmsPage.update({
        where: { id },
        data: {
          title: data.title,
          slug: data.slug,
          content: data.content,
          status: data.status,
          featured_image: data.featured_image ?? null,
          seo_title: data.seo_title ?? null,
          seo_description: data.seo_description ?? null,
          seo_keywords: data.seo_keywords ?? null,
        },
      });
    }),

  // ── Coin Packages ───────────────────────────────────────────────────────────
  listCoinPackages: adminProcedure.query(() =>
    prisma.coinPackage.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "desc" }] })
  ),

  listCoinPurchases: adminProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().optional() }).optional())
    .query(({ input }) =>
      prisma.coinPurchase.findMany({
        where: input?.status ? { payment_status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 50,
      })
    ),

  // Surfaces single-chapter audiobook purchases — these don't create an Order row
  // (they use their own table), so without this they're invisible in the admin panel.
  listChapterPurchases: adminProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const purchases = await prisma.chapterPurchase.findMany({
        where: input?.status ? { payment_status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 50,
        include: { track: { select: { title: true, track_number: true } } },
      });

      const bookIds = [...new Set(purchases.map((p) => p.book_id))];
      const userIds = [...new Set(purchases.map((p) => p.user_id))];
      const [books, users] = await Promise.all([
        prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } }),
        prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
      ]);
      const bookMap = new Map(books.map((b) => [b.id, b.title]));
      const userMap = new Map(users.map((u) => [u.id, u.email]));

      return purchases.map((p) => ({
        ...p,
        book_title: bookMap.get(p.book_id) ?? null,
        user_email: userMap.get(p.user_id) ?? null,
      }));
    }),

  updateCoinPackage: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        coins: z.number().int().nonnegative(),
        price: z.number().nonnegative(),
        bonus_coins: z.number().int().nonnegative().default(0),
        sort_order: z.number().int().default(0),
        is_featured: z.boolean().default(false),
        is_active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      if (input.id) {
        return prisma.coinPackage.update({
          where: { id: input.id },
          data: {
            name: input.name,
            coins: input.coins,
            price: input.price,
            bonus_coins: input.bonus_coins,
            sort_order: input.sort_order,
            is_featured: input.is_featured,
            ...(typeof input.is_active === "boolean" ? { is_active: input.is_active } : {}),
          },
        });
      }
      return prisma.coinPackage.create({
        data: {
          name: input.name,
          coins: input.coins,
          price: input.price,
          bonus_coins: input.bonus_coins,
          sort_order: input.sort_order,
          is_featured: input.is_featured,
          is_active: input.is_active ?? true,
        },
      });
    }),

  deleteCoinPackage: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.coinPackage.delete({ where: { id: input.id } })),

  // ── Coupons ─────────────────────────────────────────────────────────────────
  listCoupons: adminProcedure.query(() =>
    prisma.coupon.findMany({
      orderBy: { created_at: "desc" },
      include: {
        books: { include: { book: { select: { id: true, title: true } } } },
        category: { select: { id: true, name: true } },
      },
    })
  ),

  createCoupon: adminProcedure
    .input(
      z.object({
        code: z.string().min(1),
        description: z.string().nullable().optional(),
        discount_type: z.string().default("percentage"),
        discount_value: z.number().nonnegative(),
        applies_to: z.string().default("all"),
        category_id: z.string().nullable().optional(),
        book_ids: z.array(z.string()).optional(),
        min_order_amount: z.number().nullable().optional(),
        usage_limit: z.number().int().nullable().optional(),
        per_user_limit: z.number().int().nullable().optional(),
        start_date: z.string().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        first_order_only: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const coupon = await prisma.coupon.create({
        data: {
          code: input.code.toUpperCase(),
          description: input.description ?? null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          applies_to: input.applies_to,
          category_id: input.applies_to === "category" ? (input.category_id ?? null) : null,
          min_order_amount: input.min_order_amount ?? null,
          usage_limit: input.usage_limit ?? null,
          per_user_limit: input.per_user_limit ?? null,
          start_date: input.start_date ? new Date(input.start_date) : new Date(),
          end_date: input.end_date ? new Date(input.end_date) : null,
          status: input.status,
          first_order_only: input.first_order_only,
        },
      });
      if (input.applies_to === "books" && input.book_ids?.length) {
        await prisma.couponBook.createMany({
          data: input.book_ids.map((book_id) => ({ coupon_id: coupon.id, book_id })),
          skipDuplicates: true,
        });
      }
      return coupon;
    }),

  updateCoupon: adminProcedure
    .input(
      z.object({
        id: z.string(),
        code: z.string().min(1),
        description: z.string().nullable().optional(),
        discount_type: z.string().default("percentage"),
        discount_value: z.number().nonnegative(),
        applies_to: z.string().default("all"),
        category_id: z.string().nullable().optional(),
        book_ids: z.array(z.string()).optional(),
        min_order_amount: z.number().nullable().optional(),
        usage_limit: z.number().int().nullable().optional(),
        per_user_limit: z.number().int().nullable().optional(),
        start_date: z.string().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        first_order_only: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const { id, book_ids, ...rest } = input;
      const coupon = await prisma.coupon.update({
        where: { id },
        data: {
          code: rest.code.toUpperCase(),
          description: rest.description ?? null,
          discount_type: rest.discount_type,
          discount_value: rest.discount_value,
          applies_to: rest.applies_to,
          category_id: rest.applies_to === "category" ? (rest.category_id ?? null) : null,
          min_order_amount: rest.min_order_amount ?? null,
          usage_limit: rest.usage_limit ?? null,
          per_user_limit: rest.per_user_limit ?? null,
          start_date: rest.start_date ? new Date(rest.start_date) : new Date(),
          end_date: rest.end_date ? new Date(rest.end_date) : null,
          status: rest.status,
          first_order_only: rest.first_order_only,
        },
      });
      // Rebuild CouponBook links regardless — delete old, insert new if still "books"
      await prisma.couponBook.deleteMany({ where: { coupon_id: id } });
      if (rest.applies_to === "books" && book_ids?.length) {
        await prisma.couponBook.createMany({
          data: book_ids.map((book_id) => ({ coupon_id: id, book_id })),
          skipDuplicates: true,
        });
      }
      return coupon;
    }),

  deleteCoupon: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.coupon.delete({ where: { id: input.id } })),

  // ── Subscription Plans ──────────────────────────────────────────────────────
  listSubscriptionPlans: adminProcedure.query(() =>
    prisma.subscriptionPlan.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "desc" }] })
  ),

  createPlan: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        price: z.number().nonnegative(),
        duration_days: z.number().int().positive().default(30),
        sort_order: z.number().int().default(0),
        is_featured: z.boolean().default(false),
        is_active: z.boolean().default(true),
        features: z.array(z.string()).default([]),
      })
    )
    .mutation(({ input }) =>
      prisma.subscriptionPlan.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          price: input.price,
          duration_days: input.duration_days,
          sort_order: input.sort_order,
          is_featured: input.is_featured,
          is_active: input.is_active,
          features: input.features,
        },
      })
    ),

  updatePlan: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        price: z.number().nonnegative(),
        duration_days: z.number().int().positive().default(30),
        sort_order: z.number().int().default(0),
        is_featured: z.boolean().default(false),
        is_active: z.boolean().default(true),
        features: z.array(z.string()).default([]),
      })
    )
    .mutation(({ input }) =>
      prisma.subscriptionPlan.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description ?? null,
          price: input.price,
          duration_days: input.duration_days,
          sort_order: input.sort_order,
          is_featured: input.is_featured,
          is_active: input.is_active,
          features: input.features,
        },
      })
    ),

  deletePlan: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.subscriptionPlan.delete({ where: { id: input.id } })),

  // ── Ad Banners ──────────────────────────────────────────────────────────────
  listAdBanners: adminProcedure.query(() =>
    prisma.adBanner.findMany({ orderBy: [{ display_order: "asc" }, { created_at: "desc" }] })
  ),

  updateAdBanner: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        title: z.string().nullable().optional(),
        image_url: z.string().nullable().optional(),
        destination_url: z.string().nullable().optional(),
        placement_key: z.string().min(1),
        start_date: z.string().nullable().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        display_order: z.number().int().default(0),
        device: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const data = {
        title: input.title ?? null,
        image_url: input.image_url ?? null,
        destination_url: input.destination_url ?? null,
        placement_key: input.placement_key,
        start_date: input.start_date ? new Date(input.start_date) : null,
        end_date: input.end_date ? new Date(input.end_date) : null,
        status: input.status,
        display_order: input.display_order,
        device: input.device ?? null,
      };
      if (input.id) return prisma.adBanner.update({ where: { id: input.id }, data });
      return prisma.adBanner.create({ data });
    }),

  deleteAdBanner: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.adBanner.delete({ where: { id: input.id } })),

  // ── Ad Campaigns ────────────────────────────────────────────────────────────
  listAdCampaigns: adminProcedure.query(() =>
    prisma.adCampaign.findMany({ orderBy: { created_at: "desc" } })
  ),

  updateAdCampaign: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        ad_type: z.string().default("banner"),
        placement_key: z.string().nullable().optional(),
        start_date: z.string().nullable().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        target_page: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const data = {
        name: input.name,
        ad_type: input.ad_type,
        placement_key: input.placement_key ?? null,
        start_date: input.start_date ? new Date(input.start_date) : null,
        end_date: input.end_date ? new Date(input.end_date) : null,
        status: input.status,
        target_page: input.target_page ?? null,
        notes: input.notes ?? null,
      };
      if (input.id) return prisma.adCampaign.update({ where: { id: input.id }, data });
      return prisma.adCampaign.create({ data });
    }),

  deleteAdCampaign: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.adCampaign.delete({ where: { id: input.id } })),

  // ── Ad Placements ───────────────────────────────────────────────────────────
  listAdPlacements: adminProcedure.query(() =>
    prisma.adPlacement.findMany({ orderBy: [{ display_priority: "asc" }, { placement_key: "asc" }] })
  ),

  updateAdPlacement: adminProcedure
    .input(
      z.object({
        id: z.string(),
        ad_type: z.string().optional(),
        frequency: z.string().nullable().optional(),
        device_visibility: z.string().nullable().optional(),
        display_priority: z.number().int().nullable().optional(),
        notes: z.string().nullable().optional(),
        is_enabled: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.adPlacement.update({ where: { id }, data });
    }),

  adReportSummary: adminProcedure.query(async () => {
    const [banners, rewardedLogs] = await Promise.all([
      prisma.adBanner.findMany({
        orderBy: { impressions: "desc" },
        take: 20,
      }),
      prisma.rewardedAdLog.findMany({
        select: { coins_rewarded: true },
      }),
    ]);

    const totalImpressions = banners.reduce((sum, banner) => sum + Number(banner.impressions || 0), 0);
    const totalClicks = banners.reduce((sum, banner) => sum + Number(banner.clicks || 0), 0);
    const rewardedCount = rewardedLogs.length;
    const totalCoinsGiven = rewardedLogs.reduce((sum, log) => sum + Number(log.coins_rewarded || 0), 0);

    return {
      banners,
      totalImpressions,
      totalClicks,
      rewardedCount,
      totalCoinsGiven,
    };
  }),

  analyticsReportData: adminProcedure.query(async () => {
    const [orders, orderItems, earnings, categories, authors, profiles] = await Promise.all([
      prisma.order.findMany({
        select: {
          id: true,
          user_id: true,
          total_amount: true,
          status: true,
          created_at: true,
          coupon_code: true,
          discount_amount: true,
          shipping_cost: true,
          payment_method: true,
          cod_payment_status: true,
        },
      }),
      prisma.orderItem.findMany({
        select: {
          order_id: true,
          format: true,
          price: true,
          quantity: true,
          book_id: true,
        },
      }),
      prisma.contributorEarning.findMany({
        select: {
          user_id: true,
          role: true,
          earned_amount: true,
          status: true,
          book_id: true,
          format: true,
        },
      }),
      prisma.category.findMany({ select: { id: true, name: true, name_bn: true } }),
      prisma.author.findMany({ select: { id: true, name: true } }),
      prisma.profile.findMany({ select: { user_id: true, display_name: true } }),
    ]);

    const bookIds = [...new Set(orderItems.map((item) => item.book_id).filter(Boolean) as string[])];
    const books = bookIds.length
      ? await prisma.book.findMany({
          where: { id: { in: bookIds } },
          select: { id: true, title: true, author_id: true, publisher_id: true, category_id: true },
        })
      : [];
    const bookMap = Object.fromEntries(books.map((book) => [book.id, book]));

    return {
      orders,
      orderItems: orderItems.map((item) => ({
        order_id: item.order_id,
        format: item.format,
        unit_price: item.price,
        quantity: item.quantity,
        book_id: item.book_id,
        books: item.book_id ? bookMap[item.book_id] ?? null : null,
      })),
      earnings,
      categories,
      authors,
      profiles,
    };
  }),

  userEngagementAnalytics: adminProcedure.query(async () => {
    const now = Date.now();
    const last30Date = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const last7Date = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fiveMinDate = new Date(now - 5 * 60 * 1000);

    const [consumption, onlineCount, totalUsers, reads] = await Promise.all([
      prisma.contentConsumptionTime.findMany({
        where: { created_at: { gte: last30Date } },
        select: { user_id: true, format: true, seconds: true, created_at: true },
      }),
      prisma.userPresence.count({ where: { last_seen: { gte: fiveMinDate } } }),
      prisma.profile.count(),
      prisma.bookRead.findMany({
        where: { created_at: { gte: last7Date } },
        select: { created_at: true },
      }),
    ]);

    const dauMap: Record<string, Set<string>> = {};
    const formatMap: Record<string, number> = {};
    for (const row of consumption) {
      const date = row.created_at.toISOString().slice(0, 10);
      if (!dauMap[date]) dauMap[date] = new Set();
      dauMap[date].add(row.user_id);
      formatMap[row.format] = (formatMap[row.format] || 0) + Number(row.seconds || 0);
    }

    const dauData = Object.entries(dauMap)
      .map(([date, users]) => ({ date, users: users.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const formatData = Object.entries(formatMap).map(([name, value]) => ({
      name,
      value: Math.round(value / 3600),
    }));

    const readsMap: Record<string, number> = {};
    for (const row of reads) {
      const date = row.created_at.toISOString().slice(0, 10);
      readsMap[date] = (readsMap[date] || 0) + 1;
    }
    const readsData = Object.entries(readsMap)
      .map(([date, count]) => ({ date: date.slice(5), reads: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { dauData, formatData, onlineCount, totalUsers, readsData };
  }),

  liveUsers: adminProcedure
    .input(z.object({ filter: z.enum(["online", "reading", "listening"]).optional() }).optional())
    .query(async ({ input }) => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activityFilter =
        input?.filter === "reading"
          ? "reading"
          : input?.filter === "listening"
            ? "listening"
            : undefined;

      const rows = await prisma.userPresence.findMany({
        where: {
          last_seen: { gte: fiveMinAgo },
          ...(activityFilter ? { activity_type: activityFilter } : {}),
        },
        orderBy: { last_seen: "desc" },
        select: {
          user_id: true,
          last_seen: true,
          activity_type: true,
          current_page: true,
          current_book_id: true,
          platform: true,
        },
      });

      if (!rows.length) return [];

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const bookIds = [...new Set(rows.map((r) => r.current_book_id).filter(Boolean) as string[])];
      const [profiles, books] = await Promise.all([
        prisma.profile.findMany({
          where: { user_id: { in: userIds } },
          select: { user_id: true, display_name: true, avatar_url: true },
        }),
        bookIds.length
          ? prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } })
          : Promise.resolve([]),
      ]);
      const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, { name: p.display_name || p.user_id.slice(0, 8), avatar: p.avatar_url }]));
      const bookMap = Object.fromEntries(books.map((b) => [b.id, b.title]));

      return rows.map((r) => ({
        ...r,
        display_name: profileMap[r.user_id]?.name || r.user_id.slice(0, 8),
        avatar_url: profileMap[r.user_id]?.avatar || null,
        book_title: r.current_book_id ? bookMap[r.current_book_id] || null : null,
        platform: (r as any).platform || "web",
      }));
    }),

  readingAnalyticsData: adminProcedure.query(async () => {
    const [logs, books, bookReads, bookListens, presenceData, settings] = await Promise.all([
      prisma.userActivityLog.findMany({
        select: { action: true, book_id: true, user_id: true, created_at: true, metadata: true },
        orderBy: { created_at: "desc" },
        take: 5000,
      }),
      prisma.book.findMany({ select: { id: true, title: true, total_reads: true, total_listens: true, cover_url: true } }),
      prisma.bookRead.findMany({ select: { book_id: true, user_id: true, created_at: true } }),
      prisma.bookListen.findMany({ select: { book_id: true, user_id: true, created_at: true } }),
      prisma.userPresence.findMany(),
      prisma.platformSetting.findMany({
        where: { key: "rec_trending_period_days" },
        select: { key: true, value: true },
        take: 1,
      }),
    ]);

    return {
      logs: logs.map((row) => ({
        event_type: row.action,
        book_id: row.book_id,
        user_id: row.user_id,
        created_at: row.created_at,
        metadata: row.metadata,
      })),
      books,
      bookReads,
      bookListens,
      presenceData,
      trendingPeriod: settings[0]?.value ?? "7",
    };
  }),

  // ── Withdrawal Requests ────────────────────────────────────────────────────
  listWithdrawals: adminProcedure.query(async () => {
    const withdrawals = await prisma.withdrawalRequest.findMany({ orderBy: { created_at: "desc" } });
    const userIds = [...new Set(withdrawals.map(w => w.user_id))];
    const profiles = await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } });
    const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || "Unknown"]));
    return withdrawals.map(w => ({
      ...w,
      display_name: profileMap[w.user_id] || "Unknown",
      account_info: w.mobile_number || w.bank_account || "—",
      admin_notes: w.notes,
    }));
  }),

  processWithdrawal: adminProcedure
    .input(z.object({ id: z.string(), status: z.string(), adminNotes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const withdrawal = await prisma.withdrawalRequest.update({
        where: { id: input.id },
        data: { status: input.status, notes: input.adminNotes ?? null },
      });
      const user = await prisma.user.findUnique({ where: { id: withdrawal.user_id }, select: { email: true } });
      if (user?.email) {
        const approved = input.status === "approved";
        sendNotificationEmail({
          to: user.email,
          subject: `Your Withdrawal Request has been ${approved ? "Approved" : "Rejected"}`,
          templateType: approved ? "withdrawal_approved" : "withdrawal_rejected",
          bodyHtml: `<h2 style="color:${approved ? "#16a34a" : "#dc2626"}">${approved ? "Withdrawal Approved ✓" : "Withdrawal Rejected"}</h2>
            <p>Your withdrawal request for <strong>৳${Number(withdrawal.amount).toFixed(2)}</strong> has been <strong>${input.status}</strong>.</p>
            ${input.adminNotes ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:13px"><strong>Note:</strong> ${input.adminNotes}</p>` : ""}
            ${approved ? "<p>Funds will be transferred to your registered account within 2–5 business days.</p>" : "<p>Please contact support if you have questions.</p>"}`,
          text: `Your withdrawal of ৳${Number(withdrawal.amount).toFixed(2)} was ${input.status}.`,
        }).catch(() => {});
      }
      return withdrawal;
    }),

  // ── Submissions ────────────────────────────────────────────────────────────
  listSubmissions: adminProcedure
    .input(z.object({ status: z.string() }))
    .query(async ({ input }) => {
      const books = await prisma.book.findMany({
        where: {
          OR: [
            { submission_status: input.status },
            { formats: { some: { submission_status: input.status } } },
            // Also surface books whose audiobook tracks are pending review,
            // even when the parent format is already "approved".
            // Prisma relation field is audiobook_tracks (snake_case)
            ...(input.status === "pending" ? [{
              formats: {
                some: {
                  format: "audiobook",
                  audiobook_tracks: { some: { status: "pending" } },
                } as any,
              },
            }] : []),
          ],
        },
        orderBy: { created_at: "desc" },
        include: {
          category: { select: { name: true, name_bn: true } },
          formats: {
            select: {
              id: true, format: true, price: true, stock_count: true,
              duration: true, audio_quality: true, file_url: true,
              submission_status: true,
              // Include pending tracks so the admin dialog can display them
              audiobook_tracks: {
                where: { status: "pending" },
                select: { id: true, title: true, track_number: true, duration: true, audio_url: true },
                orderBy: { track_number: "asc" },
              },
            },
          },
          contributors: { select: { user_id: true, role: true, format: true } },
        },
      });
      const userIds = [...new Set(books.map((b: any) => b.submitted_by).filter(Boolean) as string[])];
      const profiles = userIds.length > 0
        ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } })
        : [];
      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || "Unknown"]));
      return books.map((b: any) => ({
        ...b,
        _submitter: b.submitted_by ? (profileMap[b.submitted_by] || "Unknown") : "Admin",
        book_formats: b.formats?.map((f: any) => ({
          ...f,
          // Rename to camelCase for frontend consistency
          audiobookTracks: f.audiobook_tracks,
        })),
        book_contributors: b.contributors,
        categories: b.category,
      }));
    }),

  /** Approve or reject a single audiobook track. */
  setAudiobookTrackStatus: adminProcedure
    .input(z.object({
      trackId: z.string(),
      status: z.enum(["active", "rejected", "draft"]),
    }))
    .mutation(async ({ input }) => {
      return prisma.audiobookTrack.update({
        where: { id: input.trackId },
        data: { status: input.status },
      });
    }),

  updateSubmissionStatus: adminProcedure
    .input(z.object({
      bookId:   z.string(),
      status:   z.enum(["approved", "rejected", "draft", "pending"]),
      /** When provided, only update this specific format — not all formats. */
      formatId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx: any) => {

        if (input.formatId) {
          // ── Per-format update ────────────────────────────────────────────
          // Only change the specified format. Does NOT touch sibling formats.

          const fmt = await tx.bookFormat.findUnique({
            where: { id: input.formatId },
            select: { id: true, format: true, book_id: true },
          });
          if (!fmt || fmt.book_id !== input.bookId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Format not found on this book" });
          }

          await tx.bookFormat.update({
            where: { id: input.formatId },
            data: { submission_status: input.status },
          });

          // Activate audiobook tracks when approving an audiobook format
          if (input.status === "approved" && fmt.format === "audiobook") {
            await tx.audiobookTrack.updateMany({
              where: { book_format_id: input.formatId, status: { in: ["draft", "pending"] } },
              data: { status: "active" },
            });
          }

          // Recalculate the book's top-level status from all its formats:
          //   approved  → at least one format is approved (book is live)
          //   rejected  → every format is rejected
          //   pending   → no formats approved, at least one pending
          //   draft     → everything else
          const allFmts = await tx.bookFormat.findMany({
            where: { book_id: input.bookId },
            select: { submission_status: true },
          });
          const ss = allFmts.map((f: any) => f.submission_status as string);
          let bookStatus: string;
          if (ss.some((s: string) => s === "approved"))       bookStatus = "approved";
          else if (ss.every((s: string) => s === "rejected")) bookStatus = "rejected";
          else if (ss.some((s: string) => s === "pending"))   bookStatus = "pending";
          else                                                 bookStatus = "draft";

          return tx.book.update({
            where: { id: input.bookId },
            data: { submission_status: bookStatus },
          });

        } else {
          // ── Book-level update (all formats submitted together) ───────────
          // Only clobber formats that are still in the same review cycle
          // (i.e., NOT already approved) to avoid accidentally revoking
          // a format that was already live.

          const updatedBook = await tx.book.update({
            where: { id: input.bookId },
            data: {
              submission_status: input.status,
              ...(input.status === "pending" ? { submitted_by: ctx.userId } : {}),
            },
          });

          const formatWhere: any = { book_id: input.bookId };
          if (input.status === "draft") {
            // "Send Back" should only affect formats still in the review cycle
            // (pending/draft). Leave already-approved formats live so creators
            // only need to fix the specific formats being returned.
            formatWhere.submission_status = { not: "approved" };
          }
          // For "rejected" and "approved": update ALL formats without exception.
          // A full book rejection must mark every format as rejected so the
          // reinstate flow can surface them in the Rejected tab.

          await tx.bookFormat.updateMany({
            where: formatWhere,
            data: { submission_status: input.status },
          });

          if (input.status === "approved") {
            const audiobookFormats = await tx.bookFormat.findMany({
              where: { book_id: input.bookId, format: "audiobook" },
              select: { id: true },
            });
            const ids = audiobookFormats.map((f: any) => f.id);
            if (ids.length > 0) {
              await tx.audiobookTrack.updateMany({
                where: { book_format_id: { in: ids }, status: { in: ["draft", "pending"] } },
                data: { status: "active" },
              });
            }
          }

          return updatedBook;
        }
      });
    }),

  getAudiobookTracksForFormat: adminProcedure
    .input(z.object({ bookFormatId: z.string() }))
    .query(({ input }) =>
      prisma.audiobookTrack.findMany({ where: { book_format_id: input.bookFormatId }, orderBy: { track_number: "asc" } })
    ),

  getBookFormatsAdmin: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .query(({ input }) =>
      prisma.bookFormat.findMany({
        where: { book_id: input.bookId },
        select: { id: true, format: true, price: true, file_url: true, duration: true, audio_quality: true, stock_count: true },
      })
    ),

  listEditRequests: adminProcedure.query(async () => {
    const requests = await prisma.contentEditRequest.findMany({ where: { status: "pending" }, orderBy: { created_at: "desc" } });
    const userIds = [...new Set(requests.map(r => r.user_id))];
    const bookIds = [...new Set(requests.map(r => r.book_id))];
    const [profiles, books] = await Promise.all([
      userIds.length > 0 ? prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } }) : [],
      bookIds.length > 0 ? prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true, cover_url: true } }) : [],
    ]);
    const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || "Unknown"]));
    const bookMap = Object.fromEntries(books.map(b => [b.id, b]));
    return requests.map(r => ({
      ...r,
      proposed_changes: (() => { try { return JSON.parse(r.details || "{}"); } catch { return {}; } })(),
      _submitter: profileMap[r.user_id] || "Unknown",
      _book: bookMap[r.book_id] || null,
    }));
  }),

  approveEditRequest: adminProcedure
    .input(z.object({ requestId: z.string(), adminNotes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const req = await prisma.contentEditRequest.findUnique({ where: { id: input.requestId } });
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      const changes = (() => { try { return JSON.parse(req.details || "{}"); } catch { return {}; } })();

      // Whitelist of scalar fields that actually exist on the Book model
      const BOOK_SCALAR_FIELDS = new Set([
        "title", "title_en", "slug", "description", "language", "tags",
        "cover_url", "is_featured", "is_bestseller", "is_new", "is_free",
        "published_date", "rating", "reviews_count",
      ]);
      // Whitelist of scalar fields that exist on BookFormat
      const FORMAT_SCALAR_FIELDS = new Set([
        "price", "original_price", "discount", "duration", "audio_quality",
        "file_url", "file_size", "pages", "chapters_count", "preview_chapters",
        "preview_percentage", "stock_count", "binding", "weight", "dimensions",
        "delivery_days", "is_available", "in_stock", "isbn",
      ]);

      await prisma.$transaction(async (tx: any) => {
        if (changes.book && req.book_id && req.request_type === "book") {
          const raw = changes.book as Record<string, any>;

          // Only pick valid Book scalar fields — drop FK ids and format-only fields
          const scalarUpdates: Record<string, any> = {};
          for (const [k, v] of Object.entries(raw)) {
            if (BOOK_SCALAR_FIELDS.has(k) && v !== undefined && v !== null && v !== "") {
              scalarUpdates[k] = v;
            }
          }

          // Convert FK id fields to Prisma relation connect syntax
          const relationalUpdates: any = {};
          if (raw.category_id) relationalUpdates.category = { connect: { id: raw.category_id } };
          if (raw.author_id)   relationalUpdates.author   = { connect: { id: raw.author_id } };
          if (raw.publisher_id) relationalUpdates.publisher = { connect: { id: raw.publisher_id } };

          const data = { ...scalarUpdates, ...relationalUpdates };
          if (Object.keys(data).length > 0) {
            await tx.book.update({ where: { id: req.book_id }, data });
          }
        }

        if (changes.format?.format_id) {
          const { format_id, ...rawFormatUpdates } = changes.format as Record<string, any>;
          // Only pick valid BookFormat scalar fields
          const formatUpdates: Record<string, any> = {};
          for (const [k, v] of Object.entries(rawFormatUpdates)) {
            if (FORMAT_SCALAR_FIELDS.has(k) && v !== undefined && v !== null && v !== "") {
              formatUpdates[k] = v;
            }
          }
          if (Object.keys(formatUpdates).length > 0) {
            await tx.bookFormat.update({ where: { id: format_id }, data: formatUpdates });
          }
        }

        await tx.contentEditRequest.update({
          where: { id: input.requestId },
          data: { status: "approved", reviewer_id: ctx.userId },
        });
      });
      return { success: true };
    }),

  rejectEditRequest: adminProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(({ ctx, input }) =>
      prisma.contentEditRequest.update({
        where: { id: input.requestId },
        data: { status: "rejected", reviewer_id: ctx.userId },
      })
    ),

  // ── System Health & Logs ────────────────────────────────────────────────────
  dbHealth: adminProcedure.query(async () => {
    const nowIso = new Date().toISOString();

    const [connectionsRaw, slowQueriesRaw, tableStatsRaw, indexUsageRaw, cacheRaw, sizeRaw, locksRaw] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT pid, state, wait_event,
               LEFT(query, 180) AS query_preview
        FROM pg_stat_activity
        WHERE datname = current_database()
        ORDER BY state = 'active' DESC, query_start DESC
        LIMIT 80
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT pid, state,
               EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000 AS duration_ms,
               LEFT(query, 180) AS query_preview
        FROM pg_stat_activity
        WHERE state = 'active'
          AND query_start IS NOT NULL
          AND query NOT ILIKE '%pg_stat_activity%'
          AND (clock_timestamp() - query_start) > interval '500 milliseconds'
        ORDER BY duration_ms DESC
        LIMIT 20
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT relname AS table_name,
               n_live_tup AS estimated_rows,
               pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
               pg_size_pretty(pg_indexes_size(relid)) AS index_size
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 30
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          indexrelname AS index_name,
          relname AS table_name,
          idx_scan,
          idx_tup_read,
          pg_size_pretty(pg_relation_size(indexrelid)) AS size
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC NULLS LAST
        LIMIT 50
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          SUM(blks_hit)::bigint AS blocks_hit,
          SUM(blks_read)::bigint AS blocks_read
        FROM pg_stat_database
        WHERE datname = current_database()
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT pg_database_size(current_database())::bigint AS size_bytes,
               pg_size_pretty(pg_database_size(current_database())) AS size_pretty
      `).catch(() => []),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT blocked.pid AS blocked_pid,
               blocking.pid AS blocking_pid,
               LEFT(blocked.query, 120) AS blocked_query
        FROM pg_locks blocked_locks
        JOIN pg_stat_activity blocked ON blocked.pid = blocked_locks.pid
        JOIN pg_locks blocking_locks
          ON blocking_locks.locktype = blocked_locks.locktype
          AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
          AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
          AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
          AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
          AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
          AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
          AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
          AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
          AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
          AND blocking_locks.pid <> blocked_locks.pid
        JOIN pg_stat_activity blocking ON blocking.pid = blocking_locks.pid
        WHERE NOT blocked_locks.granted
      `).catch(() => []),
    ]);

    const activeConnections = connectionsRaw.filter((c) => c.state === "active").length;
    const currentUsed = connectionsRaw.length;
    const maxConnections = 90;
    const saturation = Math.round((currentUsed / maxConnections) * 100);
    const cacheHit = Number(cacheRaw?.[0]?.blocks_hit ?? 0);
    const cacheRead = Number(cacheRaw?.[0]?.blocks_read ?? 0);
    const cacheRatio = cacheHit + cacheRead > 0 ? cacheHit / (cacheHit + cacheRead) : 1;
    const slowCount = slowQueriesRaw.length;

    let healthScore = 100;
    healthScore -= Math.min(35, Math.max(0, saturation - 45));
    healthScore -= Math.min(25, slowCount * 3);
    healthScore -= locksRaw.length > 0 ? 15 : 0;
    healthScore -= cacheRatio < 0.9 ? Math.round((0.9 - cacheRatio) * 100) : 0;
    healthScore = Math.max(0, Math.min(100, healthScore));
    const healthStatus = healthScore >= 80 ? "healthy" : healthScore >= 55 ? "degraded" : "critical";

    return {
      health: { score: healthScore, status: healthStatus },
      connections: { active: activeConnections, details: connectionsRaw },
      slow_queries: { count: slowCount, queries: slowQueriesRaw },
      pool: {
        max_connections: maxConnections,
        current_used: currentUsed,
        active: activeConnections,
        idle: connectionsRaw.filter((c) => c.state === "idle").length,
        idle_in_transaction: connectionsRaw.filter((c) => c.state === "idle in transaction").length,
        waiting: locksRaw.length,
        saturation_pct: saturation,
        avg_idle_seconds: null,
        longest_idle_seconds: null,
        by_state: Object.entries(
          connectionsRaw.reduce((acc, cur) => {
            const key = String(cur.state || "unknown");
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([state, count]) => ({ state, count })),
      },
      tables: tableStatsRaw,
      index_usage: indexUsageRaw,
      cache: {
        ratio: cacheRatio,
        blocks_hit: cacheHit,
        blocks_read: cacheRead,
      },
      db_size: sizeRaw?.[0] ?? null,
      locks: locksRaw,
      timestamp: nowIso,
    };
  }),

  systemLogs: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(30),
        level: z.string().optional(),
        module: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 30;
      const where: any = {};
      if (input?.level && input.level !== "all") where.level = input.level;
      if (input?.module) where.module = input.module;
      if (input?.search) {
        where.OR = [
          { message: { contains: input.search, mode: "insensitive" } },
          { module: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.systemLog.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.systemLog.count({ where }),
      ]);

      return {
        logs: rows.map((r) => ({
          ...r,
          occurrence_count: 1,
          first_seen_at: r.created_at,
          last_seen_at: r.updated_at ?? r.created_at,
        })),
        total,
      };
    }),

  cleanupSystemLogs: adminProcedure
    .input(z.object({ olderThanDays: z.number().int().min(1).max(365).default(90) }).optional())
    .mutation(async ({ input }) => {
      const olderThanDays = input?.olderThanDays ?? 90;
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      const result = await prisma.systemLog.deleteMany({
        where: { created_at: { lt: cutoff } },
      });
      return { deleted: result.count };
    }),

  // ── Approve / Reject Role Application (enhanced) ──────────────────────────
  approveApplication: adminProcedure
    .input(z.object({ applicationId: z.string(), userId: z.string(), role: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await prisma.roleApplication.findUnique({ where: { id: input.applicationId } });
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });

      await prisma.$transaction(async (tx: any) => {
        await tx.roleApplication.update({
          where: { id: input.applicationId },
          data: { status: "approved", reviewed_by: ctx.userId, verified: true, reviewed_at: new Date() },
        });
        await tx.userRole.upsert({
          where: { user_id_role: { user_id: input.userId, role: input.role as any } },
          create: { user_id: input.userId, role: input.role as any },
          update: {},
        });
      });

      const displayName = app.display_name || "Unknown";
      if (input.role === "writer") {
        const existing = await prisma.author.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.author.create({ data: { name: displayName, user_id: input.userId, status: "active" } });
      } else if (input.role === "publisher") {
        const existing = await prisma.publisher.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.publisher.create({ data: { name: displayName, user_id: input.userId } });
      } else if (input.role === "narrator") {
        const existing = await prisma.narrator.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.narrator.create({ data: { name: displayName, user_id: input.userId, status: "active" } });
      } else if (input.role === "translator") {
        const existing = await prisma.translator.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.translator.create({ data: { name: displayName, user_id: input.userId, status: "active" } });
      } else if (input.role === "rj") {
        const existing = await prisma.rjProfile.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.rjProfile.create({ data: { user_id: input.userId, stage_name: displayName, is_approved: true } });
        else await prisma.rjProfile.update({ where: { user_id: input.userId }, data: { is_approved: true } });
      }

      if (app.display_name) {
        await prisma.profile.update({ where: { user_id: input.userId }, data: { display_name: app.display_name } });
      }

      const approvedUser = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
      if (approvedUser?.email) {
        sendNotificationEmail({
          to: approvedUser.email,
          subject: `Your ${input.role} application has been approved!`,
          templateType: "creator_approved",
          bodyHtml: `<h2 style="color:#16a34a">Application Approved ✓</h2>
            <p>Congratulations, <strong>${app.display_name || "there"}</strong>! Your application for the <strong>${input.role}</strong> role on BoiAro has been approved.</p>
            <p>You can now access your creator dashboard and start publishing.</p>
            <a href="https://boiaro.com/creator" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none">Go to Creator Dashboard</a>`,
          text: `Congratulations! Your ${input.role} application has been approved.`,
        }).catch(() => {});
      }

      return { success: true };
    }),

  rejectApplication: adminProcedure
    .input(z.object({ applicationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await prisma.roleApplication.findUnique({ where: { id: input.applicationId } });
      const result = await prisma.roleApplication.update({
        where: { id: input.applicationId },
        data: { status: "rejected", reviewed_by: ctx.userId, reviewed_at: new Date() },
      });
      if (app?.user_id) {
        const rejectedUser = await prisma.user.findUnique({ where: { id: app.user_id }, select: { email: true } });
        if (rejectedUser?.email) {
          sendNotificationEmail({
            to: rejectedUser.email,
            subject: "Update on your BoiAro creator application",
            templateType: "creator_rejected",
            bodyHtml: `<h2 style="color:#dc2626">Application Update</h2>
              <p>Hi <strong>${app.display_name || "there"}</strong>, thank you for applying to become a <strong>${app.applied_role || "creator"}</strong> on BoiAro.</p>
              <p>After careful review, we are unable to approve your application at this time. You are welcome to apply again in the future.</p>
              <p>If you have questions, please reach out to our support team.</p>`,
            text: `Your ${app.applied_role || "creator"} application was not approved. You may apply again in the future.`,
          }).catch(() => {});
        }
      }
      return result;
    }),

  // ── Revenue Splits ─────────────────────────────────────────────────────────
  listDefaultRevenueRules: adminProcedure.query(async () => {
    const rules = await prisma.defaultRevenueRule.findMany({ orderBy: { format: "asc" } });
    return rules.map((r) => ({
      id: r.id,
      format: r.format,
      writer_percentage: r.writer_percentage,
      publisher_percentage: r.publisher_percentage,
      narrator_percentage: r.narrator_percentage,
      translator_percentage: r.translator_percentage,
      platform_percentage: r.platform_percentage,
      fulfillment_cost_percentage: r.fulfillment_cost_percentage,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }),

  updateDefaultRevenueRule: adminProcedure
    .input(z.object({ id: z.string(), writer_percentage: z.number(), publisher_percentage: z.number(), narrator_percentage: z.number(), translator_percentage: z.number().default(0), platform_percentage: z.number(), fulfillment_cost_percentage: z.number() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.defaultRevenueRule.update({
        where: { id },
        data: {
          writer_percentage: data.writer_percentage,
          publisher_percentage: data.publisher_percentage,
          narrator_percentage: data.narrator_percentage,
          translator_percentage: data.translator_percentage,
          platform_percentage: data.platform_percentage,
          fulfillment_cost_percentage: data.fulfillment_cost_percentage,
        },
      });
    }),

  listRevenueOverrides: adminProcedure.query(async () => {
    const splits = await prisma.formatRevenueSplit.findMany({ orderBy: { created_at: "desc" } });
    const bookIds = [...new Set(splits.map(s => s.book_id))];
    const books = bookIds.length > 0
      ? await prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } })
      : [];
    const bookMap = Object.fromEntries(books.map(b => [b.id, b]));
    return splits.map(s => ({
      id: s.id, book_id: s.book_id, format: s.format, created_at: s.created_at,
      writer_percentage: s.writer_pct,
      publisher_percentage: s.publisher_pct,
      narrator_percentage: s.narrator_pct,
      translator_percentage: s.translator_pct,
      platform_percentage: s.platform_pct,
      fulfillment_cost_percentage: s.fulfillment_cost_pct,
      books: bookMap[s.book_id] || null,
    }));
  }),

  upsertRevenueOverride: adminProcedure
    .input(z.object({ book_id: z.string(), format: z.string(), writer_percentage: z.number(), publisher_percentage: z.number(), narrator_percentage: z.number(), translator_percentage: z.number().default(0), platform_percentage: z.number(), fulfillment_cost_percentage: z.number() }))
    .mutation(async ({ input }) => {
      const data = {
        book_id: input.book_id, format: input.format,
        writer_pct: input.writer_percentage, publisher_pct: input.publisher_percentage,
        narrator_pct: input.narrator_percentage, translator_pct: input.translator_percentage,
        platform_pct: input.platform_percentage,
        fulfillment_cost_pct: input.fulfillment_cost_percentage,
      };
      const existing = await prisma.formatRevenueSplit.findFirst({ where: { book_id: input.book_id, format: input.format } });
      if (existing) return prisma.formatRevenueSplit.update({ where: { id: existing.id }, data });
      return prisma.formatRevenueSplit.create({ data });
    }),

  deleteRevenueOverride: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.formatRevenueSplit.delete({ where: { id: input.id } })),

  listPayments: adminProcedure.query(async () => {
    const payments = await prisma.payment.findMany({
      orderBy: { created_at: "desc" },
      include: {
        order: {
          select: {
            id: true,
            order_number: true,
            shipping_name: true,
            shipping_phone: true,
            shipping_address: true,
            shipping_district: true,
            status: true,
            total_amount: true,
            payment_method: true,
            cod_payment_status: true,
            user_id: true,
          },
        },
      },
    });
    const missingNameUserIds = [
      ...new Set(payments.filter((p) => !p.order?.shipping_name && !!p.user_id).map((p) => p.user_id)),
    ];
    const profiles = missingNameUserIds.length
      ? await prisma.profile.findMany({
          where: { user_id: { in: missingNameUserIds } },
          select: { user_id: true, display_name: true, phone: true },
        })
      : [];
    const profileMap = Object.fromEntries(
      profiles.map((profile) => [profile.user_id, { display_name: profile.display_name ?? null, phone: profile.phone ?? null }])
    );
    return payments.map((payment) => ({
      ...payment,
      orders: payment.order ?? null,
      _customerName:
        payment.order?.shipping_name ||
        profileMap[payment.user_id]?.display_name ||
        payment.user_id?.slice(0, 8) ||
        "Unknown",
      _customerPhone: payment.order?.shipping_phone || profileMap[payment.user_id]?.phone || null,
    }));
  }),

  markPaymentFailed: adminProcedure
    .input(z.object({ paymentId: z.string() }))
    .mutation(({ input }) =>
      prisma.payment.update({
        where: { id: input.paymentId },
        data: { status: "failed" },
      })
    ),

  listPaymentGateways: adminProcedure.query(async () => {
    // Self-heals: RevenueCat (Apple IAP) has no separate seed script, so ensure
    // its row exists the first time an admin opens this page.
    await prisma.paymentGateway.upsert({
      where: { gateway_key: "revenuecat" },
      create: { gateway_key: "revenuecat", label: "RevenueCat (Apple IAP)", is_enabled: false, config: {} },
      update: {},
    });
    return prisma.paymentGateway.findMany({
      orderBy: [{ sort_priority: "asc" }, { created_at: "asc" }],
    });
  }),

  updatePaymentGateway: adminProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().min(1),
        is_enabled: z.boolean(),
        mode: z.string().nullable().optional(),
        sort_priority: z.number().int().default(0),
        config: z.record(z.any()).default({}),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) =>
      prisma.paymentGateway.update({
        where: { id: input.id },
        data: {
          label: input.label,
          is_enabled: input.is_enabled,
          mode: input.mode ?? null,
          sort_priority: input.sort_priority,
          config: input.config as any,
          notes: input.notes ?? null,
        },
      })
    ),

  revenueAuditOrder: adminProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const query = input.query.trim();
      const order =
        (await prisma.order.findUnique({ where: { id: query } })) ||
        (await prisma.order.findFirst({ where: { order_number: query } }));
      if (!order) return null;

      const [payment, ledgerEntries, orderItems, books] = await Promise.all([
        prisma.payment.findFirst({ where: { order_id: order.id }, orderBy: { created_at: "desc" } }),
        prisma.accountingLedger.findMany({ where: { order_id: order.id }, orderBy: { created_at: "desc" } }),
        prisma.orderItem.findMany({ where: { order_id: order.id } }),
        prisma.book.findMany({
          where: { id: { in: [...new Set((await prisma.orderItem.findMany({ where: { order_id: order.id }, select: { book_id: true } })).map((i) => i.book_id).filter(Boolean) as string[])] } },
          select: { id: true, title: true },
        }),
      ]);

      const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));
      const revenueIncluded = isVerifiedRevenueOrder(order);

      const incomeEntries = ledgerEntries.filter((e) => e.type === "income" && e.category === "book_sale");
      let exclusionReason: string | null = null;
      if (!revenueIncluded) {
        exclusionReason =
          order.payment_method === "cod" ? "cod_not_settled" : "order_status_not_counted_as_paid_revenue";
      }

      const issues: string[] = [];
      if (incomeEntries.length === 0 && revenueIncluded) issues.push("Order is verified revenue but missing ledger income entry");
      if (incomeEntries.length > 1) issues.push(`Duplicate ledger income entries found: ${incomeEntries.length}`);
      if (!payment && order.payment_method !== "cod") issues.push("No payment record found for non-COD order");
      if (payment?.status === "paid" && !revenueIncluded) issues.push("Payment paid but order excluded from revenue");
      if (order.payment_method === "cod" && order.status === "delivered" && !isVerifiedRevenueOrder(order)) {
        issues.push("COD delivered but cod_payment_status not settled");
      }

      return {
        order,
        payment,
        ledgerEntries,
        orderItems: orderItems.map((item) => ({ ...item, books: item.book_id ? bookMap[item.book_id] || null : null })),
        revenueIncluded,
        exclusionReason,
        issues,
      };
    }),

  revenueAuditFixOrder: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const verified = isVerifiedRevenueOrder(order);

      const existingIncome = await prisma.accountingLedger.findFirst({
        where: { order_id: order.id, type: "income", category: "book_sale", amount: { gt: 0 } },
      });
      const fixes: string[] = [];
      if (verified && !existingIncome) {
        // Sellable amount = total_amount - shipping_cost (shipping is customer pass-through)
        const sellableAmount = Math.max(0, Number(order.total_amount || 0) - Number(order.shipping_cost || 0));
        await prisma.accountingLedger.create({
          data: {
            type: "income",
            category: "book_sale",
            amount: sellableAmount,
            entry_date: new Date(),
            order_id: order.id,
            reference_type: "order",
            reference_id: order.id,
            description: `Auto-fix: revenue ledger for order ${order.order_number || order.id.slice(0, 8)}`,
            source: "system",
            created_by: ctx.userId,
          },
        });
        fixes.push("created_missing_income_ledger");
      }
      return { fixes };
    }),

  revenueConsistencyCheck: adminProcedure.query(async () => {
    const [orders, ledger] = await Promise.all([
      prisma.order.findMany({
        select: { id: true, order_number: true, total_amount: true, shipping_cost: true, status: true, payment_method: true, cod_payment_status: true, created_at: true },
      }),
      prisma.accountingLedger.findMany({
        where: { type: "income", category: "book_sale" },
      }),
    ]);
    const verifiedOrders = orders.filter((o) => isVerifiedRevenueOrder(o));
    // Use sellable amount (excludes shipping — customer pass-through, not platform revenue)
    const orderRevenue = verifiedOrders.reduce((s, o) => s + Math.max(0, Number(o.total_amount || 0) - Number(o.shipping_cost || 0)), 0);
    const positiveLedger = ledger.filter((e) => Number(e.amount) > 0);
    const ledgerIncome = positiveLedger.reduce((s, e) => s + Number(e.amount || 0), 0);
    const ledgerOrderIds = new Set(positiveLedger.map((e) => e.order_id).filter(Boolean));
    const missingFromLedger = verifiedOrders.filter((o) => !ledgerOrderIds.has(o.id));
    const seen = new Set<string>();
    const duplicateInLedger: any[] = [];
    positiveLedger.forEach((e) => {
      if (!e.order_id) return;
      const key = `${e.order_id}_${e.category}`;
      if (seen.has(key)) duplicateInLedger.push(e);
      seen.add(key);
    });
    return {
      orderRevenue,
      ledgerIncome,
      mismatch: Math.abs(orderRevenue - ledgerIncome) > 0.01,
      missingFromLedger,
      duplicateInLedger,
    };
  }),

  weeklyReportData: adminProcedure.query(async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    start.setHours(0, 0, 0, 0);
    const startDay = start.toISOString().slice(0, 10);

    const [newUsersCount, weekOrders, weekLedger, topBooks, consumption, alerts, weekSubRevAgg] = await Promise.all([
      prisma.profile.count({ where: { created_at: { gte: start } } }),
      prisma.order.findMany({
        where: {
          created_at: { gte: start },
          status: { notIn: ["cancelled", "returned", "pending"] },
        },
        select: { total_amount: true, shipping_cost: true, status: true, payment_method: true, cod_payment_status: true },
      }),
      prisma.accountingLedger.findMany({ where: { entry_date: { gte: new Date(startDay) } }, select: { type: true, amount: true, category: true } }),
      prisma.book.findMany({ select: { title: true, total_reads: true }, orderBy: { total_reads: "desc" }, take: 5 }),
      prisma.contentConsumptionTime.findMany({ where: { created_at: { gte: start } }, select: { format: true, seconds: true } }),
      prisma.systemLog.findMany({ where: { created_at: { gte: start }, level: { in: ["warn", "error", "critical"] } }, select: { level: true, metadata: true } }),
      prisma.payment.aggregate({ where: { subscription_id: { not: null }, status: "paid", created_at: { gte: start } }, _sum: { amount: true } }),
    ]);

    const income = weekLedger.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount || 0), 0);
    const expense = weekLedger.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount || 0), 0);
    const ebookHours = consumption.filter((c) => c.format === "ebook").reduce((s, c) => s + Number(c.seconds || 0), 0) / 3600;
    const audioHours = consumption.filter((c) => c.format === "audiobook").reduce((s, c) => s + Number(c.seconds || 0), 0) / 3600;
    const normalizedAlerts = alerts.map((a) => {
      const meta = (a.metadata || {}) as Record<string, any>;
      const isResolved = Boolean(meta.is_resolved);
      return { severity: a.level === "critical" ? "critical" : a.level === "error" ? "warning" : "info", is_resolved: isResolved };
    });

    const weekOrdersVerified = weekOrders.filter((o) => isVerifiedRevenueOrder(o));
    const weekSubRevenue = Number(weekSubRevAgg._sum.amount ?? 0);
    return {
      newUsers: newUsersCount,
      totalOrders: weekOrdersVerified.length,
      totalRevenue: weekOrdersVerified.reduce((s, o) => s + Math.max(0, Number(o.total_amount || 0) - Number(o.shipping_cost || 0)), 0) + weekSubRevenue,
      income,
      expense,
      netProfit: income - expense,
      topBooks: topBooks.map((b) => ({ title: b.title, reads: b.total_reads || 0 })),
      ebookHours: Number(ebookHours.toFixed(1)),
      audioHours: Number(audioHours.toFixed(1)),
      alertsTotal: normalizedAlerts.length,
      alertsCritical: normalizedAlerts.filter((a) => a.severity === "critical").length,
      alertsResolved: normalizedAlerts.filter((a) => a.is_resolved).length,
      alertsUnresolved: normalizedAlerts.filter((a) => !a.is_resolved).length,
      pool: { saturation_pct: null, active: null, idle: null },
    };
  }),

  financialReportData: adminProcedure.query(async () => {
    const [orders, orderItems, ledger, earnings, bookFormats, books] = await Promise.all([
      prisma.order.findMany({
        select: {
          id: true,
          order_number: true,
          total_amount: true,
          status: true,
          created_at: true,
          packaging_cost: true,
          fulfillment_cost: true,
          shipping_cost: true,
          payment_method: true,
          cod_payment_status: true,
          purchase_cost_per_unit: true,
          is_purchased: true,
        },
      }),
      prisma.orderItem.findMany({
        select: {
          id: true,
          order_id: true,
          book_id: true,
          format: true,
          price: true,
          quantity: true,
        },
      }),
      prisma.accountingLedger.findMany({
        orderBy: [{ entry_date: "desc" }, { created_at: "desc" }],
      }),
      prisma.contributorEarning.findMany({
        where: { status: { not: "reversed" } },
        select: {
          book_id: true,
          format: true,
          role: true,
          earned_amount: true,
          sale_amount: true,
          status: true,
          created_at: true,
        },
      }),
      prisma.bookFormat.findMany({
        select: {
          book_id: true,
          format: true,
          original_price: true,
          discount: true,
          publisher_commission_percent: true,
          unit_cost: true,
        },
      }),
      prisma.book.findMany({ select: { id: true, title: true } }),
    ]);

    const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));
    return {
      orders,
      orderItems: orderItems.map((item) => ({
        ...item,
        unit_price: item.price,
        books: item.book_id ? bookMap[item.book_id] || null : null,
      })),
      ledger,
      earnings: earnings.map((e) => ({
        ...e,
        books: e.book_id ? bookMap[e.book_id] || null : null,
      })),
      bookFormats,
      books,
    };
  }),

  investorReportData: adminProcedure.query(async () => {
    const [orders, orderItems, ledger, earnings, profiles, totalUsersCount, withdrawals, bookFormats, books] = await Promise.all([
      prisma.order.findMany({
        select: {
          id: true,
          order_number: true,
          total_amount: true,
          status: true,
          created_at: true,
          packaging_cost: true,
          fulfillment_cost: true,
          shipping_cost: true,
          payment_method: true,
          cod_payment_status: true,
          user_id: true,
          purchase_cost_per_unit: true,
          is_purchased: true,
        },
      }),
      prisma.orderItem.findMany({
        select: { order_id: true, book_id: true, format: true, price: true, quantity: true },
      }),
      prisma.accountingLedger.findMany({ orderBy: [{ entry_date: "desc" }, { created_at: "desc" }] }),
      prisma.contributorEarning.findMany({
        where: { status: { not: "reversed" } },
        select: { book_id: true, format: true, role: true, earned_amount: true, sale_amount: true, status: true, created_at: true },
      }),
      prisma.profile.findMany({ select: { id: true, created_at: true } }),
      prisma.profile.count(),
      prisma.withdrawalRequest.findMany({
        select: { id: true, amount: true, status: true, created_at: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.bookFormat.findMany({ select: { book_id: true, format: true, unit_cost: true, original_price: true, publisher_commission_percent: true } }),
      prisma.book.findMany({ select: { id: true, title: true } }),
    ]);
    const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));
    return {
      orders,
      orderItems: orderItems.map((item) => ({
        ...item,
        unit_price: item.price,
        books: item.book_id ? bookMap[item.book_id] || null : null,
      })),
      ledger,
      earnings,
      profiles,
      totalUsersCount,
      withdrawals,
      bookFormats,
    };
  }),

  performanceData: adminProcedure.query(async () => {
    const oneDayAgo = new Date(Date.now() - 86400000);
    const [perfLogs, errorLogs, dbStats] = await Promise.all([
      prisma.systemLog.findMany({
        where: { module: { in: ["api", "trpc", "rest", "db"] } },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { module: true, metadata: true, created_at: true },
      }),
      prisma.systemLog.findMany({
        where: { level: { in: ["error", "critical"] }, created_at: { gte: oneDayAgo } },
        orderBy: { created_at: "asc" },
        select: { level: true, created_at: true, module: true },
      }),
      prisma.platformSetting.findMany({
        where: { key: { in: ["db_pool_saturation_pct", "db_pool_active", "db_pool_idle", "db_slow_queries_count", "db_health_score", "db_health_status"] } },
        select: { key: true, value: true },
      }),
    ]);
    const settingMap = Object.fromEntries(dbStats.map((s) => [s.key, s.value]));

    const edgeLogs = perfLogs.map((log, idx) => {
      const meta = (log.metadata || {}) as Record<string, any>;
      return {
        id: `perf-${idx}`,
        function_name: String(meta.function_name || log.module || "unknown"),
        response_time_ms: Number(meta.response_time_ms || meta.duration_ms || 0),
        status_code: Number(meta.status_code || 200),
        created_at: log.created_at,
      };
    });

    return {
      edgeLogs,
      errorLogs,
      dbHealth: {
        health: {
          score: Number(settingMap.db_health_score || 0),
          status: settingMap.db_health_status || "unknown",
        },
        connections: {
          active: Number(settingMap.db_pool_active || 0),
          idle: Number(settingMap.db_pool_idle || 0),
        },
        slow_queries: {
          count: Number(settingMap.db_slow_queries_count || 0),
        },
        pool: {
          saturation_pct: Number(settingMap.db_pool_saturation_pct || 0),
        },
      },
    };
  }),

  listEarnings: adminProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 50;
      // Fetch more than requested so we have enough after filtering to verified orders
      const earnings = await prisma.contributorEarning.findMany({
        orderBy: { created_at: "desc" },
        take: limit * 6,
        select: {
          id: true,
          user_id: true,
          book_id: true,
          format: true,
          role: true,
          sale_amount: true,
          earned_amount: true,
          percentage: true,
          fulfillment_amount: true,
          order_id: true,
          order_item_id: true,
          status: true,
          created_at: true,
        },
      });

      // Only show earnings from verified (paid/completed) orders
      const orderIds = [...new Set(earnings.map(e => e.order_id).filter(Boolean) as string[])];
      const orders = orderIds.length > 0
        ? await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, status: true, payment_method: true, cod_payment_status: true },
          })
        : [];
      const verifiedOrderIds = new Set(
        orders.filter((o) => isVerifiedRevenueOrder({
          status: String(o.status || ""),
          payment_method: o.payment_method,
          cod_payment_status: o.cod_payment_status,
        })).map((o) => o.id)
      );
      const orderStatusMap = Object.fromEntries(orders.map(o => [o.id, o.status]));

      // Also include IAP earnings (no order_id) — those are always verified at creation
      const verifiedEarnings = earnings
        .filter((e) => !e.order_id || verifiedOrderIds.has(e.order_id))
        .slice(0, limit);

      const bookIds = [...new Set(verifiedEarnings.map(e => e.book_id).filter(Boolean) as string[])];
      const books = bookIds.length > 0
        ? await prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } })
        : [];
      const bookMap = Object.fromEntries(books.map(b => [b.id, b]));
      return verifiedEarnings.map(e => ({
        ...e,
        books: e.book_id ? bookMap[e.book_id] || null : null,
        order_status: e.order_id ? (orderStatusMap[e.order_id] ?? null) : null,
      }));
    }),

  confirmEarnings: adminProcedure
    .input(z.object({ earningIds: z.array(z.string()).min(1) }))
    .mutation(async ({ input }) => {
      const result = await prisma.contributorEarning.updateMany({
        where: { id: { in: input.earningIds }, status: "pending" },
        data: { status: "confirmed" },
      });
      return { confirmed_count: result.count };
    }),

  // Backfill earnings for an existing confirmed order that was placed before
  // earnings calculation was implemented.
  calculateOrderEarnings: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        select: { id: true },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const created = await calculateOrderEarnings(input.orderId);
      return { created };
    }),

  revenueDashboardData: adminProcedure.query(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [incomeRows, ordersForDash, paidItemsRaw, books, profiles] = await Promise.all([
      prisma.accountingLedger.findMany({
        where: { type: "income", entry_date: { gte: thirtyDaysAgo } },
        select: { entry_date: true, amount: true, order_id: true },
        orderBy: { entry_date: "asc" },
      }),
      prisma.order.findMany({
        where: {
          created_at: { gte: thirtyDaysAgo },
          status: { notIn: ["cancelled", "returned", "pending"] },
        },
        select: { id: true, user_id: true, total_amount: true, shipping_cost: true, created_at: true, status: true, payment_method: true, cod_payment_status: true },
      }),
      prisma.orderItem.findMany({
        where: {
          order: {
            created_at: { gte: thirtyDaysAgo },
            status: { notIn: ["cancelled", "returned", "pending"] },
          },
        },
        select: {
          book_id: true,
          format: true,
          price: true,
          quantity: true,
          order: { select: { status: true, payment_method: true, cod_payment_status: true } },
        },
      }),
      prisma.book.findMany({ select: { id: true, title: true } }),
      prisma.profile.findMany({ select: { user_id: true, display_name: true } }),
    ]);

    const dailyByDate: Record<string, number> = {};
    incomeRows.forEach((row) => {
      const key = row.entry_date.toISOString().slice(0, 10);
      dailyByDate[key] = (dailyByDate[key] || 0) + Number(row.amount || 0);
    });

    const paidOrders = ordersForDash.filter((o) => isVerifiedRevenueOrder(o));
    const paidItems = paidItemsRaw.filter((row) => isVerifiedRevenueOrder(row.order));
    const ledgerOrderIds = new Set(incomeRows.map((row) => row.order_id).filter(Boolean));
    paidOrders.forEach((order) => {
      if (ledgerOrderIds.has(order.id)) return;
      const key = order.created_at.toISOString().slice(0, 10);
      dailyByDate[key] = (dailyByDate[key] || 0) + orderSellableAmount(order);
    });
    const dailyRevenue = Object.entries(dailyByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount: Math.round(amount) }));

    const formatByName: Record<string, number> = {};
    const revenueByBookId: Record<string, number> = {};
    paidItems.forEach((item) => {
      const total = Number(item.price || 0) * Number(item.quantity || 1);
      formatByName[item.format || "unknown"] = (formatByName[item.format || "unknown"] || 0) + total;
      if (item.book_id) revenueByBookId[item.book_id] = (revenueByBookId[item.book_id] || 0) + total;
    });
    const formatRevenue = Object.entries(formatByName).map(([name, value]) => ({ name, value: Math.round(value) }));
    const bookTitleById = Object.fromEntries(books.map((b) => [b.id, b.title]));
    const topBooks = Object.entries(revenueByBookId)
      .map(([bookId, revenue]) => ({ title: bookTitleById[bookId] || "Unknown", revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const profileNameByUserId = Object.fromEntries(profiles.map((p) => [p.user_id, p.display_name || "User"]));
    const spentByUserId: Record<string, number> = {};
    paidOrders.forEach((order) => {
      spentByUserId[order.user_id] = (spentByUserId[order.user_id] || 0) + orderSellableAmount(order);
    });
    const topUsers = Object.entries(spentByUserId)
      .map(([userId, spent]) => ({ name: profileNameByUserId[userId] || "User", spent: Math.round(spent) }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10);

    return { dailyRevenue, formatRevenue, topBooks, topUsers };
  }),

  revenueStats: adminProcedure.query(async () => {
    const [earnings, withdrawals, orders, subRevenueAgg] = await Promise.all([
      prisma.contributorEarning.findMany({
        select: {
          role: true,
          earned_amount: true,
          sale_amount: true,
          order_id: true,
          status: true,
        },
      }),
      prisma.withdrawalRequest.findMany(),
      prisma.order.findMany({
        select: {
          id: true,
          total_amount: true,
          shipping_cost: true,
          status: true,
          payment_method: true,
          cod_payment_status: true,
          items: { select: { price: true, quantity: true } },
        },
      }),
      prisma.payment.aggregate({ where: { subscription_id: { not: null }, status: "paid" }, _sum: { amount: true } }),
    ]);
    const activeEarnings = earnings.filter((e) => e.status !== "reversed");
    const verifiedOrders = orders.filter((order) => isVerifiedRevenueOrder({
      status: String(order.status || ""),
      payment_method: order.payment_method,
      cod_payment_status: order.cod_payment_status,
    }));
    const verifiedOrderIds = new Set(verifiedOrders.map((o) => o.id));
    // Include: (a) order-backed earnings from verified/paid orders, and
    //         (b) coin-unlock earnings that have no order_id (always created at unlock time, inherently verified).
    const verifiedEarnings = activeEarnings.filter((e) => !e.order_id || verifiedOrderIds.has(e.order_id));
    const totalSales = verifiedOrders.reduce((sum, order) => {
      const itemTotal = order.items.reduce((itemSum, item) => itemSum + orderItemSaleAmount(item), 0);
      return sum + (itemTotal > 0 ? itemTotal : orderSellableAmount(order));
    }, 0);
    const subscriptionRevenue = Number(subRevenueAgg._sum.amount ?? 0);
    return {
      totalSales: totalSales + subscriptionRevenue,
      bookSales: totalSales,
      subscriptionRevenue,
      platformEarnings: verifiedEarnings.filter(e => e.role === "platform").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      writerPayouts: verifiedEarnings.filter(e => e.role === "writer").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      publisherPayouts: verifiedEarnings.filter(e => e.role === "publisher").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      narratorPayouts: verifiedEarnings.filter(e => e.role === "narrator").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      translatorPayouts: verifiedEarnings.filter(e => e.role === "translator").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      pendingWithdrawals: withdrawals.filter(w => w.status === "pending").reduce((s, w) => s + Number(w.amount || 0), 0),
    };
  }),

  // ── Shipping Methods ───────────────────────────────────────────────────────
  listShippingMethods: adminProcedure.query(() =>
    prisma.shippingMethod.findMany({ orderBy: { name: "asc" } })
  ),

  upsertShippingMethod: adminProcedure
    .input(z.object({ id: z.string().optional(), name: z.string().min(1), description: z.string().nullable().optional(), base_cost: z.number().default(0), per_kg_cost: z.number().default(0), zone: z.string().nullable().optional(), delivery_days: z.string().nullable().optional(), is_active: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if (id) return prisma.shippingMethod.update({ where: { id }, data });
      return prisma.shippingMethod.create({ data: data as any });
    }),

  updateShippingMethod: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        base_cost: z.number().optional(),
        per_kg_cost: z.number().optional(),
        zone: z.string().nullable().optional(),
        delivery_days: z.string().nullable().optional(),
        is_active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.shippingMethod.update({ where: { id }, data });
    }),

  deleteShippingMethod: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.shippingMethod.delete({ where: { id: input.id } })),

  toggleShippingMethod: adminProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(({ input }) => prisma.shippingMethod.update({ where: { id: input.id }, data: { is_active: input.isActive } })),

  // ── Free Shipping Campaigns ────────────────────────────────────────────────
  listFreeShipping: adminProcedure.query(() =>
    prisma.freeShippingCampaign.findMany({ orderBy: { created_at: "desc" } })
  ),

  upsertFreeShipping: adminProcedure
    .input(z.object({ id: z.string().optional(), name: z.string().min(1), min_order_value: z.number().default(0), start_date: z.string().optional(), end_date: z.string().nullable().optional(), is_active: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const { id, start_date, end_date, ...rest } = input;
      const data = { ...rest, start_date: start_date ? new Date(start_date) : new Date(), end_date: end_date ? new Date(end_date) : null };
      if (id) return prisma.freeShippingCampaign.update({ where: { id }, data });
      return prisma.freeShippingCampaign.create({ data: data as any });
    }),

  deleteFreeShipping: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.freeShippingCampaign.delete({ where: { id: input.id } })),

  toggleFreeShipping: adminProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(({ input }) => prisma.freeShippingCampaign.update({ where: { id: input.id }, data: { is_active: input.isActive } })),

  // ── Platform Settings ──────────────────────────────────────────────────────
  getPlatformSettings: adminProcedure
    .input(z.object({ keys: z.array(z.string()).optional() }).optional())
    .query(async ({ input }) => {
      const keys = input?.keys?.filter(Boolean);
      const settings = await prisma.platformSetting.findMany({
        where: keys && keys.length > 0 ? { key: { in: keys } } : undefined,
      });
      return Object.fromEntries(settings.map((s) => [s.key, s.value]));
    }),

  setPlatformSetting: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input }) =>
      prisma.platformSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      })
    ),

  bulkSetPlatformSettings: adminProcedure
    .input(
      z.union([
        z.array(z.object({ key: z.string(), value: z.string() })),
        z.object({ pairs: z.array(z.object({ key: z.string(), value: z.string() })) }),
      ])
    )
    .mutation(async ({ input }) => {
      const pairs = Array.isArray(input) ? input : input.pairs;
      await Promise.all(
        pairs.map((s) =>
          prisma.platformSetting.upsert({
            where: { key: s.key },
            create: { key: s.key, value: s.value },
            update: { value: s.value },
          })
        )
      );
      return { success: true };
    }),

  // ── Book Titles (for select dropdowns) ───────────────────────────────────
  listBookTitles: adminProcedure.query(() =>
    prisma.book.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } })
  ),

  // ── Book Contributors ──────────────────────────────────────────────────────
  listBookContributors: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ input }) => {
      const contributors = await prisma.bookContributor.findMany({ where: { book_id: input.bookId } });
      const userIds = contributors.map(c => c.user_id).filter(Boolean) as string[];
      const profiles = userIds.length > 0
        ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } })
        : [];
      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name]));
      return contributors.map(c => ({ ...c, display_name: profileMap[c.user_id || ""] || "Unknown" }));
    }),

  addBookContributor: adminProcedure
    .input(z.object({ bookId: z.string(), userId: z.string(), role: z.string(), format: z.string() }))
    .mutation(({ input }) =>
      prisma.bookContributor.create({
        data: { book_id: input.bookId, user_id: input.userId, role: input.role, format: input.format },
      })
    ),

  removeBookContributor: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.bookContributor.delete({ where: { id: input.id } })),

  // ── Book Revenue Split (per-book) ─────────────────────────────────────────
  getBookRevenueSplit: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ input }) => {
      const [defaults, overrides] = await Promise.all([
        prisma.defaultRevenueRule.findMany({ orderBy: { format: "asc" } }),
        prisma.formatRevenueSplit.findMany({ where: { book_id: input.bookId } }),
      ]);
      return {
        defaults: defaults.map((d) => ({
          id: d.id,
          format: d.format,
          writer_percentage: d.writer_percentage,
          publisher_percentage: d.publisher_percentage,
          narrator_percentage: d.narrator_percentage,
          translator_percentage: d.translator_percentage,
          platform_percentage: d.platform_percentage,
          fulfillment_cost_percentage: d.fulfillment_cost_percentage,
          created_at: d.created_at,
          updated_at: d.updated_at,
        })),
        overrides: overrides.map(s => ({
          id: s.id, format: s.format,
          writer_percentage: s.writer_pct, publisher_percentage: s.publisher_pct,
          narrator_percentage: s.narrator_pct, translator_percentage: s.translator_pct,
          platform_percentage: s.platform_pct,
          fulfillment_cost_percentage: s.fulfillment_cost_pct,
        })),
      };
    }),

  // ── RJ Management ─────────────────────────────────────────────────────────
  listRjProfiles: adminProcedure.query(() =>
    prisma.rjProfile.findMany({ orderBy: { created_at: "desc" } })
  ),

  listLiveSessions: adminProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(20) }).optional())
    .query(({ input }) =>
      prisma.liveSession.findMany({
        where: input?.status ? { status: input.status } : undefined,
        orderBy: { started_at: "desc" },
        take: input?.limit ?? 20,
      })
    ),

  updateRjProfile: adminProcedure
    .input(z.object({ id: z.string(), is_approved: z.boolean().optional(), is_active: z.boolean().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.rjProfile.update({ where: { id }, data });
    }),

  createRjProfileFromDisplayName: adminProcedure
    .input(z.object({ displayName: z.string().min(1), stageName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const profile = await prisma.profile.findFirst({
        where: { display_name: { contains: input.displayName, mode: "insensitive" } },
        select: { user_id: true },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      await prisma.userRole.upsert({
        where: { user_id_role: { user_id: profile.user_id, role: "rj" } },
        create: { user_id: profile.user_id, role: "rj" },
        update: {},
      });

      const existing = await prisma.rjProfile.findUnique({ where: { user_id: profile.user_id } });
      if (existing) {
        return prisma.rjProfile.update({
          where: { user_id: profile.user_id },
          data: { stage_name: input.stageName, is_approved: true },
        });
      }
      return prisma.rjProfile.create({
        data: { user_id: profile.user_id, stage_name: input.stageName, is_approved: true },
      });
    }),

  forceEndLiveSession: adminProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const session = await prisma.liveSession.update({
        where: { id: input.sessionId },
        data: { status: "ended", ended_at: new Date(), disconnect_reason: "admin_force_stop" },
      });
      const station = await prisma.radioStation.findFirst({ select: { id: true } });
      if (station) {
        await prisma.radioStation.update({
          where: { id: station.id },
          data: { is_active: false },
        });
      }
      return session;
    }),

  listRadioStations: adminProcedure.query(() =>
    prisma.radioStation.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] })
  ),

  upsertRadioStation: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        stream_url: z.string().min(1),
        artwork_url: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        is_active: z.boolean().default(true),
        sort_order: z.number().int().default(0),
      })
    )
    .mutation(({ input }) => {
      const data = {
        name: input.name,
        stream_url: input.stream_url,
        artwork_url: input.artwork_url ?? null,
        description: input.description ?? null,
        is_active: input.is_active,
        sort_order: input.sort_order,
      };
      if (input.id) return prisma.radioStation.update({ where: { id: input.id }, data });
      return prisma.radioStation.create({ data });
    }),

  setRadioStationActive: adminProcedure
    .input(z.object({ id: z.string(), is_active: z.boolean() }))
    .mutation(({ input }) =>
      prisma.radioStation.update({ where: { id: input.id }, data: { is_active: input.is_active } })
    ),

  gamificationData: adminProcedure.query(async () => {
    const [badges, streakUsers, earnedBadges, pointsAgg, activeGoals] = await Promise.all([
      prisma.badgeDefinition.findMany({ orderBy: [{ sort_order: "asc" }, { created_at: "desc" }] }),
      prisma.userStreak.count(),
      prisma.userBadge.count(),
      prisma.gamificationPoint.aggregate({ _sum: { points: true } }),
      prisma.userGoal.count({ where: { status: "active" } }),
    ]);
    return {
      badges,
      stats: {
        totalStreakUsers: streakUsers,
        totalBadgesEarned: earnedBadges,
        totalPoints: pointsAgg._sum.points ?? 0,
        activeGoals,
      },
    };
  }),

  upsertBadgeDefinition: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        key: z.string().min(1),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        category: z.string().default("general"),
        condition_type: z.string().default("manual"),
        condition_value: z.number().int().nullable().optional(),
        coin_reward: z.number().int().nullable().optional(),
        sort_order: z.number().int().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const data = {
        key: input.key,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        condition_type: input.condition_type,
        condition_value: input.condition_value ?? 0,
        coin_reward: input.coin_reward ?? 0,
        sort_order: input.sort_order ?? 0,
      };
      if (input.id) return prisma.badgeDefinition.update({ where: { id: input.id }, data });
      return prisma.badgeDefinition.create({ data });
    }),

  setBadgeDefinitionActive: adminProcedure
    .input(z.object({ id: z.string(), is_active: z.boolean() }))
    .mutation(({ input }) =>
      prisma.badgeDefinition.update({ where: { id: input.id }, data: { is_active: input.is_active } })
    ),

  smsRecipientsByGroup: adminProcedure
    .input(z.object({ group: z.enum(["authors", "narrators", "publishers", "users", "rj"]) }))
    .query(async ({ input }) => {
      if (input.group === "authors") {
        const rows = await prisma.author.findMany({ select: { name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.name, group: "authors" }));
      }
      if (input.group === "narrators") {
        const rows = await prisma.narrator.findMany({ select: { name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.name, group: "narrators" }));
      }
      if (input.group === "publishers") {
        const rows = await prisma.publisher.findMany({ select: { name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.name, group: "publishers" }));
      }
      if (input.group === "users") {
        const rows = await prisma.profile.findMany({ select: { display_name: true, phone: true } });
        return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.display_name || "Unknown", group: "users" }));
      }
      const rows = await prisma.rjProfile.findMany({ select: { stage_name: true, phone: true } });
      return rows.filter((r) => !!r.phone).map((r) => ({ phone: r.phone!, name: r.stage_name, group: "rj" }));
    }),

  smsStatus: adminProcedure.query(async () => {
    const hasDbSid = await prisma.smsSid.findFirst({ where: { is_default: true, is_active: true } });
    const configured = !!(hasDbSid || (process.env.SSL_SMS_API_TOKEN && process.env.SSL_SMS_SID));
    return { configured };
  }),

  listSmsSids: adminProcedure.query(() =>
    prisma.smsSid.findMany({ orderBy: { created_at: "asc" } })
  ),

  createSmsSid: adminProcedure
    .input(z.object({
      label: z.string().min(1),
      sid: z.string().min(1),
      api_token: z.string().min(1),
      otp_secret: z.string().optional(),
      is_default: z.boolean().default(false),
      is_active: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      if (input.is_default) {
        await prisma.smsSid.updateMany({ data: { is_default: false } });
      }
      return prisma.smsSid.create({
        data: {
          label: input.label,
          sid: input.sid,
          api_token: input.api_token,
          otp_secret: input.otp_secret ?? null,
          is_default: input.is_default,
          is_active: input.is_active,
        },
      });
    }),

  updateSmsSid: adminProcedure
    .input(z.object({
      id: z.string(),
      label: z.string().min(1).optional(),
      sid: z.string().min(1).optional(),
      api_token: z.string().min(1).optional(),
      otp_secret: z.string().nullable().optional(),
      is_default: z.boolean().optional(),
      is_active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.is_default) {
        await prisma.smsSid.updateMany({ where: { id: { not: input.id } }, data: { is_default: false } });
      }
      return prisma.smsSid.update({
        where: { id: input.id },
        data: {
          ...(input.label !== undefined && { label: input.label }),
          ...(input.sid !== undefined && { sid: input.sid }),
          ...(input.api_token !== undefined && { api_token: input.api_token }),
          ...(input.otp_secret !== undefined && { otp_secret: input.otp_secret }),
          ...(input.is_default !== undefined && { is_default: input.is_default }),
          ...(input.is_active !== undefined && { is_active: input.is_active }),
        },
      });
    }),

  deleteSmsSid: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.smsSid.delete({ where: { id: input.id } })),

  setDefaultSmsSid: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await prisma.smsSid.updateMany({ data: { is_default: false } });
      return prisma.smsSid.update({ where: { id: input.id }, data: { is_default: true, is_active: true } });
    }),

  listSmsLogs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(({ input }) =>
      prisma.smsLog.findMany({ orderBy: { created_at: "desc" }, take: input?.limit ?? 100 })
    ),

  listSmsTemplates: adminProcedure.query(() =>
    prisma.smsTemplate.findMany({ orderBy: { created_at: "desc" } })
  ),

  createSmsTemplate: adminProcedure
    .input(z.object({ name: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const templateKey = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const existing = await prisma.smsTemplate.findUnique({ where: { template_key: templateKey } });
      if (existing) {
        return prisma.smsTemplate.update({
          where: { template_key: templateKey },
          data: { name: input.name.trim(), body: input.body.trim() },
        });
      }
      return prisma.smsTemplate.create({
        data: {
          name: input.name.trim(),
          body: input.body.trim(),
          template_key: templateKey,
          variables: [],
          is_active: true,
        },
      });
    }),

  sendSms: adminProcedure
    .input(z.object({ recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional(), group: z.string().optional() })), message: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (!input.recipients.length) return { sent: 0, failed: 0, skipped: 0 };
      const normalized = input.recipients
        .map((r) => ({ ...r, phone: r.phone.trim() }))
        .filter((r) => r.phone.length > 0);

      const skipped = input.recipients.length - normalized.length;
      const phones = normalized.map((r) => r.phone);

      const results = await sendSslWirelessSms(phones, input.message);

      const logRows = results.map((result) => ({
        phone_number: result.phone,
        message: input.message,
        provider: "ssl_wireless",
        status: result.status,
      }));
      await prisma.smsLog.createMany({ data: logRows });

      const sent = results.filter((r) => r.status === "sent").length;
      const failed = results.filter((r) => r.status === "failed").length;
      const errors = results
        .filter((r) => r.status === "failed" && r.error)
        .map((r) => r.error as string)
        .filter((v, i, a) => a.indexOf(v) === i); // unique errors
      return { sent, failed, skipped, errors };
    }),

  liveMonitoringData: adminProcedure
    .input(z.object({ from: z.string(), format: z.string().optional() }))
    .query(async ({ input }) => {
      const from = new Date(input.from);
      const [payments, paymentEvents, coinTransactions, contentUnlocks, orders, orderItems, ledger, systemLogs] = await Promise.all([
        prisma.payment.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 500 }),
        prisma.paymentEvent.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 200 }),
        prisma.coinTransaction.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 500 }),
        prisma.contentUnlock.findMany({
          where: {
            created_at: { gte: from },
            ...(input.format && input.format !== "all" ? { format: input.format } : {}),
          },
          orderBy: { created_at: "desc" },
          take: 500,
        }),
        prisma.order.findMany({
          where: { created_at: { gte: from } },
          select: {
            id: true, status: true, total_amount: true, payment_method: true, cod_payment_status: true, created_at: true, shipping_cost: true,
          },
          orderBy: { created_at: "desc" },
          take: 1000,
        }),
        prisma.orderItem.findMany({
          select: { order_id: true, format: true, quantity: true, price: true },
          take: 1000,
        }),
        prisma.accountingLedger.findMany({
          where: { entry_date: { gte: from } },
          select: { id: true, order_id: true, type: true, category: true, amount: true, entry_date: true },
          take: 1000,
        }),
        prisma.systemLog.findMany({ where: { created_at: { gte: from } }, orderBy: { created_at: "desc" }, take: 200 }),
      ]);
      return {
        payments,
        paymentEvents,
        coinTransactions,
        contentUnlocks,
        orders,
        orderItems: orderItems.map((item) => ({ ...item, unit_price: item.price })),
        ledger,
        systemLogs,
      };
    }),

  r2RolloutStatus: adminProcedure.query(async () => {
    const keys = [
      "r2_rollout_current_percent",
      "r2_rollout_auto_scale_enabled",
      "r2_rollout_min_percent",
      "r2_rollout_max_percent",
      "r2_rollout_scale_up_threshold",
      "r2_rollout_scale_down_threshold",
      "r2_rollout_step_size",
      "r2_rollout_last_adjusted_at",
      "r2_rollout_last_adjustment_reason",
      "r2_rollout_circuit_breaker_tripped",
      "r2_rollout_circuit_breaker_safe_percent",
    ];
    const settings = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    const now = new Date();
    const todayStart = new Date(now.toISOString().slice(0, 10));
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [events, r2Logs] = await Promise.all([
      prisma.paymentEvent.findMany({ where: { created_at: { gte: sevenDaysAgo } }, select: { created_at: true, status: true } }),
      prisma.systemLog.findMany({
        where: { created_at: { gte: sevenDaysAgo }, module: { in: ["r2", "media", "storage"] } },
        select: { created_at: true, level: true, metadata: true, message: true, module: true },
      }),
    ]);

    const dayMap: Record<string, any> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(sevenDaysAgo.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = {
        stat_date: key,
        r2_requests: 0,
        origin_requests: 0,
        r2_errors: 0,
        origin_errors: 0,
        r2_signed_url_failures: 0,
        playback_successes: 0,
        playback_failures: 0,
        rollout_percent: Number(map.r2_rollout_current_percent || 0),
        auto_adjusted: false,
        error_rate_r2: 0,
        error_rate_origin: 0,
        fallback_count: 0,
      };
    }

    r2Logs.forEach((log) => {
      const key = log.created_at.toISOString().slice(0, 10);
      if (!dayMap[key]) return;
      const meta = (log.metadata || {}) as Record<string, any>;
      const provider = String(meta.provider || "").toLowerCase();
      const isR2 = provider.includes("r2") || String(log.module).toLowerCase() === "r2";
      if (isR2) dayMap[key].r2_requests += 1;
      else dayMap[key].origin_requests += 1;
      if (["error", "critical"].includes(log.level)) {
        if (isR2) dayMap[key].r2_errors += 1;
        else dayMap[key].origin_errors += 1;
      }
      if (String(log.message || "").toLowerCase().includes("signed url")) dayMap[key].r2_signed_url_failures += 1;
      if (String(log.message || "").toLowerCase().includes("fallback")) dayMap[key].fallback_count += 1;
    });
    events.forEach((event) => {
      const key = event.created_at.toISOString().slice(0, 10);
      if (!dayMap[key]) return;
      if (event.status === "paid") dayMap[key].playback_successes += 1;
      else if (event.status === "failed") dayMap[key].playback_failures += 1;
    });
    Object.values(dayMap).forEach((d: any) => {
      d.error_rate_r2 = d.r2_requests > 0 ? (d.r2_errors / d.r2_requests) * 100 : 0;
      d.error_rate_origin = d.origin_requests > 0 ? (d.origin_errors / d.origin_requests) * 100 : 0;
    });

    const todayKey = todayStart.toISOString().slice(0, 10);
    const history = Object.values(dayMap).sort((a: any, b: any) => a.stat_date.localeCompare(b.stat_date));
    const today = history.find((d: any) => d.stat_date === todayKey) || null;

    return {
      config: {
        current_percent: Number(map.r2_rollout_current_percent || 0),
        auto_scale_enabled: map.r2_rollout_auto_scale_enabled === "true",
        min_percent: Number(map.r2_rollout_min_percent || 0),
        max_percent: Number(map.r2_rollout_max_percent || 100),
        scale_up_threshold: Number(map.r2_rollout_scale_up_threshold || 1),
        scale_down_threshold: Number(map.r2_rollout_scale_down_threshold || 3),
        step_size: Number(map.r2_rollout_step_size || 10),
        last_adjusted_at: map.r2_rollout_last_adjusted_at || null,
        last_adjustment_reason: map.r2_rollout_last_adjustment_reason || null,
      },
      today,
      history,
      circuit_breaker: {
        tripped: map.r2_rollout_circuit_breaker_tripped === "true",
        safe_percent: map.r2_rollout_circuit_breaker_safe_percent ? Number(map.r2_rollout_circuit_breaker_safe_percent) : null,
      },
    };
  }),

  updateR2RolloutConfig: adminProcedure
    .input(
      z.object({
        current_percent: z.number().int().min(0).max(100).optional(),
        auto_scale_enabled: z.boolean().optional(),
        min_percent: z.number().int().min(0).max(100).optional(),
        max_percent: z.number().int().min(0).max(100).optional(),
        scale_up_threshold: z.number().min(0).max(100).optional(),
        scale_down_threshold: z.number().min(0).max(100).optional(),
        step_size: z.number().int().min(1).max(100).optional(),
        reset_circuit_breaker: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const keyMap: Record<string, string> = {
        current_percent: "r2_rollout_current_percent",
        auto_scale_enabled: "r2_rollout_auto_scale_enabled",
        min_percent: "r2_rollout_min_percent",
        max_percent: "r2_rollout_max_percent",
        scale_up_threshold: "r2_rollout_scale_up_threshold",
        scale_down_threshold: "r2_rollout_scale_down_threshold",
        step_size: "r2_rollout_step_size",
      };
      const pairs = Object.entries(input)
        .filter(([k, v]) => k in keyMap && v !== undefined)
        .map(([k, v]) => ({ key: keyMap[k], value: String(v) }));
      if (input.reset_circuit_breaker) {
        pairs.push({ key: "r2_rollout_circuit_breaker_tripped", value: "false" });
      }
      await prisma.$transaction(
        pairs.map((pair) =>
          prisma.platformSetting.upsert({
            where: { key: pair.key },
            create: pair,
            update: { value: pair.value },
          })
        )
      );
      return { ok: true };
    }),

  autoAdjustR2Rollout: adminProcedure.mutation(async () => {
    const status = await prisma.platformSetting.findMany({
      where: {
        key: {
          in: [
            "r2_rollout_current_percent",
            "r2_rollout_auto_scale_enabled",
            "r2_rollout_min_percent",
            "r2_rollout_max_percent",
            "r2_rollout_scale_up_threshold",
            "r2_rollout_scale_down_threshold",
            "r2_rollout_step_size",
          ],
        },
      },
    });
    const map = Object.fromEntries(status.map((s) => [s.key, s.value]));
    const autoEnabled = map.r2_rollout_auto_scale_enabled !== "false";
    const oldPercent = Number(map.r2_rollout_current_percent || 0);
    if (!autoEnabled) return { adjusted: false, old_percent: oldPercent, new_percent: oldPercent, reason: "auto-scale disabled" };

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await prisma.systemLog.findMany({
      where: { created_at: { gte: start }, module: { in: ["r2", "media", "storage"] } },
      select: { level: true, module: true, metadata: true },
    });
    let r2Requests = 0;
    let r2Errors = 0;
    logs.forEach((log) => {
      const meta = (log.metadata || {}) as Record<string, any>;
      const provider = String(meta.provider || "").toLowerCase();
      const isR2 = provider.includes("r2") || String(log.module).toLowerCase() === "r2";
      if (!isR2) return;
      r2Requests += 1;
      if (["error", "critical"].includes(log.level)) r2Errors += 1;
    });
    const errorRate = r2Requests > 0 ? (r2Errors / r2Requests) * 100 : 0;
    const upThreshold = Number(map.r2_rollout_scale_up_threshold || 1);
    const downThreshold = Number(map.r2_rollout_scale_down_threshold || 3);
    const step = Number(map.r2_rollout_step_size || 10);
    const minPercent = Number(map.r2_rollout_min_percent || 0);
    const maxPercent = Number(map.r2_rollout_max_percent || 100);

    let newPercent = oldPercent;
    let reason = "within thresholds";
    if (errorRate > downThreshold) {
      newPercent = Math.max(minPercent, oldPercent - step);
      reason = `error rate ${errorRate.toFixed(2)}% > ${downThreshold}%`;
    } else if (errorRate < upThreshold) {
      newPercent = Math.min(maxPercent, oldPercent + step);
      reason = `error rate ${errorRate.toFixed(2)}% < ${upThreshold}%`;
    }
    const adjusted = newPercent !== oldPercent;
    if (adjusted) {
      await prisma.$transaction([
        prisma.platformSetting.upsert({
          where: { key: "r2_rollout_current_percent" },
          create: { key: "r2_rollout_current_percent", value: String(newPercent) },
          update: { value: String(newPercent) },
        }),
        prisma.platformSetting.upsert({
          where: { key: "r2_rollout_last_adjusted_at" },
          create: { key: "r2_rollout_last_adjusted_at", value: new Date().toISOString() },
          update: { value: new Date().toISOString() },
        }),
        prisma.platformSetting.upsert({
          where: { key: "r2_rollout_last_adjustment_reason" },
          create: { key: "r2_rollout_last_adjustment_reason", value: reason },
          update: { value: reason },
        }),
      ]);
    }
    return { adjusted, old_percent: oldPercent, new_percent: newPercent, reason };
  }),

  addRjRole: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ input }) =>
      prisma.userRole.upsert({
        where: { user_id_role: { user_id: input.userId, role: "rj" } },
        create: { user_id: input.userId, role: "rj" },
        update: {},
      })
    ),

  // ── Full Dashboard Stats ───────────────────────────────────────────────────
  fullDashboard: adminProcedure.query(async () => {
    const today = new Date().toISOString().split("T")[0];
    const todayStart = new Date(today);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const itemBuyingUnitCost = (fc: {
      unit_cost?: number | null;
      original_price?: number | null;
      publisher_commission_percent?: number | null;
    }) => {
      const uc = Number(fc.unit_cost || 0);
      if (uc > 0) return uc;
      const orig = Number(fc.original_price || 0);
      const comm = Number(fc.publisher_commission_percent || 0);
      if (orig > 0 && comm > 0) return orig - (orig * comm) / 100;
      return 0;
    };

    const [
      bookCount, formatCounts, authorCount, narratorCount,
      orders, profileCount, topBooks, recentOrders,
      pendingApps, recentReviews, bookReads,
      ledgerAll, todayLedger, recentLedger,
      coinTxns, earnings, hardcopyFormats,
      orderItems, topRated, bookFormatsAll, onlineNow, readingNow, listeningNow,
      subRevenueAgg,
    ] = await Promise.all([
      prisma.book.count(),
      prisma.bookFormat.groupBy({ by: ["format"], _count: { id: true } }),
      prisma.author.count(),
      prisma.narrator.count(),
      prisma.order.findMany({
        select: {
          id: true,
          order_number: true,
          total_amount: true,
          status: true,
          created_at: true,
          shipping_cost: true,
          payment_method: true,
          cod_payment_status: true,
          user_id: true,
          is_purchased: true,
          purchase_cost_per_unit: true,
          packaging_cost: true,
          fulfillment_cost: true,
        },
      }),
      prisma.profile.count(),
      prisma.book.findMany({ select: { title: true, total_reads: true }, orderBy: { total_reads: "desc" }, take: 5 }),
      prisma.order.findMany({ select: { id: true, total_amount: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 6 }),
      prisma.roleApplication.findMany({ where: { status: "pending" }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.review.findMany({ select: { id: true, rating: true, created_at: true, book: { select: { title: true } } }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.bookRead.count(),
      prisma.accountingLedger.findMany({ select: { type: true, amount: true, entry_date: true, order_id: true } }),
      prisma.accountingLedger.findMany({ where: { entry_date: { gte: todayStart } }, select: { type: true, amount: true } }),
      prisma.accountingLedger.findMany({ select: { description: true, amount: true, type: true, entry_date: true, order_id: true }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.coinTransaction.findMany({ select: { type: true, amount: true } }),
      prisma.contributorEarning.findMany({
        select: { role: true, earned_amount: true, sale_amount: true, format: true, order_id: true, status: true },
      }),
      prisma.bookFormat.findMany({ where: { format: "hardcopy" }, select: { stock_count: true, book: { select: { title: true } } } }),
      prisma.orderItem.findMany({ select: { book_id: true, format: true, price: true, quantity: true, order_id: true } }),
      prisma.book.findMany({ where: { rating: { not: null } }, select: { title: true, rating: true, reviews_count: true }, orderBy: { rating: "desc" }, take: 5 }),
      prisma.bookFormat.findMany({
        select: {
          book_id: true,
          format: true,
          unit_cost: true,
          original_price: true,
          publisher_commission_percent: true,
        },
      }),
      prisma.userPresence.count({ where: { last_seen: { gte: fiveMinAgo } } }),
      prisma.userPresence.count({ where: { last_seen: { gte: fiveMinAgo }, activity_type: "reading" } }),
      prisma.userPresence.count({ where: { last_seen: { gte: fiveMinAgo }, activity_type: "listening" } }),
      prisma.payment.aggregate({ where: { subscription_id: { not: null }, status: "paid" }, _sum: { amount: true } }),
    ]);

    const subscriptionRevenue = Number(subRevenueAgg._sum.amount ?? 0);

    const bookIdsForTitles = [...new Set(orderItems.map((i) => i.book_id).filter(Boolean) as string[])];
    const booksById =
      bookIdsForTitles.length > 0
        ? Object.fromEntries(
            (await prisma.book.findMany({
              where: { id: { in: bookIdsForTitles } },
              select: { id: true, title: true },
            })).map((b) => [b.id, b.title])
          )
        : {};

    const fmtMap = Object.fromEntries(formatCounts.map(f => [f.format, f._count.id]));
    const ledgerEntries = ledgerAll;

    const totalIncome = ledgerEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const totalExpense = ledgerEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const todayIncome = todayLedger.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const todayExpense = todayLedger.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);

    const totalCoinsEarned = coinTxns.filter(c => c.type === "earn" || c.type === "bonus").reduce((s, c) => s + Math.abs(c.amount), 0);
    const totalCoinsSpent = coinTxns.filter(c => c.type === "spend").reduce((s, c) => s + Math.abs(c.amount), 0);

    const statusMap: Record<string, number> = {};
    orders.forEach(o => { statusMap[o.status || "pending"] = (statusMap[o.status || "pending"] || 0) + 1; });

    const hcFormats = hardcopyFormats;
    const totalStock = hcFormats.reduce((s, f) => s + (f.stock_count || 0), 0);
    const outOfStockCount = hcFormats.filter(f => (f.stock_count || 0) <= 0).length;
    const lowStockCount = hcFormats.filter(f => { const sc = f.stock_count || 0; return sc > 0 && sc <= 5; }).length;
    const lowStockBooks = hcFormats
      .filter(f => (f.stock_count || 0) <= 5)
      .map(f => ({ title: f.book?.title || "Unknown", stock: f.stock_count || 0 }))
      .sort((a, b) => a.stock - b.stock).slice(0, 8);

    const verifiedOrders = orders.filter(isVerifiedRevenueOrder);
    const verifiedOrderIds = new Set(verifiedOrders.map((o) => o.id));
    const sellableAmount = (o: (typeof orders)[0]) => orderSellableAmount(o);

    const paidUserIds = new Set(
      verifiedOrders.map((o) => o.user_id).filter((id): id is string => Boolean(id))
    );
    const activeEarnings = earnings.filter((e) => e.status !== "reversed");
    // Verified earnings: from verified orders OR coin-unlock (null order_id, inherently paid)
    const verifiedEarnings = activeEarnings.filter((e) => !e.order_id || verifiedOrderIds.has(e.order_id));
    const writerEarnings = verifiedEarnings.filter(e => e.role === "writer").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const narratorEarnings = verifiedEarnings.filter(e => e.role === "narrator").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const publisherEarnings = verifiedEarnings.filter(e => e.role === "publisher").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const uniqueOrderSales = new Map<string, number>();
    verifiedEarnings.forEach(e => { if (e.order_id && !uniqueOrderSales.has(e.order_id)) uniqueOrderSales.set(e.order_id, Number(e.sale_amount || 0)); });
    const totalSaleAmount = Array.from(uniqueOrderSales.values()).reduce((s, v) => s + v, 0);
    const platformEarnings = Math.max(0, totalSaleAmount - writerEarnings - narratorEarnings - publisherEarnings);

    const formatCostMap = Object.fromEntries(
      bookFormatsAll.map((f) => [`${f.book_id}_${f.format}`, f])
    );

    const monthMap: Record<string, { revenue: number; cost: number; profit: number }> = {};
    verifiedOrders.forEach((o) => {
      const key = new Date(o.created_at).toISOString().slice(0, 7);
      if (!monthMap[key]) monthMap[key] = { revenue: 0, cost: 0, profit: 0 };
      monthMap[key].revenue += sellableAmount(o);
    });
    ledgerEntries.forEach(e => {
      const key = e.entry_date ? new Date(e.entry_date).toISOString().slice(0, 7) : null;
      if (!key) return;
      if (!monthMap[key]) monthMap[key] = { revenue: 0, cost: 0, profit: 0 };
      if (e.type === "expense") monthMap[key].cost += Number(e.amount);
    });
    Object.values(monthMap).forEach(m => { m.profit = m.revenue - m.cost; });
    const revenueByMonth = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, d]) => ({ month, ...d }));

    const bookSales: Record<string, { title: string; sales: number; revenue: number }> = {};
    orderItems.forEach(item => {
      if (!item.book_id || !verifiedOrderIds.has(item.order_id)) return;
      if (!bookSales[item.book_id]) bookSales[item.book_id] = { title: booksById[item.book_id] || "Unknown", sales: 0, revenue: 0 };
      bookSales[item.book_id].title = booksById[item.book_id] || bookSales[item.book_id].title;
      bookSales[item.book_id].sales += item.quantity || 1;
      bookSales[item.book_id].revenue += Number(item.price || 0) * (item.quantity || 1);
    });
    const topSellingBooks = Object.values(bookSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const bookProfitAgg: Record<string, { revenue: number; cost: number }> = {};
    orderItems.forEach((item) => {
      if (!item.book_id || !verifiedOrderIds.has(item.order_id)) return;
      const bid = item.book_id;
      if (!bookProfitAgg[bid]) bookProfitAgg[bid] = { revenue: 0, cost: 0 };
      const qty = item.quantity || 1;
      bookProfitAgg[bid].revenue += Number(item.price || 0) * qty;
      const fc = formatCostMap[`${item.book_id}_${item.format}`] || {};
      bookProfitAgg[bid].cost += itemBuyingUnitCost(fc) * qty;
    });
    const topEarningBooks = Object.entries(bookProfitAgg)
      .map(([bookId, v]) => ({
        title: booksById[bookId] || "Unknown",
        revenue: v.revenue,
        profit: v.revenue - v.cost,
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const fmtProfitAgg: Record<string, { revenue: number; cost: number }> = {};
    orderItems.forEach((item) => {
      if (!verifiedOrderIds.has(item.order_id)) return;
      const fmt = item.format || "unknown";
      if (!fmtProfitAgg[fmt]) fmtProfitAgg[fmt] = { revenue: 0, cost: 0 };
      const qty = item.quantity || 1;
      fmtProfitAgg[fmt].revenue += Number(item.price || 0) * qty;
      const fc = formatCostMap[`${item.book_id}_${item.format}`] || {};
      fmtProfitAgg[fmt].cost += itemBuyingUnitCost(fc) * qty;
    });
    const formatProfit = Object.entries(fmtProfitAgg).map(([format, v]) => ({
      format,
      revenue: v.revenue,
      profit: v.revenue - v.cost,
    }));

    const codOrders = orders.filter((o) => o.payment_method === "cod");
    const codPending = codOrders
      .filter((o) => {
        if (["cancelled", "returned"].includes(o.status || "")) return false;
        const cs = o.cod_payment_status || "";
        // null/empty = freshly placed, not yet collected; also explicit pending statuses
        return !cs || cs === "cod_pending_collection" || cs === "unpaid";
      })
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const codCollected = codOrders
      .filter((o) => o.cod_payment_status === "collected_by_courier")
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const codSettled = codOrders
      .filter((o) => ["settled_to_merchant", "paid"].includes(o.cod_payment_status || ""))
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);

    const verifiedSellableTotal = verifiedOrders.reduce((s, o) => s + sellableAmount(o), 0);
    // Only subtract creator payouts from verified revenue sources (same filter as verifiedEarnings)
    const creatorPayoutsTotal = verifiedEarnings
      .filter((e) => e.role !== "platform")
      .reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    // subscriptionRevenue is pure platform income (no creator split), include in gross revenue and net profit
    const realNetProfit = verifiedSellableTotal + subscriptionRevenue - creatorPayoutsTotal - totalExpense;
    const ledgerOrderIds = new Set(ledgerAll.map((entry) => entry.order_id).filter(Boolean));
    const recentLedgerRows = [
      ...recentLedger.map((r) => ({
        description: (r as any).description || "—",
        amount: Number(r.amount),
        type: r.type,
        date: r.entry_date ? new Date(r.entry_date).toLocaleDateString() : "—",
        sortDate: r.entry_date ? new Date(r.entry_date) : new Date(0),
      })),
      ...verifiedOrders
        .filter((order) => !ledgerOrderIds.has(order.id))
        .map((order) => ({
          description: `Book sale ${order.order_number || order.id.slice(0, 8)}`,
          amount: sellableAmount(order),
          type: "income",
          date: new Date(order.created_at).toLocaleDateString(),
          sortDate: order.created_at,
        })),
    ]
      .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
      .slice(0, 5)
      .map(({ sortDate: _sortDate, ...row }) => row);

    return {
      totalBooks: bookCount,
      totalEbooks: fmtMap["ebook"] || 0,
      totalAudiobooks: fmtMap["audiobook"] || 0,
      totalHardcopies: fmtMap["hardcopy"] || 0,
      totalAuthors: authorCount,
      totalNarrators: narratorCount,
      totalUsers: profileCount,
      totalOrders: orders.filter((o) => !["cancelled", "returned"].includes(o.status)).length,
      totalRevenue: verifiedSellableTotal + subscriptionRevenue,
      subscriptionRevenue,
      totalIncome, totalExpense, netProfit: totalIncome - totalExpense,
      todayIncome, todayExpense, todayProfit: todayIncome - todayExpense,
      recentLedger: recentLedgerRows,
      totalCoinsEarned, totalCoinsSpent,
      ordersByStatus: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
      totalStock, lowStockCount, outOfStockCount, lowStockBooks,
      revenueByMonth,
      formatDistribution: [
        { name: "eBook", value: fmtMap["ebook"] || 0 },
        { name: "Audiobook", value: fmtMap["audiobook"] || 0 },
        { name: "Hard Copy", value: fmtMap["hardcopy"] || 0 },
      ].filter(f => f.value > 0),
      topBooks: topBooks.map(b => ({ title: b.title, reads: b.total_reads || 0 })),
      topSellingBooks,
      topRatedBooks: topRated.filter(b => b.rating != null && b.rating > 0).map(b => ({ title: b.title, rating: Number(b.rating), reviews: b.reviews_count || 0 })),
      writerEarnings, narratorEarnings, publisherEarnings, platformEarnings,
      totalViews: 0,
      totalReads: bookReads,
      totalPurchases: verifiedOrders.length,
      paidUsers: paidUserIds.size,
      pendingApplications: pendingApps.map(a => ({
        id: a.id.slice(0, 8), fullId: a.id, userId: a.user_id, role: a.applied_role,
        user: a.display_name || a.user_id.slice(0, 8), date: new Date(a.created_at).toLocaleDateString(),
      })),
      pendingReviews: recentReviews.map(r => ({
        id: r.id.slice(0, 8), book: r.book?.title || "Unknown",
        rating: r.rating, date: new Date(r.created_at).toLocaleDateString(),
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id.slice(0, 8), total: Number(o.total_amount || 0),
        status: o.status || "pending", created: new Date(o.created_at).toLocaleDateString(),
      })),
      onlineNow,
      readingNow,
      listeningNow,
      formatProfit,
      topEarningBooks,
      codPending,
      codCollected,
      codSettled,
      realNetProfit,
    };
  }),

  // ── Content Access Logs ────────────────────────────────────────────────────
  listContentAccessLogs: adminProcedure
    .input(z.object({ limit: z.number().default(100) }).optional())
    .query(({ input }) =>
      prisma.contentAccessLog.findMany({ orderBy: { created_at: "desc" }, take: input?.limit ?? 100 })
    ),
});
