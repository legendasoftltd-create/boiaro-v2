import { prisma } from "./prisma.js";
import type { Prisma } from "../generated/prisma/index.js";

/**
 * Race-safe find-or-create for social/OAuth login flows (Google, Facebook,
 * Apple's email-fallback path). Two concurrent requests for a brand-new
 * email — a double-tapped "Sign in with Google" button, a client retry
 * after a slow response, two tabs — can both pass the initial
 * findUnique-sees-nothing check and then both attempt create(); the loser
 * used to crash with an unhandled Prisma unique-constraint error instead
 * of just returning the user the winner created. Reproduced in production:
 * "Unique constraint failed on the fields: (`email`)" from
 * handleGoogleLogin, surfaced to the user as a bare Google-auth error.
 *
 * Catching the constraint violation and re-fetching makes the whole
 * operation naturally idempotent no matter how many requests race.
 */
export async function findOrCreateUserByEmail(email: string, createData: Prisma.UserCreateInput) {
  const existing = await prisma.user.findUnique({ where: { email }, include: { profile: true, roles: true } });
  if (existing) return existing;

  try {
    return await prisma.user.create({ data: createData, include: { profile: true, roles: true } });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const winner = await prisma.user.findUnique({ where: { email }, include: { profile: true, roles: true } });
      if (winner) return winner;
    }
    throw err;
  }
}
