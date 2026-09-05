import cron from "node-cron";
import { runInactivityAlerts } from "./inactivityAlerts.js";
import { runWeeklySummary } from "./weeklySummary.js";
import { runCompetitionPayouts } from "./competitionPayouts.js";
import { runMonthlyLeaderboardLock } from "./monthlyLeaderboardLock.js";
import { runShowReminders } from "./showReminders.js";
import { runStreamReconnectSweep } from "./streamReconnect.js";
import { runRecordingRetentionSweep } from "./recordingRetention.js";
import { runEpisodeScheduledPublish } from "./episodePublish.js";
import { runIcecastListenerPoll } from "./icecastListenerPoll.js";
import { runDatabaseBackup } from "./databaseBackup.js";
import { runPaymentExpirySweep } from "./paymentExpiry.js";
import { runSocialAutoBroadcast } from "./socialAutoBroadcast.js";

/**
 * Registers all recurring background jobs. Called once at server startup
 * (see index.ts). This is the only scheduler in the codebase — if you're
 * adding a new time-triggered feature (a new alert type, a competition
 * payout sweep, etc.), register it here rather than starting a second
 * cron instance elsewhere.
 *
 * Daily/weekly jobs are pinned to Asia/Dhaka (the app's audience timezone)
 * via the `timezone` option — NOT server-local time. The host's own OS
 * timezone can differ from Dhaka and shifts with its own DST rules, so
 * relying on "server-local" silently drifts these jobs off their intended
 * Dhaka wall-clock time (e.g. a "20:00 server-local" streak alert meant to
 * land near Dhaka midnight would land an hour off once the host's DST
 * offset changes). Sub-daily sweep jobs (every minute/5 minutes/hourly)
 * don't need a timezone since their cadence is timezone-independent.
 *
 * All jobs are self-contained (skip already-alerted users) so a missed
 * run or an overlapping manual invocation is harmless.
 */
const DHAKA = { timezone: "Asia/Dhaka" };

export function startScheduledJobs(): void {
  // Daily at 10:00 Dhaka — inactivity alerts
  cron.schedule("0 10 * * *", () => {
    runInactivityAlerts()
      .then((r) => r.sent && console.log(`[jobs] inactivityAlerts: sent ${r.sent}`))
      .catch((err) => console.error("[jobs] inactivityAlerts failed:", err));
  }, DHAKA);

  // Streak-ending-soon push notifications (runStreakAlerts, in ./streakAlerts.js)
  // are intentionally NOT scheduled — every user who had a streak at risk got
  // pushed a "your streak ends today!" notification daily at 20:00 Dhaka,
  // which caused a real (not fake) but unwanted spike of app opens on the
  // admin dashboard's Active Now count every evening. Streak tracking itself
  // (accrual, lapsing at Dhaka midnight) lives entirely outside this job and
  // is unaffected — this only ever sent the reminder push, nothing else.

  // Weekly, Sunday at 18:00 Dhaka — weekly reading report ready notification
  cron.schedule("0 18 * * 0", () => {
    runWeeklySummary()
      .then((r) => r.sent && console.log(`[jobs] weeklySummary: sent ${r.sent}`))
      .catch((err) => console.error("[jobs] weeklySummary failed:", err));
  }, DHAKA);

  // Hourly — pay out & close competitions whose end_at has passed
  cron.schedule("15 * * * *", () => {
    runCompetitionPayouts()
      .then((r) => r.processed && console.log(`[jobs] competitionPayouts: processed ${r.processed}`))
      .catch((err) => console.error("[jobs] competitionPayouts failed:", err));
  });

  // Hourly, at :20 — lock the previous Dhaka calendar month's leaderboard
  // once it's fully ended and pay out any auto-coin prizes (idempotent —
  // skips metrics already locked, cheap no-op most hours)
  cron.schedule("20 * * * *", () => {
    runMonthlyLeaderboardLock()
      .then((r) => r.locked && console.log(`[jobs] monthlyLeaderboardLock: locked ${r.locked} metric(s)`))
      .catch((err) => console.error("[jobs] monthlyLeaderboardLock failed:", err));
  });

  // Every 5 minutes — show-starting-soon reminders for followers
  cron.schedule("*/5 * * * *", () => {
    runShowReminders()
      .then((r) => r.sent && console.log(`[jobs] showReminders: sent ${r.sent}`))
      .catch((err) => console.error("[jobs] showReminders failed:", err));
  });

  // Every minute — flip stale live sessions to "reconnecting", then
  // auto-end ones that stay stale past the timeout
  cron.schedule("* * * * *", () => {
    runStreamReconnectSweep()
      .then((r) => (r.markedReconnecting || r.autoEnded) && console.log(`[jobs] streamReconnect: reconnecting=${r.markedReconnecting} ended=${r.autoEnded}`))
      .catch((err) => console.error("[jobs] streamReconnect failed:", err));
  });

  // Every minute — release On Air episodes whose scheduled publish time has
  // passed (the publish form's "Schedule Publish")
  cron.schedule("* * * * *", () => {
    runEpisodeScheduledPublish()
      .then((r) => r.published && console.log(`[jobs] episodePublish: published ${r.published}`))
      .catch((err) => console.error("[jobs] episodePublish failed:", err));
  });

  // Daily at 04:00 Dhaka — delete draft/rejected recordings past retention, and
  // published ones too if an explicit published-retention limit is set
  cron.schedule("0 4 * * *", () => {
    runRecordingRetentionSweep()
      .then((r) => (r.draftsDeleted || r.publishedDeleted) && console.log(`[jobs] recordingRetention: drafts=${r.draftsDeleted} published=${r.publishedDeleted}`))
      .catch((err) => console.error("[jobs] recordingRetention failed:", err));
  }, DHAKA);

  // Every minute — sample Icecast's real listener count (see radioAnalytics'
  // peak/average, which reads these samples rather than ListenerSession)
  cron.schedule("* * * * *", () => {
    runIcecastListenerPoll().catch((err) => console.error("[jobs] icecastListenerPoll failed:", err));
  });

  // Every 15 minutes — expire long-abandoned SSLCommerz/bKash/Nagad checkouts
  // (order or subscription) that never got a success/fail/cancel callback or
  // IPN, so they settle into "payment_failed" instead of sitting open forever
  // and skewing the Live Monitoring payment success rate.
  cron.schedule("*/15 * * * *", () => {
    runPaymentExpirySweep()
      .then((r) => (r.ordersExpired || r.subscriptionsExpired) && console.log(`[jobs] paymentExpiry: orders=${r.ordersExpired} subscriptions=${r.subscriptionsExpired}`))
      .catch((err) => console.error("[jobs] paymentExpiry failed:", err));
  });

  // Every minute — scheduled Social Live auto-start / auto-stop. Idempotent:
  // it checks for a broadcast already attached to the schedule before acting,
  // so a repeated run (or an overlapping manual invocation) cannot produce a
  // second encoder.
  cron.schedule("* * * * *", () => {
    runSocialAutoBroadcast()
      .then((r) => (r.started || r.stopped) && console.log(`[jobs] socialAutoBroadcast: started=${r.started} stopped=${r.stopped}`))
      .catch((err) => console.error("[jobs] socialAutoBroadcast failed:", err));
  });

  // Daily at 03:00 Dhaka — full database backup to S3/R2 (see
  // AdminBackupStatus.tsx for the real catalog this feeds). Runs before the
  // 04:00 recording-retention sweep so a backup always reflects what's about
  // to be cleaned up, not after.
  cron.schedule("0 3 * * *", () => {
    runDatabaseBackup()
      .then((r) => console.log(`[jobs] databaseBackup: uploaded ${r.key} (${(r.sizeBytes / 1024 / 1024).toFixed(1)} MB), ${r.deletedExpired} expired cleaned up`))
      .catch((err) => console.error("[jobs] databaseBackup failed:", err));
  }, DHAKA);

  console.log("[jobs] scheduled jobs registered (inactivity, weekly summary, competition payouts, monthly leaderboard lock, show reminders, stream reconnect, recording retention, icecast listener poll, payment expiry, database backup, social auto-broadcast)");
}
