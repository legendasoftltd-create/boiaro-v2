import type { NextFunction, Request, Response } from "express";
import { getAuthUserFromAuthorizationHeader } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

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
//
// This used to be a bare next() that relied entirely on attachAuth being
// mounted globally — correct in practice, but any route mounted ahead of
// attachAuth and guarded by this would have silently seen no auth at all.
// It now populates req.auth itself, so it is safe in isolation, and is
// idempotent when attachAuth has already run.
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  if (!req.auth) {
    req.auth = getAuthUserFromAuthorizationHeader(req.header("authorization"));
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
