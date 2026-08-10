import { prisma } from "../lib/prisma.js";

/**
 * Runs every minute (see jobs/index.ts) — polls Icecast's own status-json.xsl
 * for the real stream audience, distinct from ListenerSession (Socket.IO
 * chat/reaction participants only, undercounts anyone listening without the
 * chat panel open). Always stores a sample, even 0/no-mount, so the time
 * series has no gaps to interpolate around — live_session_id is null
 * whenever nothing's currently live.
 */
export async function runIcecastListenerPoll(): Promise<{ listenerCount: number | null }> {
  const setting = await prisma.siteSetting.findUnique({ where: { key: "radio_public_stream_url" } });
  const streamUrl = setting?.value;
  if (!streamUrl) return { listenerCount: null };

  let statusUrl: URL;
  try {
    statusUrl = new URL(streamUrl);
  } catch {
    return { listenerCount: null };
  }
  const mountPath = statusUrl.pathname;
  statusUrl.pathname = statusUrl.pathname.replace(/\/[^/]*$/, "/status-json.xsl");

  let listenerCount = 0;
  try {
    const res = await fetch(statusUrl.toString(), { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const data: any = await res.json();
      // Icecast returns `source` as a single object when there's exactly
      // one mount, or an array when there's more than one — normalize.
      const sources = data?.icestats?.source
        ? Array.isArray(data.icestats.source) ? data.icestats.source : [data.icestats.source]
        : [];
      const match = sources.find((s: any) => typeof s?.listenurl === "string" && s.listenurl.endsWith(mountPath));
      listenerCount = Number(match?.listeners ?? 0) || 0;
    }
  } catch (err: any) {
    console.error("[jobs] icecastListenerPoll: fetch failed:", err.message);
    // Still record a sample below (0) — a poll failure is itself meaningful
    // (stream/Icecast may be down), not something to silently skip.
  }

  const liveSession = await prisma.liveSession.findFirst({
    where: { status: { in: ["live", "reconnecting"] }, is_test: false },
    select: { id: true },
    orderBy: { started_at: "desc" },
  });

  await prisma.icecastListenerSample.create({
    data: { live_session_id: liveSession?.id ?? null, listener_count: listenerCount },
  });

  return { listenerCount };
}
