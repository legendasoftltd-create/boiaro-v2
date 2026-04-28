import { Router } from "express";
import { TRPCError } from "@trpc/server";
import { sendHttpError } from "../../lib/http.js";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth.js";
import { getEbookSignedUrl } from "../../services/content.service.js";
import { prisma } from "../../lib/prisma.js";

export const contentRestRouter = Router();

contentRestRouter.post("/ebook-url", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId;
    const { book_id } = req.body;
    const result = await getEbookSignedUrl(userId, book_id);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

contentRestRouter.post("/audio-url", async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, track_number = 1 } = req.body;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id, format: "audiobook" },
      select: { id: true },
    });
    if (!bookFormat) {
      res.status(404).json({ error: "Audiobook format not found" });
      return;
    }
    const track = await prisma.audiobookTrack.findFirst({
      where: { book_format_id: bookFormat.id, track_number: Number(track_number) },
      select: { audio_url: true, is_preview: true },
    });
    if (!track?.audio_url) {
      res.status(404).json({ error: "Track not found" });
      return;
    }
    const expires = Date.now() + 300_000;
    res.json({
      signed_url: `${track.audio_url}?token=secure_token&expires=${expires}`,
      expires_in: 300,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

contentRestRouter.post("/batch-audio-urls", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id } = req.body;
    if (!book_id) {
      res.status(400).json({ error: "book_id is required" });
      return;
    }
    const bookFormat = await prisma.bookFormat.findFirst({
      where: { book_id, format: "audiobook" },
      select: { id: true },
    });
    if (!bookFormat) {
      res.status(404).json({ error: "Audiobook format not found" });
      return;
    }
    const tracks = await prisma.audiobookTrack.findMany({
      where: { book_format_id: bookFormat.id, status: "active" },
      orderBy: { track_number: "asc" },
      select: { track_number: true, audio_url: true },
    });
    const expires = Date.now() + 300_000;
    res.json({
      tracks: tracks.map((t) => ({
        track_number: t.track_number,
        signed_url: t.audio_url ? `${t.audio_url}?token=secure_token&expires=${expires}` : null,
        expires_in: 300,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});