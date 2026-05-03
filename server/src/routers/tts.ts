import { router, publicProcedure } from "../trpc.js";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { uploadWithFallback } from "../lib/s3.js";
import path from "path";
import os from "os";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default English voice

// Get upload config from environment
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

/**
 * Generate full book audio using ElevenLabs API and upload to S3
 */
async function generateFullBookAudioWithElevenLabs(
  text: string,
  bookId: string,
  userId: string
): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  console.log(`[TTS] Generating full book audio for book: ${bookId}`);

  // Generate audio using ElevenLabs
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  // Upload to S3 with fallback to local disk
  const uploadResult = await uploadWithFallback(
    audioBuffer,
    `book_${bookId}.mp3`,
    "audio/mpeg",
    { hint: "audio", folder: "tts-books" },
    { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL }
  );

  console.log(`[TTS] Audio uploaded via ${uploadResult.via}: ${uploadResult.url}`);

  // Store audio metadata in database
  await prisma.ttsAudio.create({
    data: {
      source_text: text.substring(0, 500), // Store first 500 chars as reference
      audio_url: uploadResult.url,
      book_id: bookId,
      user_id: userId,
      voice_id: ELEVENLABS_VOICE_ID,
      language: "en",
      status: "completed",
    },
  });

  return uploadResult.url;
}

export const ttsRouter = router({
  /**
   * Generate or retrieve full book audio
   * - First time: Generates full audio with ElevenLabs and uploads to S3
   * - Subsequent times: Returns stored S3 URL
   */
  getOrGenerateFullBookAudio: publicProcedure
    .input(
      z.object({
        bookId: z.string(),
        fullText: z.string().min(1).max(50000), // Full book text (up to ~50k chars = 30-40 min audio)
        userId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = input.userId || ctx.userId || "anonymous";

        // Check if audio already exists for this book
        const existingAudio = await prisma.ttsAudio.findFirst({
          where: {
            book_id: input.bookId,
            status: "completed",
          },
          orderBy: { created_at: "desc" },
          select: { audio_url: true, created_at: true },
        });

        if (existingAudio?.audio_url) {
          console.log(`[TTS] Using cached audio for book ${input.bookId}`);
          return {
            audioUrl: existingAudio.audio_url,
            cached: true,
            success: true,
            generatedAt: existingAudio.created_at,
          };
        }

        // Generate new full book audio
        console.log(`[TTS] Generating new audio for book ${input.bookId}`);
        const audioUrl = await generateFullBookAudioWithElevenLabs(
          input.fullText,
          input.bookId,
          userId
        );

        return {
          audioUrl,
          cached: false,
          success: true,
          generatedAt: new Date(),
        };
      } catch (error) {
        console.error("[TTS] Error:", error);
        return {
          audioUrl: null,
          cached: false,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get audio URL for a book (query version for checking without generating)
   */
  getBookAudioUrl: publicProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ input }) => {
      try {
        const audio = await prisma.ttsAudio.findFirst({
          where: {
            book_id: input.bookId,
            status: "completed",
          },
          orderBy: { created_at: "desc" },
          select: { audio_url: true, created_at: true },
        });

        return {
          exists: !!audio?.audio_url,
          audioUrl: audio?.audio_url || null,
          generatedAt: audio?.created_at || null,
          success: true,
        };
      } catch (error) {
        console.error("[TTS] Error checking audio:", error);
        return {
          exists: false,
          audioUrl: null,
          generatedAt: null,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Clear old cached audio (older than 30 days)
   */
  clearOldCache: publicProcedure.mutation(async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deleted = await prisma.ttsAudio.deleteMany({
        where: {
          created_at: {
            lt: thirtyDaysAgo,
          },
          status: "completed",
        },
      });
      return { success: true, deletedCount: deleted.count };
    } catch (error) {
      console.error("[TTS] Cache cleanup error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }),
});
