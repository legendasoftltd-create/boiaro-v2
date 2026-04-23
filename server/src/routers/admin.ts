import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import type { Context } from "../context.js";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

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
  { section_key: "live_radio", title: "Live Radio", subtitle: "Listen to live streaming now", is_enabled: false, sort_order: 18, display_source: null },
  { section_key: "blog", title: "ব্লগ ও আর্টিকেল", subtitle: "আমাদের সাম্প্রতিক লেখা", is_enabled: true, sort_order: 19, display_source: null },
  { section_key: "app_download", title: "অ্যাপ ডাউনলোড", subtitle: null, is_enabled: true, sort_order: 20, display_source: null },
];

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
              submission_status: true,
              narrator: { select: { id: true, name: true } },
            },
          },
        },
      });
      let nextCursor: string | undefined;
      if (books.length > input.limit) nextCursor = books.pop()!.id;
      return { books, nextCursor };
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

  upsertBook: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        title_en: z.string().optional().nullable(),
        slug: z.string().min(1),
        description: z.string().optional().nullable(),
        description_bn: z.string().optional().nullable(),
        author_id: z.string().optional().nullable(),
        category_id: z.string().optional().nullable(),
        publisher_id: z.string().optional().nullable(),
        cover_url: z.string().optional().nullable(),
        is_featured: z.boolean().optional(),
        is_bestseller: z.boolean().optional(),
        is_new: z.boolean().optional(),
        is_free: z.boolean().optional(),
        language: z.string().optional().nullable(),
        tags: z.array(z.string()).nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, author_id, category_id, publisher_id, ...data } = input;
      const normalizedTags =
        data.tags === undefined ? undefined : data.tags === null ? [] : data.tags;

      const relationData = {
        author: author_id ? { connect: { id: author_id } } : { disconnect: true },
        category: category_id ? { connect: { id: category_id } } : { disconnect: true },
        publisher: publisher_id ? { connect: { id: publisher_id } } : { disconnect: true },
      };

      if (id) {
        return prisma.book.update({
          where: { id },
          data: {
            ...data,
            ...(normalizedTags !== undefined ? { tags: { set: normalizedTags } } : {}),
            ...relationData,
          } as any,
        });
      }

      return prisma.book.create({
        data: {
          ...data,
          ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
          ...(author_id ? { author: { connect: { id: author_id } } } : {}),
          ...(category_id ? { category: { connect: { id: category_id } } } : {}),
          ...(publisher_id ? { publisher: { connect: { id: publisher_id } } } : {}),
        } as any,
      });
    }),

  deleteBookWithFormats: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) =>
      prisma.$transaction([
        prisma.bookFormat.deleteMany({ where: { book_id: input.id } }),
        prisma.book.delete({ where: { id: input.id } }),
      ])
    ),

  upsertBookFormat: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        book_id: z.string(),
        format: z.string(),
        narrator_id: z.string().nullable().optional(),
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
    .mutation(({ input }) => {
      const { id, ...data } = input;
      if (id) return prisma.bookFormat.update({ where: { id }, data: data as any });
      return prisma.bookFormat.create({ data: data as any });
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
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.audiobookTrack.create({
        data: {
          ...input,
          created_by: ctx.userId,
        } as any,
      })
    ),

  updateAudiobookTrackAdmin: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().min(1), chapter_price: z.number().nullable().optional() }))
    .mutation(({ input }) =>
      prisma.audiobookTrack.update({
        where: { id: input.id },
        data: { title: input.title, chapter_price: input.chapter_price ?? null },
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
          reference_type: input.reference_type ?? null,
          reference_id: input.reference_id ?? null,
          created_by: ctx.userId,
        },
      })
    ),

  approveBook: adminProcedure
    .input(z.object({ bookId: z.string() }))
    .mutation(({ input }) =>
      prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "approved" },
      })
    ),

  rejectBook: adminProcedure
    .input(z.object({ bookId: z.string(), reason: z.string().optional() }))
    .mutation(({ input }) =>
      prisma.book.update({
        where: { id: input.bookId },
        data: { submission_status: "rejected" },
      })
    ),

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
              ],
            }
          : undefined,
        orderBy: { created_at: "desc" },
        include: {
          profile: { select: { display_name: true, avatar_url: true, is_active: true, deleted_at: true } },
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
      const bookMap = Object.fromEntries(books.map((book) => [book.id, book]));

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
      return prisma.order.update({
        where: { id: input.orderId },
        data: { cod_payment_status: input.codPaymentStatus },
      });
    }),

  markCodPaid: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.$transaction([
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
      const bookIds = [...new Set(orderItems.map((item) => item.book_id).filter(Boolean) as string[])];
      const books = bookIds.length
        ? await prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: { title: true },
          })
        : [];
      const description = `Order-based purchase: ${
        books.map((book) => book.title).join(", ") || "Book"
      } — ${totalQty} × ৳${input.purchaseCostPerUnit} (Order #${order.order_number || input.orderId.slice(0, 8)})`;

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
            amount: totalCogs,
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

      return prisma.$transaction([
        prisma.roleApplication.update({
          where: { id: input.applicationId },
          data: { status: "approved", reviewed_by: ctx.userId, verified: true, reviewed_at: new Date() },
        }),
        prisma.userRole.upsert({
          where: { user_id_role: { user_id: app.user_id, role: app.applied_role as any } },
          create: { user_id: app.user_id, role: app.applied_role as any },
          update: {},
        }),
      ]);
    }),

  // ── Permissions ─────────────────────────────────────────────────────────────
  myPermissions: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = await prisma.userRole.findFirst({
      where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } },
    });
    if (!isAdmin) return { roleName: null, permissions: [], isSuperAdmin: false };

    const MODULES = [
      "books", "users", "orders", "payments", "reports", "support", "content",
      "settings", "roles", "email", "notifications", "analytics", "cms",
      "subscriptions", "coupons", "shipping", "withdrawals", "revenue",
    ];

    if (isAdmin.role === "admin") {
      return {
        roleName: "super_admin",
        isSuperAdmin: true,
        permissions: MODULES.map((m) => ({ module: m, can_view: true, can_create: true, can_edit: true, can_delete: true })),
      };
    }

    return {
      roleName: "moderator",
      isSuperAdmin: false,
      permissions: MODULES.map((m) => ({ module: m, can_view: true, can_create: false, can_edit: false, can_delete: false })),
    };
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
        role: z.enum(["writer", "publisher", "narrator"]),
        profileTable: z.enum(["authors", "publishers", "narrators"]),
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
      } else {
        await prisma.narrator.create({ data: { ...(profileData as any), user_id: user.id } });
      }

      return { message: "Creator account created successfully", userId: user.id };
    }),

  linkCreatorProfile: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["writer", "publisher", "narrator"]),
        profileTable: z.enum(["authors", "publishers", "narrators"]),
        profileId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { email, role, profileTable, profileId } = input;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      if (profileTable === "authors") {
        await prisma.author.update({ where: { id: profileId }, data: { user_id: user.id } });
      } else if (profileTable === "publishers") {
        await prisma.publisher.update({ where: { id: profileId }, data: { user_id: user.id } });
      } else {
        await prisma.narrator.update({ where: { id: profileId }, data: { user_id: user.id } });
      }

      await prisma.userRole.upsert({
        where: { user_id_role: { user_id: user.id, role: role as any } },
        create: { user_id: user.id, role: role as any },
        update: {},
      });

      return { message: "Profile linked successfully" };
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
    .mutation(({ input }) => prisma.review.update({ where: { id: input.id }, data: { status: "approved" } })),

  rejectReview: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.review.update({ where: { id: input.id }, data: { status: "rejected" } })),

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
        userIds = [...new Set(roles.map((role) => role.user_id))];
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

      return { sent: userIds.length };
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

  // ── User detail + role update ─────────────────────────────────────────────────
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

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.string(), role: z.string(), action: z.enum(["add", "remove"]) }))
    .mutation(async ({ input }) => {
      if (input.action === "add") {
        await prisma.userRole.upsert({
          where: { user_id_role: { user_id: input.userId, role: input.role as any } },
          create: { user_id: input.userId, role: input.role as any },
          update: {},
        });
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

  // ── User soft-delete / restore ───────────────────────────────────────────────
  softDeleteUser: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string().optional() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: {
          deleted_at: new Date(),
          deleted_reason: input.reason || null,
          is_active: false,
        },
      })
    ),

  restoreUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ input }) =>
      prisma.profile.update({
        where: { user_id: input.userId },
        data: { deleted_at: null, deleted_reason: null, is_active: true },
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
    prisma.coupon.findMany({ orderBy: { created_at: "desc" } })
  ),

  createCoupon: adminProcedure
    .input(
      z.object({
        code: z.string().min(1),
        description: z.string().nullable().optional(),
        discount_type: z.string().default("percentage"),
        discount_value: z.number().nonnegative(),
        applies_to: z.string().default("all"),
        min_order_amount: z.number().nullable().optional(),
        usage_limit: z.number().int().nullable().optional(),
        per_user_limit: z.number().int().nullable().optional(),
        start_date: z.string().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        first_order_only: z.boolean().default(false),
      })
    )
    .mutation(({ input }) =>
      prisma.coupon.create({
        data: {
          code: input.code.toUpperCase(),
          description: input.description ?? null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          applies_to: input.applies_to,
          min_order_amount: input.min_order_amount ?? null,
          usage_limit: input.usage_limit ?? null,
          per_user_limit: input.per_user_limit ?? null,
          start_date: input.start_date ? new Date(input.start_date) : new Date(),
          end_date: input.end_date ? new Date(input.end_date) : null,
          status: input.status,
          first_order_only: input.first_order_only,
        },
      })
    ),

  updateCoupon: adminProcedure
    .input(
      z.object({
        id: z.string(),
        code: z.string().min(1),
        description: z.string().nullable().optional(),
        discount_type: z.string().default("percentage"),
        discount_value: z.number().nonnegative(),
        applies_to: z.string().default("all"),
        min_order_amount: z.number().nullable().optional(),
        usage_limit: z.number().int().nullable().optional(),
        per_user_limit: z.number().int().nullable().optional(),
        start_date: z.string().optional(),
        end_date: z.string().nullable().optional(),
        status: z.string().default("active"),
        first_order_only: z.boolean().default(false),
      })
    )
    .mutation(({ input }) =>
      prisma.coupon.update({
        where: { id: input.id },
        data: {
          code: input.code.toUpperCase(),
          description: input.description ?? null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          applies_to: input.applies_to,
          min_order_amount: input.min_order_amount ?? null,
          usage_limit: input.usage_limit ?? null,
          per_user_limit: input.per_user_limit ?? null,
          start_date: input.start_date ? new Date(input.start_date) : new Date(),
          end_date: input.end_date ? new Date(input.end_date) : null,
          status: input.status,
          first_order_only: input.first_order_only,
        },
      })
    ),

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

  readingAnalyticsData: adminProcedure.query(async () => {
    const [logs, books, bookReads, presenceData, settings] = await Promise.all([
      prisma.userActivityLog.findMany({
        select: { action: true, book_id: true, user_id: true, created_at: true, metadata: true },
        orderBy: { created_at: "desc" },
        take: 5000,
      }),
      prisma.book.findMany({ select: { id: true, title: true, total_reads: true, cover_url: true } }),
      prisma.bookRead.findMany({ select: { book_id: true, user_id: true, created_at: true } }),
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
    .mutation(({ input }) =>
      prisma.withdrawalRequest.update({
        where: { id: input.id },
        data: { status: input.status, notes: input.adminNotes ?? null },
      })
    ),

  // ── Submissions ────────────────────────────────────────────────────────────
  listSubmissions: adminProcedure
    .input(z.object({ status: z.string() }))
    .query(async ({ input }) => {
      const books = await prisma.book.findMany({
        where: { submission_status: input.status, submitted_by: { not: null } },
        orderBy: { created_at: "desc" },
        include: {
          category: { select: { name: true, name_bn: true } },
          formats: { select: { id: true, format: true, price: true, stock_count: true, duration: true, audio_quality: true, file_url: true } },
          contributors: { select: { user_id: true, role: true, format: true } },
        },
      });
      const userIds = [...new Set(books.map(b => b.submitted_by).filter(Boolean) as string[])];
      const profiles = userIds.length > 0
        ? await prisma.profile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, display_name: true } })
        : [];
      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || "Unknown"]));
      return books.map(b => ({ ...b, _submitter: profileMap[b.submitted_by!] || "Unknown", book_formats: b.formats, book_contributors: b.contributors, categories: b.category }));
    }),

  updateSubmissionStatus: adminProcedure
    .input(z.object({ bookId: z.string(), status: z.enum(["approved", "rejected", "draft", "pending"]) }))
    .mutation(({ input }) =>
      prisma.book.update({ where: { id: input.bookId }, data: { submission_status: input.status } })
    ),

  getAudiobookTracksForFormat: adminProcedure
    .input(z.object({ bookFormatId: z.string() }))
    .query(({ input }) =>
      prisma.audiobookTrack.findMany({ where: { book_format_id: input.bookFormatId }, orderBy: { track_number: "asc" } })
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
      await prisma.$transaction(async (tx) => {
        if (changes.book && req.book_id && req.request_type === "book") {
          const { submission_status: _ss, submitted_by: _sb, ...bookUpdates } = changes.book;
          if (Object.keys(bookUpdates).length > 0) await tx.book.update({ where: { id: req.book_id }, data: bookUpdates });
        }
        if (changes.format?.format_id) {
          const { format_id, ...formatUpdates } = changes.format;
          if (Object.keys(formatUpdates).length > 0) await tx.bookFormat.update({ where: { id: format_id }, data: formatUpdates });
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

      await prisma.$transaction(async (tx) => {
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
      } else if (input.role === "rj") {
        const existing = await prisma.rjProfile.findFirst({ where: { user_id: input.userId } });
        if (!existing) await prisma.rjProfile.create({ data: { user_id: input.userId, stage_name: displayName, is_approved: true } });
        else await prisma.rjProfile.update({ where: { user_id: input.userId }, data: { is_approved: true } });
      }

      if (app.display_name) {
        await prisma.profile.update({ where: { user_id: input.userId }, data: { display_name: app.display_name } });
      }

      return { success: true };
    }),

  rejectApplication: adminProcedure
    .input(z.object({ applicationId: z.string() }))
    .mutation(({ ctx, input }) =>
      prisma.roleApplication.update({
        where: { id: input.applicationId },
        data: { status: "rejected", reviewed_by: ctx.userId, reviewed_at: new Date() },
      })
    ),

  // ── Revenue Splits ─────────────────────────────────────────────────────────
  listDefaultRevenueRules: adminProcedure.query(() =>
    prisma.defaultRevenueRule.findMany({ orderBy: { format: "asc" } })
  ),

  updateDefaultRevenueRule: adminProcedure
    .input(z.object({ id: z.string(), writer_percentage: z.number(), publisher_percentage: z.number(), narrator_percentage: z.number(), platform_percentage: z.number(), fulfillment_cost_percentage: z.number() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.defaultRevenueRule.update({ where: { id }, data });
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
      platform_percentage: s.platform_pct,
      fulfillment_cost_percentage: s.fulfillment_cost_pct,
      books: bookMap[s.book_id] || null,
    }));
  }),

  upsertRevenueOverride: adminProcedure
    .input(z.object({ book_id: z.string(), format: z.string(), writer_percentage: z.number(), publisher_percentage: z.number(), narrator_percentage: z.number(), platform_percentage: z.number(), fulfillment_cost_percentage: z.number() }))
    .mutation(async ({ input }) => {
      const data = {
        book_id: input.book_id, format: input.format,
        writer_pct: input.writer_percentage, publisher_pct: input.publisher_percentage,
        narrator_pct: input.narrator_percentage, platform_pct: input.platform_percentage,
        fulfillment_cost_pct: input.fulfillment_cost_percentage,
      };
      const existing = await prisma.formatRevenueSplit.findFirst({ where: { book_id: input.book_id, format: input.format } });
      if (existing) return prisma.formatRevenueSplit.update({ where: { id: existing.id }, data });
      return prisma.formatRevenueSplit.create({ data });
    }),

  deleteRevenueOverride: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.formatRevenueSplit.delete({ where: { id: input.id } })),

  listEarnings: adminProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const earnings = await prisma.contributorEarning.findMany({ orderBy: { created_at: "desc" }, take: input?.limit ?? 50 });
      const bookIds = [...new Set(earnings.map(e => e.book_id).filter(Boolean) as string[])];
      const books = bookIds.length > 0
        ? await prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } })
        : [];
      const bookMap = Object.fromEntries(books.map(b => [b.id, b]));
      return earnings.map(e => ({ ...e, books: e.book_id ? bookMap[e.book_id] || null : null }));
    }),

  revenueStats: adminProcedure.query(async () => {
    const [earnings, withdrawals] = await Promise.all([
      prisma.contributorEarning.findMany(),
      prisma.withdrawalRequest.findMany(),
    ]);
    const uniqueOrderSales = new Map<string, number>();
    earnings.forEach(e => {
      if (e.order_id && !uniqueOrderSales.has(e.order_id)) uniqueOrderSales.set(e.order_id, Number(e.sale_amount || 0));
    });
    return {
      totalSales: Array.from(uniqueOrderSales.values()).reduce((s, v) => s + v, 0),
      platformEarnings: earnings.filter(e => e.role === "platform").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      writerPayouts: earnings.filter(e => e.role === "writer").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      publisherPayouts: earnings.filter(e => e.role === "publisher").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      narratorPayouts: earnings.filter(e => e.role === "narrator").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
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
    .input(z.object({ keys: z.array(z.string()) }))
    .query(async ({ input }) => {
      const settings = await prisma.platformSetting.findMany({ where: { key: { in: input.keys } } });
      return Object.fromEntries(settings.map(s => [s.key, s.value]));
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
    .input(z.array(z.object({ key: z.string(), value: z.string() })))
    .mutation(async ({ input }) => {
      await Promise.all(input.map(s =>
        prisma.platformSetting.upsert({
          where: { key: s.key },
          create: { key: s.key, value: s.value },
          update: { value: s.value },
        })
      ));
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
        defaults,
        overrides: overrides.map(s => ({
          id: s.id, format: s.format,
          writer_percentage: s.writer_pct, publisher_percentage: s.publisher_pct,
          narrator_percentage: s.narrator_pct, platform_percentage: s.platform_pct,
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

    const [
      bookCount, formatCounts, authorCount, narratorCount,
      orders, profileCount, topBooks, recentOrders,
      pendingApps, recentReviews, bookReads,
      ledgerAll, todayLedger, recentLedger,
      coinTxns, earnings, hardcopyFormats,
      paidOrderUsers, orderItems, topRated,
    ] = await Promise.all([
      prisma.book.count(),
      prisma.bookFormat.groupBy({ by: ["format"], _count: { id: true } }),
      prisma.author.count(),
      prisma.narrator.count(),
      prisma.order.findMany({ select: { id: true, total_amount: true, status: true, created_at: true, shipping_cost: true, payment_method: true } }),
      prisma.profile.count(),
      prisma.book.findMany({ select: { title: true, total_reads: true }, orderBy: { total_reads: "desc" }, take: 5 }),
      prisma.order.findMany({ select: { id: true, total_amount: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 6 }),
      prisma.roleApplication.findMany({ where: { status: "pending" }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.review.findMany({ select: { id: true, rating: true, created_at: true, book: { select: { title: true } } }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.bookRead.count(),
      prisma.accountingLedger.findMany({ select: { type: true, amount: true, entry_date: true } }),
      prisma.accountingLedger.findMany({ where: { entry_date: { gte: todayStart } }, select: { type: true, amount: true } }),
      prisma.accountingLedger.findMany({ select: { description: true, amount: true, type: true, entry_date: true }, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.coinTransaction.findMany({ select: { type: true, amount: true } }),
      prisma.contributorEarning.findMany({ select: { role: true, earned_amount: true, sale_amount: true, format: true, order_id: true } }),
      prisma.bookFormat.findMany({ where: { format: "hardcopy" }, select: { stock_count: true, book: { select: { title: true } } } }),
      prisma.order.findMany({ where: { status: { not: "cancelled" } }, select: { user_id: true } }),
      prisma.orderItem.findMany({ select: { book_id: true, format: true, price: true, quantity: true, order_id: true } }),
      prisma.book.findMany({ where: { rating: { not: null } }, select: { title: true, rating: true, reviews_count: true }, orderBy: { rating: "desc" }, take: 5 }),
    ]);

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

    const paidUserIds = new Set(paidOrderUsers.map(o => o.user_id));
    const activeEarnings = earnings;
    const writerEarnings = activeEarnings.filter(e => e.role === "writer").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const narratorEarnings = activeEarnings.filter(e => e.role === "narrator").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const publisherEarnings = activeEarnings.filter(e => e.role === "publisher").reduce((s, e) => s + Number(e.earned_amount || 0), 0);
    const uniqueOrderSales = new Map<string, number>();
    activeEarnings.forEach(e => { if (e.order_id && !uniqueOrderSales.has(e.order_id)) uniqueOrderSales.set(e.order_id, Number(e.sale_amount || 0)); });
    const totalSaleAmount = Array.from(uniqueOrderSales.values()).reduce((s, v) => s + v, 0);
    const platformEarnings = Math.max(0, totalSaleAmount - writerEarnings - narratorEarnings - publisherEarnings);

    const validOrders = orders.filter(o => o.status !== "cancelled");
    const monthMap: Record<string, { revenue: number; cost: number; profit: number }> = {};
    validOrders.forEach(o => {
      const key = new Date(o.created_at).toISOString().slice(0, 7);
      if (!monthMap[key]) monthMap[key] = { revenue: 0, cost: 0, profit: 0 };
      monthMap[key].revenue += Number(o.total_amount || 0);
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
      if (!item.book_id) return;
      if (!bookSales[item.book_id]) bookSales[item.book_id] = { title: "Unknown", sales: 0, revenue: 0 };
      bookSales[item.book_id].sales += item.quantity || 1;
      bookSales[item.book_id].revenue += Number(item.price || 0) * (item.quantity || 1);
    });
    const topSellingBooks = Object.values(bookSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      totalBooks: bookCount,
      totalEbooks: fmtMap["ebook"] || 0,
      totalAudiobooks: fmtMap["audiobook"] || 0,
      totalHardcopies: fmtMap["hardcopy"] || 0,
      totalAuthors: authorCount,
      totalNarrators: narratorCount,
      totalUsers: profileCount,
      totalOrders: orders.length,
      totalRevenue: validOrders.reduce((s, o) => s + (Number(o.total_amount || 0) - Number(o.shipping_cost || 0)), 0),
      totalIncome, totalExpense, netProfit: totalIncome - totalExpense,
      todayIncome, todayExpense, todayProfit: todayIncome - todayExpense,
      recentLedger: recentLedger.map(r => ({
        description: (r as any).description || "—", amount: Number(r.amount), type: r.type,
        date: r.entry_date ? new Date(r.entry_date).toLocaleDateString() : "—",
      })),
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
      totalPurchases: validOrders.length,
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
      onlineNow: 0, readingNow: 0, listeningNow: 0,
      formatProfit: [], topEarningBooks: [],
      codPending: 0, codCollected: 0, codSettled: 0,
      realNetProfit: totalIncome - totalExpense,
    };
  }),

  // ── Content Access Logs ────────────────────────────────────────────────────
  listContentAccessLogs: adminProcedure
    .input(z.object({ limit: z.number().default(100) }).optional())
    .query(({ input }) =>
      prisma.contentAccessLog.findMany({ orderBy: { created_at: "desc" }, take: input?.limit ?? 100 })
    ),
});
