import type { NextFunction, Request, Response } from "express";

/**
 * Normalises every REST error body to one shape without changing what any
 * existing field means.
 *
 * Handlers were written across two eras: some return the unified envelope from
 * sendHttpError (`{ success:false, error:<CODE>, message }`), while ~200 early
 * returns answer with a bare `{ error: "<human text>" }`. Clients therefore had
 * to branch on prose and could not tell a failure from a success by shape
 * alone.
 *
 * Rewriting all 200 call sites would have flipped `error` from prose to a code
 * and broken every client that displays `err.error` directly. Instead this
 * shapes the response on the way out, so after it every 4xx/5xx JSON body has:
 *
 *   success: false          — always present, so failure is detectable by shape
 *   message: <human text>   — always present and always human-readable
 *   error:   <unchanged>    — whatever the handler already sent
 *
 * New code should still use sendHttpError / sendHttpFail, which produce a
 * stable machine-readable `error` code; this only backfills the older handlers.
 */
const STATUS_FALLBACK: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  402: "Payment required",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  410: "Gone",
  415: "Unsupported media type",
  422: "Unprocessable entity",
  429: "Too many requests",
  500: "Internal server error",
  502: "Upstream error",
};

export function normalizeErrorShape(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = function patchedJson(body: unknown) {
    if (res.statusCode < 400 || body === null || typeof body !== "object" || Array.isArray(body)) {
      return originalJson(body);
    }

    const shaped = body as Record<string, unknown>;
    const message =
      typeof shaped.message === "string" && shaped.message
        ? shaped.message
        : typeof shaped.error === "string" && shaped.error
          ? shaped.error
          : typeof shaped.reason === "string" && shaped.reason
            ? shaped.reason
            : STATUS_FALLBACK[res.statusCode] ?? "Request failed";

    return originalJson({
      success: false,
      error: shaped.error ?? STATUS_FALLBACK[res.statusCode] ?? "ERROR",
      ...shaped,
      message,
    });
  } as Response["json"];

  next();
}
