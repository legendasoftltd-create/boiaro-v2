// Nightly database backup: pg_dump -> gzip -> S3/R2, with retention cleanup.
// Shared by the in-app cron (jobs/index.ts) and the standalone CLI entry
// point (scripts/backup-database.ts, for a manual one-off run).
import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { PassThrough } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const BACKUP_PREFIX = "backups/";

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function runDatabaseBackup(): Promise<{ key: string; sizeBytes: number; deletedExpired: number }> {
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_S3_BUCKET,
    AWS_S3_ENDPOINT,
    DATABASE_URL,
    DB_BACKUP_RETENTION_DAYS,
  } = process.env;

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
    throw new Error("S3/R2 not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET) — refusing to run a backup with nowhere to put it");
  }
  if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

  const s3 = new S3Client({
    region: AWS_REGION || "us-east-1",
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    ...(AWS_S3_ENDPOINT ? { endpoint: AWS_S3_ENDPOINT, forcePathStyle: true } : {}),
    requestHandler: { requestTimeout: 15 * 60_000 },
  });

  const key = `${BACKUP_PREFIX}boiaro-${timestamp()}.sql.gz`;

  const dump = spawn("pg_dump", [DATABASE_URL, "--no-owner", "--no-privileges", "-F", "p"]);
  const gzip = createGzip();
  const output = new PassThrough();
  dump.stdout.pipe(gzip).pipe(output);

  let dumpErr = "";
  dump.stderr.on("data", (d) => { dumpErr += d.toString(); });

  const bufferPromise = streamToBuffer(output);
  const exitCode: number = await new Promise((resolve) => dump.on("close", resolve));
  const body = await bufferPromise;

  if (exitCode !== 0) throw new Error(`pg_dump failed (exit ${exitCode}): ${dumpErr}`);
  if (body.length === 0) throw new Error("pg_dump produced an empty file — aborting, not uploading a useless backup");

  await s3.send(new PutObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key, Body: body, ContentType: "application/gzip" }));

  const retentionDays = Number(DB_BACKUP_RETENTION_DAYS || 14);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const list = await s3.send(new ListObjectsV2Command({ Bucket: AWS_S3_BUCKET, Prefix: BACKUP_PREFIX }));
  const stale = (list.Contents || []).filter((o) => o.LastModified && o.LastModified.getTime() < cutoff && o.Key);
  for (const obj of stale) {
    await s3.send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: obj.Key! }));
  }

  return { key, sizeBytes: body.length, deletedExpired: stale.length };
}
