import { prisma } from "./prisma.js";
import { notifyUser } from "./notify.js";

// "Follow" an RJ (via the generic Follow model, followee_id = rj_user_id)
// to get notified whenever they go live — no separate favorite-show model.

const BATCH_SIZE = 25;

/**
 * Sends one notification per follower without ever going fully sequential
 * (each follower previously awaited one at a time — for an RJ with a large
 * following, that's a slow, unbatched loop, and every call site of this
 * used to be a synchronous `await` inside its own mutation, so e.g. an
 * admin cancelling a popular RJ's show would block their own request until
 * every single follower had been notified). Callers should NOT await this
 * either — invoke and let it run in the background; failures are per-
 * follower and don't affect the caller's own request either way.
 */
async function dispatchToFollowers(rjUserId: string, build: (followerId: string) => Parameters<typeof notifyUser>[1]): Promise<void> {
  const followers = await prisma.follow.findMany({ where: { followee_id: rjUserId }, select: { follower_id: true } });
  for (let i = 0; i < followers.length; i += BATCH_SIZE) {
    const batch = followers.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map((f) => notifyUser(f.follower_id, build(f.follower_id))));
  }
}

export function notifyFollowersOfGoLive(rjUserId: string, stageName: string, showTitle: string | undefined, liveSessionId: string): Promise<void> {
  return dispatchToFollowers(rjUserId, () => ({
    title: `🎙️ ${stageName} BoiAro On Air-এ লাইভে এসেছেন!`,
    message: showTitle ? `"${showTitle}" এখনই শুনুন।` : "এখনই লাইভ শুনুন।",
    type: "rj_live",
    // Points at this exact broadcast, not just "/live" — several stations
    // can be live at once, so a generic link can't be trusted to still
    // land on the right one by the time the follower opens it.
    link: `/live/${liveSessionId}`,
    preferenceKey: "radio_enabled",
  }));
}

export function notifyFollowersOfScheduleCancelled(rjUserId: string, showTitle: string, reason?: string | null): Promise<void> {
  return dispatchToFollowers(rjUserId, () => ({
    title: `❌ "${showTitle}" বাতিল হয়েছে`,
    message: reason ? reason : "এই শোটি বাতিল করা হয়েছে।",
    type: "show_cancelled",
    link: "/schedule",
    preferenceKey: "radio_enabled",
  }));
}

export function notifyFollowersOfScheduleRescheduled(rjUserId: string, showTitle: string, newWhen: string): Promise<void> {
  return dispatchToFollowers(rjUserId, () => ({
    title: `🔁 "${showTitle}"-এর সময়সূচী পরিবর্তন হয়েছে`,
    message: `নতুন সময়: ${newWhen}`,
    type: "show_rescheduled",
    link: "/schedule",
    preferenceKey: "radio_enabled",
  }));
}

export function notifyFollowersOfCatchupPublished(rjUserId: string, showTitle: string): Promise<void> {
  return dispatchToFollowers(rjUserId, () => ({
    title: `🎧 "${showTitle}"-এর রেকর্ডিং এখন উপলব্ধ`,
    message: "যেকোনো সময় শুনুন — ক্যাচ-আপে গিয়ে দেখুন।",
    type: "catchup_published",
    link: "/catchup",
    preferenceKey: "radio_enabled",
  }));
}

/**
 * A recorded show an admin published to the app's On Air → Latest Shows.
 *
 * Distinct from notifyFollowersOfCatchupPublished above, which is about the
 * older Icecast catch-up feed and links to /catchup: this deep-links straight
 * to the episode, so the tap lands on the show rather than on a list the
 * listener then has to search.
 */
export function notifyFollowersOfShowPublished(rjUserId: string, showTitle: string, episodeId: string): Promise<void> {
  return dispatchToFollowers(rjUserId, () => ({
    title: `🎧 "${showTitle}" এখন শোনা যাচ্ছে`,
    message: "সম্প্রতি প্রচারিত অনুষ্ঠানটি যেকোনো সময় শুনুন।",
    type: "catchup_published",
    link: `/shows/${episodeId}`,
    preferenceKey: "radio_enabled",
  }));
}

// Manual, RJ- or admin-initiated announcement — for anything that doesn't
// fit the automatic triggers above (a surprise show, a special guest, an
// off-schedule live). Distinct from admin.sendNotification's generic
// audience-broadcast tool: this is always scoped to one RJ's own followers
// and always respects the radio_enabled preference, same as every other
// radio notification — the generic tool does neither.
export function notifyFollowersOfSpecialAnnouncement(rjUserId: string, title: string, message: string, link?: string): Promise<void> {
  return dispatchToFollowers(rjUserId, () => ({
    title: `📢 ${title}`,
    message,
    type: "special_announcement",
    link: link || "/schedule",
    preferenceKey: "radio_enabled",
  }));
}
