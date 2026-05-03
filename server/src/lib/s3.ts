import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";
import crypto from "crypto";
import fs from "fs";

// ─── Config ──────────────────────────────────────────────────────────────────

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_S3_BUCKET,
  AWS_S3_ENDPOINT,   // optional: S3-compatible providers (MinIO, Cloudflare R2)
  AWS_S3_PUBLIC_URL, // optional: CDN / custom domain prefix
} = process.env;

export const s3Configured =
  Boolean(AWS_ACCESS_KEY_ID) &&
  Boolean(AWS_SECRET_ACCESS_KEY) &&
  Boolean(AWS_S3_BUCKET);

// ─── S3 Client ───────────────────────────────────────────────────────────────

export const s3Client = new S3Client({
  region: AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID || "",
    secretAccessKey: AWS_SECRET_ACCESS_KEY || "",
  },
  ...(AWS_S3_ENDPOINT ? { endpoint: AWS_S3_ENDPOINT, forcePathStyle: true } : {}),
  requestHandler: { requestTimeout: 15_000 }, // 15s timeout per request
});

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
//
// Prevents hammering a down S3 on every upload.
// States:
//   closed    → normal operation, all uploads go to S3
//   open      → S3 is down, skip and use local immediately
//   half-open → recovery probe: allow one attempt to test S3

interface CircuitBreaker {
  state: "closed" | "open" | "half-open";
  failureCount: number;
  lastFailureAt: number;
  readonly threshold: number;   // consecutive failures before opening
  readonly recoveryMs: number;  // how long to wait before probing again
}

const circuit: CircuitBreaker = {
  state: "closed",
  failureCount: 0,
  lastFailureAt: 0,
  threshold: 3,
  recoveryMs: 30_000, // 30 seconds
};

export function getCircuitState(): CircuitBreaker["state"] {
  return circuit.state;
}

function circuitAllows(): boolean {
  if (circuit.state === "closed") return true;
  if (circuit.state === "half-open") return true;
  // open → check if recovery window has passed
  if (Date.now() - circuit.lastFailureAt > circuit.recoveryMs) {
    circuit.state = "half-open";
    console.log("[s3] circuit → half-open, probing S3...");
    return true;
  }
  return false;
}

function onS3Success(): void {
  if (circuit.state !== "closed") {
    console.log("[s3] S3 recovered ✓ circuit → closed");
  }
  circuit.state = "closed";
  circuit.failureCount = 0;
}

function onS3Failure(err: unknown): void {
  circuit.failureCount++;
  circuit.lastFailureAt = Date.now();
  const msg = err instanceof Error ? err.message : String(err);
  if (circuit.state === "half-open" || circuit.failureCount >= circuit.threshold) {
    circuit.state = "open";
    console.warn(`[s3] circuit → open (failures: ${circuit.failureCount}). Reason: ${msg}`);
  } else {
    console.warn(`[s3] upload failed (${circuit.failureCount}/${circuit.threshold}): ${msg}`);
  }
}

// ─── Pending Sync Queue ───────────────────────────────────────────────────────
//
// When S3 is down, files are saved to local disk and added to this queue.
// The sync service reads this queue, uploads to S3 when it recovers, then
// patches every DB URL field and deletes the local copy.

export interface PendingSyncEntry {
  id: string;
  localPath: string;    // absolute path to local file
  localUrl: string;     // URL stored in DB (e.g. http://host/uploads/uuid.jpg)
  originalName: string;
  mimeType: string;
  options: UploadOptions;
  addedAt: string;      // ISO timestamp
}

let _queuePath = "";

export function initQueuePath(uploadsDir: string): void {
  _queuePath = path.join(uploadsDir, ".s3_pending.json");
}

export function loadPendingQueue(): PendingSyncEntry[] {
  if (!_queuePath) return [];
  try {
    if (!fs.existsSync(_queuePath)) return [];
    return JSON.parse(fs.readFileSync(_queuePath, "utf8")) as PendingSyncEntry[];
  } catch {
    return [];
  }
}

function savePendingQueue(queue: PendingSyncEntry[]): void {
  if (!_queuePath) return;
  try {
    fs.writeFileSync(_queuePath, JSON.stringify(queue, null, 2));
  } catch (err) {
    console.error("[s3-queue] failed to save queue:", err);
  }
}

export function addToPendingQueue(entry: Omit<PendingSyncEntry, "id" | "addedAt">): void {
  const queue = loadPendingQueue();
  queue.push({ ...entry, id: crypto.randomUUID(), addedAt: new Date().toISOString() });
  savePendingQueue(queue);
  console.log(`[s3-queue] queued for sync: ${entry.originalName} (queue size: ${queue.length})`);
}

export function removeFromPendingQueue(id: string): void {
  const queue = loadPendingQueue().filter((e) => e.id !== id);
  savePendingQueue(queue);
}

export function pendingQueueSize(): number {
  return loadPendingQueue().length;
}

// ─── URL Builder ─────────────────────────────────────────────────────────────

export function getS3PublicUrl(key: string): string {
  if (AWS_S3_PUBLIC_URL) return `${AWS_S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  if (AWS_S3_ENDPOINT) return `${AWS_S3_ENDPOINT.replace(/\/$/, "")}/${AWS_S3_BUCKET}/${key}`;
  return `https://${AWS_S3_BUCKET}.s3.${AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
}

// ─── Folder Detection ────────────────────────────────────────────────────────

export interface UploadOptions {
  folder?: string;
  hint?: "avatar" | "cover" | "ebook" | "audio" | "image";
  ext?: string;
}

export function getS3Folder(
  mimeType: string,
  ext: string,
  hint?: UploadOptions["hint"]
): string {
  if (hint === "avatar") return "avatars";
  if (hint === "cover") return "covers";
  if (hint === "ebook") return "ebooks";
  if (hint === "audio") return "audio";
  if (hint === "image") return "images";

  const m = (mimeType || "").toLowerCase();
  const e = (ext || "").toLowerCase();
  if (m === "application/epub+zip" || e === ".epub") return "ebooks";
  if (m === "application/pdf" || e === ".pdf") return "ebooks";
  if (m.startsWith("audio/") || m.startsWith("video/")) return "audio";
  if (m.startsWith("image/")) return "images";
  return "misc";
}

// ─── Core S3 Upload ──────────────────────────────────────────────────────────

/**
 * Upload directly to S3. Throws on any error — let callers decide fallback.
 * Use uploadWithFallback() for resilient uploads in production routes.
 */
export async function uploadToS3(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  options: UploadOptions = {}
): Promise<string> {
  if (!s3Configured) throw new Error("S3 not configured");

  const ext = options.ext ?? (path.extname(originalName).toLowerCase() || ".bin");
  const folder = options.folder ?? getS3Folder(mimeType, ext, options.hint);
  const key = `${folder}/${crypto.randomUUID()}${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: AWS_S3_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: mimeType || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return getS3PublicUrl(key);
}

// ─── Local Disk Save (fallback) ───────────────────────────────────────────────

function saveToLocalDisk(
  buffer: Buffer,
  originalName: string,
  uploadsDir: string,
  baseUrl: string
): { localPath: string; localUrl: string } {
  const ext = path.extname(originalName).toLowerCase() || ".bin";
  const filename = `${crypto.randomUUID()}${ext}`;
  const localPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(localPath, buffer);
  const localUrl = `${baseUrl.replace(/\/$/, "")}/uploads/${filename}`;
  return { localPath, localUrl };
}

// ─── Resilient Upload with Fallback ──────────────────────────────────────────

export interface FallbackConfig {
  uploadsDir: string;
  baseUrl: string;
}

export interface UploadResult {
  url: string;
  via: "s3" | "local";
  queued?: boolean; // true when local and queued for later S3 sync
}

/**
 * Upload a file with automatic fallback and recovery queue.
 *
 * When S3 is configured:
 *   • Circuit closed/half-open → try S3, return S3 URL on success.
 *   • S3 failure OR circuit open → save to local disk, add to sync queue,
 *     return local URL. Sync service will push to S3 and patch the DB URL later.
 *
 * When S3 is not configured:
 *   • Save to local disk, no queue (local-only mode).
 */
export async function uploadWithFallback(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  options: UploadOptions,
  fallback: FallbackConfig
): Promise<UploadResult> {
  // S3 not configured → pure local mode
  if (!s3Configured) {
    const { localUrl } = saveToLocalDisk(buffer, originalName, fallback.uploadsDir, fallback.baseUrl);
    return { url: localUrl, via: "local" };
  }

  // S3 configured → try upload (respecting circuit state)
  if (circuitAllows()) {
    try {
      const s3Url = await uploadToS3(buffer, originalName, mimeType, options);
      onS3Success();
      return { url: s3Url, via: "s3" };
    } catch (err) {
      onS3Failure(err);
    }
  } else {
    console.debug("[s3] circuit open — using local storage");
  }

  // S3 is down → save locally and queue for sync
  const { localPath, localUrl } = saveToLocalDisk(buffer, originalName, fallback.uploadsDir, fallback.baseUrl);
  addToPendingQueue({ localPath, localUrl, originalName, mimeType, options });
  return { url: localUrl, via: "local", queued: true };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteFromS3(urlOrKey: string): Promise<void> {
  if (!s3Configured) return;
  let key: string;
  const base = getS3PublicUrl("");
  if (urlOrKey.startsWith(base)) {
    key = urlOrKey.slice(base.length);
  } else if (urlOrKey.startsWith("http")) {
    try {
      const u = new URL(urlOrKey);
      key = u.pathname.replace(/^\//, "");
      if (key.startsWith(`${AWS_S3_BUCKET}/`)) key = key.slice(AWS_S3_BUCKET!.length + 1);
    } catch { return; }
  } else {
    key = urlOrKey;
  }
  if (!key) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET!, Key: key }));
}

// ─── Presigned URLs ───────────────────────────────────────────────────────────

export async function createPresignedUploadUrl(key: string, mimeType: string, expiresIn = 300): Promise<string> {
  if (!s3Configured) throw new Error("S3 not configured");
  return getSignedUrl(s3Client, new PutObjectCommand({ Bucket: AWS_S3_BUCKET!, Key: key, ContentType: mimeType }), { expiresIn });
}

export async function createPresignedGetUrl(keyOrUrl: string, expiresIn = 3600): Promise<string> {
  if (!s3Configured) throw new Error("S3 not configured");
  const base = getS3PublicUrl("");
  let key = keyOrUrl;
  if (keyOrUrl.startsWith("http")) {
    key = keyOrUrl.startsWith(base)
      ? keyOrUrl.slice(base.length)
      : new URL(keyOrUrl).pathname.replace(/^\//, "");
  }
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: AWS_S3_BUCKET!, Key: key }), { expiresIn });
}

export function isS3Url(url: string): boolean {
  if (!url) return false;
  const base = getS3PublicUrl("");
  if (url.startsWith(base)) return true;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".amazonaws.com") || host.endsWith(".r2.cloudflarestorage.com");
  } catch { return false; }
}

// ─── Bucket Policy ────────────────────────────────────────────────────────────
// Public-read for non-sensitive asset folders; ebooks & audio stay private.

export async function applyPublicReadPolicy(): Promise<void> {
  if (!s3Configured) throw new Error("S3 not configured");
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: [
        `arn:aws:s3:::${AWS_S3_BUCKET}/covers/*`,
        `arn:aws:s3:::${AWS_S3_BUCKET}/images/*`,
        `arn:aws:s3:::${AWS_S3_BUCKET}/avatars/*`,
      ],
    }],
  });
  await s3Client.send(new PutBucketPolicyCommand({ Bucket: AWS_S3_BUCKET!, Policy: policy }));
}
