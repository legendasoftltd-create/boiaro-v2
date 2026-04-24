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
