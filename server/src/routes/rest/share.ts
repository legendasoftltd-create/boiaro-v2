import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { renderBadgeCard, renderWeeklyReportCard } from "../../lib/shareCard.js";
import { getUserWeeklyReport } from "../../services/weeklyReport.service.js";

export const shareRestRouter = Router();

// ── GET /api/v1/share/badge/:userBadgeId.png ─────────────────────────────────
// Auth required (only the badge owner can render their own card — the card
// includes their display name). Path param is "<uuid>.png"; the .png suffix
// is cosmetic (so a saved/shared file has a sane extension) and stripped.
shareRestRouter.get("/badge/:idParam", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userBadgeId = String(req.params.idParam).replace(/\.png$/i, "");
    const userBadge = await prisma.userBadge.findUnique({
      where: { id: userBadgeId },
      include: { badge: true },
    });
    if (!userBadge || userBadge.user_id !== req.auth.userId) {
      res.status(404).json({ error: "Badge not found" });
      return;
    }
    const profile = await prisma.profile.findUnique({ where: { user_id: req.auth.userId! }, select: { display_name: true } });

    const image = await renderBadgeCard({
      badgeTitle: userBadge.badge.title,
      badgeDescription: userBadge.badge.description,
      coinReward: userBadge.badge.coin_reward,
      userName: profile?.display_name || "একজন পাঠক",
    });
    res.set({ "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" });
    res.send(image);
  } catch (error) {
    console.error("[share] badge card generation failed:", error);
    res.status(500).json({ error: "Image generation failed" });
  }
});

// ── GET /api/v1/share/weekly-report.png ───────────────────────────────────────
shareRestRouter.get("/weekly-report.png", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const [report, profile] = await Promise.all([
      getUserWeeklyReport(userId),
      prisma.profile.findUnique({ where: { user_id: userId }, select: { display_name: true } }),
    ]);
    const topBook = report.books[0]?.title ?? null;

    const image = await renderWeeklyReportCard({
      userName: profile?.display_name || "একজন পাঠক",
      totalMinutes: report.totalMinutes,
      bookCount: report.bookCount,
      weekOverWeekPercent: report.weekOverWeekPercent,
      topBookTitle: topBook,
    });
    res.set({ "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" });
    res.send(image);
  } catch (error) {
    console.error("[share] weekly report card generation failed:", error);
    res.status(500).json({ error: "Image generation failed" });
  }
});
