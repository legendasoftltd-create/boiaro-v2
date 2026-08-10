import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAuthUserFromAuthorizationHeader } from "./lib/auth.js";

export interface Context {
  userId: string | null;
  userEmail: string | null;
  ip: string | null;
  userAgent: string | null;
}

export function createContext({ req }: CreateExpressContextOptions): Context {
  const auth = getAuthUserFromAuthorizationHeader(req.headers.authorization);
  return {
    ...auth,
    ip: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}
