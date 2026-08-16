import { prisma } from "./prisma.js";

export type StreamHealth = "healthy" | "degraded" | "down" | "unknown";

// Looks at the most recent 3 Icecast polls (roughly the last 3 minutes,
// see icecastListenerPoll.ts which runs every minute) — "down" only once
// the source has been missing for a few consecutive polls, not a single
// transient blip.
const SAMPLE_WINDOW = 3;

export function deriveStreamHealth(samples: { source_up: boolean }[]): StreamHealth {
  if (samples.length === 0) return "unknown";
  const upCount = samples.filter((s) => s.source_up).length;
  if (upCount === samples.length) return "healthy";
  if (upCount === 0) return "down";
  return "degraded";
}

export async function getStreamHealth(sessionId: string): Promise<StreamHealth> {
  const samples = await prisma.icecastListenerSample.findMany({
    where: { live_session_id: sessionId },
    orderBy: { sampled_at: "desc" },
    take: SAMPLE_WINDOW,
    select: { source_up: true },
  });
  return deriveStreamHealth(samples);
}

// Batched version for a list of currently-live sessions — one query instead
// of N, used by admin's live-sessions monitoring view.
export async function getStreamHealthForSessions(sessionIds: string[]): Promise<Map<string, StreamHealth>> {
  const result = new Map<string, StreamHealth>();
  if (!sessionIds.length) return result;
  const samples = await prisma.icecastListenerSample.findMany({
    where: { live_session_id: { in: sessionIds } },
    orderBy: { sampled_at: "desc" },
    select: { live_session_id: true, source_up: true },
  });
  const bySession = new Map<string, { source_up: boolean }[]>();
  for (const s of samples) {
    if (!s.live_session_id) continue;
    const arr = bySession.get(s.live_session_id) ?? [];
    if (arr.length < SAMPLE_WINDOW) arr.push(s);
    bySession.set(s.live_session_id, arr);
  }
  for (const id of sessionIds) result.set(id, deriveStreamHealth(bySession.get(id) ?? []));
  return result;
}
