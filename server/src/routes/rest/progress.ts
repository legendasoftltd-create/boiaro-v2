import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

export const progressRestRouter = Router();

progressRestRouter.get("/reading", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id } = req.query;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const progress = await prisma.readingProgress.findUnique({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id: String(book_id) } },
    });
    if (!progress) {
      res.json({ current_page: 0, total_pages: 0, percentage: 0, last_read_at: null });
      return;
    }
    res.json({
      current_page: progress.current_page ?? 0,
      total_pages: progress.total_pages ?? 0,
      percentage: Math.round(progress.percentage ?? 0),
      last_read_at: progress.last_read_at,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

progressRestRouter.put("/reading", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, current_page, total_pages } = req.body;
    if (!book_id || current_page === undefined || total_pages === undefined) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const percentage = total_pages > 0 ? Math.min((current_page / total_pages) * 100, 100) : 0;
    await prisma.readingProgress.upsert({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id } },
      create: {
        user_id: req.auth.userId!,
        book_id,
        current_page,
        total_pages,
        percentage,
        last_read_at: new Date(),
      },
      update: { current_page, total_pages, percentage, last_read_at: new Date() },
    });
    res.json({ message: "Reading progress saved" });
  } catch (error) {
    sendHttpError(res, error);
  }
});

progressRestRouter.get("/listening", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id } = req.query;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const progress = await prisma.listeningProgress.findUnique({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id: String(book_id) } },
    });
    if (!progress) {
      res.json({ current_track: 1, position_seconds: 0, total_seconds: 0, last_listened_at: null });
      return;
    }
    res.json({
      current_track: progress.current_track ?? 1,
      position_seconds: Math.round(progress.current_position ?? 0),
      total_seconds: Math.round(progress.total_duration ?? 0),
      last_listened_at: progress.last_listened_at,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

progressRestRouter.put("/listening", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, track_number = 1, position_seconds = 0, total_seconds = 0 } = req.body;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const percentage = total_seconds > 0 ? Math.min((position_seconds / total_seconds) * 100, 100) : 0;
    await prisma.listeningProgress.upsert({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id } },
      create: {
        user_id: req.auth.userId!,
        book_id,
        current_track: track_number,
        current_position: position_seconds,
        total_duration: total_seconds,
        percentage,
        last_listened_at: new Date(),
      },
      update: {
        current_track: track_number,
        current_position: position_seconds,
        total_duration: total_seconds,
        percentage,
        last_listened_at: new Date(),
      },
    });
    res.json({ message: "Listening progress saved" });
  } catch (error) {
    sendHttpError(res, error);
  }
});
