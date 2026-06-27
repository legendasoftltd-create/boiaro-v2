import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(30), unreadOnly: z.boolean().default(false) }))
    .query(({ ctx, input }) =>
      prisma.userNotification.findMany({
        where: {
          user_id: ctx.userId,
          ...(input.unreadOnly && { is_read: false }),
        },
        include: { notification: true },
        orderBy: { created_at: "desc" },
        take: input.limit,
      })
    ),

  unreadCount: protectedProcedure.query(({ ctx }) =>
    prisma.userNotification.count({ where: { user_id: ctx.userId, is_read: false } })
  ),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      prisma.userNotification.updateMany({
        where: { id: input.id, user_id: ctx.userId },
        data: { is_read: true, read_at: new Date() },
      })
    ),

  markAllRead: protectedProcedure.mutation(({ ctx }) =>
    prisma.userNotification.updateMany({
      where: { user_id: ctx.userId, is_read: false },
      data: { is_read: true, read_at: new Date() },
    })
  ),

  preferences: protectedProcedure.query(({ ctx }) =>
    prisma.notificationPreference.findUnique({ where: { user_id: ctx.userId } })
  ),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        email_enabled: z.boolean().optional(),
        push_enabled: z.boolean().optional(),
        order_enabled: z.boolean().optional(),
        promotional_enabled: z.boolean().optional(),
        reminder_enabled: z.boolean().optional(),
        support_enabled: z.boolean().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.notificationPreference.upsert({
        where: { user_id: ctx.userId },
        create: { user_id: ctx.userId, ...input },
        update: input,
      })
    ),

  // Register a push token (FCM for mobile/native, Firebase Web Push for browsers).
  registerPushToken: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1),
        platform: z.enum(["android", "ios", "web"]).default("web"),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.devicePushToken.upsert({
        where: { user_id_token: { user_id: ctx.userId, token: input.token } },
        create: { user_id: ctx.userId, token: input.token, platform: input.platform },
        update: { platform: input.platform, updated_at: new Date() },
      })
    ),

  unregisterPushToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      prisma.devicePushToken.deleteMany({
        where: { user_id: ctx.userId, token: input.token },
      })
    ),
});
