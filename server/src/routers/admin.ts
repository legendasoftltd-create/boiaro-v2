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
          publisher: { select: { id: true, name: true } },
          formats: { select: { id: true, format: true, price: true, submission_status: true } },
        },
      });
      let nextCursor: string | undefined;
      if (books.length > input.limit) nextCursor = books.pop()!.id;
      return { books, nextCursor };
    }),

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
      let nextCursor: string | undefined;
      if (users.length > input.limit) nextCursor = users.pop()!.id;
      return { users, nextCursor };
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
        include: { items: true },
      });
      let nextCursor: string | undefined;
      if (orders.length > input.limit) nextCursor = orders.pop()!.id;
      return { orders, nextCursor };
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
  listHomepageSections: adminProcedure.query(() =>
    prisma.homepageSection.findMany({ orderBy: { sort_order: "asc" } })
  ),

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

  updateWithdrawal: adminProcedure
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
