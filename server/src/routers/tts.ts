import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { uploadWithFallback } from "../lib/s3.js";
import crypto from "crypto";

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = await prisma.userRole.findFirst({
    where: { user_id: ctx.userId, role: { in: ["admin", "moderator"] } },
  });
  if (!role) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const getElevenLabsKey = () => process.env.ELEVENLABS_API_KEY;
const UPLOADS_DIR = process.env.UPLOADS_DIR || "./uploads";
const BASE_URL = (process.env.BASE_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");

// ─── TTS Access Control ─────────────────────────────────────────────────────
// Shared by both tRPC procedures and REST routes.

export type TtsAccessResult =
  | { allowed: true;  access_type: string }
  | { allowed: false; reason: string; access_type: string; coin_price: number };

export async function checkTtsAccess(
  userId: string,
  bookId: string
): Promise<TtsAccessResult> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      premium_voice_enabled: true,
      voice_access_type: true,
      voice_coin_price: true,
    },
  });

  if (!book) {
    return { allowed: false, reason: "Book not found", access_type: "none", coin_price: 0 };
  }
  if (!book.premium_voice_enabled) {
    return {
      allowed: false,
      reason: "Premium Voice is not enabled for this book",
      access_type: "none",
      coin_price: 0,
    };
  }

  // Free — no unlock needed
  if (book.voice_access_type === "free") {
    return { allowed: true, access_type: "free" };
  }

  // Check coin/purchase unlock record
  const unlock = await prisma.contentUnlock.findFirst({
    where: { user_id: userId, book_id: bookId, format: "premium_voice", status: "active" },
  });
  if (unlock) return { allowed: true, access_type: "coin_unlock" };

  // Check if user purchased the ebook via payment gateway
  const paidEbookOrder = await prisma.orderItem.findFirst({
    where: {
      order: { user_id: userId, status: { in: ["paid", "confirmed", "completed", "delivered"] } },
      book_format: { book_id: bookId, format: "ebook" },
    },
  });
  if (paidEbookOrder) return { allowed: true, access_type: "coin_unlock" };

  // Subscription grants access for both "subscription" and "paid" access types
  const subscription = await prisma.userSubscription.findFirst({
    where: {
      user_id: userId,
      status: "active",
      OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
    },
  });
  if (subscription) return { allowed: true, access_type: "subscription" };

  // Denied — tell the client what they need
  const coinPrice = book.voice_coin_price ?? 0;
  if (book.voice_access_type === "subscription") {
    return {
      allowed: false,
      reason: "Active subscription required for AI Voice on this book",
      access_type: "subscription",
      coin_price: coinPrice,
    };
  }
  return {
    allowed: false,
    reason: "Purchase required — unlock with coins to use AI Voice",
    access_type: "paid",
    coin_price: coinPrice,
  };
}

// ─── Bengali-friendly voices (fallback when no DB config) ──────────────────
export const BENGALI_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", label: "সারা (মহিলা)", lang: "bn", enabled: true },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",  label: "লিলি (মহিলা)", lang: "bn", enabled: true },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", label: "জর্জ (পুরুষ)", lang: "bn", enabled: true },
];
const DEFAULT_VOICE_ID = BENGALI_VOICES[0].id; // Sarah

// ─── Platform settings keys ─────────────────────────────────────────────────
const VOICE_CONFIG_KEY    = "tts_voices_config";
const AMBIENT_CONFIG_KEY  = "ambient_tracks_config";
const TTS_MODEL_KEY       = "tts_model_id";

// ─── Default ambient tracks ─────────────────────────────────────────────────
const DEFAULT_AMBIENT_TRACKS = [
  { id: "calm",      name: "Calm",      label: "শান্ত",        emoji: "🌿", url: "", enabled: true, prompt: "Soft peaceful ambient sounds, gentle breeze, birds chirping, nature background music" },
  { id: "romance",   name: "Romance",   label: "রোমান্স",       emoji: "💕", url: "", enabled: true, prompt: "Romantic soft piano melody, gentle strings, warm ambient atmosphere" },
  { id: "horror",    name: "Horror",    label: "ভৌতিক",        emoji: "👻", url: "", enabled: true, prompt: "Eerie dark ambient music, unsettling low drones, suspenseful horror atmosphere" },
  { id: "suspense",  name: "Suspense",  label: "সাসপেন্স",     emoji: "⚡", url: "", enabled: true, prompt: "Tense suspense background music, mysterious ambient sounds, thriller atmosphere" },
  { id: "adventure", name: "Adventure", label: "অ্যাডভেঞ্চার", emoji: "⚔️", url: "", enabled: true, prompt: "Epic adventure background music, orchestral ambient, heroic atmosphere" },
];

// ─── DB helpers ─────────────────────────────────────────────────────────────
async function getStoredVoices() {
  const row = await prisma.platformSetting.findUnique({ where: { key: VOICE_CONFIG_KEY } });
  if (row?.value) { try { return JSON.parse(row.value) as typeof BENGALI_VOICES; } catch {} }
  return BENGALI_VOICES;
}

async function getStoredAmbientTracks() {
  const row = await prisma.platformSetting.findUnique({ where: { key: AMBIENT_CONFIG_KEY } });
  if (row?.value) { try { return JSON.parse(row.value) as typeof DEFAULT_AMBIENT_TRACKS; } catch {} }
  return DEFAULT_AMBIENT_TRACKS;
}

// ─── TTS model — dynamic, cached in memory for 5 min ───────────────────────
const ELEVENLABS_MODEL_DEFAULT = "eleven_multilingual_v2";
let _modelCache: { value: string; expiresAt: number } | null = null;

async function getStoredTtsModel(): Promise<string> {
  if (_modelCache && Date.now() < _modelCache.expiresAt) return _modelCache.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: TTS_MODEL_KEY } });
  const model = row?.value?.trim() || ELEVENLABS_MODEL_DEFAULT;
  _modelCache = { value: model, expiresAt: Date.now() + 5 * 60_000 };
  return model;
}

function invalidateModelCache() { _modelCache = null; }

// ─── ElevenLabs settings ────────────────────────────────────────────────────
const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128"; // URL query param, NOT body
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.5,
  use_speaker_boost: true,
  speed: 1.0,
};

// ─── Bengali text preprocessing ────────────────────────────────────────────
function preprocessBengaliText(text: string): string {
  return text
    .replace(/।/g, "। ")        // পূর্ণ বিরাম → natural pause
    .replace(/,/g, ", ")         // কমা pause
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoParagraphs(text: string, maxChars = 2500): string[] {
  // Split on paragraph breaks first
  const rawParagraphs = text
    .split(/\n{2,}|।\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const chunks: string[] = [];
  for (const para of rawParagraphs) {
    if (para.length <= maxChars) {
      chunks.push(para);
    } else {
      // Split long paragraphs on sentence boundaries
      const sentences = para.split(/(?<=।)\s+/);
      let current = "";
      for (const sentence of sentences) {
        if ((current + sentence).length > maxChars && current) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current += (current ? " " : "") + sentence;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }
  return chunks.length > 0 ? chunks : [text.substring(0, maxChars)];
}

// ─── SHA-256 hash for cache key ─────────────────────────────────────────────
function makeCacheHash(text: string, voiceId: string, model: string): string {
  return crypto
    .createHash("sha256")
    .update(`${text}|${voiceId}|${model}`)
    .digest("hex");
}

// ─── Core ElevenLabs TTS call ───────────────────────────────────────────────
async function callElevenLabs(text: string, voiceId: string, model?: string): Promise<Buffer> {
  const key = getElevenLabsKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");

  const modelId = model ?? await getStoredTtsModel();
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: preprocessBengaliText(text),
      model_id: modelId,
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    try {
      const errObj = JSON.parse(errText);
      if (errObj?.detail?.status === "quota_exceeded") {
        throw new Error("QUOTA_EXCEEDED");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "QUOTA_EXCEEDED") throw e;
    }
    throw new Error(`ElevenLabs ${response.status}: ${errText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ─── Generate + cache a single paragraph ────────────────────────────────────
export async function generateParagraphAudio(
  text: string,
  voiceId: string,
  bookId: string,
  userId: string,
  paragraphIndex: number
): Promise<string> {
  const model = await getStoredTtsModel();
  const textHash = makeCacheHash(text, voiceId, model);

  // Check cache first
  const cached = await prisma.ttsAudio.findFirst({
    where: { text_hash: textHash, status: "completed" },
    select: { audio_url: true },
  });
  if (cached?.audio_url) {
    console.log(`[TTS] Cache hit for paragraph ${paragraphIndex}`);
    return cached.audio_url;
  }

  console.log(`[TTS] Generating paragraph ${paragraphIndex} (${text.length} chars) model=${model}`);
  const audioBuffer = await callElevenLabs(text, voiceId, model);

  const fileName = `tts_${bookId}_p${paragraphIndex}_${textHash.slice(0, 8)}.mp3`;
  const uploadResult = await uploadWithFallback(
    audioBuffer,
    fileName,
    "audio/mpeg",
    { hint: "audio", folder: "tts-paragraphs" },
    { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL }
  );

  await prisma.ttsAudio.create({
    data: {
      text_hash: textHash,
      source_text: text.substring(0, 500),
      audio_url: uploadResult.url,
      book_id: bookId,
      user_id: userId,
      voice_id: voiceId,
      language: "bn",
      status: "completed",
      char_count: text.length,
    },
  });

  console.log(`[TTS] Uploaded paragraph ${paragraphIndex} via ${uploadResult.via}`);
  return uploadResult.url;
}

// ──────────────────────────────────────────────────────────────────────────────

export const ttsRouter = router({

  // List available Bengali voices (reads from platform_settings, falls back to hardcoded)
  listVoices: publicProcedure.query(async () => {
    const voices = await getStoredVoices();
    return voices.filter(v => v.enabled !== false);
  }),

  // Public: list enabled ambient tracks
  listAmbientTracks: publicProcedure.query(async () => {
    const tracks = await getStoredAmbientTracks();
    return tracks.filter(t => t.enabled);
  }),

  // Generate audio for a single paragraph (with SHA-256 cache)
  generateParagraph: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      text: z.string().min(1).max(3000),
      voiceId: z.string().default(DEFAULT_VOICE_ID),
      paragraphIndex: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      // ── Access gate ──
      const access = await checkTtsAccess(ctx.userId, input.bookId);
      if (access.allowed === false) {
        throw new TRPCError({ code: "FORBIDDEN", message: access.reason });
      }

      try {
        const audioUrl = await generateParagraphAudio(
          input.text,
          input.voiceId,
          input.bookId,
          ctx.userId,
          input.paragraphIndex
        );
        return { success: true, audioUrl, cached: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("[TTS] generateParagraph error:", msg);
        return {
          success: false,
          audioUrl: null,
          error: msg,
          quotaExceeded: msg === "QUOTA_EXCEEDED",
        };
      }
    }),

  // Prefetch next N paragraphs (background lookahead)
  prefetchParagraphs: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      paragraphs: z.array(z.object({
        text: z.string().min(1).max(3000),
        index: z.number().int(),
      })).max(3),
      voiceId: z.string().default(DEFAULT_VOICE_ID),
    }))
    .mutation(async ({ ctx, input }) => {
      // ── Access gate ──
      const access = await checkTtsAccess(ctx.userId, input.bookId);
      if (access.allowed === false) {
        throw new TRPCError({ code: "FORBIDDEN", message: access.reason });
      }

      // Fire and forget — cache them so next play is instant
      Promise.all(
        input.paragraphs.map(p =>
          generateParagraphAudio(p.text, input.voiceId, input.bookId, ctx.userId, p.index)
            .catch(e => console.warn(`[TTS] Prefetch ${p.index} failed:`, e))
        )
      );
      return { success: true };
    }),

  // Get or generate full book audio (legacy compat + for books without paragraph structure)
  getOrGenerateFullBookAudio: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      fullText: z.string().min(1).max(50000),
      voiceId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const voiceId = input.voiceId || DEFAULT_VOICE_ID;
        const userId = ctx.userId;
        const model = await getStoredTtsModel();
        const textHash = makeCacheHash(input.fullText, voiceId, model);

        const cached = await prisma.ttsAudio.findFirst({
          where: { text_hash: textHash, status: "completed" },
          select: { audio_url: true, created_at: true },
        });
        if (cached?.audio_url) {
          return { audioUrl: cached.audio_url, cached: true, success: true, generatedAt: cached.created_at };
        }

        // Split into paragraphs and generate first one immediately
        const paragraphs = splitIntoParagraphs(input.fullText);
        const firstUrl = await generateParagraphAudio(paragraphs[0], voiceId, input.bookId, userId, 0);

        // Cache remaining in background
        if (paragraphs.length > 1) {
          Promise.all(
            paragraphs.slice(1).map((p, i) =>
              generateParagraphAudio(p, voiceId, input.bookId, userId, i + 1).catch(() => {})
            )
          );
        }

        return { audioUrl: firstUrl, cached: false, success: true, generatedAt: new Date() };
      } catch (err) {
        console.error("[TTS] Error:", err);
        return { audioUrl: null, cached: false, success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    }),

  // Get book audio URL (query)
  getBookAudioUrl: publicProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ input }) => {
      const audio = await prisma.ttsAudio.findFirst({
        where: { book_id: input.bookId, status: "completed" },
        orderBy: { created_at: "desc" },
        select: { audio_url: true, created_at: true },
      });
      return { exists: !!audio, audioUrl: audio?.audio_url ?? null, generatedAt: audio?.created_at ?? null, success: true };
    }),

  // Admin: check ElevenLabs API status + quota
  checkApiStatus: adminProcedure.query(async () => {
    const key = getElevenLabsKey();
    if (!key) return { configured: false, quota: null, error: "API key not set" };
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": key },
      });
      if (!res.ok) return { configured: true, quota: null, error: `ElevenLabs ${res.status}` };
      const d = await res.json() as any;
      return {
        configured: true,
        error: null,
        quota: {
          characterCount: d.character_count ?? 0,
          characterLimit: d.character_limit ?? 0,
          nextResetUnix: d.next_character_count_reset_unix ?? null,
          tier: d.tier ?? "free",
          status: d.status ?? "active",
        },
      };
    } catch (err) {
      return { configured: true, quota: null, error: "Connection failed" };
    }
  }),

  // Admin: test a voice with sample text
  testVoice: adminProcedure
    .input(z.object({
      voiceId: z.string(),
      text: z.string().max(200).default("আমি বাংলায় কথা বলছি। এটি একটি পরীক্ষামূলক বার্তা।"),
    }))
    .mutation(async ({ input }) => {
      try {
        const audioBuffer = await callElevenLabs(input.text, input.voiceId);
        const result = await uploadWithFallback(
          audioBuffer,
          `tts_test_${input.voiceId.slice(0, 6)}_${Date.now()}.mp3`,
          "audio/mpeg",
          { hint: "audio", folder: "tts-tests" },
          { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL }
        );
        return { success: true, audioUrl: result.url };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, audioUrl: null, error: msg, quotaExceeded: msg === "QUOTA_EXCEEDED" };
      }
    }),

  // Admin: per-book TTS cache stats
  adminBookStats: adminProcedure.query(async () => {
    const rows = await prisma.$queryRaw<{ book_id: string; cnt: bigint; total_chars: bigint; latest: Date }[]>`
      SELECT book_id, COUNT(*) AS cnt, COALESCE(SUM(char_count),0) AS total_chars, MAX(created_at) AS latest
      FROM tts_audio WHERE status='completed' AND book_id IS NOT NULL
      GROUP BY book_id ORDER BY cnt DESC LIMIT 20
    `;
    const bookIds = rows.map(r => r.book_id);
    const books = await prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: { id: true, title: true, slug: true, premium_voice_enabled: true, voice_access_type: true, voice_coin_price: true },
    });
    const bmap = Object.fromEntries(books.map(b => [b.id, b]));
    return rows.map(r => ({
      bookId: r.book_id,
      book: (bmap[r.book_id] as any) ?? null,
      count: Number(r.cnt),
      totalChars: Number(r.total_chars),
      latest: r.latest,
    }));
  }),

  // Admin: dashboard stats
  adminStats: adminProcedure.query(async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalCached, todayGenerated, totalCharsRow] = await Promise.all([
      prisma.ttsAudio.count({ where: { status: "completed" } }),
      prisma.ttsAudio.count({ where: { status: "completed", created_at: { gte: todayStart } } }),
      prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COALESCE(SUM(char_count), 0) AS total FROM tts_audio WHERE status = 'completed'
      `,
    ]);

    const voices = await getStoredVoices();
    return {
      totalCached,
      todayGenerated,
      totalCharsProcessed: Number(totalCharsRow[0]?.total ?? 0),
      voices: voices.filter(v => v.enabled !== false),
    };
  }),

  // Admin: list cached audio
  adminListCache: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const [items, total] = await Promise.all([
        prisma.ttsAudio.findMany({
          where: { status: "completed" },
          orderBy: { created_at: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        prisma.ttsAudio.count({ where: { status: "completed" } }),
      ]);
      return { items, total };
    }),

  // Admin: delete specific cached audio
  adminDeleteCache: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.ttsAudio.delete({ where: { id: input.id } })),

  // Admin: clear old cache
  clearOldCache: adminProcedure
    .input(z.object({ daysOld: z.number().int().min(1).default(30) }))
    .mutation(async ({ input }) => {
      const cutoff = new Date(Date.now() - input.daysOld * 24 * 60 * 60 * 1000);
      const result = await prisma.ttsAudio.deleteMany({
        where: { created_at: { lt: cutoff }, status: "completed" },
      });
      return { success: true, deletedCount: result.count };
    }),

  // Clear all cache
  clearAllCache: adminProcedure.mutation(async () => {
    const result = await prisma.ttsAudio.deleteMany({ where: { status: "completed" } });
    return { success: true, deletedCount: result.count };
  }),

  // ── Voice Config ────────────────────────────────────────────────────────────

  // Admin: fetch all voices from ElevenLabs API
  adminFetchElevenLabsVoices: adminProcedure.query(async () => {
    const key = getElevenLabsKey();
    if (!key) throw new TRPCError({ code: "BAD_REQUEST", message: "API key not set" });
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `ElevenLabs ${res.status}` });
    const data = await res.json() as { voices: any[] };
    return data.voices ?? [];
  }),

  // Admin: get current voice config
  adminGetVoiceConfig: adminProcedure.query(() => getStoredVoices()),

  // Admin: save voice config
  adminSaveVoiceConfig: adminProcedure
    .input(z.array(z.object({
      id:       z.string(),
      name:     z.string(),
      label:    z.string(),
      lang:     z.string().default("bn"),
      enabled:  z.boolean().default(true),
      category: z.string().optional(),
    })))
    .mutation(async ({ input }) => {
      await prisma.platformSetting.upsert({
        where:  { key: VOICE_CONFIG_KEY },
        update: { value: JSON.stringify(input) },
        create: { key: VOICE_CONFIG_KEY, value: JSON.stringify(input) },
      });
      return { success: true };
    }),

  // ── Ambient Track Config ────────────────────────────────────────────────────

  // Admin: get ambient tracks config
  adminGetAmbientTracks: adminProcedure.query(() => getStoredAmbientTracks()),

  // Admin: save ambient tracks config
  adminSaveAmbientTracks: adminProcedure
    .input(z.array(z.object({
      id:      z.string(),
      name:    z.string(),
      label:   z.string(),
      emoji:   z.string(),
      url:     z.string(),
      enabled: z.boolean(),
      prompt:  z.string().optional(),
    })))
    .mutation(async ({ input }) => {
      await prisma.platformSetting.upsert({
        where:  { key: AMBIENT_CONFIG_KEY },
        update: { value: JSON.stringify(input) },
        create: { key: AMBIENT_CONFIG_KEY, value: JSON.stringify(input) },
      });
      return { success: true };
    }),

  // Admin: generate ambient sound via ElevenLabs Sound Effects API
  adminGenerateAmbientSound: adminProcedure
    .input(z.object({
      trackId:         z.string(),
      prompt:          z.string().min(10).max(500),
      durationSeconds: z.number().min(5).max(22).default(22),
    }))
    .mutation(async ({ input }) => {
      const key = getElevenLabsKey();
      if (!key) throw new TRPCError({ code: "BAD_REQUEST", message: "ELEVENLABS_API_KEY not configured" });

      const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text:             input.prompt,
          duration_seconds: input.durationSeconds,
          prompt_influence: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `ElevenLabs ${response.status}: ${errText}` });
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const fileName = `ambient_${input.trackId}_${Date.now()}.mp3`;
      const result = await uploadWithFallback(
        audioBuffer,
        fileName,
        "audio/mpeg",
        { hint: "audio", folder: "ambient-tracks" },
        { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL }
      );
      return { success: true, url: result.url, via: result.via };
    }),

  // ── TTS Model Config ────────────────────────────────────────────────────────

  // Admin: fetch available models from ElevenLabs
  adminFetchElevenLabsModels: adminProcedure.query(async () => {
    const key = getElevenLabsKey();
    if (!key) throw new TRPCError({ code: "BAD_REQUEST", message: "API key not set" });
    const res = await fetch("https://api.elevenlabs.io/v1/models", {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `ElevenLabs ${res.status}` });
    return res.json() as Promise<{ model_id: string; name: string; description: string; can_do_text_to_speech: boolean }[]>;
  }),

  // Admin: get current TTS model
  adminGetTtsModel: adminProcedure.query(async () => {
    const model = await getStoredTtsModel();
    return { model };
  }),

  // Admin: save TTS model
  adminSaveTtsModel: adminProcedure
    .input(z.object({ model: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await prisma.platformSetting.upsert({
        where:  { key: TTS_MODEL_KEY },
        update: { value: input.model },
        create: { key: TTS_MODEL_KEY, value: input.model },
      });
      invalidateModelCache();
      return { success: true };
    }),
});
