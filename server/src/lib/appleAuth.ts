import { createRemoteJWKSet, jwtVerify } from "jose";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma.js";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getAppleJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  }
  return jwks;
}

export interface AppleIdentity {
  providerId: string; // Apple's `sub` claim — stable across logins
  email: string | null;
}

// Verifies the `identityToken` JWT against Apple's published public keys.
// This is the source of truth for who the user is — the app's `providerId`/
// `email`/`firstname`/`lastname` body fields are only populated by Apple on
// the user's very first authorization, so they must never override what's
// already saved for a returning user.
export async function verifyAppleIdToken(idToken: string): Promise<AppleIdentity> {
  const audience = process.env.APPLE_BUNDLE_ID;
  if (!audience) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Server Apple login is not configured (missing APPLE_BUNDLE_ID).",
    });
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, getAppleJwks(), {
      issuer: APPLE_ISSUER,
      audience,
    }));
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Apple ID token." });
  }

  const sub = payload.sub;
  if (!sub || typeof sub !== "string") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Apple ID token is missing subject." });
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;

  return { providerId: sub, email };
}

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Resolves the Apple identity to a user, creating one if needed:
//   1. Match by apple_id (returning user) — display_name/email are never
//      touched, since the client payload is unreliable after first login.
//   2. Match by the JWT's email (links Apple to an existing password/Google/
//      Facebook account, since they all key on email).
//   3. Otherwise create a brand-new user from this first-login identity.
export async function findOrCreateAppleUser(identity: AppleIdentity, fallbackName: string | null) {
  let user = await prisma.user.findUnique({
    where: { apple_id: identity.providerId },
    include: { profile: true, roles: true },
  });

  if (!user && identity.email) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: identity.email },
      include: { profile: true, roles: true },
    });
    if (existingByEmail) {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { apple_id: identity.providerId },
        include: { profile: true, roles: true },
      });
    }
  }

  if (!user) {
    if (!identity.email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Apple did not provide an email for this account. Please grant the email scope and try again.",
      });
    }
    const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
    const referral_code = generateReferralCode();
    user = await prisma.user.create({
      data: {
        email: identity.email,
        apple_id: identity.providerId,
        password_hash,
        email_verified: true,
        profile: {
          create: {
            display_name: fallbackName || identity.email.split("@")[0],
            referral_code,
          },
        },
        roles: { create: { role: "user" } },
      },
      include: { profile: true, roles: true },
    });
  }

  return user;
}
