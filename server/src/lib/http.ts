import { TRPCError } from "@trpc/server";
import type { Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/index.js";
import { logSystemError } from "./systemLog.js";

const trpcStatusMap: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

// Unified REST error response: { success: false, error: string, message: string }
export function sendHttpError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Validation failed",
      issues: error.flatten(),
    });
    return;
  }

  if (error instanceof TRPCError) {
    const cause = error.cause as { type?: string; limit?: number; devices?: unknown } | undefined;
    res.status(trpcStatusMap[error.code] ?? 500).json({
      success: false,
      error: cause?.type ?? error.code,
      message: error.message,
      ...(cause?.type === "DEVICE_LIMIT_REACHED" ? { limit: cause.limit, devices: cause.devices } : {}),
    });
    return;
  }

  // Routine database conflicts are expected outcomes, not internal failures.
  // They used to fall through to the 500 branch below, which both misled the
  // client (a duplicate slug looked like a server crash) and buried real
  // incidents under routine noise in the error log.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const target = (error.meta?.target as string[] | string | undefined);
    const field = Array.isArray(target) ? target.join(", ") : target;
    if (error.code === "P2002") {
      res.status(409).json({
        success: false,
        error: "DUPLICATE_VALUE",
        message: field ? `A record with this ${field} already exists` : "This value is already in use",
      });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({ success: false, error: "NOT_FOUND", message: "Record not found" });
      return;
    }
    if (error.code === "P2003") {
      res.status(409).json({
        success: false,
        error: "IN_USE",
        message: "This record is still referenced by other data and cannot be changed",
      });
      return;
    }
  }

  console.error(error);
  logSystemError("rest", error).catch(() => null);
  res.status(500).json({ success: false, error: "INTERNAL_ERROR", message: "Internal server error" });
}

/**
 * Single shape for expected REST failures: { success:false, error:<CODE>, message }.
 * Handlers previously returned bare `{ error: "..." }` objects on their early
 * returns, so mobile clients saw two different error shapes from the same API
 * and had to branch on prose rather than a stable code.
 */
export function sendHttpFail(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
) {
  res.status(status).json({ success: false, error: code, message, ...(extra ?? {}) });
}
