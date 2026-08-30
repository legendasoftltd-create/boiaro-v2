import { Router } from "express";
import { TRPCError } from "@trpc/server";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { maybeRecordListen } from "../../lib/listenTracking.js";
import { maybeRecordRead } from "../../lib/readTracking.js";
import { checkAndAwardBadges, awardPoints, bumpGoalProgress, bumpGoalMinutes, POINTS } from "../../services/gamification.service.js";

export const progressRestRouter = Router();

/**
 * Progress endpoints feed points, streaks, the monthly leaderboard and
 * competition payouts — which carry real prize money — so the numbers they
 * accept have to be plausible. They previously took whatever the client sent:
 * negative pages, positions far beyond the track length, and an unbounded
 * session_seconds that credited goal minutes directly.
 */
const MAX_SESSION_SECONDS = 4 * 60 * 60; // 4h — longer than any single save interval

function toCount(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} must be a non-negative number` });
  }
  return n;
}

/** Clamp a client-reported session length to something a real session could produce. */
function safeSessionSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_SESSION_SECONDS);
}

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
    const pages = toCount(total_pages, "total_pages");
    const page = Math.min(toCount(current_page, "current_page"), pages);
    const sessionSeconds = safeSessionSeconds(session_seconds);
    const percentage = pages > 0 ? Math.min((page / pages) * 100, 100) : 0;
    const existing = await prisma.readingProgress.findUnique({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id } },
    });
    const isNewRead = await maybeRecordRead(req.auth.userId, book_id, sessionSeconds, session_pages_read);
    if (isNewRead) awardPoints(req.auth.userId!, POINTS.READ_SESSION, "read_session", book_id).catch(() => null);
    if (existing?.last_read_at) {
      // Server-measured elapsed time, capped the same way — the client's own
      // timer is never the sole source for anything that pays out.
      const deltaSeconds = Math.min((Date.now() - existing.last_read_at.getTime()) / 1000, MAX_SESSION_SECONDS);
      bumpGoalMinutes(req.auth.userId!, "read_minutes", deltaSeconds).catch(() => null);
    } else if (sessionSeconds) {
      // First save of a fresh reading session for this book — there's no
      // prior last_read_at to diff against, so without this the whole
      // session (e.g. someone testing with a page-turn or two) silently
      // credits zero goal minutes. session_seconds is the client's own
      // elapsed-since-open timer, the best available stand-in here.
      bumpGoalMinutes(req.auth.userId!, "read_minutes", sessionSeconds).catch(() => null);
    }
    if (percentage >= 100 && (existing?.percentage ?? 0) < 100) {
      bumpGoalProgress(req.auth.userId!, "books_month", 1).catch(() => null);
    }
    await prisma.readingProgress.upsert({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id } },
      create: {
        user_id: req.auth.userId!,
        book_id,
        current_page: page,
        total_pages: pages,
        percentage,
        last_read_at: new Date(),
      },
      update: { current_page: page, total_pages: pages, percentage, last_read_at: new Date() },
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
    const { book_id, track_number = 1, position_seconds = 0, total_seconds = 0, playback_speed, session_seconds } = req.body;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const totalSeconds = toCount(total_seconds, "total_seconds");
    const positionSeconds = totalSeconds > 0
      ? Math.min(toCount(position_seconds, "position_seconds"), totalSeconds)
      : toCount(position_seconds, "position_seconds");
    const sessionSeconds = safeSessionSeconds(session_seconds);
    const percentage = totalSeconds > 0 ? Math.min((positionSeconds / totalSeconds) * 100, 100) : 0;
    const speedVal = playback_speed != null ? Math.min(Math.max(Number(playback_speed), 0.25), 4) : undefined;
    const existingListen = await prisma.listeningProgress.findUnique({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id } },
    });
    const isNewListen = await maybeRecordListen(req.auth.userId, book_id, positionSeconds, totalSeconds);
    if (isNewListen) awardPoints(req.auth.userId!, POINTS.LISTEN_SESSION, "listen_session", book_id).catch(() => null);
    if (existingListen?.last_listened_at) {
      const deltaSeconds = Math.min((Date.now() - existingListen.last_listened_at.getTime()) / 1000, MAX_SESSION_SECONDS);
      bumpGoalMinutes(req.auth.userId!, "listen_minutes", deltaSeconds).catch(() => null);
    } else if (sessionSeconds) {
      // Same first-save gap as reading above — the client saves on a fixed
      // interval, so without this the first tick of every new listening
      // session for a book credits zero goal minutes.
      bumpGoalMinutes(req.auth.userId!, "listen_minutes", sessionSeconds).catch(() => null);
    }
    if (percentage >= 100 && (existingListen?.percentage ?? 0) < 100) {
      bumpGoalProgress(req.auth.userId!, "books_month", 1).catch(() => null);
    }
    await prisma.listeningProgress.upsert({
      where: { user_id_book_id: { user_id: req.auth.userId!, book_id } },
      create: {
        user_id: req.auth.userId!,
        book_id,
        current_track: Math.max(1, Math.trunc(Number(track_number) || 1)),
        current_position: positionSeconds,
        total_duration: totalSeconds,
        percentage,
        last_listened_at: new Date(),
        ...(speedVal != null && { playback_speed: speedVal }),
      },
      update: {
        current_track: Math.max(1, Math.trunc(Number(track_number) || 1)),
        current_position: positionSeconds,
        total_duration: totalSeconds,
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
