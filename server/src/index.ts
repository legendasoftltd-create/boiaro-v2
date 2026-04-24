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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:8080")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// tRPC MUST come before express.json()
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

app.use(express.json());

// ── File uploads ──────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, or WebP images are allowed"));
    }
  },
});

const uploadMedia = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/epub+zip",
      "application/octet-stream",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/aac",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported media file type"));
    }
  },
});

function sendUploadedFileUrl(req: express.Request, res: express.Response) {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  const baseUrl = process.env.FRONTEND_URL || `http://localhost:${PORT}`;
  const publicUrl = `${baseUrl}/uploads/${req.file.filename}`;
  res.json({ url: publicUrl });
}

app.post("/upload", uploadImage.single("file"), sendUploadedFileUrl);
app.post("/upload/media", uploadMedia.single("file"), sendUploadedFileUrl);

// Serve uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const frontendDist = path.resolve(__dirname, "../../dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export type { AppRouter } from "./routers/_app.js";
