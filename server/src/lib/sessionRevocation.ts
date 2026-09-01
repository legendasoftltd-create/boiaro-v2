import { prisma } from "./prisma.js";

/**
 * Enforces the session kill switch on *access* tokens, not just refreshes.
 *
 * Access tokens are stateless JWTs, so nothing used to stop one that was
 * issued before a "sign out from all devices" or a password change. At a
 * one-hour lifetime that gap closed itself quickly. It does not close itself
 * for the legacy mobile app, whose token has to last 90 days to keep the
 * session alive without a working refresh — there, an unchecked token would
 * mean a revoke that takes three months to land.
 *
 * The lookup is cached because it sits on every authenticated request. Almost
 * every user has never revoked anything, so the common answer is "null, not
 * revoked" and stays cached; a revoke busts its own entry immediately, and the
 * short TTL covers any other writer.
 */
const CACHE_TTL_MS = 60_000;

interface Entry {
  validFrom: number | null;
  cachedAt: number;
}

const cache = new Map<string, Entry>();

/** Call right after stamping sessions_valid_from so the revoke takes effect at once. */
export function bustRevocationCache(userId: string): void {
  cache.delete(userId);
}

async function revokedAt(userId: string): Promise<number | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) return hit.validFrom;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessions_valid_from: true },
  });
  const validFrom = user?.sessions_valid_from ? user.sessions_valid_from.getTime() : null;
  cache.set(userId, { validFrom, cachedAt: Date.now() });
  return validFrom;
}

/**
 * True when this token predates the user's most recent revoke and must be
 * refused. `iat` is in seconds (JWT), sessions_valid_from in milliseconds.
 *
 * A token with no `iat` cannot be placed relative to a revoke. That only
 * happens for a token we did not sign, which verification has already
 * rejected — so treat it as revoked rather than letting an unplaceable token
 * through.
 */
export async function isSessionRevoked(userId: string, iat?: number): Promise<boolean> {
  const validFrom = await revokedAt(userId);
  if (validFrom === null) return false;
  if (typeof iat !== "number") return true;
  return iat * 1000 < validFrom;
}
