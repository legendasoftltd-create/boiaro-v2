import { prisma } from "./prisma.js";
import { dhakaWallClock } from "./timezone.js";

export interface RadioAnalyticsInput {
  from?: string;
  to?: string;
  groupBy?: "none" | "rj" | "station" | "show";
  /** Locks the whole computation to one RJ's own sessions — used by rj.myAnalytics. Never client-supplied for the admin (platform-wide) path. */
  rjUserId?: string;
}

// Shared by admin.radioAnalytics (platform-wide) and rj.myAnalytics
// (self-scoped) — see either call site's comment for the field-by-field
// meaning of the returned summary/groups shape.
export async function computeRadioAnalytics(input: RadioAnalyticsInput) {
  const from = input.from ? new Date(input.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = input.to ? new Date(input.to) : new Date();
  const groupBy = input.groupBy ?? "none";

  const sessionsInRange = await prisma.liveSession.findMany({
    where: {
      started_at: { gte: from, lte: to },
      is_test: false,
      ...(input.rjUserId ? { rj_user_id: input.rjUserId } : {}),
    },
    select: {
      id: true, rj_user_id: true, station_id: true, show_title: true, category: true,
      reaction_count: true, catchup_play_count: true, started_at: true, ended_at: true,
    },
  });
  const sessionIds = sessionsInRange.map((s) => s.id);

  const [listenerRows, chatRows, requestCount, newFollowers, catchupRows, stations, rjProfiles, icecastSamples] = await Promise.all([
    prisma.listenerSession.findMany({
      where: { live_session_id: { in: sessionIds } },
      select: { live_session_id: true, user_id: true, device_id: true, platform: true, country: true, city: true, quality: true, joined_at: true, left_at: true },
    }),
    prisma.liveChatMessage.findMany({ where: { live_session_id: { in: sessionIds } }, select: { live_session_id: true, user_id: true } }),
    prisma.songRequest.count({ where: { live_session_id: { in: sessionIds } } }),
    prisma.follow.count({ where: { created_at: { gte: from, lte: to }, followee_id: { in: [...new Set(sessionsInRange.map((s) => s.rj_user_id))] } } }),
    prisma.catchupProgress.findMany({ where: { live_session_id: { in: sessionIds } }, select: { live_session_id: true, user_id: true, completed: true } }),
    prisma.radioStation.findMany({ select: { id: true, name: true } }),
    prisma.rjProfile.findMany({ select: { user_id: true, stage_name: true } }),
    prisma.icecastListenerSample.findMany({
      where: { live_session_id: { in: sessionIds } },
      select: { live_session_id: true, listener_count: true },
    }),
  ]);

  const stationName = new Map(stations.map((s) => [s.id, s.name]));
  const rjName = new Map(rjProfiles.map((r) => [r.user_id, r.stage_name]));

  const rangeUserIds = [...new Set(listenerRows.map((r) => r.user_id).filter((v): v is string => !!v))];
  const rangeDeviceIds = [...new Set(listenerRows.map((r) => r.device_id).filter((v): v is string => !!v))];
  const priorVisitors = (rangeUserIds.length || rangeDeviceIds.length)
    ? await prisma.listenerSession.findMany({
        where: {
          joined_at: { lt: from },
          OR: [
            ...(rangeUserIds.length ? [{ user_id: { in: rangeUserIds } }] : []),
            ...(rangeDeviceIds.length ? [{ device_id: { in: rangeDeviceIds } }] : []),
          ],
        },
        select: { user_id: true, device_id: true },
      })
    : [];
  const returningKeys = new Set(priorVisitors.map((r) => r.user_id ?? `device:${r.device_id}`));

  const now = Date.now();
  const events = listenerRows.flatMap((r) => [
    { t: r.joined_at.getTime(), d: 1 },
    { t: (r.left_at ?? new Date(now)).getTime(), d: -1 },
  ]).sort((a, b) => a.t - b.t);
  let running = 0, peakConcurrent = 0;
  for (const e of events) { running += e.d; if (running > peakConcurrent) peakConcurrent = running; }

  const totalListeningSeconds = listenerRows.reduce((sum, r) => sum + Math.max(0, ((r.left_at?.getTime() ?? now) - r.joined_at.getTime()) / 1000), 0);
  const uniqueListenerKeys = new Set(listenerRows.map((r) => r.user_id ?? `device:${r.device_id}`));
  const uniqueChatUsers = new Set(chatRows.map((r) => r.user_id));

  const deviceBreakdown: Record<string, number> = {};
  listenerRows.forEach((r) => { const p = r.platform ?? "unknown"; deviceBreakdown[p] = (deviceBreakdown[p] ?? 0) + 1; });

  const countryBreakdown: Record<string, number> = {};
  listenerRows.forEach((r) => { const c = r.country ?? "unknown"; countryBreakdown[c] = (countryBreakdown[c] ?? 0) + 1; });

  // City is best-effort (only populated by the geoip-lite fallback path, see
  // geoCountry.ts) — omit "unknown" here rather than let a mostly-empty
  // field dominate the breakdown the way countryBreakdown intentionally does.
  const cityBreakdown: Record<string, number> = {};
  listenerRows.forEach((r) => { if (r.city) cityBreakdown[r.city] = (cityBreakdown[r.city] ?? 0) + 1; });

  const qualityBreakdown: Record<string, number> = {};
  listenerRows.forEach((r) => { if (r.quality) qualityBreakdown[r.quality] = (qualityBreakdown[r.quality] ?? 0) + 1; });

  const catchupUniqueListeners = new Set(catchupRows.map((r) => `${r.live_session_id}:${r.user_id}`)).size;
  const catchupCompleted = catchupRows.filter((r) => r.completed).length;

  const icecastCounts = icecastSamples.map((s) => s.listener_count);
  const icecastPeakListeners = icecastCounts.length ? Math.max(...icecastCounts) : 0;
  const icecastAverageListeners = icecastCounts.length
    ? Math.round((icecastCounts.reduce((a, b) => a + b, 0) / icecastCounts.length) * 10) / 10
    : 0;

  const summary = {
    totalSessions: sessionsInRange.length,
    uniqueListeners: uniqueListenerKeys.size,
    returningListeners: returningKeys.size,
    newListeners: uniqueListenerKeys.size - returningKeys.size,
    peakConcurrentListeners: peakConcurrent,
    icecastPeakListeners,
    icecastAverageListeners,
    totalListeningMinutes: Math.round(totalListeningSeconds / 60),
    averageListeningMinutes: listenerRows.length ? Math.round((totalListeningSeconds / listenerRows.length) / 60 * 10) / 10 : 0,
    newFollowers,
    chatCount: chatRows.length,
    uniqueChatUsers: uniqueChatUsers.size,
    reactionCount: sessionsInRange.reduce((sum, s) => sum + s.reaction_count, 0),
    requestCount,
    catchupPlays: sessionsInRange.reduce((sum, s) => sum + s.catchup_play_count, 0),
    catchupUniqueListeners,
    catchupCompletionRatePct: catchupRows.length ? Math.round((catchupCompleted / catchupRows.length) * 1000) / 10 : 0,
    deviceBreakdown,
    countryBreakdown,
    cityBreakdown,
    qualityBreakdown,
  };

  let groups: Array<{ key: string; label: string } & typeof summary> | null = null;
  if (groupBy !== "none") {
    const keyOf = (s: (typeof sessionsInRange)[number]) =>
      groupBy === "rj" ? s.rj_user_id : groupBy === "show" ? (s.show_title ?? "Untitled") : (s.station_id ?? "none");
    const labelOf = (key: string) =>
      groupBy === "rj" ? (rjName.get(key) ?? "Unknown RJ") : groupBy === "show" ? key : (stationName.get(key) ?? "No station");
    const keys = [...new Set(sessionsInRange.map(keyOf))];
    groups = keys.map((key) => {
      const groupSessionIds = new Set(sessionsInRange.filter((s) => keyOf(s) === key).map((s) => s.id));
      const gListener = listenerRows.filter((r) => groupSessionIds.has(r.live_session_id));
      const gChat = chatRows.filter((r) => groupSessionIds.has(r.live_session_id));
      const gCatchup = catchupRows.filter((r) => groupSessionIds.has(r.live_session_id));
      const gSessions = sessionsInRange.filter((s) => groupSessionIds.has(s.id));
      const gIcecast = icecastSamples.filter((s) => s.live_session_id && groupSessionIds.has(s.live_session_id)).map((s) => s.listener_count);
      const gSeconds = gListener.reduce((sum, r) => sum + Math.max(0, ((r.left_at?.getTime() ?? now) - r.joined_at.getTime()) / 1000), 0);
      const gEvents = gListener.flatMap((r) => [{ t: r.joined_at.getTime(), d: 1 }, { t: (r.left_at ?? new Date(now)).getTime(), d: -1 }]).sort((a, b) => a.t - b.t);
      let gRunning = 0, gPeak = 0;
      for (const e of gEvents) { gRunning += e.d; if (gRunning > gPeak) gPeak = gRunning; }
      const gCompleted = gCatchup.filter((r) => r.completed).length;
      const gCountryBreakdown: Record<string, number> = {};
      gListener.forEach((r) => { const c = r.country ?? "unknown"; gCountryBreakdown[c] = (gCountryBreakdown[c] ?? 0) + 1; });
      const gCityBreakdown: Record<string, number> = {};
      gListener.forEach((r) => { if (r.city) gCityBreakdown[r.city] = (gCityBreakdown[r.city] ?? 0) + 1; });
      const gQualityBreakdown: Record<string, number> = {};
      gListener.forEach((r) => { if (r.quality) gQualityBreakdown[r.quality] = (gQualityBreakdown[r.quality] ?? 0) + 1; });
      return {
        key, label: labelOf(key),
        totalSessions: gSessions.length,
        uniqueListeners: new Set(gListener.map((r) => r.user_id ?? `device:${r.device_id}`)).size,
        returningListeners: 0,
        newListeners: 0,
        peakConcurrentListeners: gPeak,
        icecastPeakListeners: gIcecast.length ? Math.max(...gIcecast) : 0,
        icecastAverageListeners: gIcecast.length ? Math.round((gIcecast.reduce((a, b) => a + b, 0) / gIcecast.length) * 10) / 10 : 0,
        totalListeningMinutes: Math.round(gSeconds / 60),
        averageListeningMinutes: gListener.length ? Math.round((gSeconds / gListener.length) / 60 * 10) / 10 : 0,
        newFollowers: 0,
        chatCount: gChat.length,
        uniqueChatUsers: new Set(gChat.map((r) => r.user_id)).size,
        reactionCount: gSessions.reduce((sum, s) => sum + s.reaction_count, 0),
        requestCount: 0,
        catchupPlays: gSessions.reduce((sum, s) => sum + s.catchup_play_count, 0),
        catchupUniqueListeners: new Set(gCatchup.map((r) => r.user_id)).size,
        catchupCompletionRatePct: gCatchup.length ? Math.round((gCompleted / gCatchup.length) * 1000) / 10 : 0,
        deviceBreakdown: {},
        countryBreakdown: gCountryBreakdown,
        cityBreakdown: gCityBreakdown,
        qualityBreakdown: gQualityBreakdown,
      };
    }).sort((a, b) => b.uniqueListeners - a.uniqueListeners);
  }

  return { from, to, summary, groups };
}

export interface RadioAnalyticsSeriesInput {
  from?: string;
  to?: string;
  bucket?: "day" | "week" | "month";
  rjUserId?: string;
}

function seriesBucketKey(date: Date, bucket: "day" | "week" | "month"): string {
  const d = dhakaWallClock(date);
  if (bucket === "month") return d.toISOString().slice(0, 7);
  if (bucket === "week") {
    const day = d.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + mondayOffset);
    return monday.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

// True time-bucketed series (day/week/month), distinct from computeRadioAnalytics
// above which only ever returns one aggregate summary for the whole range —
// this is what powers an actual trend chart. Each session (and everything
// tied to it — listeners, chat) is attributed to the Dhaka-wall-clock bucket
// its started_at falls in, same attribution rule the summary's own range
// filter already uses.
export async function computeRadioAnalyticsSeries(input: RadioAnalyticsSeriesInput) {
  const from = input.from ? new Date(input.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = input.to ? new Date(input.to) : new Date();
  const bucket = input.bucket ?? "day";

  const sessionsInRange = await prisma.liveSession.findMany({
    where: {
      started_at: { gte: from, lte: to },
      is_test: false,
      ...(input.rjUserId ? { rj_user_id: input.rjUserId } : {}),
    },
    select: { id: true, started_at: true, catchup_play_count: true, reaction_count: true },
  });
  const sessionIds = sessionsInRange.map((s) => s.id);
  const sessionStart = new Map(sessionsInRange.map((s) => [s.id, s.started_at]));

  const [listenerRows, chatRows] = await Promise.all([
    prisma.listenerSession.findMany({
      where: { live_session_id: { in: sessionIds } },
      select: { live_session_id: true, user_id: true, device_id: true, joined_at: true, left_at: true },
    }),
    prisma.liveChatMessage.findMany({ where: { live_session_id: { in: sessionIds } }, select: { live_session_id: true } }),
  ]);

  interface Bucket { totalSessions: number; uniqueListenerKeys: Set<string>; totalListeningSeconds: number; chatCount: number; catchupPlays: number; reactionCount: number }
  const buckets = new Map<string, Bucket>();
  const getBucket = (key: string): Bucket => {
    let b = buckets.get(key);
    if (!b) { b = { totalSessions: 0, uniqueListenerKeys: new Set(), totalListeningSeconds: 0, chatCount: 0, catchupPlays: 0, reactionCount: 0 }; buckets.set(key, b); }
    return b;
  };

  const now = Date.now();
  sessionsInRange.forEach((s) => {
    const b = getBucket(seriesBucketKey(s.started_at, bucket));
    b.totalSessions += 1;
    b.catchupPlays += s.catchup_play_count;
    b.reactionCount += s.reaction_count;
  });
  listenerRows.forEach((r) => {
    const startedAt = sessionStart.get(r.live_session_id);
    if (!startedAt) return;
    const b = getBucket(seriesBucketKey(startedAt, bucket));
    b.uniqueListenerKeys.add(r.user_id ?? `device:${r.device_id}`);
    b.totalListeningSeconds += Math.max(0, ((r.left_at?.getTime() ?? now) - r.joined_at.getTime()) / 1000);
  });
  chatRows.forEach((r) => {
    const startedAt = sessionStart.get(r.live_session_id);
    if (!startedAt) return;
    getBucket(seriesBucketKey(startedAt, bucket)).chatCount += 1;
  });

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      totalSessions: b.totalSessions,
      uniqueListeners: b.uniqueListenerKeys.size,
      totalListeningMinutes: Math.round(b.totalListeningSeconds / 60),
      chatCount: b.chatCount,
      catchupPlays: b.catchupPlays,
      reactionCount: b.reactionCount,
    }));

  return { from, to, bucket, series };
}
