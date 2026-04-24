import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAuthUserFromAuthorizationHeader } from "./lib/auth.js";

export interface Context {
  userId: string | null;
  userEmail: string | null;
}

export function createContext({ req }: CreateExpressContextOptions): Context {
  return getAuthUserFromAuthorizationHeader(req.headers.authorization);
}
