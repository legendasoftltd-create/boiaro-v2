import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma.js";
import { uploadWithFallback } from "./s3.js";
import { resolveFileUrl } from "./mediaUrl.js";
import { notifyFollowersOfShowPublished } from "./radioNotify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same uploads dir / base URL convention as liveRecorder.ts and the Studio
// master upload route, so a transcoded episode falls back to local disk the
// same way its master WAV did when S3 isn't configured.
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");
const BASE_URL = (process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");
const fallbackConfig = { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL };

// Scratch space only — every file written here is deleted once the encoded
// result has been uploaded (or the attempt has failed).
const TRANSCODE_TMP_DIR = path.join(os.tmpdir(), "onair-episodes");

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

/** Constant-bitrate MP3 — universally seekable on both app players, unlike VBR. */
const STREAM_BITRATE = process.env.ONAIR_STREAM_BITRATE || "128k";

// One transcode per episode at a time. Publishing is an admin click, and a
// double-click (or a retry while the first pass is still encoding) would
// otherwise run two ffmpeg processes over the same hour-long WAV.
const inFlight = new Set<string>();

// The status the episode should land on once its encode finishes. Kept outside
// the running job so a *second* publish during the encode (e.g. the admin
// switches from Draft to Publish Now while it converts) still takes effect —
// the in-flight guard skips the duplicate ffmpeg run, not the new intent.
const pendingTargets = new Map<string, string>();

export function isTranscoding(episodeId: string): boolean {
  return inFlight.has(episodeId);
}

export function probeDurationSeconds(source: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      source,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("close", () => {
      const sec = parseFloat(out.trim());
      resolve(Number.isFinite(sec) && sec > 0 ? Math.round(sec) : null);
    });
    proc.on("error", () => resolve(null));
  });
}

function encodeToMp3(source: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // -vn drops any cover-art stream (a WAV master shouldn't have one, but an
    // admin-supplied replacement file might, and libmp3lame refuses to write
    // some of them). -ar/-ac normalise to the CD-standard stereo layout every
    // mobile decoder handles.
    const proc = spawn(FFMPEG, [
      "-y",
      "-nostdin",
      "-i", source,
      "-vn",
      "-c:a", "libmp3lame",
      "-b:a", STREAM_BITRATE,
      "-ar", "44100",
      "-ac", "2",
      // Write the Xing header so players can seek accurately without having
      // to scan the whole file first — this is what makes the app's seek bar
      // land on the right place in a 90-minute show.
      "-write_xing", "1",
      outPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });

    let stderrTail = "";
    proc.stderr?.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderrTail.slice(-400)}`));
    });
  });
}

export interface TranscodeResult {
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

/**
 * Produces the streaming copy of an episode's master audio.
 *
 * The Studio master is a WAV — roughly 600 MB for a 60-minute stereo show —
 * which is why requirement 1 forbids serving it to the app directly. This
 * re-encodes it to a 128 kbps MP3 (~55 MB for the same hour) and uploads that
 * as `stream_audio_url`. The master is never touched: it stays in S3 as the
 * backup copy.
 *
 * ffmpeg reads the source over HTTP rather than the file being downloaded
 * first, so a long master never has to land on this box's disk twice.
 */
export async function transcodeEpisodeAudio(episodeId: string, masterUrl: string): Promise<TranscodeResult> {
  const source = resolveFileUrl(masterUrl) ?? masterUrl;
  if (!fs.existsSync(TRANSCODE_TMP_DIR)) fs.mkdirSync(TRANSCODE_TMP_DIR, { recursive: true });
  const outPath = path.join(TRANSCODE_TMP_DIR, `${episodeId}.mp3`);

  try {
    await encodeToMp3(source, outPath);
    const stat = fs.statSync(outPath);
    if (stat.size < 10_000) throw new Error("Encoded file is empty — the master audio may be silent or unreadable");

    // Probe the encoded file, not the source: that's the duration the app's
    // seek bar and "1h 18m" label actually have to agree with.
    const durationSeconds = await probeDurationSeconds(outPath);

    const buffer = fs.readFileSync(outPath);
    const result = await uploadWithFallback(
      buffer,
      `${episodeId}-stream.mp3`,
      "audio/mpeg",
      { hint: "audio", folder: "onair-episodes" },
      fallbackConfig
    );

    return { url: result.url, mimeType: "audio/mpeg", sizeBytes: stat.size, durationSeconds };
  } finally {
    fs.promises.unlink(outPath).catch(() => null);
  }
}

/**
 * Kicks off the transcode in the background and writes the outcome back to the
 * episode row. Deliberately not awaited by the publish mutation — an hour-long
 * WAV takes minutes to encode, far past any HTTP timeout — so the admin UI
 * polls `transcode_status` instead.
 *
 * The episode stays in "processing" until this completes; only then does it
 * move to its intended status (published / draft), which is what stops a
 * half-encoded show from appearing in Latest Shows.
 */
export function startEpisodeTranscode(episodeId: string, masterUrl: string, targetStatus: string): void {
  pendingTargets.set(episodeId, targetStatus);
  if (inFlight.has(episodeId)) return;
  inFlight.add(episodeId);

  void (async () => {
    try {
      await prisma.onAirEpisode.update({
        where: { id: episodeId },
        data: { transcode_status: "processing", transcode_error: null, status: "processing" },
      });

      const result = await transcodeEpisodeAudio(episodeId, masterUrl);

      // Re-read rather than trusting the status captured at kickoff — an admin
      // may have unpublished or rescheduled the episode while it encoded.
      const current = await prisma.onAirEpisode.findUnique({ where: { id: episodeId } });
      if (!current) return;

      const scheduled = current.publish_at && current.publish_at.getTime() > Date.now();
      const wanted = pendingTargets.get(episodeId) ?? targetStatus;
      const finalStatus = wanted === "published" && scheduled ? "draft" : wanted;
      const firstRelease = finalStatus === "published" && !current.published_at;

      await prisma.onAirEpisode.update({
        where: { id: episodeId },
        data: {
          stream_audio_url: result.url,
          stream_mime_type: result.mimeType,
          stream_size_bytes: result.sizeBytes,
          ...(result.durationSeconds ? { duration_seconds: result.durationSeconds } : {}),
          transcode_status: "completed",
          transcode_error: null,
          status: finalStatus,
          ...(firstRelease ? { published_at: new Date() } : {}),
        },
      });
      // The publish mutation can't announce a first release itself: a first
      // publish always parks in "processing" while this runs, so the followers
      // notification belongs here, at the moment the show actually goes live.
      if (firstRelease) {
        notifyFollowersOfShowPublished(current.rj_user_id, current.title, episodeId).catch(() => null);
      }
      console.log(`[episodeTranscoder] episode ${episodeId} encoded (${Math.round(result.sizeBytes / 1024 / 1024)} MB) → ${finalStatus}`);
    } catch (err: any) {
      console.error(`[episodeTranscoder] episode ${episodeId} failed:`, err?.message);
      await prisma.onAirEpisode.update({
        where: { id: episodeId },
        data: {
          transcode_status: "failed",
          transcode_error: String(err?.message ?? err).slice(0, 500),
          // Back to draft, never published — a failed encode must not leave an
          // episode publicly listed with no playable audio.
          status: "draft",
        },
      }).catch(() => null);
    } finally {
      inFlight.delete(episodeId);
      pendingTargets.delete(episodeId);
    }
  })();
}
