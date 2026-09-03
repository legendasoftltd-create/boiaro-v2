import { TRPCError } from "@trpc/server";
import { prisma } from "../lib/prisma.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { getRadioSetting, getRadioSettingBool, getRadioSettingNumber } from "../lib/radioSettings.js";
import { buildIngestUrl, decryptStreamKey, redactStreamKeys } from "../lib/socialCredentials.js";
import { renderSceneSet } from "../lib/socialScenes.js";
import {
  startEncoder,
  stopEncoder,
  setScene,
  currentScene,
  isEncoding,
  activeEncoderCount,
  activeBroadcastIds,
  encoderDiagnostics,
  type EncoderDestination,
} from "../lib/socialEncoder.js";

/**
 * Orchestration for Social Live Broadcasting.
 *
 * The rule this whole layer exists to honour: Social Live is an output
 * consumer of the radio feed and never a dependency of it. Nothing in here
 * writes to live_sessions, radio_stations, the Icecast config or the socket
 * layer. It reads the current show to label the stream, and reads the
 * station's public stream URL to consume it — that is the entire surface.
 */

export type BroadcastState = "OFFLINE" | "STARTING" | "LIVE" | "RECONNECTING" | "STOPPING" | "FAILED";

export interface PreflightProblem {
  code: string;
  message: string;
}

/**
 * Everything that must be true before an encoder is spawned. Checked as a
 * set rather than one at a time, so an admin sees every reason it will not
 * start instead of fixing them one refresh at a time.
 */
export async function preflight(connectionIds: string[]): Promise<{
  ok: boolean;
  problems: PreflightProblem[];
  sourceUrl?: string;
  stationName?: string | null;
  showTitle?: string | null;
  rjName?: string | null;
  coverUrl?: string | null;
  destinations?: { connectionId: string; url: string; platform: string }[];
}> {
  const problems: PreflightProblem[] = [];

  if (!(await getRadioSettingBool("social_live_enabled"))) {
    problems.push({
      code: "FEATURE_OFF",
      message: "Social Live is switched off. Turn on social_live_enabled in radio settings first.",
    });
  }

  const maxConcurrent = (await getRadioSettingNumber("social_max_concurrent_encoders")) ?? 1;
  if (activeEncoderCount() >= maxConcurrent) {
    problems.push({
      code: "AT_CAPACITY",
      message: `Already running ${activeEncoderCount()} encoder(s), which is the configured limit.`,
    });
  }

  if (!connectionIds.length) {
    problems.push({ code: "NO_DESTINATION", message: "Pick at least one platform to broadcast to." });
  }

  const connections = connectionIds.length
    ? await prisma.socialPlatformConnection.findMany({ where: { id: { in: connectionIds } } })
    : [];

  const destinations: { connectionId: string; url: string; platform: string }[] = [];
  for (const id of connectionIds) {
    const conn = connections.find((c) => c.id === id);
    if (!conn) {
      problems.push({ code: "MISSING_CONNECTION", message: "A selected connection no longer exists." });
      continue;
    }
    if (!conn.enabled) {
      problems.push({ code: "DISABLED", message: `${conn.account_name} is disabled.` });
      continue;
    }
    const key = decryptStreamKey(conn.stream_key_encrypted);
    if (!key) {
      problems.push({
        code: "BAD_CREDENTIAL",
        message: `${conn.account_name}'s stream key could not be decrypted — re-enter it.`,
      });
      continue;
    }
    try {
      destinations.push({ connectionId: conn.id, url: buildIngestUrl(conn.rtmp_url, key), platform: conn.platform });
    } catch (err: any) {
      problems.push({
        code: "BAD_CREDENTIAL",
        message: `${conn.account_name}: ${redactStreamKeys(err?.message ?? "invalid credentials")}`,
      });
    }
  }

  // The database is the guard that survives a restart; this check is only so
  // the admin gets a sentence instead of a constraint violation.
  if (connectionIds.length) {
    const busy = await prisma.socialBroadcastDestination.findMany({
      where: { connection_id: { in: connectionIds }, state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
      select: { connection_id: true },
    });
    for (const b of busy) {
      const conn = connections.find((c) => c.id === b.connection_id);
      problems.push({
        code: "ALREADY_BROADCASTING",
        message: `${conn?.account_name ?? "That connection"} is already part of a running broadcast.`,
      });
    }
  }

  // The audio source. Read from the station's configured public stream URL —
  // never a hard-coded production URL.
  const liveSession = await prisma.liveSession.findFirst({
    where: { status: { in: ["live", "reconnecting"] }, is_test: false },
    orderBy: { started_at: "desc" },
    select: { id: true, show_title: true, station_id: true, stream_url: true, rj_user_id: true, cover_image_url: true },
  });

  // Purely cosmetic — the RJ's name and the show cover appear on the scene.
  // A missing profile or artwork must never block a broadcast, so both are
  // best-effort lookups.
  const rjProfile = liveSession?.rj_user_id
    ? await prisma.rjProfile
        .findFirst({ where: { user_id: liveSession.rj_user_id }, select: { stage_name: true } })
        .catch(() => null)
    : null;

  let sourceUrl: string | undefined;
  let stationName: string | null = null;
  const station = liveSession?.station_id
    ? await prisma.radioStation.findUnique({ where: { id: liveSession.station_id }, select: { name: true, stream_url: true, artwork_url: true } })
    : await prisma.radioStation.findFirst({ where: { is_active: true }, orderBy: { sort_order: "asc" }, select: { name: true, stream_url: true, artwork_url: true } });

  if (station) {
    stationName = station.name;
    sourceUrl = liveSession?.stream_url || station.stream_url;
  }
  const coverUrl = liveSession?.cover_image_url ?? station?.artwork_url ?? null;
  if (!sourceUrl) {
    problems.push({ code: "NO_SOURCE", message: "No station stream URL is configured to broadcast from." });
  } else {
    const reachable = await probeStream(sourceUrl);
    if (!reachable) {
      problems.push({ code: "SOURCE_UNREACHABLE", message: `The audio source (${sourceUrl}) is not responding.` });
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    sourceUrl,
    stationName,
    showTitle: liveSession?.show_title ?? null,
    rjName: rjProfile?.stage_name ?? null,
    coverUrl,
    destinations,
  };
}

/**
 * Can we actually fetch audio from the Icecast mount right now? A HEAD is not
 * enough — Icecast answers HEAD on a mount with no source — so this reads a
 * few bytes of the body and gives up quickly.
 */
async function probeStream(url: string, timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Range: "bytes=0-2047" } });
    if (!res.ok && res.status !== 206) return false;
    const reader = res.body?.getReader();
    if (!reader) return false;
    const { value } = await reader.read();
    await reader.cancel().catch(() => null);
    return Boolean(value && value.length > 0);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}


/**
 * Per-broadcast supervisor — the §14 failover loop.
 *
 * The brief is explicit that losing the audio feed for a few seconds must not
 * end the Facebook or YouTube stream. Two mechanisms cover that, at different
 * timescales:
 *
 *   - ffmpeg's own `-reconnect` options handle a brief blip without the
 *     process even noticing, so nothing reaches the platforms.
 *   - This loop handles a longer outage: it notices the source has stopped
 *     answering, switches the published scene to "be right back", counts the
 *     consecutive failures, and switches back to the live scene the moment
 *     the source returns. Only once a threshold of consecutive failures is
 *     crossed is the broadcast called degraded and the admin alerted.
 *
 * Deliberately does NOT stop the encoder on source loss. The platform stream
 * staying up on a holding scene is the whole point — tearing it down is what
 * the brief forbids.
 */
interface Supervisor {
  timer: NodeJS.Timeout;
  consecutiveFailures: number;
  degraded: boolean;
}

const supervisors = new Map<string, Supervisor>();

async function superviseOnce(broadcastId: string, sourceUrl: string, threshold: number): Promise<void> {
  const sup = supervisors.get(broadcastId);
  if (!sup) return;
  if (!isEncoding(broadcastId)) {
    stopSupervisor(broadcastId);
    return;
  }

  const alive = await probeStream(sourceUrl, 5000);

  if (alive) {
    if (sup.consecutiveFailures > 0 || currentScene(broadcastId) !== "live") {
      const recovered = sup.consecutiveFailures;
      sup.consecutiveFailures = 0;
      sup.degraded = false;
      setScene(broadcastId, "live");
      await prisma.socialBroadcast
        .updateMany({ where: { id: broadcastId, state: "RECONNECTING" }, data: { state: "LIVE" } })
        .catch(() => null);
      await prisma.socialBroadcastDestination
        .updateMany({
          where: { broadcast_id: broadcastId, state: "RECONNECTING" },
          data: { state: "LIVE", last_reconnect_at: new Date() },
        })
        .catch(() => null);
      if (recovered > 0) {
        await logRadioAction("system", "social_source_recovered", { broadcastId, afterFailures: recovered });
      }
    }
    return;
  }

  sup.consecutiveFailures += 1;

  // First miss: hold the audience on a scene that explains itself, and start
  // counting. The encoder keeps running throughout.
  if (sup.consecutiveFailures === 1) {
    setScene(broadcastId, "brb");
    await prisma.socialBroadcast
      .updateMany({ where: { id: broadcastId, state: "LIVE" }, data: { state: "RECONNECTING" } })
      .catch(() => null);
    await prisma.socialBroadcastDestination
      .updateMany({
        where: { broadcast_id: broadcastId, state: "LIVE" },
        data: { state: "RECONNECTING", last_disconnect_at: new Date(), reconnect_attempts: { increment: 1 } },
      })
      .catch(() => null);
    await logRadioAction("system", "social_source_lost", { broadcastId });
    return;
  }

  if (sup.consecutiveFailures >= threshold && !sup.degraded) {
    sup.degraded = true;
    const message = `Audio source has not answered for ${sup.consecutiveFailures} consecutive checks.`;
    await prisma.socialBroadcastDestination
      .updateMany({ where: { broadcast_id: broadcastId }, data: { last_error: message } })
      .catch(() => null);
    await logRadioAction("system", "social_broadcast_degraded", { broadcastId, failures: sup.consecutiveFailures });
    console.error(`[socialLive] broadcast ${broadcastId} degraded: ${message}`);
  }
}

function startSupervisor(broadcastId: string, sourceUrl: string): void {
  if (supervisors.has(broadcastId)) return;
  void (async () => {
    const intervalSeconds = (await getRadioSettingNumber("social_source_check_seconds")) ?? 15;
    const threshold = (await getRadioSettingNumber("social_source_failure_threshold")) ?? 4;
    if (supervisors.has(broadcastId)) return;
    const timer = setInterval(() => {
      superviseOnce(broadcastId, sourceUrl, threshold).catch((err) =>
        console.error(`[socialLive] supervisor error for ${broadcastId}:`, err?.message)
      );
    }, Math.max(5, intervalSeconds) * 1000);
    supervisors.set(broadcastId, { timer, consecutiveFailures: 0, degraded: false });
  })();
}

function stopSupervisor(broadcastId: string): void {
  const sup = supervisors.get(broadcastId);
  if (!sup) return;
  clearInterval(sup.timer);
  supervisors.delete(broadcastId);
}

/** Supervisor view for the monitoring panel. */
export function supervisorState(broadcastId: string): { failures: number; degraded: boolean } | null {
  const sup = supervisors.get(broadcastId);
  return sup ? { failures: sup.consecutiveFailures, degraded: sup.degraded } : null;
}

export interface StartOptions {
  connectionIds: string[];
  actorId: string;
  trigger?: "manual" | "scheduled";
  /** Set when a scheduled show started this, so auto-stop can find it again. */
  showScheduleId?: string | null;
  /** Encode but publish nowhere — proves the pipeline without involving a platform. */
  dryRun?: boolean;
}

export async function startBroadcast(opts: StartOptions): Promise<{ broadcastId: string; pid: number }> {
  const check = await preflight(opts.connectionIds);
  if (!check.ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: check.problems.map((p) => p.message).join(" "),
    });
  }

  const liveSession = await prisma.liveSession.findFirst({
    where: { status: { in: ["live", "reconnecting"] }, is_test: false },
    orderBy: { started_at: "desc" },
    select: { id: true, station_id: true, show_title: true, rj_user_id: true },
  });

  const broadcast = await prisma.socialBroadcast.create({
    data: {
      live_session_id: liveSession?.id ?? null,
      station_id: liveSession?.station_id ?? null,
      show_schedule_id: opts.showScheduleId ?? null,
      trigger: opts.trigger ?? "manual",
      started_by: opts.actorId,
      state: "STARTING",
      social_title: check.showTitle ?? null,
    },
  });

  // The database refuses a second active leg per connection (partial unique
  // index), so a duplicate start loses here rather than spawning a process.
  let destinationRows;
  try {
    destinationRows = await Promise.all(
      check.destinations!.map((d) =>
        prisma.socialBroadcastDestination.create({
          data: { broadcast_id: broadcast.id, connection_id: d.connectionId, state: "STARTING" },
        })
      )
    );
  } catch (err: any) {
    await prisma.socialBroadcast.update({
      where: { id: broadcast.id },
      data: { state: "FAILED", ended_at: new Date(), stop_reason: "failed" },
    });
    throw new TRPCError({
      code: "CONFLICT",
      message: "One of those platforms is already part of a running broadcast.",
    });
  }

  // All four scenes are rendered up front so a mid-broadcast switch (going to
  // "be right back" when the source drops, say) is instant and cannot fail
  // at the moment it is most needed.
  const scenes = await renderSceneSet({
    showTitle: check.showTitle,
    stationName: check.stationName,
    rjName: check.rjName ?? null,
    coverUrl: check.coverUrl ?? null,
  });

  const encoderDestinations: EncoderDestination[] = destinationRows.map((row, i) => ({
    destinationId: row.id,
    url: check.destinations![i].url,
  }));

  try {
    const { pid } = await startEncoder({
      broadcastId: broadcast.id,
      sourceUrl: check.sourceUrl!,
      scenes,
      initialScene: "live",
      destinations: encoderDestinations,
      dryRun: opts.dryRun,
      videoBitrateKbps: (await getRadioSettingNumber("social_video_bitrate_kbps")) ?? 4500,
      audioBitrateKbps: (await getRadioSettingNumber("social_audio_bitrate_kbps")) ?? 128,
      framerate: (await getRadioSettingNumber("social_framerate")) ?? 30,
      keyframeSeconds: (await getRadioSettingNumber("social_keyframe_seconds")) ?? 2,
      threads: (await getRadioSettingNumber("social_encoder_threads")) ?? 2,
      preset: await getRadioSetting("social_x264_preset"),
      resolution: await getRadioSetting("social_resolution"),
      sceneFps: (await getRadioSettingNumber("social_scene_fps")) ?? 2,
      sourceReconnectMaxSeconds: (await getRadioSettingNumber("social_source_reconnect_max_seconds")) ?? 120,
    });

    await prisma.socialBroadcast.update({ where: { id: broadcast.id }, data: { state: "LIVE" } });
    await prisma.socialBroadcastDestination.updateMany({
      where: { broadcast_id: broadcast.id },
      data: { state: "LIVE" },
    });
    startSupervisor(broadcast.id, check.sourceUrl!);
    await logRadioAction(opts.actorId, "social_broadcast_started", {
      broadcastId: broadcast.id,
      trigger: opts.trigger ?? "manual",
      platforms: check.destinations!.map((d) => d.platform),
      dryRun: Boolean(opts.dryRun),
    });
    return { broadcastId: broadcast.id, pid };
  } catch (err: any) {
    const safe = redactStreamKeys(err?.message ?? "Encoder failed to start");
    await prisma.socialBroadcastDestination.updateMany({
      where: { broadcast_id: broadcast.id },
      data: { state: "FAILED", last_error: safe, ended_at: new Date() },
    });
    await prisma.socialBroadcast.update({
      where: { id: broadcast.id },
      data: { state: "FAILED", ended_at: new Date(), stop_reason: "failed" },
    });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: safe });
  }
}

/** Stops one broadcast. Safe to call repeatedly — a second call is a no-op. */
export async function stopBroadcast(
  broadcastId: string,
  actorId: string,
  reason: "manual" | "scheduled" | "emergency" | "source_lost" = "manual"
): Promise<{ stopped: boolean }> {
  await prisma.socialBroadcast
    .updateMany({
      where: { id: broadcastId, state: { in: ["STARTING", "LIVE", "RECONNECTING"] } },
      data: { state: "STOPPING" },
    })
    .catch(() => null);

  stopSupervisor(broadcastId);
  const stopped = await stopEncoder(broadcastId);

  await prisma.socialBroadcastDestination.updateMany({
    where: { broadcast_id: broadcastId, state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
    data: { state: "OFFLINE", ended_at: new Date(), encoder_pid: null },
  });
  await prisma.socialBroadcast.updateMany({
    where: { id: broadcastId, state: { notIn: ["OFFLINE", "FAILED"] } },
    data: { state: "OFFLINE", ended_at: new Date(), stop_reason: reason },
  });
  if (stopped) {
    await logRadioAction(actorId, "social_broadcast_stopped", { broadcastId, reason });
  }
  return { stopped };
}

/** Stops everything, immediately. The brief's "STOP ALL SOCIAL STREAMS". */
export async function emergencyStopAll(actorId: string): Promise<{ stopped: number }> {
  const running = activeBroadcastIds();
  for (const id of running) {
    await stopBroadcast(id, actorId, "emergency").catch(() => null);
  }
  // Anything the database still believes is running but the registry does not
  // know about — a leg orphaned by a crash — is settled here too, so the
  // emergency button genuinely leaves nothing behind.
  await prisma.socialBroadcastDestination.updateMany({
    where: { state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
    data: { state: "OFFLINE", ended_at: new Date(), encoder_pid: null, last_error: "Emergency stop." },
  });
  await prisma.socialBroadcast.updateMany({
    where: { state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
    data: { state: "OFFLINE", ended_at: new Date(), stop_reason: "emergency" },
  });
  await logRadioAction(actorId, "social_emergency_stop_all", { stopped: running.length });
  return { stopped: running.length };
}

/**
 * What the dashboard renders. Every field comes from the encoder registry and
 * the database — never from what a button was last clicked, which is the
 * brief's §17 requirement.
 */
export async function getStatus() {
  const [featureEnabled, broadcasts, liveSession] = await Promise.all([
    getRadioSettingBool("social_live_enabled"),
    prisma.socialBroadcast.findMany({
      where: { state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
      include: { destinations: { include: { connection: { select: { platform: true, account_name: true } } } } },
      orderBy: { started_at: "desc" },
    }),
    prisma.liveSession.findFirst({
      where: { status: { in: ["live", "reconnecting"] }, is_test: false },
      orderBy: { started_at: "desc" },
      select: { id: true, show_title: true, started_at: true, station_id: true },
    }),
  ]);

  const station = liveSession?.station_id
    ? await prisma.radioStation.findUnique({ where: { id: liveSession.station_id }, select: { name: true } })
    : null;

  return {
    featureEnabled,
    onAir: Boolean(liveSession),
    currentShow: liveSession
      ? { title: liveSession.show_title, startedAt: liveSession.started_at, station: station?.name ?? null }
      : null,
    activeEncoders: activeEncoderCount(),
    broadcasts: broadcasts.map((b) => ({
      id: b.id,
      state: b.state as BroadcastState,
      trigger: b.trigger,
      startedAt: b.started_at,
      // The registry is the truth about whether a process exists; the row is
      // the truth about what it was for. Disagreement between them is itself
      // worth surfacing rather than hiding.
      processRunning: isEncoding(b.id),
      // What is actually on screen right now, and what the failover loop
      // thinks of the audio source. Both come from the running encoder, not
      // from what a button last did.
      scene: currentScene(b.id),
      supervisor: supervisorState(b.id),
      diagnostics: encoderDiagnostics(b.id),
      destinations: b.destinations.map((d) => ({
        id: d.id,
        platform: d.connection.platform,
        accountName: d.connection.account_name,
        state: d.state as BroadcastState,
        reconnectAttempts: d.reconnect_attempts,
        lastError: d.last_error,
        watchUrl: d.platform_watch_url,
      })),
    })),
  };
}
