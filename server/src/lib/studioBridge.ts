import { TRPCError } from "@trpc/server";
import { prisma } from "./prisma.js";
import { deriveIcecastMountPath } from "./icecastMount.js";
import { syncStudioIcecastMounts } from "./icecastMountSync.js";

// The bridge's own fixed default mount (studio-bridge/.env's ICECAST_MOUNT)
// — used only by a stationless test broadcast (registerBridgeMount falls
// back to it when no station is selected); every real, per-station
// broadcast lands on that station's own derived mount instead. Included
// unconditionally so even that edge case gets dead-air fallback protection.
const STUDIO_BRIDGE_DEFAULT_MOUNT = process.env.STUDIO_BRIDGE_DEFAULT_MOUNT || "/studio.mp3";

/**
 * Shared client for the Bridge Relay's internal control channel (see
 * BRIDGE_INTERNAL_PORT in studio-bridge/.env, and the HTTP server in
 * studio-bridge/src/index.ts). Every call is shared-secret authenticated —
 * same secret the reverse "master-ready" webhook already uses.
 */
async function callBridgeInternal(path: string, body: unknown): Promise<Response> {
  const internalUrl = process.env.STUDIO_BRIDGE_INTERNAL_URL || "http://127.0.0.1:8899";
  const secret = process.env.STUDIO_BRIDGE_INTERNAL_SECRET || "";
  return fetch(`${internalUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Studio-Internal-Secret": secret },
    body: JSON.stringify(body),
  });
}

/**
 * Tells the Bridge Relay which Icecast mount a specific broadcast's RTMP
 * stream should land on, before Egress starts publishing. Without this,
 * every concurrent Studio broadcast falls back to the bridge's single
 * static ICECAST_MOUNT and stomps on each other.
 *
 * `toIcecast`/`toWav` let a broadcast register two independent taps of the
 * same room under different stream paths (§14 recording_mode): the primary
 * always goes to Icecast (toIcecast:true) and writes the master WAV only
 * when recording_mode is "mixed"; a second, mic-only TrackCompositeEgress
 * stream (registered separately, toIcecast:false/toWav:true) is what
 * produces a true voice-only master when recording_mode is "voice_only" —
 * see startBroadcast in routers/studio.ts.
 */
export async function registerBridgeMount(
  streamPath: string,
  opts: { mount?: string; toIcecast: boolean; toWav: boolean }
) {
  const res = await callBridgeInternal("/internal/register-mount", { streamPath, ...opts }).catch((err) => {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Could not reach the Bridge Relay: ${err.message}` });
  });
  if (!res.ok) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Bridge Relay rejected mount registration (${res.status})` });
  }
}

/**
 * Keeps the real, listener-facing Icecast's per-mount emergency-fallback
 * wiring (silence -> standby playlist) in sync with the platform's active
 * station list — see icecastMountSync.ts (this used to call out to the
 * Bridge Relay's own /internal/sync-stations, which only ever managed the
 * bridge's own local Icecast; that stopped being the one real listeners
 * connect to once the bridge started pushing to this host instead — see
 * project memory studio-bridge-icecast-routing-2026-08-16). Best-effort:
 * called after any station is added, edited, or (de)activated, and once at
 * server boot; going live never depends on this having succeeded, only the
 * dead-air fallback protection does.
 */
export async function syncStationMountsWithBridge(): Promise<void> {
  const stations = await prisma.radioStation.findMany({
    where: { is_active: true },
    select: { stream_url: true },
  });
  const mounts = [
    STUDIO_BRIDGE_DEFAULT_MOUNT,
    ...stations.map((s) => deriveIcecastMountPath(s.stream_url)).filter((m): m is string => !!m),
  ];
  await syncStudioIcecastMounts(mounts);
}
