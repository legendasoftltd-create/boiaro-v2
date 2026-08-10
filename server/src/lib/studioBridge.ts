import { TRPCError } from "@trpc/server";
import { prisma } from "./prisma.js";

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
 */
export async function registerBridgeMount(roomName: string, mount: string) {
  const res = await callBridgeInternal("/internal/register-mount", { streamPath: `/live/${roomName}`, mount }).catch((err) => {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Could not reach the Bridge Relay: ${err.message}` });
  });
  if (!res.ok) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Bridge Relay rejected mount registration (${res.status})` });
  }
}

function mountPathFrom(streamUrl: string): string | null {
  try {
    return new URL(streamUrl).pathname;
  } catch {
    return null;
  }
}

/**
 * Pushes the current set of active stations' Icecast mounts to the Bridge
 * Relay so it can keep each mount's emergency-fallback wiring (silence ->
 * standby playlist) up to date in Icecast's config — see icecastConfig.ts
 * on the bridge side. Best-effort: called after any station is added,
 * edited, or (de)activated, and once at server boot; a bridge that's
 * temporarily unreachable just misses that one sync, not a hard failure,
 * since going live doesn't depend on this (only registerBridgeMount does).
 */
export async function syncStationMountsWithBridge(): Promise<void> {
  const stations = await prisma.radioStation.findMany({
    where: { is_active: true },
    select: { stream_url: true },
  });
  const mounts = [...new Set(stations.map((s) => mountPathFrom(s.stream_url)).filter((m): m is string => !!m))];
  const res = await callBridgeInternal("/internal/sync-stations", { mounts });
  if (!res.ok) throw new Error(`Bridge Relay rejected station sync (${res.status})`);
}
