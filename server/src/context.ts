import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAuthUserFromAuthorizationHeader } from "./lib/auth.js";

export interface Context {
  userId: string | null;
  userEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  /**
   * Per-request memo for the admin permission lookup.
   *
   * The admin panel batches many procedures into a single HTTP request, and
   * the permission middleware runs once per procedure — so without this, a
   * dashboard load multiplies its 2-3 permission queries by the number of
   * procedures in the batch. One context is created per HTTP request, so
   * caching here resolves them exactly once per batch.
   *
   * Typed loosely to keep context.ts free of a dependency on the permissions
   * module (which imports Prisma).
   */
  adminAccess?: Promise<unknown>;
}

export function createContext({ req }: CreateExpressContextOptions): Context {
  const auth = getAuthUserFromAuthorizationHeader(req.headers.authorization);
  return {
    ...auth,
    ip: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}
