import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./context.js";
import { attachAuth } from "./middleware/auth.js";
import { restRouter } from "./routes/rest/index.js";
import {
  s3Configured,
  uploadWithFallback,
  initQueuePath,
  getCircuitState,
  pendingQueueSize,
} from "./lib/s3.js";

import { startStorageSyncService } from "./services/storageSync.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:8080")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || origin === "null" || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(attachAuth);
app.use("/api/v1", restRouter);

// ── Uploads directory ─────────────────────────────────────────────────────────

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Tell the S3 lib where to persist the pending-sync queue
initQueuePath(UPLOADS_DIR);

const PORT = parseInt(process.env.PORT || "3001", 10);
const BASE_URL = (process.env.FRONTEND_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

// Shared fallback config (used by both upload routes)
const fallbackConfig = { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL };

// ── Multer setup ──────────────────────────────────────────────────────────────
//
// Always use memoryStorage so the buffer is available for S3 upload.
// When S3 is down (or not configured), uploadWithFallback() writes the buffer
// to local disk itself, so diskStorage is no longer needed here.

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
const MEDIA_MIMES = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf", "application/epub+zip", "application/octet-stream",
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac",
  "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg",
  "video/mp4", "video/webm", "video/ogg", "video/quicktime",
];

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    IMAGE_MIMES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only JPG, PNG, or WebP images are allowed")),
});

const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    MEDIA_MIMES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Unsupported media file type")),
});

// ── Upload routes ─────────────────────────────────────────────────────────────

// /upload — images (covers, banners, avatars, site images)
app.post("/upload", uploadImage.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
  try {
    const hint = (req.query.type as string | undefined) as "avatar" | "cover" | "image" | undefined;
    const result = await uploadWithFallback(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      { hint: hint ?? "image" },
      fallbackConfig
    );
    res.json({ url: result.url, storage: result.via });
  } catch (err: any) {
    console.error("[upload] error:", err?.message);
    res.status(500).json({ error: "Upload failed. Please try again." });
  }
});

// /upload/media — ebooks (EPUB/PDF), audiobook tracks (MP3/AAC/WAV), large images
app.post("/upload/media", uploadMedia.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
  try {
    const mime = req.file.mimetype;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let hint: "ebook" | "audio" | "image" | undefined;
    if (mime === "application/epub+zip" || mime === "application/pdf" || ext === ".epub" || ext === ".pdf") {
      hint = "ebook";
    } else if (mime.startsWith("audio/") || mime.startsWith("video/")) {
      hint = "audio";
    } else if (mime.startsWith("image/")) {
      hint = "image";
    }
    const result = await uploadWithFallback(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      { hint },
      fallbackConfig
    );
    res.json({ url: result.url, storage: result.via, queued: result.queued ?? false });
  } catch (err: any) {
    console.error("[upload/media] error:", err?.message);
    res.status(500).json({ error: "Upload failed. Please try again." });
  }
});

// Serve local files (fallback copies when S3 was down)
app.use("/uploads", express.static(UPLOADS_DIR));

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    storage: s3Configured ? "s3" : "local",
    s3Circuit: s3Configured ? getCircuitState() : "n/a",
    pendingSyncFiles: pendingQueueSize(),
  });
});

// ── Frontend (production) ─────────────────────────────────────────────────────

const frontendDist = path.resolve(__dirname, "../../dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const mode = s3Configured ? `S3 [circuit: ${getCircuitState()}]` : "local disk";
  console.log(`Server running on http://localhost:${PORT} [storage: ${mode}]`);
  // Start background sync service (uploads locally-saved files to S3 when it recovers)
  startStorageSyncService();
});

export type { AppRouter } from "./routers/_app.js";
