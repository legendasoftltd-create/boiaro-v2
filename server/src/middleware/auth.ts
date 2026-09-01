import type { NextFunction, Request, Response } from "express";
import { getAuthUserFromAuthorizationHeader } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { isSessionRevoked } from "../lib/sessionRevocation.js";

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string | null;
    userEmail: string | null;
  };
}

export async function attachAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const auth = getAuthUserFromAuthorizationHeader(req.header("authorization"));
  // A token that predates the user's last revoke is treated as absent, so
  // "sign out from all devices" and a password change take effect on the very
  // next request instead of waiting out the token's lifetime. That wait used
  // to be an hour; for the legacy mobile app, whose token must last 90 days,
  // it would otherwise be three months.
  if (auth.userId && (await isSessionRevoked(auth.userId, auth.issuedAt))) {
    req.auth = { userId: null, userEmail: null };
    next();
    return;
  }
  req.auth = auth;
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
//
// This used to be a bare next() that relied entirely on attachAuth being
// mounted globally — correct in practice, but any route mounted ahead of
// attachAuth and guarded by this would have silently seen no auth at all.
// It now populates req.auth itself, so it is safe in isolation, and is
// idempotent when attachAuth has already run.
export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  if (!req.auth) {
    await attachAuth(req, _res, () => {});
  }
  next();
}


/**
 * Roles allowed to push files into platform storage.
 *
 * The upload routes were unauthenticated; adding requireAuth closed the open
 * door, but every registered reader could still upload half-gigabyte media.
 * In practice only the admin and creator screens upload at all
 * (AdminBooks, AdminCategories, SiteImageUpload, WriterBooks,
 * EbookChapterManager, NarratorAudiobooks, AudiobookEpisodeManager,
 * PublisherBooks, AudioFileUpload) — reader avatars go through
 * /api/v1/profile/upload-image instead. So the upload surface is narrowed to
 * the roles that actually need it.
 */
const UPLOADER_ROLES = ["admin", "moderator", "writer", "publisher", "narrator", "translator", "rj"] as const;

export async function requireUploader(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const role = await prisma.userRole.findFirst({
      where: { user_id: userId, role: { in: UPLOADER_ROLES as unknown as string[] as any } },
      select: { id: true },
    });
    if (!role) {
      res.status(403).json({ error: "Your account is not permitted to upload files" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
