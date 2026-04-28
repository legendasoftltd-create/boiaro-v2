import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

export const libraryRestRouter = Router();

const bookSummarySelect = {
  id: true,
  title: true,
  cover_url: true,
  slug: true,
  author: { select: { name: true } },
} as const;

libraryRestRouter.get("/purchases", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const purchases = await prisma.userPurchase.findMany({
      where: { user_id: req.auth.userId!, status: "active" },
      orderBy: { created_at: "desc" },
    });
    const bookIds = [...new Set(purchases.map((p) => p.book_id))];
    const books = await prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: bookSummarySelect,
    });
    const bookMap = new Map(books.map((b) => [b.id, b]));
    res.json({
      items: purchases.map((p) => ({
        book_id: p.book_id,
        format: p.format,
        purchased_at: p.created_at,
        books: bookMap.get(p.book_id) ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

libraryRestRouter.get("/unlocks", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const unlocks = await prisma.contentUnlock.findMany({
      where: { user_id: req.auth.userId!, status: "active" },
      orderBy: { created_at: "desc" },
    });
    const bookIds = [...new Set(unlocks.map((u) => u.book_id))];
    const books = await prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: bookSummarySelect,
    });
    const bookMap = new Map(books.map((b) => [b.id, b]));
    res.json({
      items: unlocks.map((u) => ({
        book_id: u.book_id,
        format: u.format,
        unlocked_at: u.created_at,
        books: bookMap.get(u.book_id) ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

libraryRestRouter.get("/continue-reading", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const progressList = await prisma.readingProgress.findMany({
      where: {
        user_id: req.auth.userId!,
        percentage: { gt: 0, lt: 100 },
      },
      orderBy: { last_read_at: "desc" },
      take: 10,
    });
    const bookIds = progressList.map((p) => p.book_id);
    const books = await prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: bookSummarySelect,
    });
    const bookMap = new Map(books.map((b) => [b.id, b]));
    res.json({
      items: progressList.map((p) => ({
        book_id: p.book_id,
        current_page: p.current_page ?? 0,
        total_pages: p.total_pages ?? 0,
        percentage: Math.round(p.percentage ?? 0),
        last_read_at: p.last_read_at,
        books: bookMap.get(p.book_id) ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

libraryRestRouter.get("/continue-listening", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const progressList = await prisma.listeningProgress.findMany({
      where: {
        user_id: req.auth.userId!,
        percentage: { gt: 0, lt: 100 },
      },
      orderBy: { last_listened_at: "desc" },
      take: 10,
    });
    const bookIds = progressList.map((p) => p.book_id);
    const books = await prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: bookSummarySelect,
    });
    const bookMap = new Map(books.map((b) => [b.id, b]));
    res.json({
      items: progressList.map((p) => ({
        book_id: p.book_id,
        current_track: p.current_track ?? 1,
        position_seconds: Math.round(p.current_position ?? 0),
        percentage: Math.round(p.percentage ?? 0),
        last_listened_at: p.last_listened_at,
        books: bookMap.get(p.book_id) ?? null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
