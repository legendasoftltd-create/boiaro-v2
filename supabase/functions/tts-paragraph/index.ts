import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Utilities ─────────────────────────────── */

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractStoragePath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/tts-audio\/(.+)$/);
  return m ? m[1] : null;
}

/* ── Bangla detection & normalisation ──────── */

function isBangla(text: string): boolean {
  let bn = 0, lat = 0;
  for (const ch of text) {
    if (/[\u0980-\u09FF]/.test(ch)) bn++;
    else if (/[a-zA-Z]/.test(ch)) lat++;
  }
  return (bn + lat) > 0 && bn / (bn + lat) >= 0.4;
}

function normaliseBangla(raw: string): string {
  let t = raw;
  t = t.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/।{2,}/g, "।");
  t = t.replace(/!{2,}/g, "!");
  t = t.replace(/\?{2,}/g, "?");
  t = t.replace(/([।,])([^\s"')\]])/g, "$1 $2");
  return t.trim();
}

/**
 * Enhance Bangla text with v3-compatible audio tags and delivery shaping.
 * Maps common Bangla punctuation patterns to expressive audio tags.
 * Preserves the original text — only prepends/appends tags.
 */
function enhanceBanglaForV3(text: string): string {
  let enhanced = text;

  // Add pause weight via ellipses at দাঁড়ি (।) — v3 respects these for pacing
  enhanced = enhanced.replace(/।\s*/g, "।… ");

  // Emotional exclamation emphasis
  enhanced = enhanced.replace(/!\s*/g, "! ");

  // Question marks get curious delivery
  enhanced = enhanced.replace(/\?\s*/g, "? ");

  // Detect emotional patterns and prepend audio tags
  // Sad/melancholic patterns: কান্না, দুঃখ, কষ্ট, বেদনা, চোখের জল
  if (/(?:কান্না|দুঃখ|কষ্ট|বেদনা|চোখের\s*জল|অশ্রু)/u.test(enhanced)) {
    enhanced = "[sad] " + enhanced;
  }
  // Angry patterns: রাগ, ক্রোধ, চিৎকার
  else if (/(?:রাগ|ক্রোধ|চিৎকার|ক্ষোভ)/u.test(enhanced)) {
    enhanced = "[angry] " + enhanced;
  }
  // Happy/excited: আনন্দ, খুশি, হাসি, উল্লাস
  else if (/(?:আনন্দ|খুশি|হাসি|উল্লাস|মজা)/u.test(enhanced)) {
    enhanced = "[excited] " + enhanced;
  }
  // Surprised: বিস্ময়, অবাক, চমক
  else if (/(?:বিস্ময়|অবাক|চমক|আশ্চর্য)/u.test(enhanced)) {
    enhanced = "[surprised] " + enhanced;
  }
  // Whisper/secret: ফিসফিস, গোপন, চুপি
  else if (/(?:ফিসফিস|গোপন|চুপি|কানে\s*কানে)/u.test(enhanced)) {
    enhanced = "[whisper] " + enhanced;
  }
  // Thoughtful/reflective: ভাবনা, চিন্তা, মনে মনে
  else if (/(?:ভাবনা|চিন্তা|মনে\s*মনে)/u.test(enhanced)) {
    enhanced = "[thoughtful] " + enhanced;
  }

  // Add trailing sigh for ellipsis-heavy text (hesitation/longing)
  if ((enhanced.match(/\.\.\./g) || []).length >= 2) {
    enhanced = enhanced + " [sighs]";
  }

  return enhanced;
}

/* ── Voice & model configuration ───────────── */

const DEFAULT_VOICE_ID = "9ZHZoaMR26GdQwglJzoy"; // Christopher Deep Narrator
const FALLBACK_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Bella
const DEFAULT_MODEL = "eleven_v3";                  // GA — most expressive, 70+ langs, audio tags
const FALLBACK_MODEL = "eleven_multilingual_v2";    // fallback if v3 fails
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

// v3 stability slider: "Creative" range for maximum expressiveness
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.30,           // Creative range — maximum emotional variation
  similarity_boost: 0.80,    // High fidelity to voice character
  style: 0.70,               // Elevated style for dramatic audiobook narration
  use_speaker_boost: true,
};

// Pipeline version — changing this invalidates all old cache entries
const PIPELINE_VERSION = "v3-enhanced-1";

async function buildCacheKey(params: {
  text: string;
  voiceId: string;
  model: string;
  outputFormat: string;
  language: string;
  settings: Record<string, unknown>;
  pipelineVersion: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    t: params.text.trim().toLowerCase(),
    v: params.voiceId,
    m: params.model,
    o: params.outputFormat,
    l: params.language,
    s: params.settings,
    p: params.pipelineVersion,
  });
  return sha256(canonical);
}

/* ── ElevenLabs API call with v3 → v2 fallback ── */

async function callElevenLabs(
  apiKey: string,
  voiceId: string,
  model: string,
  text: string,
  outputFormat: string,
  settings: typeof DEFAULT_VOICE_SETTINGS,
): Promise<{ buffer: ArrayBuffer; usedModel: string; usedVoice: string }> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;
  const body = JSON.stringify({
    text,
    model_id: model,
    voice_settings: settings,
  });
  const headers = { "xi-api-key": apiKey, "Content-Type": "application/json" };

  const res = await fetch(url, { method: "POST", headers, body });

  if (res.ok) {
    return { buffer: await res.arrayBuffer(), usedModel: model, usedVoice: voiceId };
  }

  const errText = await res.text().catch(() => "Unknown");
  console.warn(`[tts] ${model}/${voiceId} failed (${res.status}): ${errText.slice(0, 200)}`);

  // Fallback chain: v3 → v2 model, then primary → fallback voice
  const fallbacks: Array<{ m: string; v: string }> = [];
  if (model === DEFAULT_MODEL) fallbacks.push({ m: FALLBACK_MODEL, v: voiceId });
  if (voiceId === DEFAULT_VOICE_ID) fallbacks.push({ m: model, v: FALLBACK_VOICE_ID });
  if (model === DEFAULT_MODEL && voiceId === DEFAULT_VOICE_ID) {
    fallbacks.push({ m: FALLBACK_MODEL, v: FALLBACK_VOICE_ID });
  }

  for (const fb of fallbacks) {
    console.log(`[tts] Trying fallback: model=${fb.m} voice=${fb.v}`);
    const fbUrl = `https://api.elevenlabs.io/v1/text-to-speech/${fb.v}?output_format=${outputFormat}`;
    const fbBody = JSON.stringify({ text, model_id: fb.m, voice_settings: settings });
    const fbRes = await fetch(fbUrl, { method: "POST", headers, body: fbBody });
    if (fbRes.ok) {
      return { buffer: await fbRes.arrayBuffer(), usedModel: fb.m, usedVoice: fb.v };
    }
    console.warn(`[tts] Fallback ${fb.m}/${fb.v} also failed (${fbRes.status})`);
  }

  throw new Error(`All ElevenLabs attempts failed. Last: ${res.status}: ${errText.slice(0, 300)}`);
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
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Parse body ---
    const body = await req.json();
    const { text, book_id, language, pregenerate } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "text is required and must be non-empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // v3 has a 5000 char limit
    if (text.trim().length > 5000) {
      return new Response(
        JSON.stringify({ error: "text exceeds v3 limit of 5000 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Text processing pipeline ---
    const detectedBangla = isBangla(text);
    let cleanText = detectedBangla ? normaliseBangla(text) : text.trim();
    const lang = language || (detectedBangla ? "bn-BD" : "en-US");

    // Apply v3 audio tag enhancement for Bangla text
    const enhancedText = detectedBangla ? enhanceBanglaForV3(cleanText) : cleanText;

    // --- Resolve generation parameters ---
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    const ttsApiUrl = Deno.env.get("CUSTOM_TTS_API_URL");
    const ttsApiKey = Deno.env.get("CUSTOM_TTS_API_KEY");
    const useElevenLabs = !!elevenLabsKey;

    const voiceId = body.voice_id || DEFAULT_VOICE_ID;
    const model = DEFAULT_MODEL;
    const outputFormat = DEFAULT_OUTPUT_FORMAT;
    const voiceSettings = DEFAULT_VOICE_SETTINGS;

    // --- Build composite cache key (includes pipeline version to invalidate old entries) ---
    const textHash = await sha256(enhancedText.trim().toLowerCase());
    const cacheKey = useElevenLabs
      ? await buildCacheKey({
          text: enhancedText,
          voiceId, model, outputFormat,
          language: lang,
          settings: voiceSettings,
          pipelineVersion: PIPELINE_VERSION,
        })
      : textHash;

    console.log(`[tts-paragraph] v3 pipeline | key=${cacheKey.slice(0, 12)}… voice=${voiceId} model=${model} lang=${lang} enhanced=${detectedBangla} pregenerate=${!!pregenerate}`);

    // --- 1. Cache-first delivery ---
    const { data: cached } = await supabaseAdmin
      .from("tts_paragraph_cache")
      .select("id, audio_url, status")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.status === "generated" && cached.audio_url) {
      const filePath = extractStoragePath(cached.audio_url);
      if (filePath) {
        const { data: signedData } = await supabaseAdmin.storage
          .from("tts-audio")
          .createSignedUrl(filePath, 300);
        if (signedData?.signedUrl) {
          console.log(`[tts-paragraph] Cache HIT key=${cacheKey.slice(0, 12)}`);
          return new Response(
            JSON.stringify({
              audio_url: signedData.signedUrl,
              cached: true,
              pipeline: { model, voice: voiceId, version: PIPELINE_VERSION, enhanced: detectedBangla },
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      // Fallback to stored URL
      return new Response(
        JSON.stringify({
          audio_url: cached.audio_url,
          cached: true,
          pipeline: { model, voice: voiceId, version: PIPELINE_VERSION, enhanced: detectedBangla },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (cached?.status === "pending") {
      return new Response(
        JSON.stringify({ status: "pending", message: "Audio is being generated, please retry shortly" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- No provider configured → mock ---
    if (!elevenLabsKey && !ttsApiUrl) {
      console.warn("[tts-paragraph] No TTS provider configured — mock mode");
      return new Response(
        JSON.stringify({
          audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          cached: false,
          mock_mode: true,
          pipeline: { model: "mock", voice: "none", version: PIPELINE_VERSION },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- 2. Upsert pending record ---
    const { data: record, error: upsertErr } = await supabaseAdmin
      .from("tts_paragraph_cache")
      .upsert(
        {
          cache_key: cacheKey,
          text_hash: textHash,
          voice_id: useElevenLabs ? voiceId : null,
          model_id: useElevenLabs ? model : null,
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
      console.error("[tts-paragraph] Upsert error:", upsertErr);
      return new Response(
        JSON.stringify({ error: "Failed to create TTS record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recordId = record.id;

    // --- 3. Generate audio ---
    let audioBuffer: ArrayBuffer;
    let usedModel = model;
    let usedVoice = voiceId;

    try {
      if (useElevenLabs) {
        console.log(`[tts-paragraph] ElevenLabs v3: text_len=${enhancedText.length} stability=${voiceSettings.stability} style=${voiceSettings.style}`);
        const result = await callElevenLabs(
          elevenLabsKey!, voiceId, model, enhancedText, outputFormat, voiceSettings,
        );
        audioBuffer = result.buffer;
        usedModel = result.usedModel;
        usedVoice = result.usedVoice;
        console.log(`[tts-paragraph] Generated ${audioBuffer.byteLength} bytes via ${usedModel}/${usedVoice}`);
      } else if (ttsApiUrl && ttsApiKey) {
        const ttsResponse = await fetch(ttsApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ttsApiKey },
          body: JSON.stringify({ text: cleanText, language: lang }),
        });

        if (!ttsResponse.ok) {
          throw new Error(`TTS API ${ttsResponse.status}: ${(await ttsResponse.text().catch(() => "")).slice(0, 300)}`);
        }

        const contentType = ttsResponse.headers.get("content-type") || "";
        if (contentType.includes("audio") || contentType.includes("octet-stream")) {
          audioBuffer = await ttsResponse.arrayBuffer();
        } else {
          const json = await ttsResponse.json();
          if (json.error) throw new Error(json.error);
          if (json.mock === true) {
            await supabaseAdmin.from("tts_paragraph_cache")
              .update({ status: "generated", audio_url: json.audio_url })
              .eq("id", recordId);
            return new Response(
              JSON.stringify({ audio_url: json.audio_url, cached: false, mock_mode: true }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (json.audio_url) {
            const dl = await fetch(json.audio_url);
            if (!dl.ok) throw new Error("Failed to download audio");
            audioBuffer = await dl.arrayBuffer();
          } else {
            throw new Error("No audio data returned");
          }
        }
      } else {
        throw new Error("No TTS provider available");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[tts-paragraph] TTS error:", msg);
      await supabaseAdmin.from("tts_paragraph_cache")
        .update({ status: "failed", error_message: msg.slice(0, 500) })
        .eq("id", recordId);
      return new Response(
        JSON.stringify({ error: "TTS generation failed", details: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- 4. Upload to storage ---
    const fileName = `paragraphs/${cacheKey.slice(0, 8)}/${Date.now()}.mp3`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("tts-audio")
      .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });

    if (uploadErr) {
      console.error("[tts-paragraph] Upload error:", uploadErr);
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

    console.log(`[tts-paragraph] Done: ${audioBuffer.byteLength}B key=${cacheKey.slice(0, 12)} model=${usedModel} voice=${usedVoice}`);

    return new Response(
      JSON.stringify({
        audio_url: finalUrl,
        cached: false,
        mock_mode: false,
        pipeline: {
          model: usedModel,
          voice: usedVoice,
          version: PIPELINE_VERSION,
          enhanced: detectedBangla,
          settings: voiceSettings,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[tts-paragraph] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
