import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { chapter_id, voice_id, text, language } = body;

    // --- Mock fallback when TTS API is not configured ---
    const ttsApiUrl = Deno.env.get("CUSTOM_TTS_API_URL");
    const ttsApiKey = Deno.env.get("CUSTOM_TTS_API_KEY");

    if (!ttsApiUrl || !ttsApiKey) {
      console.warn("[generate-tts] CUSTOM_TTS_API_URL or CUSTOM_TTS_API_KEY missing — returning mock response.");
      return new Response(
        JSON.stringify({
          audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          cached: false,
          mock_mode: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Input validation ---

    if (!chapter_id || !voice_id || !text) {
      return new Response(
        JSON.stringify({ error: "chapter_id, voice_id, and text are required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "text must be a non-empty string" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // --- 1. Check cache ---
    const { data: cached } = await supabaseAdmin
      .from("tts_audio")
      .select("id, audio_url, status")
      .eq("chapter_id", chapter_id)
      .eq("voice_id", voice_id)
      .maybeSingle();

    if (cached?.status === "generated" && cached.audio_url) {
      return new Response(
        JSON.stringify({ audio_url: cached.audio_url, cached: true, mock_mode: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- 2. Get voice from voices table ---
    const { data: voice, error: voiceErr } = await supabaseAdmin
      .from("voices")
      .select("id, provider_voice_id, language")
      .eq("id", voice_id)
      .eq("is_active", true)
      .maybeSingle();

    if (voiceErr || !voice) {
      return new Response(
        JSON.stringify({ error: "Voice not found or inactive" }),
        { status: 404, headers: corsHeaders },
      );
    }

    // --- 3. Upsert pending record ---
    const { data: ttsRecord, error: upsertErr } = await supabaseAdmin
      .from("tts_audio")
      .upsert(
        {
          chapter_id,
          voice_id,
          status: "pending",
          error_message: null,
          audio_url: null,
        },
        { onConflict: "chapter_id,voice_id" },
      )
      .select("id")
      .single();

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
      return new Response(
        JSON.stringify({ error: "Failed to create TTS record" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const recordId = ttsRecord.id;

    // --- 4. Call custom TTS API (secrets validated above) ---
    const lang = language || voice.language || "bn-BD";
    console.log(`[generate-tts] Calling real TTS API for chapter=${chapter_id}, voice=${voice.provider_voice_id}, lang=${lang}, text_length=${text.trim().length}`);

    let audioBuffer: ArrayBuffer | null = null;
    let externalAudioUrl: string | null = null;
    let isMockFromBackend = false;

    try {
      const ttsResponse = await fetch(ttsApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ttsApiKey,
        },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: voice.provider_voice_id,
          language: lang,
        }),
      });

      if (!ttsResponse.ok) {
        const errText = await ttsResponse.text().catch(() => "Unknown error");
        console.error(`[generate-tts] TTS API HTTP ${ttsResponse.status}:`, errText.slice(0, 300));
        throw new Error(`TTS API returned ${ttsResponse.status}: ${errText}`);
      }

      const contentType = ttsResponse.headers.get("content-type") || "";
      console.log(`[generate-tts] TTS API response content-type: ${contentType}`);

      if (contentType.includes("audio") || contentType.includes("octet-stream")) {
        // Direct audio binary response
        audioBuffer = await ttsResponse.arrayBuffer();
      } else {
        // JSON response — check for mock, error, or audio_url
        const ttsJson = await ttsResponse.json();

        if (ttsJson.error) {
          throw new Error(ttsJson.error);
        }

        if (ttsJson.mock === true) {
          isMockFromBackend = true;
          externalAudioUrl = ttsJson.audio_url || null;
        } else if (ttsJson.audio_url) {
          // Download audio from the returned URL
          const audioFetch = await fetch(ttsJson.audio_url);
          if (!audioFetch.ok) throw new Error("Failed to download audio from returned URL");
          audioBuffer = await audioFetch.arrayBuffer();
        } else {
          throw new Error("TTS API returned no audio data or audio_url");
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[generate-tts] TTS API error:", errMsg);

      await supabaseAdmin
        .from("tts_audio")
        .update({ status: "failed", error_message: errMsg.slice(0, 500) })
        .eq("id", recordId);

      return new Response(
        JSON.stringify({ error: "TTS generation failed", details: errMsg }),
        { status: 502, headers: corsHeaders },
      );
    }

    // --- 5. Handle mock response from backend ---
    if (isMockFromBackend) {
      console.log("[generate-tts] Backend returned mock response");
      await supabaseAdmin
        .from("tts_audio")
        .update({ status: "generated", audio_url: externalAudioUrl, error_message: null })
        .eq("id", recordId);

      return new Response(
        JSON.stringify({ audio_url: externalAudioUrl, cached: false, mock_mode: true, record_id: recordId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- 6. Upload real audio to storage ---
    const fileName = `chapters/${chapter_id}/${voice_id}_${Date.now()}.mp3`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("tts-audio")
      .upload(fileName, audioBuffer!, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadErr) {
      console.error("[generate-tts] Upload error:", uploadErr);
      await supabaseAdmin
        .from("tts_audio")
        .update({ status: "failed", error_message: uploadErr.message })
        .eq("id", recordId);

      return new Response(
        JSON.stringify({ error: "Failed to upload audio" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("tts-audio")
      .getPublicUrl(fileName);

    const audioUrl = publicUrlData.publicUrl;

    // --- 7. Update record as generated ---
    await supabaseAdmin
      .from("tts_audio")
      .update({
        status: "generated",
        audio_url: audioUrl,
        error_message: null,
        file_size_bytes: audioBuffer!.byteLength,
      })
      .eq("id", recordId);

    console.log(`[generate-tts] Success — stored ${audioBuffer!.byteLength} bytes at ${audioUrl}`);

    return new Response(
      JSON.stringify({ audio_url: audioUrl, cached: false, mock_mode: false, record_id: recordId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-tts] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
