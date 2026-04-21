import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import jwt from "jsonwebtoken";

export interface Context {
  userId: string | null;
  userEmail: string | null;
}

export function createContext({ req }: CreateExpressContextOptions): Context {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return { userId: null, userEmail: null };

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      email: string;
    };
    return { userId: payload.sub, userEmail: payload.email };
  } catch {
    return { userId: null, userEmail: null };
  }
}
