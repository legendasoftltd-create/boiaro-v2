import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { isFirebaseConfigured } from "../../lib/firebase.js";

export const notificationsRestRouter = Router();

// ── GET /api/v1/notifications ────────────────────────────────────────────────
// Returns last 50 notifications for the authenticated user.
notificationsRestRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userNotifications = await prisma.userNotification.findMany({
      where: { user_id: req.auth.userId! },
      include: { notification: true },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    res.json({
      notifications: userNotifications.map((un) => ({
        id: un.id,
        title: un.notification.title,
        message: un.notification.message,
        type: un.notification.type,
        link: un.notification.link ?? null,
        image_url: un.notification.image_url ?? null,
        is_read: un.is_read,
        created_at: un.created_at,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/notifications/read ─────────────────────────────────────────
// Mark one, many, or all notifications as read.
// Body: { ids: string[] }  — omit or send [] to mark ALL as read.
notificationsRestRouter.post("/read", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length > 0) {
      await prisma.userNotification.updateMany({
        where: { user_id: req.auth.userId!, id: { in: ids } },
        data: { is_read: true, read_at: new Date() },
      });
    } else {
      await prisma.userNotification.updateMany({
        where: { user_id: req.auth.userId!, is_read: false },
        data: { is_read: true, read_at: new Date() },
      });
    }
    res.json({ success: true, message: "Notifications marked as read" });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── POST /api/v1/notifications/register-token ────────────────────────────────
// Register a device push token (FCM) for the authenticated user.
// Call this after the user grants push permission and you receive an FCM token.
// Body: { token: string, platform: "android" | "ios" }
notificationsRestRouter.post("/register-token", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { token, platform = "android" } = req.body;

    if (!token || typeof token !== "string") {
      res.status(400).json({ success: false, error: "token is required" });
      return;
    }

    const validPlatforms = ["android", "ios", "web"];
    const safePlatform = validPlatforms.includes(platform) ? platform : "android";

    await (prisma as any).devicePushToken.upsert({
      where: { user_id_token: { user_id: userId, token } },
      create: { user_id: userId, token, platform: safePlatform },
      update: { platform: safePlatform, updated_at: new Date() },
    });

    res.json({
      success: true,
      push_enabled: true,
      firebase_configured: await isFirebaseConfigured(),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── DELETE /api/v1/notifications/register-token ──────────────────────────────
// Unregister a device push token (call on logout or when user disables push).
// Body: { token: string }
notificationsRestRouter.delete("/register-token", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      res.status(400).json({ success: false, error: "token is required" });
      return;
    }

    await (prisma as any).devicePushToken.deleteMany({
      where: { user_id: userId, token },
    });

    res.json({ success: true });
  } catch (error) {
    sendHttpError(res, error);
  }
});
