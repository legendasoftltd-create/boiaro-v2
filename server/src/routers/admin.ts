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
    .input(z.object({ title: z.string().min(1), slug: z.string().min(1), content: z.string().default(""), excerpt: z.string().optional(), cover_image: z.string().optional(), category: z.string().optional(), tags: z.array(z.string()).default([]), status: z.string().default("draft"), author_name: z.string().optional() }))
    .mutation(({ input }) => prisma.blogPost.create({ data: input as any })),

  updateBlogPost: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().optional(), slug: z.string().optional(), content: z.string().optional(), excerpt: z.string().optional(), cover_image: z.string().optional(), category: z.string().optional(), tags: z.array(z.string()).optional(), status: z.string().optional(), author_name: z.string().optional(), publish_date: z.string().optional() }))
    .mutation(({ input }) => {
      const { id, publish_date, ...data } = input;
      return prisma.blogPost.update({ where: { id }, data: { ...data, ...(publish_date ? { publish_date: new Date(publish_date) } : {}) } });
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
});
