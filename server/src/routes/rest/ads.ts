import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";

export const adsRestRouter = Router();

// ── GET /api/v1/ads/settings ─────────────────────────────────────────────────
// Public. Returns ad system configuration for the mobile app.
adsRestRouter.get("/settings", async (_req, res) => {
  try {
    const keys = [
      "ad_system_enabled", "ad_provider_type",
      "ad_adsense_publisher_id", "ad_web_banner_unit_id", "ad_rewarded_unit_id",
      "ad_premium_hide_ads", "ad_free_show_ads", "ad_country_targeting",
      "ad_rewarded_coins", "ad_max_per_day", "ad_cooldown_minutes",
    ];
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value; });

    res.json({
      system_enabled: map.ad_system_enabled === "true",
      provider_type: map.ad_provider_type || "none",
      publisher_id: map.ad_adsense_publisher_id || null,
      web_banner_unit_id: map.ad_web_banner_unit_id || null,
      rewarded_unit_id: map.ad_rewarded_unit_id || null,
      premium_hide_ads: map.ad_premium_hide_ads !== "false",
      free_show_ads: map.ad_free_show_ads !== "false",
      country_targeting: map.ad_country_targeting
        ? map.ad_country_targeting.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [],
      rewarded_coins: parseInt(map.ad_rewarded_coins || "1", 10),
      max_per_day: parseInt(map.ad_max_per_day || "10", 10),
      cooldown_minutes: parseInt(map.ad_cooldown_minutes || "5", 10),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/banners?placement=homepage_top&device=mobile ─────────────
// Public. Returns active image banners optionally filtered by placement/device.
adsRestRouter.get("/banners", async (req, res) => {
  try {
    const { placement, device } = req.query;
    const where: Record<string, unknown> = { status: "active" };
    if (placement) where.placement_key = String(placement);
    if (device && device !== "all") where.device = { in: [String(device), "all", null] };

    const now = new Date();
    const banners = await prisma.adBanner.findMany({
      where: {
        ...where,
        OR: [{ start_date: null }, { start_date: { lte: now } }],
        AND: [{ OR: [{ end_date: null }, { end_date: { gte: now } }] }],
      },
      orderBy: [{ display_order: "asc" }, { created_at: "desc" }],
      select: {
        id: true,
        title: true,
        image_url: true,
        destination_url: true,
        placement_key: true,
        device: true,
        display_order: true,
        impressions: true,
        clicks: true,
      },
    });

    res.json({
      banners: banners.map(b => ({
        ...b,
        image_url: b.image_url ? resolveFileUrl(b.image_url) : null,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/placements ───────────────────────────────────────────────
// Public. Returns all active placement slots.
adsRestRouter.get("/placements", async (_req, res) => {
  try {
    const placements = await prisma.adPlacement.findMany({
      where: { is_enabled: true },
      orderBy: [{ display_priority: "asc" }, { placement_key: "asc" }],
      select: {
        placement_key: true,
        label: true,
        ad_type: true,
        device_visibility: true,
        frequency: true,
        display_priority: true,
      },
    });
    res.json({ placements });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/rewarded/status ─────────────────────────────────────────
// Auth required. Returns the user's current rewarded ad status.
adsRestRouter.get("/rewarded/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [settings, todayCount, lastAd] = await Promise.all([
      prisma.platformSetting.findMany({
        where: { key: { in: ["ad_max_per_day", "ad_rewarded_coins", "ad_cooldown_minutes"] } },
      }),
      prisma.coinTransaction.count({
        where: { user_id: userId, source: "ad_reward", created_at: { gte: todayStart } },
      }),
      prisma.coinTransaction.findFirst({
        where: { user_id: userId, source: "ad_reward" },
        orderBy: { created_at: "desc" },
      }),
    ]);

    const sMap: Record<string, string> = {};
    settings.forEach(s => { sMap[s.key] = s.value; });
    const dailyLimit = parseInt(sMap.ad_max_per_day || "10", 10);
    const coinPerAd = parseInt(sMap.ad_rewarded_coins || "1", 10);
    const cooldownMinutes = parseInt(sMap.ad_cooldown_minutes || "5", 10);
    const lastAdAt = lastAd?.created_at ?? null;
    const cooldownEndsAt = lastAdAt ? new Date(lastAdAt.getTime() + cooldownMinutes * 60_000) : null;
    const cooldownSecondsLeft = cooldownEndsAt && cooldownEndsAt > new Date()
      ? Math.ceil((cooldownEndsAt.getTime() - Date.now()) / 1000)
      : 0;
    const remaining = Math.max(dailyLimit - todayCount, 0);

    res.json({
      today_count: todayCount,
      daily_limit: dailyLimit,
      remaining,
      coin_per_ad: coinPerAd,
      cooldown_minutes: cooldownMinutes,
      cooldown_seconds_left: cooldownSecondsLeft,
      can_watch: remaining > 0 && cooldownSecondsLeft === 0,
      last_ad_at: lastAdAt,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/ads/rewarded/claim ─────────────────────────────────────────
// Auth required. Claim reward after watching a rewarded ad.
// Body: { placement: string, ad_event_id?: string }
adsRestRouter.post("/rewarded/claim", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { placement = "general", ad_event_id } = req.body;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [settings, todayCount, lastAd] = await Promise.all([
      prisma.platformSetting.findMany({
        where: { key: { in: ["ad_max_per_day", "ad_rewarded_coins", "ad_cooldown_minutes"] } },
      }),
      prisma.coinTransaction.count({
        where: { user_id: userId, source: "ad_reward", created_at: { gte: todayStart } },
      }),
      prisma.coinTransaction.findFirst({
        where: { user_id: userId, source: "ad_reward" },
        orderBy: { created_at: "desc" },
      }),
    ]);

    const sMap: Record<string, string> = {};
    settings.forEach(s => { sMap[s.key] = s.value; });
    const MAX_PER_DAY = parseInt(sMap.ad_max_per_day || "10", 10);
    const AD_REWARD = parseInt(sMap.ad_rewarded_coins || "1", 10);
    const cooldownMinutes = parseInt(sMap.ad_cooldown_minutes || "5", 10);

    if (todayCount >= MAX_PER_DAY) {
      res.status(400).json({ success: false, reason: "daily_limit_reached", daily_limit: MAX_PER_DAY, today_count: todayCount });
      return;
    }

    // Server-side cooldown check (skip for quick_unlock placements)
    if (!placement.startsWith("quick_unlock") && cooldownMinutes > 0 && lastAd) {
      const elapsed = (Date.now() - lastAd.created_at.getTime()) / 1000;
      if (elapsed < cooldownMinutes * 60) {
        const remaining = Math.ceil(cooldownMinutes * 60 - elapsed);
        res.status(429).json({ success: false, reason: "cooldown", cooldown_seconds_left: remaining });
        return;
      }
    }

    const [, wallet] = await prisma.$transaction([
      prisma.coinTransaction.create({
        data: {
          user_id: userId, amount: AD_REWARD, type: "earn",
          description: `Ad reward - ${placement}`, source: "ad_reward", reference_id: placement,
        },
      }),
      prisma.userCoin.upsert({
        where: { user_id: userId },
        create: { user_id: userId, balance: AD_REWARD, total_earned: AD_REWARD, total_spent: 0 },
        update: { balance: { increment: AD_REWARD }, total_earned: { increment: AD_REWARD } },
      }),
    ]);

    await prisma.rewardedAdLog.create({
      data: {
        user_id: userId,
        ad_event_id: ad_event_id || `${placement}_${Date.now()}`,
        placement_key: placement,
        coins_rewarded: AD_REWARD,
        status: "completed",
      },
    }).catch(() => null);

    res.json({
      success: true,
      reward: AD_REWARD,
      new_balance: wallet.balance,
      today_count: todayCount + 1,
      remaining: Math.max(MAX_PER_DAY - todayCount - 1, 0),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/ads/impression ──────────────────────────────────────────────
// Auth optional. Record a banner impression (when banner becomes visible).
adsRestRouter.post("/impression", async (req: AuthenticatedRequest, res) => {
  try {
    const { banner_id } = req.body;
    if (!banner_id) { res.status(400).json({ error: "banner_id is required" }); return; }
    await prisma.adBanner.update({
      where: { id: banner_id },
      data: { impressions: { increment: 1 } },
    }).catch(() => null);
    res.json({ recorded: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/ads/click ───────────────────────────────────────────────────
// Auth optional. Record a banner click.
adsRestRouter.post("/click", async (req: AuthenticatedRequest, res) => {
  try {
    const { banner_id } = req.body;
    if (!banner_id) { res.status(400).json({ error: "banner_id is required" }); return; }
    await prisma.adBanner.update({
      where: { id: banner_id },
      data: { clicks: { increment: 1 } },
    }).catch(() => null);
    res.json({ recorded: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});
