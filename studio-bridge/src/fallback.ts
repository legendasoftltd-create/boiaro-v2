import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Always-on ffmpeg process looping a local standby playlist into Icecast's
 * fallback mount — not RTMP-triggered like bridge.ts's per-broadcast
 * processes, this starts once at boot and runs indefinitely. Mirrors
 * bridge.ts's exit/restart watchdog idiom (proven in Phase 1 by force-
 * killing the process) rather than sharing code with it — same pattern,
 * different trigger, not worth abstracting for two call sites.
 *
 * playlist.txt (ffmpeg concat-demuxer format) is pre-transcoded ONCE into a
 * single combined file at boot, and *that* is what actually gets looped.
 * Two things were tried and both broke on the loop wrap, reproduced in
 * isolation with no Icecast/watchdog involved:
 *   - `-stream_loop -1` directly over the concat demuxer: crashes ~15s in
 *     with "Operation not permitted" the moment it wraps.
 *   - `-stream_loop -1 -i "concat:a|b"` (concat protocol): doesn't crash,
 *     but throws a "Header missing" decoder error on every wrap — audible
 *     glitches forever, silently, since the process itself never exits.
 * Looping a single, cleanly re-encoded file is ffmpeg's ordinary, reliable
 * use of -stream_loop — the pre-transcode step exists specifically to avoid
 * both failure modes above.
 */
const ICECAST_HOST = process.env.ICECAST_HOST || "localhost";
const ICECAST_PORT = process.env.ICECAST_PORT || "8000";
const ICECAST_PASSWORD = process.env.ICECAST_SOURCE_PASSWORD || "devpassword";
const FALLBACK_MOUNT = process.env.ICECAST_FALLBACK_MOUNT || "/fallback.mp3";
const PLAYLIST_DIR = process.env.FALLBACK_PLAYLIST_DIR || join(process.cwd(), "fallback-playlist");
const COMBINED_PATH = join(tmpdir(), "studio-fallback-combined.mp3");
const MIN_STABLE_MS = Number(process.env.BRIDGE_MIN_STABLE_MS || 10_000);
const BACKOFF_BASE_MS = Number(process.env.BRIDGE_BACKOFF_BASE_MS || 1_000);
const BACKOFF_MAX_MS = Number(process.env.BRIDGE_BACKOFF_MAX_MS || 30_000);

let proc: ChildProcess | null = null;
let stopping = false;
let startedAt = 0;
let restartAttempt = 0;
let restartTimer: NodeJS.Timeout | null = null;

function icecastUrl() {
  return `icecast://source:${ICECAST_PASSWORD}@${ICECAST_HOST}:${ICECAST_PORT}${FALLBACK_MOUNT}`;
}

/** One-shot (non-looping) transcode of playlist.txt into a single clean file. */
function buildCombinedFile(): boolean {
  console.log(`[fallback] building combined playlist file -> ${COMBINED_PATH}`);
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "warning", "-f", "concat", "-safe", "0", "-i", "playlist.txt", "-acodec", "libmp3lame", "-b:a", "128k", COMBINED_PATH],
    { cwd: PLAYLIST_DIR, stdio: ["ignore", "pipe", "pipe"] }
  );
  if (result.status !== 0) {
    console.error(`[fallback] failed to build combined file:`, result.stderr?.toString().trim());
    return false;
  }
  return true;
}

function spawnFfmpeg(): ChildProcess {
  const args = [
    "-loglevel", "warning",
    "-stream_loop", "-1",
    "-re",
    "-i", COMBINED_PATH,
    "-acodec", "libmp3lame",
    "-b:a", "128k",
    "-content_type", "audio/mpeg",
    "-f", "mp3",
    icecastUrl(),
  ];
  console.log(`[fallback] starting looper -> ${FALLBACK_MOUNT}`);
  return spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
}

function attach() {
  const p = spawnFfmpeg();
  proc = p;
  startedAt = Date.now();

  p.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[fallback] ${line}`);
  });

  p.on("error", (err) => {
    console.error("[fallback] ffmpeg spawn error:", err.message);
    if (proc === p) proc = null;
  });

  p.on("exit", (code, signal) => {
    if (proc !== p) return; // stale exit from an already-replaced process

    if (stopping) {
      proc = null;
      console.log("[fallback] looper stopped cleanly");
      return;
    }

    const ranMs = Date.now() - startedAt;
    const nextAttempt = ranMs >= MIN_STABLE_MS ? 0 : restartAttempt + 1;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** nextAttempt, BACKOFF_MAX_MS);
    console.error(
      `[fallback] looper exited unexpectedly (code=${code}, signal=${signal}) after ${ranMs}ms — ` +
      `restarting in ${delay}ms (attempt ${nextAttempt + 1})`
    );
    restartAttempt = nextAttempt;
    proc = null;
    restartTimer = setTimeout(attach, delay);
  });
}

export function startFallbackLoop() {
  if (proc || restartTimer) {
    console.warn("[fallback] looper already running, ignoring duplicate start");
    return;
  }
  if (!buildCombinedFile()) {
    console.error("[fallback] not starting looper — combined file build failed");
    return;
  }
  stopping = false;
  restartAttempt = 0;
  attach();
}

export function stopFallbackLoop() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (!proc) return;
  stopping = true;
  proc.kill("SIGTERM");
  const p = proc;
  const killTimer = setTimeout(() => {
    if (proc === p) proc.kill("SIGKILL");
  }, 5_000);
  p.once("exit", () => clearTimeout(killTimer));
}
