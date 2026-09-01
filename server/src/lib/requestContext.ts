import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Per-request context, so code deep in the token layer can see who is asking
 * without threading a parameter through every caller.
 *
 * Currently just the User-Agent, which is what distinguishes the legacy
 * Flutter app from every other client — see legacy client handling in auth.ts.
 */
interface RequestContext {
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  storage.run({ userAgent: req.header("user-agent") ?? null }, next);
}

export function getRequestUserAgent(): string | null {
  return storage.getStore()?.userAgent ?? null;
}

/** Test seam — runs `fn` as if it arrived with this User-Agent. */
export function withUserAgent<T>(userAgent: string | null, fn: () => T): T {
  return storage.run({ userAgent }, fn);
}
