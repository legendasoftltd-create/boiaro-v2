import { prisma } from "./prisma.js";
import { sendPushToTokens } from "./firebase.js";

interface NotifyOptions {
  title: string;
  message: string;
  type: string;
  link?: string | null;
  /** Which NotificationPreference column gates push delivery for this type (defaults to push_enabled only). */
  preferenceKey?: "order_enabled" | "promotional_enabled" | "reminder_enabled" | "support_enabled";
}

/**
 * Creates an in-app notification for a single user and fires a push if
 * they haven't opted out (both the global push toggle and, if given, the
 * category-specific preference). Mirrors admin.sendNotification's delivery
 * logic for one-off, code-triggered notifications (e.g. a support reply)
 * rather than admin-composed broadcast ones.
 */
export async function notifyUser(userId: string, opts: NotifyOptions): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      title: opts.title,
      message: opts.message,
      type: opts.type,
      link: opts.link ?? null,
      audience: "specific",
      target_user_id: userId,
      status: "sent",
      sent_at: new Date(),
    },
  });

  await prisma.userNotification.create({
    data: { user_id: userId, notification_id: notification.id },
  });

  const [pushEnabledRow, preference] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: "firebase_push_enabled" } }),
    prisma.notificationPreference.findUnique({ where: { user_id: userId } }),
  ]);

  const globalPushEnabled = pushEnabledRow?.value !== "false";
  const userPushEnabled = preference?.push_enabled !== false;
  const categoryEnabled = opts.preferenceKey ? preference?.[opts.preferenceKey] !== false : true;

  if (!globalPushEnabled || !userPushEnabled || !categoryEnabled) return;

  const tokens = await prisma.devicePushToken.findMany({
    where: { user_id: userId },
    select: { token: true },
  });
  if (!tokens.length) return;

  await sendPushToTokens(tokens.map((t) => t.token), {
    title: opts.title,
    message: opts.message,
    type: opts.type,
    link: opts.link,
    notificationId: notification.id,
  });
}
