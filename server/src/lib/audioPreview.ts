import { spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { prisma } from "./prisma.js";
import { s3Configured, createPresignedGetUrl, isS3Url, uploadToS3 } from "./s3.js";
import { resolveFileUrl } from "./mediaUrl.js";

const MIN_PREVIEW_SECONDS = 60;
const MAX_PREVIEW_SECONDS = 300;
const DEFAULT_PREVIEW_SECONDS = 300;
const DEFAULT_PREVIEW_PERCENTAGE = 15;

/**
 * Mirrors src/lib/duration.ts on the client, plus a "MM:SS" fallback for the
 * per-track duration format (e.g. "8:33") used by AudiobookTrack.duration.
 */
function durationStringToSeconds(dur: string | null | undefined): number {
  if (!dur) return 0;
  const s = dur.trim();

  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return parseInt(hms[1]) * 3600 + parseInt(hms[2]) * 60 + parseInt(hms[3]);

  const h = s.match(/(\d+)\s*h/i);
  const m = s.match(/(\d+)\s*m/i);
  const sec = s.match(/(\d+)\s*s/i);
  if (h || m || sec) {
    return (parseInt(h?.[1] || "0") * 3600) + (parseInt(m?.[1] || "0") * 60) + parseInt(sec?.[1] || "0");
  }

  const ms = s.match(/^(\d+):(\d{2})$/);
  if (ms) return parseInt(ms[1]) * 60 + parseInt(ms[2]);

  return 0;
}

function probeDurationSeconds(url: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      url,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("close", () => {
      const sec = parseFloat(out.trim());
      resolve(Number.isFinite(sec) ? sec : 0);
    });
    proc.on("error", () => resolve(0));
  });
}

async function resolveReadableUrl(rawUrl: string): Promise<string> {
  const resolved = resolveFileUrl(rawUrl);
  if (!resolved) throw new Error("No audio URL to read");
  if (s3Configured && isS3Url(resolved)) return createPresignedGetUrl(resolved, 600);
  return resolved;
}

/**
 * Mirrors the client-side preview-limit formula in useAudiobookAccess.ts:
 * preview_chapters% of total book duration, clamped to [60, 300] seconds.
 * Falls back to summing actual track durations via ffprobe if the stored
 * `duration` string on the format is missing/unparseable.
 */
export async function computePreviewTargetSeconds(bookFormatId: string): Promise<number> {
  const format = await prisma.bookFormat.findUnique({
    where: { id: bookFormatId },
    select: { duration: true, preview_chapters: true },
  });
  if (!format) return DEFAULT_PREVIEW_SECONDS;

  const pct = format.preview_chapters ?? DEFAULT_PREVIEW_PERCENTAGE;
  let totalSeconds = durationStringToSeconds(format.duration);

  if (totalSeconds <= 0) {
    const tracks = await prisma.audiobookTrack.findMany({
      where: { book_format_id: bookFormatId, status: "active", media_type: "audio" },
      select: { audio_url: true },
    });
    for (const t of tracks) {
      if (!t.audio_url) continue;
      try {
        totalSeconds += await probeDurationSeconds(await resolveReadableUrl(t.audio_url));
      } catch {
        // skip unreachable track, fall through with whatever we accumulated
      }
    }
  }

  if (totalSeconds <= 0) return DEFAULT_PREVIEW_SECONDS;
  const percentageBased = Math.ceil(totalSeconds * (pct / 100));
  return Math.max(MIN_PREVIEW_SECONDS, Math.min(MAX_PREVIEW_SECONDS, percentageBased));
}

/**
 * Trims a track's audio down to `targetSeconds`, uploads the clip, and
 * stores the result on `preview_audio_url`. Re-encodes to mp3 rather than
 * stream-copying so the cut point is always a clean, playable file
 * regardless of the source container/codec.
 *
 * Returns the new preview URL, or null if the track has no audio or isn't
 * an audio track (video chapters aren't trimmed).
 */
export async function generatePreviewClip(trackId: string, targetSeconds: number): Promise<string | null> {
  const track = await prisma.audiobookTrack.findUnique({ where: { id: trackId } });
  if (!track || !track.audio_url || track.media_type !== "audio") return null;

  const sourceUrl = await resolveReadableUrl(track.audio_url);
  const tmpFile = path.join(os.tmpdir(), `preview-${crypto.randomUUID()}.mp3`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y",
      "-i", sourceUrl,
      "-t", String(targetSeconds),
      "-vn",
      "-acodec", "libmp3lame",
      "-q:a", "4",
      tmpFile,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);
  });

  try {
    const buffer = await fs.readFile(tmpFile);
    const previewUrl = await uploadToS3(buffer, `preview-${trackId}.mp3`, "audio/mpeg", { folder: "audio-previews" });
    await prisma.audiobookTrack.update({
      where: { id: trackId },
      data: { preview_audio_url: previewUrl },
    });
    return previewUrl;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

/**
 * Regenerates preview clips for every is_preview track of a book format.
 * Call this when preview_chapters (percentage) or duration changes, or as
 * a one-off backfill for already-uploaded preview tracks.
 */
export async function regeneratePreviewClipsForFormat(bookFormatId: string): Promise<{ generated: number; failed: number }> {
  const targetSeconds = await computePreviewTargetSeconds(bookFormatId);
  const previewTracks = await prisma.audiobookTrack.findMany({
    where: { book_format_id: bookFormatId, is_preview: true, status: "active", media_type: "audio" },
  });

  let generated = 0;
  let failed = 0;
  for (const track of previewTracks) {
    try {
      const url = await generatePreviewClip(track.id, targetSeconds);
      if (url) generated++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`[audioPreview] failed to generate preview for track ${track.id}:`, err);
    }
  }
  return { generated, failed };
}
