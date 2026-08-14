import { TRPCError } from "@trpc/server";
import type { Response } from "express";
import { ZodError } from "zod";
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

  console.error(error);
  logSystemError("rest", error).catch(() => null);
  res.status(500).json({ success: false, error: "INTERNAL_ERROR", message: "Internal server error" });
}
