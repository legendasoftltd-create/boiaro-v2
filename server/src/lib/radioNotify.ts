import { prisma } from "./prisma.js";
import { notifyUser } from "./notify.js";

// "Follow" an RJ (via the generic Follow model, followee_id = rj_user_id)
// to get notified whenever they go live — no separate favorite-show model.
// Shared by both the tRPC (rj.ts) and REST (rest/radio.ts) go-live paths so
// mobile clients using the REST endpoint get the same follower push as web.
export async function notifyFollowersOfGoLive(rjUserId: string, stageName: string, showTitle: string | undefined, liveSessionId: string): Promise<void> {
  const followers = await prisma.follow.findMany({ where: { followee_id: rjUserId }, select: { follower_id: true } });
  for (const f of followers) {
    await notifyUser(f.follower_id, {
      title: `🎙️ ${stageName} BoiAro On Air-এ লাইভে এসেছেন!`,
      message: showTitle ? `"${showTitle}" এখনই শুনুন।` : "এখনই লাইভ শুনুন।",
      type: "rj_live",
      // Points at this exact broadcast, not just "/live" — several stations
      // can be live at once, so a generic link can't be trusted to still
      // land on the right one by the time the follower opens it.
      link: `/live/${liveSessionId}`,
      preferenceKey: "radio_enabled",
    }).catch(() => null);
  }
}

export async function notifyFollowersOfScheduleCancelled(rjUserId: string, showTitle: string, reason?: string | null): Promise<void> {
  const followers = await prisma.follow.findMany({ where: { followee_id: rjUserId }, select: { follower_id: true } });
  for (const f of followers) {
    await notifyUser(f.follower_id, {
      title: `❌ "${showTitle}" বাতিল হয়েছে`,
      message: reason ? reason : "এই শোটি বাতিল করা হয়েছে।",
      type: "show_cancelled",
      link: "/schedule",
      preferenceKey: "radio_enabled",
    }).catch(() => null);
  }
}

export async function notifyFollowersOfScheduleRescheduled(rjUserId: string, showTitle: string, newWhen: string): Promise<void> {
  const followers = await prisma.follow.findMany({ where: { followee_id: rjUserId }, select: { follower_id: true } });
  for (const f of followers) {
    await notifyUser(f.follower_id, {
      title: `🔁 "${showTitle}"-এর সময়সূচী পরিবর্তন হয়েছে`,
      message: `নতুন সময়: ${newWhen}`,
      type: "show_rescheduled",
      link: "/schedule",
      preferenceKey: "radio_enabled",
    }).catch(() => null);
  }
}

export async function notifyFollowersOfCatchupPublished(rjUserId: string, showTitle: string): Promise<void> {
  const followers = await prisma.follow.findMany({ where: { followee_id: rjUserId }, select: { follower_id: true } });
  for (const f of followers) {
    await notifyUser(f.follower_id, {
      title: `🎧 "${showTitle}"-এর রেকর্ডিং এখন উপলব্ধ`,
      message: "যেকোনো সময় শুনুন — ক্যাচ-আপে গিয়ে দেখুন।",
      type: "catchup_published",
      link: "/catchup",
      preferenceKey: "radio_enabled",
    }).catch(() => null);
  }
}
