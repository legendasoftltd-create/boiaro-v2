import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import { signTokens, verifyRefreshToken } from "../lib/auth.js";
import { resolveUrls } from "../lib/mediaUrl.js";
import { resolveDeviceSessionOnLogin, touchOrCreateDeviceSessionOnRefresh } from "./deviceSession.service.js";
import type { DeviceLoginParams, DeviceSessionInfo } from "./deviceSession.service.js";
import type { signInSchema } from "../schemas/auth.js";
import type { z } from "zod";
import { POINTS } from "./gamification.service.js";
import { bustRevocationCache } from "../lib/sessionRevocation.js";

export function deviceLimitError(limit: number, devices: DeviceSessionInfo[]): TRPCError {
  return new TRPCError({
    code: "FORBIDDEN",
    message: "Device limit reached for your plan. Remove a device to continue.",
    cause: { type: "DEVICE_LIMIT_REACHED", limit, devices },
  });
}

// Completes a pending referral and grants coins to both parties.
// Called on first signIn so coins are only granted to users who actually log in.
async function completePendingReferral(userId: string): Promise<void> {
  const pending = await prisma.referral.findFirst({
    where: { referred_user_id: userId, status: "pending", reward_status: "pending" },
  });
  if (!pending) return;

  const [signupRewardSetting, referredBonusSetting] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: "referral_signup_reward" } }),
    prisma.platformSetting.findUnique({ where: { key: "referral_referred_bonus" } }),
  ]);
  const signupReward = parseInt(signupRewardSetting?.value || "20", 10);
  const referredBonus = parseInt(referredBonusSetting?.value || "10", 10);

  await prisma.$transaction([
    prisma.referral.update({
      where: { id: pending.id },
      data: { status: "completed", reward_status: "paid", completed_at: new Date(), reward_amount: signupReward },
    }),
    prisma.coinTransaction.create({
      data: { user_id: pending.referrer_id, amount: signupReward, type: "earn", description: "রেফারেল বোনাস - নতুন সদস্য", source: "referral_reward" },
    }),
    prisma.userCoin.upsert({
      where: { user_id: pending.referrer_id },
      create: { user_id: pending.referrer_id, balance: signupReward, total_earned: signupReward, total_spent: 0 },
      update: { balance: { increment: signupReward }, total_earned: { increment: signupReward } },
    }),
    prisma.coinTransaction.create({
      data: { user_id: userId, amount: referredBonus, type: "bonus", description: "নতুন সদস্য রেফারেল বোনাস", source: "referral_bonus" },
    }),
    prisma.userCoin.upsert({
      where: { user_id: userId },
      create: { user_id: userId, balance: referredBonus, total_earned: referredBonus, total_spent: 0 },
      update: { balance: { increment: referredBonus }, total_earned: { increment: referredBonus } },
    }),
    prisma.gamificationPoint.create({
      data: { user_id: pending.referrer_id, points: POINTS.REFERRAL_SUCCESS, event_type: "referral_success", reference_id: pending.id },
    }),
  ]);
}

export async function signInUser(
  input: z.infer<typeof signInSchema>,
  requestInfo?: { ip?: string | null; userAgent?: string | null }
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { profile: true, roles: true },
    omit: { password_hash: false }, // needed for the bcrypt.compare below
  });
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
  }

  if (user.profile?.deleted_at) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account deleted. Contact support.",
    });
  }
  if (user.profile?.is_active === false) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account deactivated. Contact support.",
    });
  }

  // Complete any pending referral on first login (deferred from signup to prevent abuse)
  completePendingReferral(user.id).catch(() => {});

  const deviceResult = await resolveDeviceSessionOnLogin(user.id, { ...input, ...requestInfo });
  if (deviceResult.allowed === false) throw deviceLimitError(deviceResult.limit, deviceResult.devices);

  const { accessToken, refreshToken } = signTokens(user.id, user.email, input.platform);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      roles: user.roles.map((role) => role.role),
      profile: user.profile,
    },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, roles: true },
  });

  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  return {
    id: user.id,
    email: user.email,
    roles: user.roles.map((role) => role.role),
    profile: user.profile ? resolveUrls(user.profile) : null,
  };
}

export async function refreshAuthTokens(refreshToken: string, deviceParams: DeviceLoginParams = {}) {
  try {
    const payload = verifyRefreshToken(refreshToken);

    // Kill switch: "sign out from all devices", a password change or a security
    // revoke stamps sessions_valid_from, and every token issued before that
    // instant stops renewing. Access tokens already in flight keep working
    // until they expire (1h), which bounds how long a revoked session lives.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { sessions_valid_from: true },
    });
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Session is no longer valid" });
    }
    if (user.sessions_valid_from && payload.iat) {
      const issuedAt = payload.iat * 1000;
      if (issuedAt < user.sessions_valid_from.getTime()) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Session was revoked. Please sign in again." });
      }
    }

    await touchOrCreateDeviceSessionOnRefresh(payload.sub, deviceParams);

    // Renewal keeps the lifetime the session was opened with, so an app
    // session stays a 90-day one even when the refresh call carries no
    // platform hint. Rotating on every refresh is what makes the window a
    // sliding inactivity window rather than a hard expiry.
    const platform = deviceParams.platform ?? (payload.plt === "app" ? "android" : undefined);
    return signTokens(payload.sub, payload.email, platform);
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid refresh token",
    });
  }
}

/**
 * Ends every session for a user: "sign out from all devices", and the forced
 * revoke after a password change or reset. Device rows are cleared too so the
 * plan's device-count allowance is freed.
 */
export async function revokeAllSessions(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { sessions_valid_from: new Date() },
  });
  // Without this the cached "not revoked" answer would keep letting existing
  // access tokens through until the TTL lapsed.
  bustRevocationCache(userId);
  await prisma.deviceSession.deleteMany({ where: { user_id: userId } });
}
