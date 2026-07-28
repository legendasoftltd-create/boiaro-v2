import { prisma } from "../lib/prisma.js";
import { getRadioSettingNumber } from "../lib/radioSettings.js";
import { emitToSession } from "../realtime/socket.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { stopRecording } from "../lib/liveRecorder.js";

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
    select: { id: true, rj_user_id: true },
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
    }
  }

  return { markedReconnecting: toReconnecting.length, autoEnded: toEnd.length };
}
