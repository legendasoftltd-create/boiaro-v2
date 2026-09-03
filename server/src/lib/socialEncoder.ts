import { spawn, ChildProcess } from "child_process";
import { prisma } from "./prisma.js";
import { logRadioAction } from "./radioAudit.js";
import { redactStreamKeys } from "./socialCredentials.js";
import type { SceneKind } from "./socialScenes.js";

/**
 * The Social Live encoder process.
 *
 * Shape deliberately copied from lib/liveRecorder.ts — argument array, never
 * a shell; a keyed in-memory registry; SIGTERM, then SIGKILL after a grace
 * period. Beyond that it adds three things the recorder does not need:
 *
 *   1. The pid is persisted to social_broadcast_destinations, so a server
 *      restart can reconcile legs still claiming to be live.
 *   2. Multiple platforms are served by ONE process via ffmpeg's tee muxer.
 *      Measured on both production hosts: a 1080p30 encode costs about one
 *      core, so paying that once for two destinations rather than twice is
 *      the difference between comfortable and not. `onfail=ignore` keeps one
 *      platform failing from taking the other down.
 *   3. Video arrives as a stream of PNG frames on stdin rather than a single
 *      looped image, which is what makes a scene change possible WITHOUT
 *      restarting ffmpeg and dropping the RTMP connection. Verified
 *      empirically: an image passed with `-loop 1` is decoded once, so
 *      overwriting the file on disk changes nothing.
 *
 * The single most important property: it reads the Icecast stream over HTTP
 * exactly as a listener would, and writes nothing back to the radio path.
 * Kill any process it owns and the App and Website broadcast is unaffected.
 */

interface ActiveEncoder {
  proc: ChildProcess;
  broadcastId: string;
  destinationIds: string[];
  /** destinationId -> the ingest URL minus its stream key, for matching ffmpeg's own error lines. */
  destinationMatchers: { destinationId: string; needle: string }[];
  startedAt: number;
  stderrTail: string;
  scenes: Record<SceneKind, Buffer>;
  currentScene: SceneKind;
  frameTimer: NodeJS.Timeout;
  /** Destinations already marked failed, so one broken output is reported once. */
  failedDestinations: Set<string>;
}

const encoders = new Map<string, ActiveEncoder>();

export function isEncoding(broadcastId: string): boolean {
  return encoders.has(broadcastId);
}
export function activeEncoderCount(): number {
  return encoders.size;
}
export function activeBroadcastIds(): string[] {
  return [...encoders.keys()];
}
export function currentScene(broadcastId: string): SceneKind | null {
  return encoders.get(broadcastId)?.currentScene ?? null;
}

export interface EncoderDestination {
  destinationId: string;
  /** Full ingest URL including the stream key — built by socialCredentials.buildIngestUrl. */
  url: string;
}

export interface EncoderOptions {
  broadcastId: string;
  /** The public Icecast URL, exactly as a listener would fetch it. */
  sourceUrl: string;
  scenes: Record<SceneKind, Buffer>;
  initialScene: SceneKind;
  destinations: EncoderDestination[];
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  framerate: number;
  keyframeSeconds: number;
  preset: string;
  resolution: string;
  threads: number;
  /** How many PNG frames per second Node pushes; ffmpeg duplicates up to `framerate`. */
  sceneFps: number;
  /** Seconds ffmpeg keeps retrying the audio source before giving up. */
  sourceReconnectMaxSeconds: number;
  /** Encode and throw the output away instead of publishing. */
  dryRun?: boolean;
}

/**
 * Builds the ffmpeg argument array.
 *
 * Exported for testing: this decides what a process on the broadcast host is
 * actually told to do, so it is asserted against directly rather than only
 * through a spawned process. Every value is a separate array element —
 * nothing is concatenated into a string a shell could interpret.
 */
export function buildEncoderArgs(opts: EncoderOptions): string[] {
  const gop = Math.max(1, Math.round(opts.framerate * opts.keyframeSeconds));
  const args: string[] = [
    "-hide_banner",
    "-loglevel", "warning",

    // Video: a stream of PNG frames on stdin. Low input rate, duplicated up
    // to the output framerate — a static scene costs almost nothing, and a
    // scene change is just a different frame.
    "-f", "image2pipe",
    "-framerate", String(opts.sceneFps),
    "-i", "pipe:0",

    // Audio: the live Icecast feed. These reconnect options are what satisfy
    // "a few seconds of lost audio must not stop the broadcast" — ffmpeg
    // retries the source itself instead of exiting, so a brief Icecast blip
    // never reaches Facebook or YouTube. Confirmed present on the production
    // app server's ffmpeg 4.4.2 as well as the media server's 6.1.1.
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", String(Math.max(1, opts.sourceReconnectMaxSeconds)),
    // -re is deliberately absent: the source is already realtime, and pacing
    // it a second time causes drift.
    "-i", opts.sourceUrl,

    // Video from the scene pipe, audio from the radio feed. Required rather
    // than optional — ffmpeg's default stream selection produces a working
    // single output, but the tee muxer gets no streams at all without -map
    // and dies with "Output file does not contain any stream".
    "-map", "0:v:0",
    "-map", "1:a:0",

    // Must sit AFTER the inputs: before them, ffmpeg reads -threads as an
    // input (decoder) option and the encoder stays uncapped — measured at
    // ~595% CPU with it in the wrong place.
    "-threads", String(Math.max(1, opts.threads)),
    "-c:v", "libx264",
    "-preset", opts.preset,
    "-tune", "stillimage",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-s", opts.resolution,
    "-r", String(opts.framerate),
    "-b:v", `${opts.videoBitrateKbps}k`,
    "-maxrate", `${opts.videoBitrateKbps}k`,
    "-bufsize", `${opts.videoBitrateKbps * 2}k`,
    "-g", String(gop),
    "-keyint_min", String(gop),
    "-sc_threshold", "0",
    "-c:a", "aac",
    "-b:a", `${opts.audioBitrateKbps}k`,
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
  ];

  if (opts.dryRun || opts.destinations.length === 0) {
    args.push("-f", "null", "-");
    return args;
  }
  if (opts.destinations.length === 1) {
    args.push("-f", "flv", opts.destinations[0].url);
    return args;
  }
  const tee = opts.destinations.map((d) => `[f=flv:onfail=ignore]${d.url}`).join("|");
  args.push("-f", "tee", tee);
  return args;
}

/** The ingest URL minus its final path segment — the key — so error lines can be matched without holding a secret. */
function urlNeedle(url: string): string {
  const cut = url.lastIndexOf("/");
  return cut > 0 ? url.slice(0, cut) : url;
}

export async function startEncoder(opts: EncoderOptions): Promise<{ pid: number }> {
  if (encoders.has(opts.broadcastId)) {
    throw new Error("An encoder is already running for this broadcast.");
  }

  const args = buildEncoderArgs(opts);
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  // shell:false is spawn's default with an argument array, stated explicitly
  // because it is the property this module's safety rests on.
  const proc = spawn(binary, args, { stdio: ["pipe", "ignore", "pipe"], shell: false });

  const entry: ActiveEncoder = {
    proc,
    broadcastId: opts.broadcastId,
    destinationIds: opts.destinations.map((d) => d.destinationId),
    destinationMatchers: opts.destinations.map((d) => ({ destinationId: d.destinationId, needle: urlNeedle(d.url) })),
    startedAt: Date.now(),
    stderrTail: "",
    scenes: opts.scenes,
    currentScene: opts.initialScene,
    frameTimer: setInterval(() => {
      const e = encoders.get(opts.broadcastId);
      if (!e) return;
      const stdin = e.proc.stdin;
      if (!stdin || stdin.destroyed || !stdin.writable) return;
      // Never let a slow pipe queue frames without bound — dropping a frame
      // is invisible on a static scene, a growing buffer is not.
      if (stdin.writableLength > 4_000_000) return;
      try {
        stdin.write(e.scenes[e.currentScene]);
      } catch {
        /* the process is going away; the exit handler deals with it */
      }
    }, Math.max(100, Math.round(1000 / Math.max(1, opts.sceneFps)))),
    failedDestinations: new Set(),
  };

  proc.stdin?.on("error", () => {
    /* EPIPE once ffmpeg exits — expected, and not an error worth surfacing */
  });

  proc.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    // Platform errors happily quote the full ingest URL back at you, which
    // would otherwise put a live stream key into a log file.
    entry.stderrTail = redactStreamKeys((entry.stderrTail + text).slice(-4000));
    detectDestinationFailure(entry, text);
  });

  proc.on("error", (err) => {
    console.error(`[socialEncoder] failed to start for broadcast ${opts.broadcastId}:`, err.message);
    cleanupEntry(opts.broadcastId);
    void markFailed(opts.broadcastId, `Encoder failed to start: ${err.message}`);
  });

  proc.on("exit", (code, signal) => {
    // A clean stop removes the registry entry BEFORE killing the process, so
    // reaching here with the entry still present means ffmpeg died on its
    // own — a crash, a rejected stream key, or the source going away for
    // longer than the reconnect window.
    if (!encoders.has(opts.broadcastId)) return;
    cleanupEntry(opts.broadcastId);
    const detail = entry.stderrTail.slice(-500).trim();
    console.error(
      `[socialEncoder] broadcast ${opts.broadcastId} exited unexpectedly (code ${code}, signal ${signal}): ${detail}`
    );
    void markFailed(opts.broadcastId, detail || `Encoder exited unexpectedly (code ${code}).`);
  });

  encoders.set(opts.broadcastId, entry);
  // Prime the pipe so ffmpeg has a frame immediately rather than waiting out
  // the first interval.
  try {
    proc.stdin?.write(entry.scenes[entry.currentScene]);
  } catch {
    /* handled by the error listener above */
  }

  const pid = proc.pid ?? 0;
  await prisma.socialBroadcastDestination
    .updateMany({ where: { id: { in: entry.destinationIds } }, data: { encoder_pid: pid, state: "STARTING" } })
    .catch(() => null);

  return { pid };
}

/**
 * ffmpeg names the failing output when a tee slave dies. Matching on the URL
 * minus its key tells us WHICH platform dropped, which is the difference
 * between a dashboard that says "live" and one that tells the truth.
 */
function detectDestinationFailure(entry: ActiveEncoder, text: string): void {
  if (!/error|failed|unable|broken pipe|connection|timed out/i.test(text)) return;
  for (const { destinationId, needle } of entry.destinationMatchers) {
    if (!text.includes(needle)) continue;
    if (entry.failedDestinations.has(destinationId)) continue;
    entry.failedDestinations.add(destinationId);
    const safe = redactStreamKeys(text).trim().slice(0, 500);
    console.error(`[socialEncoder] destination ${destinationId} dropped: ${safe}`);
    void prisma.socialBroadcastDestination
      .update({
        where: { id: destinationId },
        data: { state: "FAILED", last_error: safe, last_disconnect_at: new Date(), ended_at: new Date() },
      })
      .catch(() => null);
    void logRadioAction("system", "social_destination_failed", { broadcastId: entry.broadcastId, destinationId });
  }
}

/** Switches the scene being published. Takes effect within one frame interval. */
export function setScene(broadcastId: string, kind: SceneKind): boolean {
  const entry = encoders.get(broadcastId);
  if (!entry || entry.currentScene === kind) return false;
  entry.currentScene = kind;
  return true;
}

function cleanupEntry(broadcastId: string): void {
  const entry = encoders.get(broadcastId);
  if (entry) clearInterval(entry.frameTimer);
  encoders.delete(broadcastId);
}

/**
 * Stops the encoder: SIGTERM, then SIGKILL if it has not gone within the
 * grace period. Removing the registry entry first is what tells the exit
 * handler this was deliberate rather than a crash.
 */
export async function stopEncoder(broadcastId: string, graceMs = 5000): Promise<boolean> {
  const entry = encoders.get(broadcastId);
  if (!entry) return false;
  cleanupEntry(broadcastId);

  try {
    entry.proc.stdin?.end();
  } catch {
    /* already closed */
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        entry.proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      resolve();
    }, graceMs);
    entry.proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      entry.proc.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
  return true;
}

/** The last few KB of ffmpeg's stderr for a running broadcast, already redacted. */
export function encoderDiagnostics(broadcastId: string): string | null {
  return encoders.get(broadcastId)?.stderrTail ?? null;
}

async function markFailed(broadcastId: string, error: string): Promise<void> {
  const safe = redactStreamKeys(error).slice(0, 1000);
  await prisma.socialBroadcastDestination
    .updateMany({
      where: { broadcast_id: broadcastId, state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
      data: { state: "FAILED", last_error: safe, ended_at: new Date(), encoder_pid: null },
    })
    .catch(() => null);
  await prisma.socialBroadcast
    .updateMany({
      where: { id: broadcastId, state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
      data: { state: "FAILED", ended_at: new Date(), stop_reason: "failed" },
    })
    .catch(() => null);
  await logRadioAction("system", "social_encoder_failed", { broadcastId, error: safe });
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Called once at server startup. Rows can survive a restart still claiming to
 * be live while the process that owned them is long gone — the same problem
 * reconcileOrphanedStudioSessions solves for Studio sessions.
 *
 * A pid still alive after a restart is an orphan ffmpeg the new process no
 * longer controls: it is killed, because leaving it running means a stream
 * nobody can stop from the dashboard, and a duplicate encoder the moment
 * someone starts that broadcast again.
 */
export async function reconcileOrphanedEncoders(): Promise<{ reconciled: number; killed: number }> {
  const stale = await prisma.socialBroadcastDestination.findMany({
    where: { state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] } },
    select: { id: true, broadcast_id: true, encoder_pid: true },
  });
  if (!stale.length) return { reconciled: 0, killed: 0 };

  let killed = 0;
  for (const row of stale) {
    if (row.encoder_pid && pidAlive(row.encoder_pid)) {
      try {
        process.kill(row.encoder_pid, "SIGKILL");
        killed++;
      } catch {
        /* it went away between the check and the signal */
      }
    }
  }

  await prisma.socialBroadcastDestination.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { state: "OFFLINE", encoder_pid: null, ended_at: new Date(), last_error: "Ended by a server restart." },
  });
  await prisma.socialBroadcast.updateMany({
    where: {
      id: { in: [...new Set(stale.map((r) => r.broadcast_id))] },
      state: { in: ["STARTING", "LIVE", "RECONNECTING", "STOPPING"] },
    },
    data: { state: "OFFLINE", ended_at: new Date(), stop_reason: "server_restart" },
  });

  await logRadioAction("system", "social_encoders_reconciled", { rows: stale.length, killed });
  console.log(`[socialEncoder] reconciled ${stale.length} orphaned leg(s) after restart, killed ${killed} process(es)`);
  return { reconciled: stale.length, killed };
}
