import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, promises as fs } from "node:fs";
import { join } from "node:path";

/**
 * One ffmpeg process per active RTMP stream path, pulling from the local
 * node-media-server ingest and pushing to Icecast. Mirrors the
 * Map<id, {proc}> + on("error")/on("exit") pattern used by
 * server/src/lib/liveRecorder.ts, plus an auto-restart watchdog — which
 * liveRecorder.ts intentionally doesn't have (a dropped recording just
 * stops; a dropped live broadcast needs to self-heal).
 *
 * The same ffmpeg process also writes a second, higher-quality WAV output
 * alongside the Icecast push (tapped before Icecast's 128kbps compression —
 * see Phase 3a plan). The WAV path is stable per streamPath and overwritten
 * (-y) on a watchdog restart: a crash mid-broadcast is rare, and losing the
 * pre-crash portion of the *master* recording is an acceptable trade-off
 * for keeping this simple — the live Icecast stream (the critical path) is
 * unaffected either way.
 */
interface BridgeEntry {
  proc: ChildProcess;
  stopping: boolean;
  startedAt: number;
  restartAttempt: number;
  restartTimer: NodeJS.Timeout | null;
  wavPath: string;
}

const sessions = new Map<string, BridgeEntry>();

const RTMP_PORT = process.env.RTMP_PORT || "1935";
const ICECAST_HOST = process.env.ICECAST_HOST || "localhost";
const ICECAST_PORT = process.env.ICECAST_PORT || "8000";
const ICECAST_MOUNT = process.env.ICECAST_MOUNT || "/studio-test.mp3";
const ICECAST_PASSWORD = process.env.ICECAST_SOURCE_PASSWORD || "devpassword";
const MIN_STABLE_MS = Number(process.env.BRIDGE_MIN_STABLE_MS || 10_000);
const BACKOFF_BASE_MS = Number(process.env.BRIDGE_BACKOFF_BASE_MS || 1_000);
const BACKOFF_MAX_MS = Number(process.env.BRIDGE_BACKOFF_MAX_MS || 30_000);
const MASTER_DIR = process.env.STUDIO_MASTER_DIR || "/tmp/studio-masters";
const SERVER_URL = process.env.STUDIO_SERVER_URL || "http://localhost:3001";
const INTERNAL_SECRET = process.env.STUDIO_BRIDGE_INTERNAL_SECRET || "";

function icecastUrl() {
  return `icecast://source:${ICECAST_PASSWORD}@${ICECAST_HOST}:${ICECAST_PORT}${ICECAST_MOUNT}`;
}

function roomNameFromStreamPath(streamPath: string) {
  // streamPath looks like "/live/<room_name>" — strip to the bare room name.
  return streamPath.replace(/^\/live\//, "");
}

function wavPathFor(streamPath: string) {
  const safe = roomNameFromStreamPath(streamPath).replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(MASTER_DIR, `${safe}.wav`);
}

function spawnFfmpeg(streamPath: string, wavPath: string): ChildProcess {
  const rtmpUrl = `rtmp://127.0.0.1:${RTMP_PORT}${streamPath}`;
  const args = [
    "-loglevel", "warning",
    "-re",
    "-i", rtmpUrl,
    "-vn",
    "-acodec", "libmp3lame",
    "-b:a", "128k",
    "-content_type", "audio/mpeg",
    "-f", "mp3",
    icecastUrl(),
    "-vn",
    "-acodec", "pcm_s16le",
    "-ar", "44100",
    "-y",
    "-f", "wav",
    wavPath,
  ];
  console.log(`[bridge] starting ffmpeg for ${streamPath} -> ${ICECAST_MOUNT} + ${wavPath}`);
  return spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
}

async function notifyMasterReady(streamPath: string, wavPath: string) {
  const roomName = roomNameFromStreamPath(streamPath);
  try {
    const stat = await fs.stat(wavPath).catch(() => null);
    if (!stat) {
      console.error(`[bridge] master WAV missing for ${roomName} at ${wavPath}, skipping upload`);
      return;
    }

    // The app server and the Bridge Relay run on separate hosts in
    // production, so the webhook can't just hand over a local path — it
    // pushes the file itself as multipart form data. Multipart is exempted
    // from the server's global "Content-Type must be application/json"
    // mutation guard (server/src/index.ts), the same exemption already used
    // for the app's other file-upload endpoints (multer/memoryStorage).
    const buffer = await fs.readFile(wavPath);
    const form = new FormData();
    form.append("roomName", roomName);
    form.append("file", new Blob([buffer], { type: "audio/wav" }), `${roomName}.wav`);

    const res = await fetch(`${SERVER_URL}/api/v1/studio/internal/master-ready`, {
      method: "POST",
      headers: {
        "X-Studio-Internal-Secret": INTERNAL_SECRET,
        // Server-wide CSRF middleware (server/src/index.ts) requires this on
        // any /api/v1 mutation that isn't Bearer-authenticated — this call
        // is service-to-service (shared-secret auth instead), so it needs
        // the same opt-in browser requests get automatically.
        "X-Requested-With": "studio-bridge",
      },
      body: form,
    });
    if (!res.ok) console.error(`[bridge] master-ready webhook failed for ${roomName}: ${res.status}`);
    else console.log(`[bridge] master-ready webhook sent for ${roomName}`);
  } catch (err: any) {
    console.error(`[bridge] master-ready webhook error for ${roomName}:`, err.message);
  } finally {
    // Only this host has the file — cleanup has to happen here, not on the
    // (remote) app server, regardless of whether the upload succeeded.
    await fs.unlink(wavPath).catch(() => null);
  }
}

export function startBridge(streamPath: string) {
  if (sessions.has(streamPath)) {
    console.warn(`[bridge] ${streamPath} already has an active bridge, ignoring duplicate start`);
    return;
  }
  mkdirSync(MASTER_DIR, { recursive: true });
  attachAndTrack(streamPath, 0);
}

function attachAndTrack(streamPath: string, restartAttempt: number) {
  const wavPath = wavPathFor(streamPath);
  const proc = spawnFfmpeg(streamPath, wavPath);
  const entry: BridgeEntry = { proc, stopping: false, startedAt: Date.now(), restartAttempt, restartTimer: null, wavPath };
  sessions.set(streamPath, entry);

  proc.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[bridge:${streamPath}] ${line}`);
  });

  proc.on("error", (err) => {
    console.error(`[bridge] ffmpeg spawn error for ${streamPath}:`, err.message);
    sessions.delete(streamPath);
  });

  proc.on("exit", (code, signal) => {
    const current = sessions.get(streamPath);
    // If the map entry is gone or was replaced by a newer proc, this exit is stale — ignore.
    if (!current || current.proc !== proc) return;

    if (current.stopping) {
      sessions.delete(streamPath);
      console.log(`[bridge] ${streamPath} stopped cleanly`);
      notifyMasterReady(streamPath, current.wavPath);
      return;
    }

    // Unexpected exit — this is what the watchdog exists for.
    const ranMs = Date.now() - current.startedAt;
    const nextAttempt = ranMs >= MIN_STABLE_MS ? 0 : current.restartAttempt + 1;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** nextAttempt, BACKOFF_MAX_MS);
    console.error(
      `[bridge] ${streamPath} exited unexpectedly (code=${code}, signal=${signal}) after ${ranMs}ms — ` +
      `restarting in ${delay}ms (attempt ${nextAttempt + 1}) — master WAV recording restarts from scratch`
    );
    sessions.delete(streamPath);
    const timer = setTimeout(() => attachAndTrack(streamPath, nextAttempt), delay);
    // Keep a placeholder so a stopBridge() call during the backoff window can cancel the pending restart.
    sessions.set(streamPath, { proc, stopping: false, startedAt: current.startedAt, restartAttempt: nextAttempt, restartTimer: timer, wavPath: current.wavPath });
  });
}

export function stopBridge(streamPath: string) {
  const entry = sessions.get(streamPath);
  if (!entry) return;

  if (entry.restartTimer) {
    clearTimeout(entry.restartTimer);
    sessions.delete(streamPath);
    console.log(`[bridge] ${streamPath} cancelled pending restart`);
    return;
  }

  entry.stopping = true;
  entry.proc.kill("SIGTERM");
  const killTimer = setTimeout(() => {
    if (sessions.get(streamPath)?.proc === entry.proc) entry.proc.kill("SIGKILL");
  }, 5_000);
  entry.proc.once("exit", () => clearTimeout(killTimer));
}

export function activeBridgeCount() {
  return sessions.size;
}
