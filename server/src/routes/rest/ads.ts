import { Router } from "express";
import { z } from "zod";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";
import { checkAndAwardBadges } from "../../services/gamification.service.js";

export const adsRestRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Shared admin guard — rejects non-admin/moderator users with 403
// ─────────────────────────────────────────────────────────────────────────────
async function assertAdmin(req: AuthenticatedRequest, res: any): Promise<boolean> {
  const userId = req.auth?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  const role = await prisma.userRole.findFirst({ where: { user_id: userId, role: { in: ["admin", "moderator"] } } });
  if (!role) { res.status(403).json({ error: "Admin access required" }); return false; }
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  📱  MOBILE / PUBLIC ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

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

// ── GET /api/v1/ads/banners?placement=&device= ───────────────────────────────
// Public. Returns active image banners optionally filtered by placement/device.
adsRestRouter.get("/banners", async (req, res) => {
  try {
    const { placement, device } = req.query;
    const where: Record<string, unknown> = { status: "active" };
    if (placement) where.placement_key = String(placement);
    const now = new Date();
    const andFilters: Record<string, unknown>[] = [
      { OR: [{ start_date: null }, { start_date: { lte: now } }] },
      { OR: [{ end_date: null }, { end_date: { gte: now } }] },
    ];
    if (device && device !== "all") {
      andFilters.push({ OR: [{ device: { in: [String(device), "all"] } }, { device: null }] });
    }
    const banners = await prisma.adBanner.findMany({
      where: {
        ...where,
        AND: andFilters,
      },
      orderBy: [{ display_order: "asc" }, { created_at: "desc" }],
      select: {
        id: true, title: true, image_url: true, destination_url: true, placement_key: true, device: true, display_order: true, impressions: true, clicks: true,
        slides: {
          orderBy: { display_order: "asc" },
          select: { id: true, image_url: true, destination_url: true, display_order: true },
        },
      },
    });
    res.json({
      // image_url/destination_url stay as a mirror of the first slide for
      // backward compatibility — new clients should render `slides` as a
      // carousel when it has more than one entry.
      banners: banners.map(b => ({
        ...b,
        image_url: b.image_url ? resolveFileUrl(b.image_url) : null,
        slides: b.slides.map(s => ({ ...s, image_url: resolveFileUrl(s.image_url) })),
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/placements ───────────────────────────────────────────────
// Public. Returns all active/enabled placement slots.
adsRestRouter.get("/placements", async (_req, res) => {
  try {
    const placements = await prisma.adPlacement.findMany({
      where: { is_enabled: true },
      orderBy: [{ display_priority: "asc" }, { placement_key: "asc" }],
      select: { placement_key: true, label: true, ad_type: true, device_visibility: true, frequency: true, display_priority: true },
    });
    res.json({ placements });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/rewarded/status ─────────────────────────────────────────
// Auth required. User's current rewarded-ad status (can_watch, cooldown, etc.).
adsRestRouter.get("/rewarded/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [settings, todayCount, lastAd] = await Promise.all([
      prisma.platformSetting.findMany({ where: { key: { in: ["ad_max_per_day", "ad_rewarded_coins", "ad_cooldown_minutes"] } } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "ad_reward", created_at: { gte: todayStart } } }),
      prisma.coinTransaction.findFirst({ where: { user_id: userId, source: "ad_reward" }, orderBy: { created_at: "desc" } }),
    ]);
    const sMap: Record<string, string> = {};
    settings.forEach(s => { sMap[s.key] = s.value; });
    const dailyLimit = parseInt(sMap.ad_max_per_day || "10", 10);
    const coinPerAd = parseInt(sMap.ad_rewarded_coins || "1", 10);
    const cooldownMinutes = parseInt(sMap.ad_cooldown_minutes || "5", 10);
    const lastAdAt = lastAd?.created_at ?? null;
    const cooldownEndsAt = lastAdAt ? new Date(lastAdAt.getTime() + cooldownMinutes * 60_000) : null;
    const cooldownSecondsLeft = cooldownEndsAt && cooldownEndsAt > new Date()
      ? Math.ceil((cooldownEndsAt.getTime() - Date.now()) / 1000) : 0;
    const remaining = Math.max(dailyLimit - todayCount, 0);
    res.json({ today_count: todayCount, daily_limit: dailyLimit, remaining, coin_per_ad: coinPerAd, cooldown_minutes: cooldownMinutes, cooldown_seconds_left: cooldownSecondsLeft, can_watch: remaining > 0 && cooldownSecondsLeft === 0, last_ad_at: lastAdAt });
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
      prisma.platformSetting.findMany({ where: { key: { in: ["ad_max_per_day", "ad_rewarded_coins", "ad_cooldown_minutes"] } } }),
      prisma.coinTransaction.count({ where: { user_id: userId, source: "ad_reward", created_at: { gte: todayStart } } }),
      prisma.coinTransaction.findFirst({ where: { user_id: userId, source: "ad_reward" }, orderBy: { created_at: "desc" } }),
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
    if (!String(placement).startsWith("quick_unlock") && cooldownMinutes > 0 && lastAd) {
      const elapsed = (Date.now() - lastAd.created_at.getTime()) / 1000;
      if (elapsed < cooldownMinutes * 60) {
        res.status(429).json({ success: false, reason: "cooldown", cooldown_seconds_left: Math.ceil(cooldownMinutes * 60 - elapsed) });
        return;
      }
    }
    const [, wallet] = await prisma.$transaction([
      prisma.coinTransaction.create({ data: { user_id: userId, amount: AD_REWARD, type: "earn", description: `Ad reward - ${placement}`, source: "ad_reward", reference_id: placement } }),
      prisma.userCoin.upsert({ where: { user_id: userId }, create: { user_id: userId, balance: AD_REWARD, total_earned: AD_REWARD, total_spent: 0 }, update: { balance: { increment: AD_REWARD }, total_earned: { increment: AD_REWARD } } }),
    ]);
    await prisma.rewardedAdLog.create({ data: { user_id: userId, ad_event_id: ad_event_id || `${placement}_${Date.now()}`, placement_key: placement, coins_rewarded: AD_REWARD, status: "completed" } }).catch(() => null);
    checkAndAwardBadges(userId).catch(() => null);
    res.json({ success: true, reward: AD_REWARD, new_balance: wallet.balance, today_count: todayCount + 1, remaining: Math.max(MAX_PER_DAY - todayCount - 1, 0) });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/rewarded/history ─────────────────────────────────────────
// Auth required. Returns the user's rewarded ad log.
adsRestRouter.get("/rewarded/history", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const logs = await prisma.rewardedAdLog.findMany({
      where: { user_id: req.auth.userId! },
      orderBy: { created_at: "desc" },
      take: limit,
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = logs.filter(l => l.created_at >= todayStart).length;
    const totalCoins = logs.reduce((sum, l) => sum + l.coins_rewarded, 0);
    res.json({ today_count: todayCount, total_coins_earned: totalCoins, logs });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/ads/impression ──────────────────────────────────────────────
// Auth optional. Record a banner impression. Body: { banner_id, slide_id? }
adsRestRouter.post("/impression", async (req: AuthenticatedRequest, res) => {
  try {
    const { banner_id, slide_id } = req.body;
    if (!banner_id) { res.status(400).json({ error: "banner_id is required" }); return; }
    await Promise.all([
      prisma.adBanner.update({ where: { id: banner_id }, data: { impressions: { increment: 1 } } }).catch(() => null),
      slide_id
        ? prisma.adBannerSlide.update({ where: { id: slide_id }, data: { impressions: { increment: 1 } } }).catch(() => null)
        : null,
    ]);
    res.json({ recorded: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/ads/click ───────────────────────────────────────────────────
// Auth optional. Record a banner click. Body: { banner_id, slide_id? }
adsRestRouter.post("/click", async (req: AuthenticatedRequest, res) => {
  try {
    const { banner_id, slide_id } = req.body;
    if (!banner_id) { res.status(400).json({ error: "banner_id is required" }); return; }
    await Promise.all([
      prisma.adBanner.update({ where: { id: banner_id }, data: { clicks: { increment: 1 } } }).catch(() => null),
      slide_id
        ? prisma.adBannerSlide.update({ where: { id: slide_id }, data: { clicks: { increment: 1 } } }).catch(() => null)
        : null,
    ]);
    res.json({ recorded: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  🛡️  ADMIN ENDPOINTS  (role: admin | moderator)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /api/v1/ads/admin/report ─────────────────────────────────────────────
// Admin. Overall ad performance summary.
adsRestRouter.get("/admin/report", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const [banners, rewardedLogs, todayRewardedLogs] = await Promise.all([
      prisma.adBanner.findMany({ orderBy: { impressions: "desc" }, take: 20 }),
      prisma.rewardedAdLog.findMany({ select: { coins_rewarded: true } }),
      prisma.rewardedAdLog.count({ where: { created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ]);
    const totalImpressions = banners.reduce((sum, b) => sum + Number(b.impressions || 0), 0);
    const totalClicks = banners.reduce((sum, b) => sum + Number(b.clicks || 0), 0);
    const totalCoinsGiven = rewardedLogs.reduce((sum, l) => sum + Number(l.coins_rewarded || 0), 0);
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";
    res.json({
      summary: {
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        ctr_percent: parseFloat(ctr),
        total_rewarded_ad_views: rewardedLogs.length,
        today_rewarded_ad_views: todayRewardedLogs,
        total_coins_distributed: totalCoinsGiven,
      },
      top_banners: banners.slice(0, 10).map(b => ({
        id: b.id, title: b.title, placement_key: b.placement_key,
        impressions: b.impressions, clicks: b.clicks,
        ctr: b.impressions ? ((Number(b.clicks || 0) / Number(b.impressions)) * 100).toFixed(2) : "0.00",
        status: b.status,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/admin/banners ────────────────────────────────────────────
// Admin. List all banners (including inactive).
adsRestRouter.get("/admin/banners", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const { placement, status } = req.query;
    const where: Record<string, unknown> = {};
    if (placement) where.placement_key = String(placement);
    if (status) where.status = String(status);
    const banners = await prisma.adBanner.findMany({
      where,
      orderBy: [{ display_order: "asc" }, { created_at: "desc" }],
      include: { slides: { orderBy: { display_order: "asc" } } },
    });
    res.json({
      banners: banners.map(b => ({
        ...b,
        image_url: b.image_url ? resolveFileUrl(b.image_url) : null,
        slides: b.slides.map(s => ({ ...s, image_url: resolveFileUrl(s.image_url) })),
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

const slideSchema = z.object({
  image_url: z.string().min(1),
  destination_url: z.string().nullable().optional(),
});

// ── POST /api/v1/ads/admin/banners ───────────────────────────────────────────
// Admin. Create a new banner. Pass `slides: [{image_url, destination_url?}, ...]`
// for a multi-image carousel — omit it to fall back to the single image_url/
// destination_url fields (kept as a single-slide banner).
adsRestRouter.post("/admin/banners", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const schema = z.object({
      title: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      destination_url: z.string().nullable().optional(),
      placement_key: z.string().min(1),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
      status: z.string().default("active"),
      display_order: z.number().int().default(0),
      device: z.string().nullable().optional(),
      slides: z.array(slideSchema).optional(),
    });
    const input = schema.parse(req.body);
    const slides = input.slides?.length ? input.slides : input.image_url ? [{ image_url: input.image_url, destination_url: input.destination_url ?? null }] : [];
    if (slides.length === 0) { res.status(400).json({ error: "At least one image (image_url or slides) is required" }); return; }

    const banner = await prisma.$transaction(async (tx) => {
      const created = await tx.adBanner.create({
        data: {
          title: input.title ?? null,
          image_url: slides[0].image_url,
          destination_url: slides[0].destination_url ?? null,
          placement_key: input.placement_key,
          start_date: input.start_date ? new Date(input.start_date) : null,
          end_date: input.end_date ? new Date(input.end_date) : null,
          status: input.status,
          display_order: input.display_order,
          device: input.device ?? null,
        },
      });
      await tx.adBannerSlide.createMany({
        data: slides.map((s, i) => ({ banner_id: created.id, image_url: s.image_url, destination_url: s.destination_url ?? null, display_order: i })),
      });
      return tx.adBanner.findUniqueOrThrow({ where: { id: created.id }, include: { slides: { orderBy: { display_order: "asc" } } } });
    });
    res.status(201).json(banner);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── PUT /api/v1/ads/admin/banners/:id ────────────────────────────────────────
// Admin. Update a banner. Pass `slides` to replace the full image/link set;
// omit it to only touch the banner's own fields (title, status, schedule, etc).
adsRestRouter.put("/admin/banners/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const bannerId = String(req.params.id);
    const schema = z.object({
      title: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      destination_url: z.string().nullable().optional(),
      placement_key: z.string().min(1).optional(),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
      status: z.string().optional(),
      display_order: z.number().int().optional(),
      device: z.string().nullable().optional(),
      slides: z.array(slideSchema).optional(),
    });
    const input = schema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.placement_key) data.placement_key = input.placement_key;
    if (input.start_date !== undefined) data.start_date = input.start_date ? new Date(input.start_date) : null;
    if (input.end_date !== undefined) data.end_date = input.end_date ? new Date(input.end_date) : null;
    if (input.status) data.status = input.status;
    if (input.display_order !== undefined) data.display_order = input.display_order;
    if (input.device !== undefined) data.device = input.device;
    if (input.slides?.length) {
      data.image_url = input.slides[0].image_url;
      data.destination_url = input.slides[0].destination_url ?? null;
    } else {
      if (input.image_url !== undefined) data.image_url = input.image_url;
      if (input.destination_url !== undefined) data.destination_url = input.destination_url;
    }

    const banner = await prisma.$transaction(async (tx) => {
      const updated = await tx.adBanner.update({ where: { id: bannerId }, data });
      if (input.slides?.length) {
        await tx.adBannerSlide.deleteMany({ where: { banner_id: bannerId } });
        await tx.adBannerSlide.createMany({
          data: input.slides!.map((s, i) => ({ banner_id: bannerId, image_url: s.image_url, destination_url: s.destination_url ?? null, display_order: i })),
        });
      }
      return tx.adBanner.findUniqueOrThrow({ where: { id: bannerId }, include: { slides: { orderBy: { display_order: "asc" } } } });
    });
    res.json(banner);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── DELETE /api/v1/ads/admin/banners/:id ─────────────────────────────────────
// Admin. Delete a banner.
adsRestRouter.delete("/admin/banners/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    await prisma.adBanner.delete({ where: { id: String(req.params.id) } });
    res.json({ deleted: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/admin/campaigns ──────────────────────────────────────────
// Admin. List all ad campaigns.
adsRestRouter.get("/admin/campaigns", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const campaigns = await prisma.adCampaign.findMany({ orderBy: { created_at: "desc" } });
    res.json({ campaigns });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/ads/admin/campaigns ─────────────────────────────────────────
// Admin. Create an ad campaign.
adsRestRouter.post("/admin/campaigns", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const schema = z.object({
      name: z.string().min(1),
      ad_type: z.string().default("banner"),
      placement_key: z.string().nullable().optional(),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
      status: z.string().default("active"),
      target_page: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    });
    const input = schema.parse(req.body);
    const campaign = await prisma.adCampaign.create({
      data: {
        name: input.name, ad_type: input.ad_type,
        placement_key: input.placement_key ?? null,
        start_date: input.start_date ? new Date(input.start_date) : null,
        end_date: input.end_date ? new Date(input.end_date) : null,
        status: input.status,
        target_page: input.target_page ?? null,
        notes: input.notes ?? null,
      },
    });
    res.status(201).json(campaign);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── PUT /api/v1/ads/admin/campaigns/:id ──────────────────────────────────────
// Admin. Update an ad campaign.
adsRestRouter.put("/admin/campaigns/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const schema = z.object({
      name: z.string().min(1).optional(),
      ad_type: z.string().optional(),
      placement_key: z.string().nullable().optional(),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
      status: z.string().optional(),
      target_page: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    });
    const input = schema.parse(req.body);
    const data: Record<string, unknown> = { ...input };
    if (input.start_date !== undefined) data.start_date = input.start_date ? new Date(input.start_date) : null;
    if (input.end_date !== undefined) data.end_date = input.end_date ? new Date(input.end_date) : null;
    const campaign = await prisma.adCampaign.update({ where: { id: String(req.params.id) }, data });
    res.json(campaign);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── DELETE /api/v1/ads/admin/campaigns/:id ───────────────────────────────────
// Admin. Delete an ad campaign.
adsRestRouter.delete("/admin/campaigns/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    await prisma.adCampaign.delete({ where: { id: String(req.params.id) } });
    res.json({ deleted: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/admin/placements ─────────────────────────────────────────
// Admin. List ALL placements (including disabled).
adsRestRouter.get("/admin/placements", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const placements = await prisma.adPlacement.findMany({
      orderBy: [{ display_priority: "asc" }, { placement_key: "asc" }],
    });
    res.json({ placements });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── PUT /api/v1/ads/admin/placements/:id ─────────────────────────────────────
// Admin. Update a placement slot (enable/disable, change type, priority, etc.).
adsRestRouter.put("/admin/placements/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const schema = z.object({
      ad_type: z.string().optional(),
      frequency: z.string().nullable().optional(),
      device_visibility: z.string().nullable().optional(),
      display_priority: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
      is_enabled: z.boolean().optional(),
    });
    const { ...data } = schema.parse(req.body);
    const placement = await prisma.adPlacement.update({ where: { id: String(req.params.id) }, data });
    res.json(placement);
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/ads/admin/rewarded-logs ──────────────────────────────────────
// Admin. List rewarded ad logs across all users.
adsRestRouter.get("/admin/rewarded-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const userId = req.query.user_id ? String(req.query.user_id) : undefined;
    const placement = req.query.placement ? String(req.query.placement) : undefined;
    const where: Record<string, unknown> = {};
    if (userId) where.user_id = userId;
    if (placement) where.placement_key = placement;
    const [logs, total, totalCoins] = await Promise.all([
      prisma.rewardedAdLog.findMany({ where, orderBy: { created_at: "desc" }, take: limit }),
      prisma.rewardedAdLog.count({ where }),
      prisma.rewardedAdLog.aggregate({ where, _sum: { coins_rewarded: true } }),
    ]);
    res.json({ total, total_coins_distributed: totalCoins._sum.coins_rewarded ?? 0, logs });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── PATCH /api/v1/ads/admin/settings ─────────────────────────────────────────
// Admin. Update one or more ad platform settings.
// Body: { key: string, value: string }[] OR { [key]: value }
adsRestRouter.patch("/admin/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!await assertAdmin(req, res)) return;
    const allowedKeys = [
      "ad_system_enabled", "ad_provider_type",
      "ad_adsense_publisher_id", "ad_web_banner_unit_id", "ad_rewarded_unit_id",
      "ad_premium_hide_ads", "ad_free_show_ads", "ad_country_targeting",
      "ad_rewarded_coins", "ad_max_per_day", "ad_cooldown_minutes",
    ];
    const body = req.body as Record<string, string>;
    const updates = Object.entries(body).filter(([k]) => allowedKeys.includes(k));
    if (updates.length === 0) {
      res.status(400).json({ error: "No valid ad setting keys provided", allowed_keys: allowedKeys });
      return;
    }
    await Promise.all(
      updates.map(([key, value]) =>
        prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: String(value) },
          update: { value: String(value) },
        })
      )
    );
    res.json({ updated: updates.map(([k]) => k) });
  } catch (error) {
    sendHttpError(res, error);
  }
});
