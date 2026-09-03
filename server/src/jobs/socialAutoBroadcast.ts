import { prisma } from "../lib/prisma.js";
import { dhakaWallClock } from "../lib/timezone.js";
import { getRadioSettingBool } from "../lib/radioSettings.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { startBroadcast, stopBroadcast } from "../services/socialLive.service.js";

/**
 * Scheduled auto-start and auto-stop for Social Live (§13).
 *
 * Registered in jobs/index.ts alongside every other recurring job — never a
 * second scheduler, which that file asks for explicitly.
 *
 * Three properties the brief calls for, and how each is met:
 *
 *   - **Idempotent.** Both halves check the database for a broadcast already
 *     attached to the schedule before acting, so running twice in the same
 *     minute, or re-running by hand mid-window, does nothing the first run
 *     did not already do.
 *   - **No duplicate encoder.** Even if that check raced, startBroadcast is
 *     behind the partial unique index on the destinations table, which is
 *     what actually makes a second encoder impossible.
 *   - **Safe repeated auto-stop.** stopBroadcast is a no-op once a broadcast
 *     has ended.
 *
 * Times are compared in Dhaka wall-clock (see lib/timezone.ts), never the
 * host's own timezone — the same technique jobs/showReminders.ts uses.
 */

const TERMINAL_STATES = ["OFFLINE", "FAILED"];

export async function runSocialAutoBroadcast(): Promise<{ started: number; stopped: number }> {
  // Two switches: the feature itself, and automation specifically. An admin
  // who wants manual-only control turns off the second and keeps the first.
  if (!(await getRadioSettingBool("social_live_enabled"))) return { started: 0, stopped: 0 };
  if (!(await getRadioSettingBool("social_auto_start_enabled"))) return { started: 0, stopped: 0 };

  const dhakaNow = dhakaWallClock(new Date());
  const currentDay = dhakaNow.getUTCDay();
  const todayStr = dhakaNow.toISOString().slice(0, 10);

  const schedules = await prisma.showSchedule.findMany({
    where: {
      status: "active",
      is_active: true,
      OR: [
        { schedule_type: "recurring", day_of_week: currentDay },
        {
          schedule_type: "one_time",
          specific_date: {
            gte: new Date(`${todayStr}T00:00:00.000Z`),
            lt: new Date(`${todayStr}T23:59:59.999Z`),
          },
        },
      ],
    },
    select: { id: true, show_title: true, start_time: true, end_time: true },
  });
  if (!schedules.length) return { started: 0, stopped: 0 };

  const settings = await prisma.showSocialSetting.findMany({
    where: { show_schedule_id: { in: schedules.map((s) => s.id) } },
  });
  if (!settings.length) return { started: 0, stopped: 0 };

  let started = 0;
  let stopped = 0;

  for (const schedule of schedules) {
    const cfg = settings.find((x) => x.show_schedule_id === schedule.id);
    if (!cfg) continue;
    if (!cfg.facebook_enabled && !cfg.youtube_enabled) continue;

    const startMins = parseClock(schedule.start_time);
    const endMins = parseClock(schedule.end_time);
    if (startMins === null || endMins === null) continue;

    const nowMins = dhakaNow.getUTCHours() * 60 + dhakaNow.getUTCMinutes();
    // A show ending before it starts has crossed midnight.
    const adjustedEnd = endMins < startMins ? endMins + 24 * 60 : endMins;

    const existing = await prisma.socialBroadcast.findFirst({
      where: { show_schedule_id: schedule.id, state: { notIn: TERMINAL_STATES } },
      orderBy: { started_at: "desc" },
      select: { id: true },
    });

    // ── auto-stop ────────────────────────────────────────────────────────
    if (existing && cfg.auto_stop && nowMins >= adjustedEnd + cfg.stop_after_minutes) {
      await stopBroadcast(existing.id, "system", "scheduled").catch(() => null);
      await logRadioAction("system", "social_auto_stopped", {
        broadcastId: existing.id,
        scheduleId: schedule.id,
        show: schedule.show_title,
      });
      stopped++;
      continue;
    }

    if (existing) continue; // already running — nothing to start

    // ── auto-start ───────────────────────────────────────────────────────
    if (!cfg.auto_start) continue;
    const opensAt = startMins - cfg.start_before_minutes;
    // Only inside the show's own window. Past the end, a missed start is a
    // missed start — quietly beginning a broadcast after the show has
    // finished would be worse than not starting at all.
    if (nowMins < opensAt || nowMins > adjustedEnd) continue;

    const platforms: string[] = [];
    if (cfg.facebook_enabled) platforms.push("facebook");
    if (cfg.youtube_enabled) platforms.push("youtube");

    const connections = await prisma.socialPlatformConnection.findMany({
      where: { platform: { in: platforms }, enabled: true },
      select: { id: true },
    });
    if (!connections.length) {
      await logRadioAction("system", "social_auto_start_skipped", {
        scheduleId: schedule.id,
        reason: "no enabled connection for the selected platforms",
      });
      continue;
    }

    try {
      // startBroadcast runs the full preflight — active feed, credentials,
      // capacity — so this does not need to re-check any of it. A failed
      // precondition is a skip, not a crash: the next minute tries again.
      const result = await startBroadcast({
        connectionIds: connections.map((c) => c.id),
        actorId: "system",
        trigger: "scheduled",
        showScheduleId: schedule.id,
      });
      await logRadioAction("system", "social_auto_started", {
        broadcastId: result.broadcastId,
        scheduleId: schedule.id,
        show: schedule.show_title,
      });
      started++;
    } catch (err: any) {
      // Expected most of the time before a show is actually on air (the feed
      // is not up yet), so this is a debug-level fact, not an error.
      console.log(`[socialAutoBroadcast] not starting "${schedule.show_title}" yet: ${err?.message}`);
    }
  }

  return { started, stopped };
}

/** "HH:MM" -> minutes since midnight, or null if unparseable. */
function parseClock(value: string): number | null {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
