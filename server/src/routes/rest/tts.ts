/**
 * REST TTS API — for mobile apps and third-party clients.
 *
 * All endpoints are prefixed with  /api/v1/tts
 *
 *  GET  /voices              — list available Bengali AI voices
 *  GET  /access/:bookId      — check if caller can use premium TTS on a book
 *  POST /unlock              — spend coins to unlock premium TTS on a book
 *  POST /generate            — generate (or retrieve cached) AI audio for a paragraph
 */

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, optionalAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { BENGALI_VOICES, checkTtsAccess, generateParagraphAudio } from "../../routers/tts.js";
import { resolveFileUrl } from "../../lib/mediaUrl.js";

export const ttsRestRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tts/voices
// List all available Bengali AI voices. Public — no auth required.
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.get("/voices", (_req, res) => {
  res.json({ voices: BENGALI_VOICES });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tts/access/:bookId
// Check if the authenticated user can use premium TTS on a book.
// Returns the access status, what is required, and the current unlock state.
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.get("/access/:bookId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const bookId = String(req.params.bookId);
    const userId = req.auth.userId!;

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        premium_voice_enabled: true,
        voice_access_type: true,
        voice_coin_price: true,
      },
    });

    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    if (!book.premium_voice_enabled) {
      res.json({
        premium_voice_enabled: false,
        unlocked: false,
        access_type: null,
        coin_price: null,
        message: "Premium Voice is not available for this book",
      });
      return;
    }

    const access = await checkTtsAccess(userId, bookId);

    // Also fetch wallet balance so the client can show "you need X more coins"
    const wallet = await prisma.userCoin.findUnique({
      where: { user_id: userId },
      select: { balance: true },
    });

    res.json({
      premium_voice_enabled: true,
      unlocked: access.allowed,
      access_type: book.voice_access_type,   // "free" | "paid" | "subscription"
      coin_price: book.voice_coin_price ?? 0,
      wallet_balance: wallet?.balance ?? 0,
      ...(access.allowed === false && {
        message: access.reason,
      }),
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
      res.status(400).json({ error: "book_id is required" });
      return;
    }

    const book = await prisma.book.findUnique({
      where: { id: book_id },
      select: {
        premium_voice_enabled: true,
        voice_access_type: true,
        voice_coin_price: true,
      },
    });

    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }
    if (!book.premium_voice_enabled) {
      res.status(400).json({ error: "Premium Voice is not enabled for this book" });
      return;
    }
    if (book.voice_access_type === "free") {
      res.json({ success: true, message: "Premium Voice is free for this book — no unlock needed" });
      return;
    }
    if (book.voice_access_type === "subscription") {
      res.status(400).json({ error: "This book requires an active subscription, not a coin purchase" });
      return;
    }

    const coinCost = book.voice_coin_price ?? 0;

    // Already unlocked?
    const existing = await prisma.contentUnlock.findFirst({
      where: { user_id: userId, book_id, format: "premium_voice", status: "active" },
    });
    if (existing) {
      res.json({ success: true, already_unlocked: true, message: "Already unlocked" });
      return;
    }

    // Check balance (skip for free unlocks)
    if (coinCost > 0) {
      const wallet = await prisma.userCoin.findUnique({ where: { user_id: userId } });
      if (!wallet || wallet.balance < coinCost) {
        res.status(400).json({
          error: "Insufficient coin balance",
          required: coinCost,
          balance: wallet?.balance ?? 0,
        });
        return;
      }
    }

    // Transact
    await prisma.$transaction(async (tx: any) => {
      await tx.contentUnlock.create({
        data: {
          user_id: userId,
          book_id,
          format: "premium_voice",
          coins_spent: coinCost,
          unlock_method: coinCost === 0 ? "free" : "coin",
          status: "active",
        },
      });
      if (coinCost > 0) {
        await tx.coinTransaction.create({
          data: {
            user_id: userId,
            amount: -coinCost,
            type: "spend",
            description: "AI Voice unlock",
            reference_id: book_id,
            source: "content_unlock",
          },
        });
        await tx.userCoin.update({
          where: { user_id: userId },
          data: {
            balance: { decrement: coinCost },
            total_spent: { increment: coinCost },
          },
        });
      }
    });

    res.json({ success: true, message: "AI Voice unlocked successfully", coins_spent: coinCost });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/tts/generate
// Generate (or retrieve cached) ElevenLabs audio for a single paragraph.
// Enforces access control — user must be authenticated and have TTS access.
//
// Body:
//   book_id         string   required
//   text            string   required  (1–3000 chars)
//   voice_id        string   optional  (defaults to Sarah)
//   paragraph_index number   optional  (default 0, used for cache key)
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.post("/generate", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId!;
    const { book_id, text, voice_id, paragraph_index = 0 } = req.body;

    if (!book_id || typeof book_id !== "string") {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    if (text.length > 3000) {
      res.status(400).json({ error: "text must be 3000 characters or fewer" });
      return;
    }

    // ── Access gate ──
    const access = await checkTtsAccess(userId, book_id);
    if (access.allowed === false) {
      res.status(403).json({
        error: access.reason,
        access_type: access.access_type,
        coin_price: access.coin_price,
      });
      return;
    }

    const DEFAULT_VOICE = BENGALI_VOICES[0].id;
    const chosenVoice = typeof voice_id === "string" && voice_id ? voice_id : DEFAULT_VOICE;

    const audioUrl = await generateParagraphAudio(
      text,
      chosenVoice,
      book_id,
      userId,
      Number(paragraph_index) || 0
    );

    res.json({
      success: true,
      audio_url: resolveFileUrl(audioUrl),
      voice_id: chosenVoice,
      paragraph_index: Number(paragraph_index) || 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg === "QUOTA_EXCEEDED") {
      res.status(429).json({
        error: "ElevenLabs quota exceeded. Please try again later.",
        quota_exceeded: true,
      });
      return;
    }
    sendHttpError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tts/cache/:bookId
// Check if cached audio exists for a book (useful for pre-flight UI decisions).
// ─────────────────────────────────────────────────────────────────────────────
ttsRestRouter.get("/cache/:bookId", optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const bookId = String(req.params.bookId);
    const count = await prisma.ttsAudio.count({
      where: { book_id: bookId, status: "completed" },
    });
    const latest = count > 0
      ? await prisma.ttsAudio.findFirst({
          where: { book_id: bookId, status: "completed" },
          orderBy: { created_at: "desc" },
          select: { created_at: true, voice_id: true },
        })
      : null;

    res.json({
      has_cache: count > 0,
      segment_count: count,
      latest_at: latest?.created_at ?? null,
      voice_id: latest?.voice_id ?? null,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
