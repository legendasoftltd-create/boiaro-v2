/**
 * REST TTS API — for mobile apps and third-party clients.
 * Base prefix: /api/v1/tts
 *
 *  GET  /voices              — list enabled Bengali AI voices (dynamic from DB)
 *  GET  /ambient-tracks      — list enabled ambient tracks
 *  POST /ambient-upload      — upload ambient audio file (admin; S3 + local fallback)
 *  GET  /access/:bookId      — check TTS access for authenticated user
 *  POST /unlock              — spend coins to unlock premium TTS
 *  POST /generate            — generate (or retrieve cached) AI audio for a paragraph
 *  POST /prefetch            — background-prefetch up to 3 paragraphs
 *  GET  /cache/:bookId       — check cached audio state for a book
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, optionalAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  checkTtsAccess,
  generateParagraphAudio,
  getStoredVoices,
  getStoredAmbientTracks,
} from "../../routers/tts.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";
import { uploadWithFallback } from "../../lib/s3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PORT = parseInt(process.env.PORT || "3001", 10);
const BASE_URL = (process.env.FRONTEND_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const fallbackConfig = { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL };

const uploadAmbient = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed (MP3, AAC, OGG, WAV, FLAC)"));
    }
  },
});

export const ttsRestRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tts/voices
// List enabled Bengali AI voices. Public — no auth required.
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.get("/voices", async (_req, res) => {
  try {
    const all = await getStoredVoices();
    const voices = all.filter((v: any) => v.enabled !== false).map((v: any) => ({
      id: v.id,
      name: v.name,
      label: v.label,
      lang: v.lang ?? "bn",
      category: v.category ?? null,
    }));
    res.json({ success: true, voices });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tts/ambient-tracks
// List enabled ambient sound tracks. Public — no auth required.
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.get("/ambient-tracks", async (_req, res) => {
  try {
    const all = await getStoredAmbientTracks();
    const tracks = all.filter((t: any) => t.enabled).map((t: any) => ({
      id: t.id,
      name: t.name,
      label: t.label,
      emoji: t.emoji,
      url: resolveFileUrl(t.url),
    }));
    res.json({ success: true, tracks });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/tts/ambient-upload
// Upload an ambient audio file (admin). Stores to S3 with local fallback.
// Form-data field: "file" — MP3 / AAC / OGG / WAV / FLAC, max 50 MB.
// Response: { url, storage: "s3" | "local", queued }
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.post(
  "/ambient-upload",
  requireAuth,
  uploadAmbient.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided. Use form-data field 'file'." });
        return;
      }
      const result = await uploadWithFallback(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        { hint: "ambient" },
        fallbackConfig
      );
      res.status(201).json({
        success: true,
        url: result.url,
        storage: result.via,
        queued: result.queued ?? false,
      });
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tts/access/:bookId
// Check if the authenticated user can use premium TTS on a book.
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.get("/access/:bookId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const bookId = String(req.params.bookId);
    const userId = req.auth.userId!;

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true, premium_voice_enabled: true, voice_access_type: true, voice_coin_price: true },
    });

    if (!book) { res.status(404).json({ success: false, error: "Book not found" }); return; }

    if (!book.premium_voice_enabled) {
      res.json({ success: true, premium_voice_enabled: false, unlocked: false, access_type: null, coin_price: null });
      return;
    }

    const access = await checkTtsAccess(userId, bookId);
    const wallet = await prisma.userCoin.findUnique({ where: { user_id: userId }, select: { balance: true } });

    res.json({
      success: true,
      premium_voice_enabled: true,
      unlocked: access.allowed,
      access_type: book.voice_access_type,
      coin_price: book.voice_coin_price ?? 0,
      wallet_balance: wallet?.balance ?? 0,
      ...(access.allowed === false && { message: access.reason }),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/tts/unlock
// Spend coins to unlock premium TTS for a book.
// Body: { "book_id": string }
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.post("/unlock", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { book_id } = req.body;

    if (!book_id || typeof book_id !== "string") {
      res.status(400).json({ success: false, error: "book_id is required" }); return;
    }

    const book = await prisma.book.findUnique({
      where: { id: book_id },
      select: { premium_voice_enabled: true, voice_access_type: true, voice_coin_price: true },
    });

    if (!book) { res.status(404).json({ success: false, error: "Book not found" }); return; }
    if (!book.premium_voice_enabled) { res.status(400).json({ success: false, error: "Premium Voice not enabled for this book" }); return; }
    if (book.voice_access_type === "free") { res.json({ success: true, message: "Premium Voice is free — no unlock needed" }); return; }
    if (book.voice_access_type === "subscription") { res.status(400).json({ success: false, error: "This book requires an active subscription" }); return; }

    const coinCost = book.voice_coin_price ?? 0;
    const existing = await prisma.contentUnlock.findFirst({ where: { user_id: userId, book_id, format: "premium_voice", status: "active" } });
    if (existing) { res.json({ success: true, already_unlocked: true, message: "Already unlocked" }); return; }

    if (coinCost > 0) {
      const wallet = await prisma.userCoin.findUnique({ where: { user_id: userId } });
      if (!wallet || wallet.balance < coinCost) {
        res.status(400).json({ success: false, error: "Insufficient coin balance", required: coinCost, balance: wallet?.balance ?? 0 }); return;
      }
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.contentUnlock.create({ data: { user_id: userId, book_id, format: "premium_voice", coins_spent: coinCost, unlock_method: coinCost === 0 ? "free" : "coin", status: "active" } });
      if (coinCost > 0) {
        await tx.coinTransaction.create({ data: { user_id: userId, amount: -coinCost, type: "spend", description: "AI Voice unlock", reference_id: book_id, source: "content_unlock" } });
        await tx.userCoin.update({ where: { user_id: userId }, data: { balance: { decrement: coinCost }, total_spent: { increment: coinCost } } });
      }
    });

    res.json({ success: true, message: "AI Voice unlocked successfully", coins_spent: coinCost });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/tts/generate
// Generate (or retrieve cached) AI audio for a single paragraph.
//
// Body:
//   book_id         string   required
//   text            string   required  (1–3000 chars)
//   voice_id        string   optional
//   paragraph_index number   optional  (default 0)
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.post("/generate", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { book_id, text, voice_id, paragraph_index = 0 } = req.body;

    if (!book_id || typeof book_id !== "string") { res.status(400).json({ success: false, error: "book_id is required" }); return; }
    if (!text || typeof text !== "string" || text.trim().length === 0) { res.status(400).json({ success: false, error: "text is required" }); return; }
    if (text.length > 3000) { res.status(400).json({ success: false, error: "text must be 3000 characters or fewer" }); return; }

    const access = await checkTtsAccess(userId, book_id);
    if (access.allowed === false) {
      res.status(403).json({ success: false, error: access.reason, access_type: access.access_type, coin_price: access.coin_price }); return;
    }

    const voices = await getStoredVoices();
    const enabledVoices = voices.filter((v: any) => v.enabled !== false);
    const defaultVoiceId = enabledVoices[0]?.id ?? "";
    const chosenVoice = typeof voice_id === "string" && voice_id ? voice_id : defaultVoiceId;

    const audioUrl = await generateParagraphAudio(text, chosenVoice, book_id, userId, Number(paragraph_index) || 0);

    res.json({ success: true, audio_url: resolveFileUrl(audioUrl), voice_id: chosenVoice, paragraph_index: Number(paragraph_index) || 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg === "QUOTA_EXCEEDED") {
      res.status(429).json({ success: false, error: "ElevenLabs quota exceeded. Please try again later.", quota_exceeded: true }); return;
    }
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/tts/prefetch
// Background-prefetch up to 3 paragraphs so next-page play is instant.
//
// Body:
//   book_id    string
//   voice_id   string   optional
//   paragraphs [{ text, index }]  max 3 items
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.post("/prefetch", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { book_id, voice_id, paragraphs } = req.body;

    if (!book_id) { res.status(400).json({ success: false, error: "book_id is required" }); return; }
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) { res.status(400).json({ success: false, error: "paragraphs array is required" }); return; }
    if (paragraphs.length > 3) { res.status(400).json({ success: false, error: "Maximum 3 paragraphs per prefetch" }); return; }

    const access = await checkTtsAccess(userId, book_id);
    if (access.allowed === false) { res.status(403).json({ success: false, error: access.reason }); return; }

    const voices = await getStoredVoices();
    const enabledVoices = voices.filter((v: any) => v.enabled !== false);
    const defaultVoiceId = enabledVoices[0]?.id ?? "";
    const chosenVoice = typeof voice_id === "string" && voice_id ? voice_id : defaultVoiceId;

    // Fire and forget
    Promise.all(
      paragraphs.map((p: any) =>
        generateParagraphAudio(String(p.text), chosenVoice, book_id, userId, Number(p.index) || 0)
          .catch(() => {})
      )
    );

    res.json({ success: true, queued: paragraphs.length });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tts/cache/:bookId
// Check if cached audio exists for a book.
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.get("/cache/:bookId", optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const bookId = String(req.params.bookId);
    const count = await prisma.ttsAudio.count({ where: { book_id: bookId, status: "completed" } });
    const latest = count > 0
      ? await prisma.ttsAudio.findFirst({ where: { book_id: bookId, status: "completed" }, orderBy: { created_at: "desc" }, select: { created_at: true, voice_id: true } })
      : null;

    res.json({ success: true, has_cache: count > 0, segment_count: count, latest_at: latest?.created_at ?? null, voice_id: latest?.voice_id ?? null });
  } catch (error) {
    sendHttpError(res, error);
  }
});
