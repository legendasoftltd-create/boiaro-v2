// Nightly database backup: pg_dump -> gzip -> S3/R2, with retention cleanup.
// Run manually with `npm run backup:db`, or on a cron/systemd timer in production.
// Backup catalog lives in object storage (not the DB itself) so listing/restoring
// backups doesn't depend on the database being intact.
import "dotenv/config";
import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { PassThrough } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const RETENTION_DAYS = Number(process.env.DB_BACKUP_RETENTION_DAYS || 14);
const BACKUP_PREFIX = "backups/";

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_S3_BUCKET,
  AWS_S3_ENDPOINT,
  DATABASE_URL,
} = process.env;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
  console.error("[backup] S3/R2 not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET) — refusing to run a backup with nowhere to put it.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("[backup] DATABASE_URL not set");
  process.exit(1);
}

const s3 = new S3Client({
  region: AWS_REGION || "us-east-1",
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  ...(AWS_S3_ENDPOINT ? { endpoint: AWS_S3_ENDPOINT, forcePathStyle: true } : {}),
  requestHandler: { requestTimeout: 15 * 60_000 },
});

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function runBackup(): Promise<void> {
  const key = `${BACKUP_PREFIX}boiaro-${timestamp()}.sql.gz`;
  console.log(`[backup] starting pg_dump -> ${key}`);

  const dump = spawn("pg_dump", [DATABASE_URL!, "--no-owner", "--no-privileges", "-F", "p"]);
  const gzip = createGzip();
  const output = new PassThrough();
  dump.stdout.pipe(gzip).pipe(output);

  let dumpErr = "";
  dump.stderr.on("data", (d) => { dumpErr += d.toString(); });

  const bufferPromise = streamToBuffer(output);

  const exitCode: number = await new Promise((resolve) => dump.on("close", resolve));
  const body = await bufferPromise;

  if (exitCode !== 0) {
    console.error(`[backup] pg_dump failed (exit ${exitCode}): ${dumpErr}`);
    process.exit(1);
  }
  if (body.length === 0) {
    console.error("[backup] pg_dump produced an empty file — aborting, not uploading a useless backup");
    process.exit(1);
  }

  await s3.send(new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/gzip",
  }));
  console.log(`[backup] uploaded ${key} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);

  await cleanupOldBackups();
}

async function cleanupOldBackups(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const list = await s3.send(new ListObjectsV2Command({ Bucket: AWS_S3_BUCKET, Prefix: BACKUP_PREFIX }));
  const stale = (list.Contents || []).filter((o) => o.LastModified && o.LastModified.getTime() < cutoff && o.Key);
  for (const obj of stale) {
    await s3.send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: obj.Key! }));
    console.log(`[backup] deleted expired backup ${obj.Key} (older than ${RETENTION_DAYS}d)`);
  }
  if (stale.length === 0) console.log("[backup] no expired backups to clean up");
}

runBackup().catch((err) => {
  console.error("[backup] failed:", err);
  process.exit(1);
});
