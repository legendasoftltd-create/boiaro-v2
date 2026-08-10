import { prisma } from "../lib/prisma.js";

/**
 * Runs every minute (see jobs/index.ts) — polls Icecast's own status-json.xsl
 * for the real stream audience, distinct from ListenerSession (Socket.IO
 * chat/reaction participants only, undercounts anyone listening without the
 * chat panel open).
 *
 * Multiple stations can be live concurrently (each on its own Icecast
 * mount — see server/src/routers/studio.ts's startBroadcast and rj.ts's
 * goLive), so this samples every currently-live session's own mount, not a
 * single global one — one status-json.xsl fetch per distinct Icecast host
 * (stations sharing a host only cost one fetch), matched against each
 * session's own stream_url pathname. A session whose stream_url doesn't
 * parse, or whose mount doesn't appear in that host's response (stream
 * down), still gets a 0 sample rather than being skipped — a poll gap is
 * itself meaningful for the time series, not something to silently drop.
 */
export async function runIcecastListenerPoll(): Promise<{ sampled: number }> {
  const liveSessions = await prisma.liveSession.findMany({
    where: { status: { in: ["live", "reconnecting"] }, is_test: false },
    select: { id: true, stream_url: true },
  });
  if (!liveSessions.length) return { sampled: 0 };

  type Target = { sessionId: string; mountPath: string };
  const byOrigin = new Map<string, { statusUrl: URL; targets: Target[] }>();
  const unparseable: string[] = [];

  for (const session of liveSessions) {
    if (!session.stream_url) { unparseable.push(session.id); continue; }
    let mountUrl: URL;
    try {
      mountUrl = new URL(session.stream_url);
    } catch {
      unparseable.push(session.id);
      continue;
    }
    const statusUrl = new URL(mountUrl.toString());
    statusUrl.pathname = statusUrl.pathname.replace(/\/[^/]*$/, "/status-json.xsl");
    const origin = statusUrl.origin;
    if (!byOrigin.has(origin)) byOrigin.set(origin, { statusUrl, targets: [] });
    byOrigin.get(origin)!.targets.push({ sessionId: session.id, mountPath: mountUrl.pathname });
  }

  const samples: { live_session_id: string; listener_count: number }[] = unparseable.map((id) => ({
    live_session_id: id,
    listener_count: 0,
  }));

  for (const { statusUrl, targets } of byOrigin.values()) {
    let sources: any[] = [];
    try {
      const res = await fetch(statusUrl.toString(), { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const data: any = await res.json();
        // Icecast returns `source` as a single object when there's exactly
        // one mount, or an array when there's more than one — normalize.
        sources = data?.icestats?.source
          ? Array.isArray(data.icestats.source) ? data.icestats.source : [data.icestats.source]
          : [];
      }
    } catch (err: any) {
      console.error(`[jobs] icecastListenerPoll: fetch failed for ${statusUrl.origin}:`, err.message);
      // Falls through with sources = [] — every target on this origin samples as 0.
    }
    for (const target of targets) {
      const match = sources.find((s: any) => typeof s?.listenurl === "string" && s.listenurl.endsWith(target.mountPath));
      samples.push({ live_session_id: target.sessionId, listener_count: Number(match?.listeners ?? 0) || 0 });
    }
  }

  await prisma.icecastListenerSample.createMany({ data: samples });
  return { sampled: samples.length };
}
