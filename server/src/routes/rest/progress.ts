import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { maybeRecordListen } from "../../lib/listenTracking.js";
import { maybeRecordRead } from "../../lib/readTracking.js";
import { checkAndAwardBadges, awardPoints, POINTS } from "../../services/gamification.service.js";

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
    const { book_id, current_page, total_pages, session_seconds, session_pages_read } = req.body;
    if (!book_id || current_page === undefined || total_pages === undefined) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const percentage = total_pages > 0 ? Math.min((current_page / total_pages) * 100, 100) : 0;
    const isNewRead = await maybeRecordRead(req.auth.userId, book_id, session_seconds, session_pages_read);
    if (isNewRead) awardPoints(req.auth.userId!, POINTS.READ_SESSION, "read_session", book_id).catch(() => null);
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
    checkAndAwardBadges(req.auth.userId!).catch(() => null);
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
      playback_speed: progress.playback_speed ?? 1,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

progressRestRouter.put("/listening", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, track_number = 1, position_seconds = 0, total_seconds = 0, playback_speed } = req.body;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const percentage = total_seconds > 0 ? Math.min((position_seconds / total_seconds) * 100, 100) : 0;
    const speedVal = playback_speed != null ? Math.min(Math.max(Number(playback_speed), 0.25), 4) : undefined;
    const isNewListen = await maybeRecordListen(req.auth.userId, book_id, position_seconds, total_seconds);
    if (isNewListen) awardPoints(req.auth.userId!, POINTS.LISTEN_SESSION, "listen_session", book_id).catch(() => null);
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
        ...(speedVal != null && { playback_speed: speedVal }),
      },
      update: {
        current_track: track_number,
        current_position: position_seconds,
        total_duration: total_seconds,
        percentage,
        last_listened_at: new Date(),
        ...(speedVal != null && { playback_speed: speedVal }),
      },
    });
    checkAndAwardBadges(req.auth.userId!).catch(() => null);
    res.json({ message: "Listening progress saved" });
  } catch (error) {
    sendHttpError(res, error);
  }
});
