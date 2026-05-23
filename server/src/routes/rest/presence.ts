/**
 * REST Presence API — for mobile apps.
 * Base prefix: /api/v1/presence
 *
 *  POST /heartbeat  — upsert user presence (reading / listening / browsing)
 *  GET  /live       — admin: list users active in last 5 minutes
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";

export const presenceRestRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/presence/heartbeat
// Called by mobile app periodically (every 45s) while user is active.
//
// Body:
//   activity_type   "reading" | "listening" | "browsing"   (default: "browsing")
//   book_id         string   optional — currently open book
//   current_page    string   optional — current page/chapter label
//   session_id      string   optional — stable session UUID from app
// ─────────────────────────────────────────────────────────────────────────────
presenceRestRouter.post("/heartbeat", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const {
      activity_type = "browsing",
      book_id,
      current_page,
      session_id,
    } = req.body;

    const validTypes = ["reading", "listening", "browsing", "idle"];
    const safeType = validTypes.includes(activity_type) ? activity_type : "browsing";

    await prisma.userPresence.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        activity_type: safeType,
        current_book_id: book_id || null,
        current_page: current_page || null,
        session_id: session_id || null,
        platform: "mobile",
        last_seen: new Date(),
      },
      update: {
        activity_type: safeType,
        current_book_id: book_id || null,
        current_page: current_page || null,
        session_id: session_id || null,
        platform: "mobile",
        last_seen: new Date(),
      },
    } as any);

    res.json({ success: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/presence/live
// Returns users active in the last 5 minutes with profile + book info.
// Requires auth (admin check done server-side via admin role check).
//
// Query params:
//   filter   "reading" | "listening" | "online"   (default: all active)
//   minutes  number 1–60   (default: 5)
// ─────────────────────────────────────────────────────────────────────────────
presenceRestRouter.get("/live", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;

    // Only admins and moderators may call this
    const roles = await prisma.userRole.findMany({
      where: { user_id: userId, role: { in: ["admin", "moderator"] } },
    });
    if (!roles.length) {
      res.status(403).json({ success: false, error: "Admin access required" });
      return;
    }

    const minutes = Math.min(60, Math.max(1, parseInt(String(req.query.minutes || "5"), 10)));
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const filter = String(req.query.filter || "");

    const rows = await prisma.userPresence.findMany({
      where: {
        last_seen: { gte: since },
        ...(filter === "reading" || filter === "listening"
          ? { activity_type: filter }
          : {}),
      },
      orderBy: { last_seen: "desc" },
      select: {
        user_id: true,
        last_seen: true,
        activity_type: true,
        current_page: true,
        current_book_id: true,
        session_id: true,
      },
    });

    if (!rows.length) {
      res.json({ success: true, total: 0, reading: 0, listening: 0, browsing: 0, users: [] });
      return;
    }

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const bookIds = [...new Set(rows.map((r) => r.current_book_id).filter(Boolean) as string[])];

    const [profiles, books] = await Promise.all([
      prisma.profile.findMany({
        where: { user_id: { in: userIds } },
        select: { user_id: true, display_name: true, avatar_url: true },
      }),
      bookIds.length
        ? prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: { id: true, title: true, cover_url: true },
          })
        : Promise.resolve([]),
    ]);

    const profileMap = Object.fromEntries(
      profiles.map((p) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }])
    );
    const bookMap = Object.fromEntries(books.map((b) => [b.id, { title: b.title, cover_url: b.cover_url }]));

    const users = rows.map((r) => ({
      user_id: r.user_id,
      display_name: profileMap[r.user_id]?.display_name || r.user_id.slice(0, 8),
      avatar_url: profileMap[r.user_id]?.avatar_url || null,
      activity_type: r.activity_type,
      last_seen: r.last_seen,
      current_page: r.current_page,
      session_id: r.session_id,
      book: r.current_book_id ? (bookMap[r.current_book_id] ?? null) : null,
    }));

    res.json({
      success: true,
      total: users.length,
      reading: users.filter((u) => u.activity_type === "reading").length,
      listening: users.filter((u) => u.activity_type === "listening").length,
      browsing: users.filter((u) => u.activity_type === "browsing").length,
      users,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
