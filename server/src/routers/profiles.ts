import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const profilesRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.profile.findUnique({ where: { user_id: ctx.userId } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    return profile;
  }),

  update: protectedProcedure
    .input(
      z.object({
        display_name: z.string().optional(),
        full_name: z.string().optional(),
        bio: z.string().optional(),
        avatar_url: z.string().url().optional().or(z.literal("")),
        preferred_language: z.string().optional(),
        genre: z.string().optional(),
        specialty: z.string().optional(),
        experience: z.string().optional(),
        phone: z.string().optional(),
        website_url: z.string().optional(),
        facebook_url: z.string().optional(),
        instagram_url: z.string().optional(),
        youtube_url: z.string().optional(),
        portfolio_url: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.profile.update({
        where: { user_id: ctx.userId },
        data: input,
      });
    }),

  readingProgress: protectedProcedure.query(({ ctx }) =>
    prisma.readingProgress.findMany({
      where: { user_id: ctx.userId },
      include: {
        book: {
          include: {
            author: { select: { id: true, name: true } },
            formats: { select: { id: true, format: true } },
          },
        },
      },
      orderBy: { last_read_at: "desc" },
    })
  ),

  updateReadingProgress: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        currentPage: z.number().int().min(0),
        totalPages: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const percentage = input.totalPages > 0
        ? Math.min((input.currentPage / input.totalPages) * 100, 100)
        : 0;

      return prisma.readingProgress.upsert({
        where: { user_id_book_id: { user_id: ctx.userId, book_id: input.bookId } },
        create: {
          user_id: ctx.userId,
          book_id: input.bookId,
          current_page: input.currentPage,
          total_pages: input.totalPages,
          percentage,
          last_read_at: new Date(),
        },
        update: {
          current_page: input.currentPage,
          total_pages: input.totalPages,
          percentage,
          last_read_at: new Date(),
        },
      });
    }),

  updateListeningProgress: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        currentPosition: z.number(),
        totalDuration: z.number(),
        currentTrack: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const percentage = input.totalDuration > 0
        ? Math.min((input.currentPosition / input.totalDuration) * 100, 100)
        : 0;

      return prisma.listeningProgress.upsert({
        where: { user_id_book_id: { user_id: ctx.userId, book_id: input.bookId } },
        create: {
          user_id: ctx.userId,
          book_id: input.bookId,
          current_position: input.currentPosition,
          total_duration: input.totalDuration,
          current_track: input.currentTrack,
          percentage,
          last_listened_at: new Date(),
        },
        update: {
          current_position: input.currentPosition,
          total_duration: input.totalDuration,
          current_track: input.currentTrack,
          percentage,
          last_listened_at: new Date(),
        },
      });
    }),

  userRoles: protectedProcedure.query(({ ctx }) =>
    prisma.userRole.findMany({ where: { user_id: ctx.userId } })
  ),

  hasRole: protectedProcedure
    .input(z.object({ role: z.string() }))
    .query(async ({ ctx, input }) => {
      const r = await prisma.userRole.findFirst({
        where: { user_id: ctx.userId, role: input.role as any },
      });
      return { hasRole: !!r };
    }),

  permissionOverrides: protectedProcedure.query(({ ctx }) =>
    prisma.userPermissionOverride.findMany({
      where: { user_id: ctx.userId },
      select: { permission_key: true, is_allowed: true },
    })
  ),

  presence: protectedProcedure
    .input(
      z.object({
        activityType: z.string().default("browsing"),
        currentBookId: z.string().optional(),
        currentPage: z.string().optional(),
        sessionId: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.userPresence.upsert({
        where: { user_id: ctx.userId },
        create: {
          user_id: ctx.userId,
          activity_type: input.activityType,
          current_book_id: input.currentBookId,
          current_page: input.currentPage,
          session_id: input.sessionId,
          last_seen: new Date(),
        },
        update: {
          activity_type: input.activityType,
          current_book_id: input.currentBookId,
          current_page: input.currentPage,
          session_id: input.sessionId,
          last_seen: new Date(),
        },
      })
    ),
});
