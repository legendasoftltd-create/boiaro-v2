import type { NextFunction, Request, Response } from "express";
import { getAuthUserFromAuthorizationHeader } from "../lib/auth.js";

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string | null;
    userEmail: string | null;
  };
}

export function attachAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  req.auth = getAuthUserFromAuthorizationHeader(req.header("authorization"));
  next();
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.auth?.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  next();
}

// Populates req.auth if a token is present but does NOT reject missing tokens.
// Use for endpoints where auth enriches the response but is not mandatory.
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  next();
}
