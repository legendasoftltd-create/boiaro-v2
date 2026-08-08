import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { ensureReferralCode } from "../../lib/referralCode.js";

export const referralRestRouter = Router();

// ── GET /api/v1/referral/info ────────────────────────────────────────────────
// Returns the user's referral code plus their referral history and earnings.
referralRestRouter.get("/info", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const [referralCode, profile, referrals, rewardSettings] = await Promise.all([
      ensureReferralCode(userId),
      prisma.profile.findUnique({ where: { user_id: userId }, select: { referred_by: true } }),
      prisma.referral.findMany({ where: { referrer_id: userId }, orderBy: { created_at: "desc" } }),
      prisma.platformSetting.findMany({ where: { key: { in: ["referral_signup_reward", "referral_referred_bonus"] } } }),
    ]);
    const settingMap: Record<string, string> = {};
    rewardSettings.forEach(s => { settingMap[s.key] = s.value; });
    const totalEarned = referrals.filter(r => r.reward_status === "paid").reduce((sum, r) => sum + r.reward_amount, 0);
    res.json({
      referral_code: referralCode,
      referred_by: profile?.referred_by ?? null,
      total_referrals: referrals.length,
      completed_referrals: referrals.filter(r => r.status === "completed").length,
      pending_referrals: referrals.filter(r => r.status === "pending").length,
      total_earned: totalEarned,
      signup_reward_coins: parseInt(settingMap.referral_signup_reward || "20", 10),
      referred_bonus_coins: parseInt(settingMap.referral_referred_bonus || "10", 10),
      referrals: referrals.map(r => ({
        id: r.id,
        referred_user_id: r.referred_user_id,
        status: r.status,
        reward_amount: r.reward_amount,
        reward_status: r.reward_status,
        created_at: r.created_at,
        completed_at: r.completed_at,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/referral/settings ────────────────────────────────────────────
// Public. Returns referral program reward amounts.
referralRestRouter.get("/settings", async (_req, res) => {
  try {
    const settings = await prisma.platformSetting.findMany({
      where: { key: { in: ["referral_signup_reward", "referral_referred_bonus", "referral_enabled"] } },
    });
    const map: Record<string, string> = {};
    settings.forEach(s => { map[s.key] = s.value; });
    res.json({
      enabled: map.referral_enabled !== "false",
      signup_reward_coins: parseInt(map.referral_signup_reward || "20", 10),
      referred_bonus_coins: parseInt(map.referral_referred_bonus || "10", 10),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/referral/validate/:code ──────────────────────────────────────
// Public. Check if a referral code is valid before showing the signup form.
referralRestRouter.get("/validate/:code", async (req, res) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    const profile = await prisma.profile.findUnique({
      where: { referral_code: code },
      select: { display_name: true, user_id: true },
    });
    if (!profile) {
      res.status(404).json({ valid: false, message: "Referral code not found" });
      return;
    }
    res.json({ valid: true, referrer_name: profile.display_name ?? "A Boiaro user" });
  } catch (error) {
    sendHttpError(res, error);
  }
});
