import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Bangla detection ──────────────────────── */

function isBangla(text: string): boolean {
  let bn = 0, lat = 0;
  for (const ch of text) {
    if (/[\u0980-\u09FF]/.test(ch)) bn++;
    else if (/[a-zA-Z]/.test(ch)) lat++;
  }
  return (bn + lat) > 0 && bn / (bn + lat) >= 0.4;
}

/* ── Emotion detection (Bangla keywords) ───── */

type EmotionTag = "neutral" | "soft" | "suspense" | "fear" | "joy" | "anger" | "sad" | "whisper" | "deep";

const EMOTION_PATTERNS: Array<{ tag: EmotionTag; re: RegExp }> = [
  { tag: "whisper", re: /ফিসফিস|চুপ|গোপনে|কানে কানে|আস্তে|নিঃশব্দে|লুকিয়ে/ },
  { tag: "fear", re: /ভয়|আতঙ্ক|চিৎকার|অন্ধকার|রক্ত|মৃত্যু|ভূত|প্রেত|কাঁপ|শিউরে/ },
  { tag: "anger", re: /রাগ|ক্রোধ|ক্ষোভ|ঘৃণা|প্রতিশোধ|অভিশাপ|ধিক্কার|গর্জন/ },
  { tag: "suspense", re: /হঠাৎ|আচমকা|চমকে|থমকে|অদ্ভুত|রহস্য|নিশ্চুপ|নিস্তব্ধ/ },
  { tag: "sad", re: /কান্না|দুঃখ|কষ্ট|বেদনা|চোখের জল|অশ্রু|শোক|বিষাদ|হতাশা/ },
  { tag: "joy", re: /আনন্দ|খুশি|হাসি|উল্লাস|মজা|উৎসব|আহ্লাদ|প্রফুল্ল/ },
  { tag: "soft", re: /ভালোবাসা|আদর|মায়া|স্নেহ|কোমল|শান্ত|মৃদু|স্বপ্ন/ },
  { tag: "deep", re: /জীবন|মরণ|সত্য|ন্যায়|বিচার|ইতিহাস|দর্শন|যুদ্ধ|সংগ্রাম/ },
];

function detectEmotion(text: string): EmotionTag {
  for (const { tag, re } of EMOTION_PATTERNS) {
    if (re.test(text)) return tag;
  }
  return "neutral";
}

/* ── Emotional text preprocessing ──────────── */

/** Speed multiplier hints encoded as SSML-like markers in the text */
const EMOTION_SPEED: Record<EmotionTag, number> = {
  neutral: 1.0, soft: 0.85, deep: 0.78, suspense: 0.72,
  fear: 0.9, whisper: 0.7, joy: 1.1, anger: 1.05, sad: 0.75,
};

/**
 * Preprocess text for free TTS generation:
 * - Normalise Bangla punctuation
 * - Insert pauses (commas / ellipses) at emotional boundaries
 * - Split into sentences for pacing
 */
function preprocessForFreeTTS(rawText: string): { sentences: string[]; emotion: EmotionTag } {
  let text = rawText.trim();
  // Normalise
  text = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  text = text.replace(/\s+/g, " ");
  text = text.replace(/।{2,}/g, "।");

  const emotion = detectEmotion(text);

  // Add pacing pauses based on emotion
  if (emotion === "suspense" || emotion === "fear") {
    // Add dramatic pauses after দাঁড়ি
    text = text.replace(/।\s*/g, "।... ");
  } else if (emotion === "sad" || emotion === "whisper") {
    // Softer pauses
    text = text.replace(/।\s*/g, "।.. ");
  } else if (emotion === "anger") {
    // Short sharp pauses
    text = text.replace(/!\s*/g, "!! ");
  }

  // Split into sentences
  const sentences = text
    .split(/(?<=[।.!?…])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  return { sentences, emotion };
}

/* ── Hashing ───────────────────────────────── */

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ── Google Translate TTS (free) ───────────── */

const MAX_GTTS_CHARS = 200;

/**
 * Fetch audio from Google Translate's public TTS endpoint.
 * This is the same mechanism used by gTTS (Python library).
 * Limited to ~200 chars per request, so we chunk long text.
 */
async function fetchGoogleTranslateTTS(text: string, lang: string): Promise<ArrayBuffer> {
  // Split text into chunks if too long
  const chunks: string[] = [];
  if (text.length <= MAX_GTTS_CHARS) {
    chunks.push(text);
  } else {
    // Split on sentence boundaries
    const sentences = text.split(/(?<=[।.!?])\s*/);
    let currentChunk = "";
    for (const sentence of sentences) {
      if ((currentChunk + " " + sentence).length > MAX_GTTS_CHARS && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
  }

  // Fetch audio for each chunk
  const audioBuffers: ArrayBuffer[] = [];
  for (const chunk of chunks) {
    const encoded = encodeURIComponent(chunk);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${lang}&client=tw-ob&ttsspeed=${lang === "bn" ? "0.8" : "1"}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://translate.google.com/",
      },
    });

    if (!res.ok) {
      console.warn(`[free-tts] Google TTS failed for chunk (${res.status}): ${chunk.slice(0, 50)}`);
      throw new Error(`Google TTS returned ${res.status}`);
    }

    audioBuffers.push(await res.arrayBuffer());
  }

  // Concatenate audio buffers
  if (audioBuffers.length === 1) return audioBuffers[0];

  const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of audioBuffers) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return combined.buffer;
}

/* ── Main handler ──────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string | null = null;
    try {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Token may be expired/invalid
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const { text, book_id, language } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (text.trim().length > 3000) {
      return new Response(
        JSON.stringify({ error: "text exceeds 3000 character limit for free TTS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Preprocess with emotion detection
    const detectedBangla = isBangla(text);
    const { sentences, emotion } = preprocessForFreeTTS(text);
    const processedText = sentences.join(" ");
    const lang = detectedBangla ? "bn" : (language === "en-US" ? "en" : "bn");

    // Cache key
    const cacheKey = await sha256(`free-tts:${lang}:${processedText.trim().toLowerCase()}`);

    console.log(`[free-tts] lang=${lang} emotion=${emotion} sentences=${sentences.length} chars=${processedText.length} key=${cacheKey.slice(0, 12)}`);

    // Check cache
    const { data: cached } = await supabaseAdmin
      .from("tts_paragraph_cache")
      .select("id, audio_url, status")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.status === "generated" && cached.audio_url) {
      // Try signed URL
      const pathMatch = cached.audio_url.match(/\/storage\/v1\/object\/public\/tts-audio\/(.+)$/);
      if (pathMatch) {
        const { data: signedData } = await supabaseAdmin.storage
          .from("tts-audio")
          .createSignedUrl(pathMatch[1], 300);
        if (signedData?.signedUrl) {
          console.log(`[free-tts] Cache HIT`);
          return new Response(
            JSON.stringify({
              audio_url: signedData.signedUrl,
              cached: true,
              tier: "free",
              emotion,
              speed: EMOTION_SPEED[emotion],
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      return new Response(
        JSON.stringify({ audio_url: cached.audio_url, cached: true, tier: "free", emotion }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (cached?.status === "pending") {
      return new Response(
        JSON.stringify({ status: "pending", message: "Audio is being generated" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert pending record
    const { data: record, error: upsertErr } = await supabaseAdmin
      .from("tts_paragraph_cache")
      .upsert(
        {
          cache_key: cacheKey,
          text_hash: await sha256(text.trim().toLowerCase()),
          voice_id: null,
          model_id: "google-translate-free",
          book_id: book_id || null,
          status: "pending",
          error_message: null,
          audio_url: null,
        },
        { onConflict: "cache_key" },
      )
      .select("id")
      .single();

    if (upsertErr) {
      console.error("[free-tts] Upsert error:", upsertErr);
      return new Response(
        JSON.stringify({ error: "Failed to create record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recordId = record.id;

    // Generate audio via Google Translate TTS
    let audioBuffer: ArrayBuffer;
    try {
      audioBuffer = await fetchGoogleTranslateTTS(processedText, lang);
      console.log(`[free-tts] Generated ${audioBuffer.byteLength} bytes`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[free-tts] Generation error:", msg);
      await supabaseAdmin.from("tts_paragraph_cache")
        .update({ status: "failed", error_message: msg.slice(0, 500) })
        .eq("id", recordId);
      return new Response(
        JSON.stringify({ error: "Free TTS generation failed", details: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upload to storage
    const fileName = `free-tts/${cacheKey.slice(0, 8)}/${Date.now()}.mp3`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("tts-audio")
      .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });

    if (uploadErr) {
      console.error("[free-tts] Upload error:", uploadErr);
      await supabaseAdmin.from("tts_paragraph_cache")
        .update({ status: "failed", error_message: uploadErr.message })
        .eq("id", recordId);
      return new Response(
        JSON.stringify({ error: "Failed to upload audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from("tts-audio").getPublicUrl(fileName);

    await supabaseAdmin.from("tts_paragraph_cache")
      .update({
        status: "generated",
        audio_url: publicUrlData.publicUrl,
        file_size_bytes: audioBuffer.byteLength,
        error_message: null,
      })
      .eq("id", recordId);

    const { data: signedData } = await supabaseAdmin.storage
      .from("tts-audio")
      .createSignedUrl(fileName, 300);

    const finalUrl = signedData?.signedUrl || publicUrlData.publicUrl;

    return new Response(
      JSON.stringify({
        audio_url: finalUrl,
        cached: false,
        tier: "free",
        emotion,
        speed: EMOTION_SPEED[emotion],
        pipeline: { model: "google-translate-free", version: "v1" },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[free-tts] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
