import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma.js";
import { uploadWithFallback } from "./s3.js";
import { logRadioAction } from "./radioAudit.js";
import { getRadioSettingBool } from "./radioSettings.js";
import { isRecordingStorageBudgetAvailable } from "./radioCostControl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Global toggle AND (if a station is set) station toggle AND the session's own flag all have to say yes. */
export async function shouldAutoRecord(stationId: string | null | undefined, sessionRecordingEnabled: boolean): Promise<boolean> {
  if (!sessionRecordingEnabled) return false;
  if (!(await getRadioSettingBool("radio_recording_enabled"))) return false;
  if (!stationId) return false;
  const station = await prisma.radioStation.findUnique({ where: { id: stationId }, select: { auto_recording_enabled: true } });
  if (!station?.auto_recording_enabled) return false;
  // Storage costs real money — once an admin-set limit is reached, new
  // automatic captures are silently skipped (not an error the broadcast
  // itself should fail over) rather than growing storage unbounded. The RJ
  // can still manually attach a recording later if space is freed up.
  if (!(await isRecordingStorageBudgetAvailable())) return false;
  return true;
}

// Never held on local disk long-term — this is a scratch directory the
// capture writes to, and every file is deleted immediately after the
// finished recording is uploaded (or discarded, if the upload fails).
const RECORDING_TMP_DIR = path.join(os.tmpdir(), "radio-recordings");

const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");
const BASE_URL = (process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");
const fallbackConfig = { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL };

interface ActiveRecording {
  proc: ChildProcess;
  filePath: string;
}

const activeRecordings = new Map<string, ActiveRecording>();

export function isRecording(sessionId: string): boolean {
  return activeRecordings.has(sessionId);
}

function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("close", () => {
      const sec = parseFloat(out.trim());
      resolve(Number.isFinite(sec) ? Math.round(sec) : null);
    });
    proc.on("error", () => resolve(null));
  });
}

/**
 * Starts capturing a live session's public stream URL to a local scratch
 * file via ffmpeg. `-c copy` remuxes without re-encoding — no transcoding
 * CPU cost — which works as long as the source is already MP3/AAC (the
 * normal case for an Icecast-hosted RJ stream). If the source uses a codec
 * that can't be copied into an mp3 container, ffmpeg exits immediately and
 * this is logged rather than silently failing — the RJ can still manually
 * attach a recording afterward, same as before this feature existed.
 */
export function startRecording(sessionId: string, streamUrl: string): void {
  if (activeRecordings.has(sessionId)) return;
  if (!fs.existsSync(RECORDING_TMP_DIR)) fs.mkdirSync(RECORDING_TMP_DIR, { recursive: true });
  const filePath = path.join(RECORDING_TMP_DIR, `${sessionId}.mp3`);

  const proc = spawn("ffmpeg", ["-y", "-i", streamUrl, "-c", "copy", "-f", "mp3", filePath], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderrTail = "";
  proc.stderr?.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });

  proc.on("error", (err) => {
    console.error(`[liveRecorder] ffmpeg failed to start for session ${sessionId}:`, err.message);
    activeRecordings.delete(sessionId);
  });

  proc.on("exit", (code) => {
    // An early, unexpected exit (stream dropped, codec mismatch) — clean up
    // so a stuck entry doesn't block a future stopAndUpload call from ever
    // resolving. A clean stop always goes through stopAndUploadRecording()
    // first, which removes the map entry itself before killing the process.
    if (activeRecordings.has(sessionId)) {
      console.error(`[liveRecorder] ffmpeg for session ${sessionId} exited early (code ${code}): ${stderrTail.slice(-300)}`);
      activeRecordings.delete(sessionId);
    }
  });

  activeRecordings.set(sessionId, { proc, filePath });
  prisma.liveSession
    .update({ where: { id: sessionId }, data: { recording_status: "recording", recording_source: "automatic" } })
    .catch(() => null);
}

/** Stops capture (if running) and returns immediately — upload happens in the background. */
export function stopRecording(sessionId: string): void {
  const entry = activeRecordings.get(sessionId);
  if (!entry) return;
  activeRecordings.delete(sessionId);
  finishRecording(sessionId, entry).catch((err) => console.error(`[liveRecorder] finish failed for ${sessionId}:`, err?.message));
}

async function finishRecording(sessionId: string, entry: ActiveRecording): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try { entry.proc.kill("SIGKILL"); } catch { /* already dead */ }
      resolve();
    }, 5000);
    entry.proc.once("exit", () => { clearTimeout(timer); resolve(); });
    entry.proc.kill("SIGTERM");
  });

  await prisma.liveSession.update({ where: { id: sessionId }, data: { recording_status: "processing" } }).catch(() => null);

  try {
    const stat = fs.statSync(entry.filePath);
    // Basically empty — capture never really got going (e.g. stream URL was
    // unreachable). Treat as "no recording" rather than publishing silence.
    if (stat.size < 10_000) {
      await prisma.liveSession.update({ where: { id: sessionId }, data: { recording_status: null, recording_source: null } }).catch(() => null);
      return;
    }

    const [buffer, duration] = await Promise.all([
      fs.promises.readFile(entry.filePath),
      probeDurationSeconds(entry.filePath),
    ]);

    const result = await uploadWithFallback(
      buffer,
      `${sessionId}.mp3`,
      "audio/mpeg",
      { hint: "audio", folder: "radio-recordings" },
      fallbackConfig
    );

    await prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        recording_url: result.url,
        recording_status: "draft",
        recording_file_size_bytes: stat.size,
        recording_duration_seconds: duration,
      },
    });
    await logRadioAction("system", "recording_auto_captured", { sessionId, bytes: stat.size, via: result.via });
  } catch (err: any) {
    console.error(`[liveRecorder] capture/upload failed for session ${sessionId}:`, err?.message);
    await prisma.liveSession.update({ where: { id: sessionId }, data: { recording_status: null } }).catch(() => null);
  } finally {
    fs.unlink(entry.filePath, () => {});
  }
}
