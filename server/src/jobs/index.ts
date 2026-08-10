import cron from "node-cron";
import { runInactivityAlerts } from "./inactivityAlerts.js";
import { runStreakAlerts } from "./streakAlerts.js";
import { runWeeklySummary } from "./weeklySummary.js";
import { runCompetitionPayouts } from "./competitionPayouts.js";
import { runMonthlyLeaderboardLock } from "./monthlyLeaderboardLock.js";
import { runShowReminders } from "./showReminders.js";
import { runStreamReconnectSweep } from "./streamReconnect.js";
import { runRecordingRetentionSweep } from "./recordingRetention.js";
import { runIcecastListenerPoll } from "./icecastListenerPoll.js";

/**
 * Registers all recurring background jobs. Called once at server startup
 * (see index.ts). This is the only scheduler in the codebase — if you're
 * adding a new time-triggered feature (a new alert type, a competition
 * payout sweep, etc.), register it here rather than starting a second
 * cron instance elsewhere.
 *
 * Times are server-local. All jobs are self-contained (skip already-alerted
 * users) so a missed run or an overlapping manual invocation is harmless.
 */
export function startScheduledJobs(): void {
  // Daily at 10:00 — inactivity alerts
  cron.schedule("0 10 * * *", () => {
    runInactivityAlerts()
      .then((r) => r.sent && console.log(`[jobs] inactivityAlerts: sent ${r.sent}`))
      .catch((err) => console.error("[jobs] inactivityAlerts failed:", err));
  });

  // Daily at 20:00 — streak-ending-soon alerts
  cron.schedule("0 20 * * *", () => {
    runStreakAlerts()
      .then((r) => r.sent && console.log(`[jobs] streakAlerts: sent ${r.sent}`))
      .catch((err) => console.error("[jobs] streakAlerts failed:", err));
  });

  // Weekly, Sunday at 18:00 — weekly reading report ready notification
  cron.schedule("0 18 * * 0", () => {
    runWeeklySummary()
      .then((r) => r.sent && console.log(`[jobs] weeklySummary: sent ${r.sent}`))
      .catch((err) => console.error("[jobs] weeklySummary failed:", err));
  });

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

  // Daily at 04:00 — delete draft/rejected recordings past retention, and
  // published ones too if an explicit published-retention limit is set
  cron.schedule("0 4 * * *", () => {
    runRecordingRetentionSweep()
      .then((r) => (r.draftsDeleted || r.publishedDeleted) && console.log(`[jobs] recordingRetention: drafts=${r.draftsDeleted} published=${r.publishedDeleted}`))
      .catch((err) => console.error("[jobs] recordingRetention failed:", err));
  });

  // Every minute — sample Icecast's real listener count (see radioAnalytics'
  // peak/average, which reads these samples rather than ListenerSession)
  cron.schedule("* * * * *", () => {
    runIcecastListenerPoll().catch((err) => console.error("[jobs] icecastListenerPoll failed:", err));
  });

  console.log("[jobs] scheduled jobs registered (inactivity, streak, weekly summary, competition payouts, monthly leaderboard lock, show reminders, stream reconnect, recording retention, icecast listener poll)");
}
