import { EgressClient } from "livekit-server-sdk";
import { prisma } from "../lib/prisma.js";
import { getRadioSettingNumber } from "../lib/radioSettings.js";
import { emitToSession } from "../realtime/socket.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { stopRecording } from "../lib/liveRecorder.js";

// Studio broadcasts have their own status field (StudioSession.status) that
// only ever gets set to "ended" by the RJ explicitly clicking End Broadcast
// (studio.ts's endBroadcast) — nothing reconciled it when a broadcast died
// some other way (tab crash, lost connection, never cleanly ended). The
// LiveSession this same sweep already auto-ends via heartbeat timeout was
// the one true "is this actually still live" signal; StudioSession just
// never found out, so it sat showing "live" in the RJ's Studio list
// indefinitely. Best-effort: stops any Egress LiveKit thinks is still
// running for the room too, so it doesn't keep burning resources on a
// broadcast nobody's watching the dashboard for.
async function endOrphanedStudioSession(studioSessionId: string, roomName: string): Promise<void> {
  await prisma.studioSession.update({
    where: { id: studioSessionId },
    data: { status: "ended", ended_at: new Date() },
  });
  try {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) return;
    const egress = new EgressClient(url.replace(/^ws/, "http"), apiKey, apiSecret);
    const active = await egress.listEgress({ roomName, active: true });
    await Promise.all(active.map((e) => egress.stopEgress(e.egressId).catch(() => null)));
  } catch {
    // Best-effort — a dangling Egress job here isn't worse than the status
    // being wrong was, and the next deploy's boot-time sync doesn't depend
    // on this having succeeded.
  }
}

/**
 * Runs every minute (see jobs/index.ts). A live session's RJ client is
 * expected to call the heartbeat endpoint every ~20s while broadcasting —
 * this sweep is what actually detects a dropped connection from that.
 *
 * live, heartbeat older than grace period      -> reconnecting (listeners see
 *                                                  "temporarily offline",
 *                                                  session stays alive)
 * reconnecting, heartbeat older than timeout    -> ended (disconnect_reason:
 *                                                  "heartbeat_timeout")
 *
 * A fresh heartbeat call while "reconnecting" flips it straight back to
 * "live" (see rj.ts/liveSession.heartbeat) — this job never has to do that
 * side of the transition.
 */
// One-time, boot-time cleanup (see index.ts) for StudioSessions that were
// already orphaned before this fix existed — the sweep above only catches
// the *transition* out of "reconnecting", so a LiveSession that had
// already finished ending (any status other than live/reconnecting) would
// never trigger it. Found live: a room stuck showing "লাইভ" in the RJ's
// Studio list days after its actual broadcast had ended.
export async function reconcileOrphanedStudioSessions(): Promise<number> {
  const orphaned = await prisma.studioSession.findMany({
    where: { status: "live", live_session: { status: { notIn: ["live", "reconnecting"] } } },
    select: { id: true, room_name: true },
  });
  for (const s of orphaned) {
    await endOrphanedStudioSession(s.id, s.room_name).catch(() => null);
  }
  return orphaned.length;
}

export async function runStreamReconnectSweep(): Promise<{ markedReconnecting: number; autoEnded: number }> {
  const [graceSeconds, timeoutSeconds] = await Promise.all([
    getRadioSettingNumber("radio_reconnect_grace_seconds"),
    getRadioSettingNumber("radio_reconnect_timeout_seconds"),
  ]);
  const grace = graceSeconds ?? 120;
  const timeout = timeoutSeconds ?? 600;

  const now = Date.now();
  const graceThreshold = new Date(now - grace * 1000);
  const timeoutThreshold = new Date(now - timeout * 1000);

  const toReconnecting = await prisma.liveSession.findMany({
    where: { status: "live", last_heartbeat_at: { lt: graceThreshold } },
    select: { id: true },
  });
  if (toReconnecting.length > 0) {
    await prisma.liveSession.updateMany({
      where: { id: { in: toReconnecting.map((s) => s.id) } },
      data: { status: "reconnecting" },
    });
    toReconnecting.forEach((s) => emitToSession(s.id, "session:reconnecting", { sessionId: s.id }));
  }

  const toEnd = await prisma.liveSession.findMany({
    where: { status: "reconnecting", last_heartbeat_at: { lt: timeoutThreshold } },
    select: { id: true, rj_user_id: true, studio_session: { select: { id: true, room_name: true, status: true } } },
  });
  if (toEnd.length > 0) {
    await prisma.liveSession.updateMany({
      where: { id: { in: toEnd.map((s) => s.id) } },
      data: { status: "ended", ended_at: new Date(), disconnect_reason: "heartbeat_timeout" },
    });
    for (const s of toEnd) {
      stopRecording(s.id);
      emitToSession(s.id, "session:ended", { sessionId: s.id, reason: "heartbeat_timeout" });
      await logRadioAction(s.rj_user_id, "session_auto_ended_heartbeat_timeout", { sessionId: s.id });
      if (s.studio_session && s.studio_session.status === "live") {
        await endOrphanedStudioSession(s.studio_session.id, s.studio_session.room_name).catch(() => null);
      }
    }
  }

  return { markedReconnecting: toReconnecting.length, autoEnded: toEnd.length };
}
