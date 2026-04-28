import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

export const notificationsRestRouter = Router();

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
        is_read: un.is_read,
        created_at: un.created_at,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

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
    res.json({ message: "Notifications marked as read" });
  } catch (error) {
    sendHttpError(res, error);
  }
});
