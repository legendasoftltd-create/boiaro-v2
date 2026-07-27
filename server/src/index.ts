import "dotenv/config";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./context.js";
import { attachAuth } from "./middleware/auth.js";
import { restRouter } from "./routes/rest/index.js";
import { registerOgImageRoute } from "./routes/og-image.js";
import { socialBotMiddleware } from "./middleware/social-bot.js";
import {
  s3Configured,
  uploadWithFallback,
  initQueuePath,
  getCircuitState,
  pendingQueueSize,
  applyPublicReadPolicy,
} from "./lib/s3.js";

import { startStorageSyncService } from "./services/storageSync.service.js";
import { startScheduledJobs } from "./jobs/index.js";
import { applyWatermark } from "./lib/watermark.js";
import { initLiveSocket } from "./realtime/socket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust nginx reverse proxy so X-Forwarded-For is used for rate limiting
app.set("trust proxy", 1);

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

// tRPC MUST come before express.json()
app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(attachAuth);

// CSRF protection — require X-Requested-With on state-changing REST calls.
// Exempt:
//   - SSLCommerz callbacks (server-to-server, no custom headers possible)
//   - Auth endpoints (login/signup/refresh — no token exists yet to provide)
//   - Any request bearing a Bearer token (mobile/API clients; browsers cannot
//     set Authorization cross-origin, so Bearer auth is inherently CSRF-safe)
app.use("/api/v1", (req, res, next) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    const isPaymentCallback = req.originalUrl.startsWith("/api/v1/payments/sslcommerz/");
    const isAuthEndpoint = req.originalUrl.startsWith("/api/v1/auth/");
    const hasBearerToken = /^Bearer\s+\S+$/i.test(req.headers["authorization"] ?? "");
    const hasXRequestedWith = !!req.headers["x-requested-with"];
    if (!isPaymentCallback && !isAuthEndpoint && !hasBearerToken && !hasXRequestedWith) {
      res.status(403).json({ success: false, error: "FORBIDDEN", message: "Missing X-Requested-With header" });
      return;
    }
  }
  next();
});

// Enforce JSON content-type on mutation endpoints.
// Exempt SSLCommerz callbacks — they're posted server-to-server as
// application/x-www-form-urlencoded and cannot be made to send JSON.
// Exempt multipart/form-data — file upload endpoints (profile photo,
// TTS ambient audio, etc.) inherently send multipart bodies, not JSON.
app.use("/api/v1", (req, res, next) => {
  const isPaymentCallback = req.originalUrl.startsWith("/api/v1/payments/sslcommerz/");
  const isMultipart = req.is("multipart/form-data");
  if (!isPaymentCallback && !isMultipart && ["POST", "PATCH", "PUT"].includes(req.method) && req.headers["content-type"] && !req.is("application/json")) {
    res.status(415).json({ success: false, error: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json" });
    return;
  }
  next();
});

// Rate limiting — applied before routes
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, please try again later" } });
const claimLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, please try again later" } });
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, please try again later" } });

app.use("/api/v1/auth", authLimiter);
app.use("/api/v1/wallet/claim-daily", claimLimiter);
app.use("/api/v1/wallet/claim-ad", claimLimiter);
app.use("/api/v1/ads/rewarded/claim", claimLimiter);
app.use("/api/v1", globalLimiter);

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

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

function isAllowedMediaMime(mime: string): boolean {
  if (!mime) return false;
  // Accept any audio or video variant (covers x-aac, opus, wma, x-m4b, x-matroska, etc.)
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
  // Ebook formats
  if (mime === "application/pdf" || mime === "application/epub+zip") return true;
  // Images
  if (mime.startsWith("image/")) return true;
  // Browsers sometimes send unknown audio as a raw binary stream
  if (mime === "application/octet-stream") return true;
  return false;
}

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    IMAGE_MIMES.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only JPG, PNG, WebP, GIF, or SVG images are allowed")),
});

const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    isAllowedMediaMime(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Unsupported file type: ${file.mimetype}`)),
});

// ── Upload routes ─────────────────────────────────────────────────────────────

// /upload — images (covers, banners, avatars, site images)
app.post("/upload", uploadImage.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
  try {
    const hint = (req.query.type as string | undefined) as "avatar" | "cover" | "image" | undefined;

    // Apply BoiAro logo watermark to book cover images only
    let fileBuffer = req.file.buffer;
    if (hint === "cover") {
      try {
        fileBuffer = await applyWatermark(fileBuffer);
      } catch (wmErr: any) {
        console.error("[upload] watermark failed, uploading original:", wmErr?.message);
        // Non-fatal — fall back to original image without watermark
      }
    }

    const result = await uploadWithFallback(
      fileBuffer,
      req.file.originalname,
      hint === "cover" ? "image/jpeg" : req.file.mimetype,
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

// ── Multer / upload error handler ──────────────────────────────────────────
// Multer fileFilter errors bypass route try/catch and land here as Express errors.
// Return JSON so the frontend gets a usable error instead of an HTML 500 page.
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File too large. Maximum size exceeded." });
    return;
  }
  if (err?.code === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({ error: "Unexpected file field." });
    return;
  }
  if (err?.message?.startsWith("Only ") || err?.message?.startsWith("Unsupported file type")) {
    res.status(415).json({ error: err.message });
    return;
  }
  next(err);
});

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

// Dynamic OG image — registered before express.static so the route takes priority.
// Reads logo.png from the dist folder; ETag invalidates automatically when the
// logo file is replaced, so social share previews update without a redeploy.
registerOgImageRoute(app, frontendDist);

// Social bot meta injection — detects link-preview crawlers on /books/:slug
// and returns server-rendered HTML with book-specific OG tags. Bots don't run
// JS so the SPA's useEffect meta updates are invisible to them.
app.use(socialBotMiddleware);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

// ── Start ─────────────────────────────────────────────────────────────────────
// Plain http.Server instead of app.listen() so Socket.IO can attach to the
// same server/port rather than needing a second listener.

const httpServer = createServer(app);
initLiveSocket(httpServer);

httpServer.listen(PORT, () => {
  const mode = s3Configured ? `S3 [circuit: ${getCircuitState()}]` : "local disk";
  console.log(`Server running on http://localhost:${PORT} [storage: ${mode}]`);
  // Start background sync service (uploads locally-saved files to S3 when it recovers)
  startStorageSyncService();
  startScheduledJobs();
  // Apply S3 bucket policy so TTS/ambient audio folders are publicly readable
  if (s3Configured) {
    applyPublicReadPolicy()
      .then(() => console.log("[s3] public-read policy applied"))
      .catch((err) => console.warn("[s3] failed to apply public-read policy:", err?.message));
  }
});

export type { AppRouter } from "./routers/_app.js";
