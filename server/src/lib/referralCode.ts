import crypto from "crypto";
import { prisma } from "./prisma.js";

function randomReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

/** Generates a referral code guaranteed not to collide with an existing one. */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomReferralCode();
    const existing = await prisma.profile.findUnique({ where: { referral_code: code }, select: { user_id: true } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique referral code after 5 attempts");
}

/**
 * Returns this user's referral code, generating and persisting one first if
 * missing — covers profiles created before the referral feature existed (a
 * one-time backfill in production found ~800 such accounts with a null
 * code). Safe to call from a read path: idempotent, only writes when the
 * code is actually absent.
 */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  const profile = await prisma.profile.findUnique({ where: { user_id: userId }, select: { referral_code: true } });
  if (!profile) return null;
  if (profile.referral_code) return profile.referral_code;

  const code = await generateUniqueReferralCode();
  const updated = await prisma.profile.update({ where: { user_id: userId }, data: { referral_code: code } });
  return updated.referral_code;
}
