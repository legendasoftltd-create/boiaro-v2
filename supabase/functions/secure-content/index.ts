import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── R2 config (lazy-read from env, with DB override for rollout %) ──
function getR2Config() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKey = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET_NAME");
  const configured = !!(accountId && accessKey && secretKey && bucket);
  return { accountId, accessKey, secretKey, bucket, configured };
}

// In-memory request-level metrics (accumulated per invocation, flushed at end)
const reqMetrics = {
  r2_requests: 0,
  supabase_requests: 0,
  r2_errors: 0,
  supabase_errors: 0,
  fallback_count: 0,
};

function shouldUseR2(rolloutPercent: number): boolean {
  return rolloutPercent >= 100 || Math.random() * 100 < rolloutPercent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  let user: { id: string } | null = null;
  let body: any = {};

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate user JWT
    const authHeader = req.headers.get("authorization");

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data, error: claimsError } = await anonClient.auth.getClaims(token);

      if (!claimsError && data?.claims?.sub) {
        user = { id: data.claims.sub as string };
      } else {
        console.warn("[secure-content] getClaims failed:", claimsError?.message);
      }
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);
    body = await req.json();
    const { action } = body;

    // --- Generate access token ---
    if (action === "generate_token") {
      if (!user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { book_id, content_type } = body;
      if (!book_id || !content_type) {
        return jsonResponse({ error: "book_id and content_type required" }, 400);
      }

      const formatType = content_type === "audiobook" ? "audiobook" : "ebook";
      const { data: accessResult, error: rpcError } = await serviceClient.rpc(
        "check_content_access",
        { p_user_id: user.id, p_book_id: book_id, p_format: formatType }
      );

      const hasAccess = rpcError
        ? { granted: false, reason: rpcError.message }
        : accessResult;

      await serviceClient.from("content_access_logs").insert({
        user_id: user.id,
        book_id,
        content_type,
        access_granted: hasAccess.granted,
        denial_reason: hasAccess.reason || null,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: req.headers.get("user-agent") || null,
      });

      if (!hasAccess.granted) {
        return jsonResponse({ error: "Access denied", reason: hasAccess.reason }, 403);
      }

      const tokenExpiryMinutes = await getSetting(serviceClient, "drm_token_expiry_minutes", 10);
      const token = crypto.randomUUID() + "-" + crypto.randomUUID();
      const expiresAt = new Date(Date.now() + tokenExpiryMinutes * 60 * 1000).toISOString();

      await serviceClient.from("content_access_tokens").insert({
        user_id: user.id,
        book_id,
        content_type,
        token,
        expires_at: expiresAt,
      });

      return jsonResponse({ token, expires_at: expiresAt });
    }

    // --- Validate token and get signed URL ---
    if (action === "get_content") {
      const { token, book_id, content_type, track_number } = body;
      if (!book_id || !content_type) {
        return jsonResponse({ error: "book_id and content_type required" }, 400);
      }

      let filePath: string | null = null;

      if (token) {
        if (!user) {
          return jsonResponse({ error: "Invalid session" }, 401);
        }

        const { data: tokenRow } = await serviceClient
          .from("content_access_tokens")
          .select("*")
          .eq("token", token)
          .eq("user_id", user.id)
          .eq("book_id", book_id)
          .single();

        if (!tokenRow) {
          return jsonResponse({ error: "Invalid token" }, 403);
        }

        if (new Date(tokenRow.expires_at) < new Date()) {
          return jsonResponse({ error: "Token expired" }, 403);
        }

        filePath = await getContentFilePath(serviceClient, book_id, content_type, track_number);
      } else {
        const publicAccess = await checkPublicAccess(
          serviceClient,
          book_id,
          content_type,
          track_number
        );

        if (!publicAccess.granted) {
          return jsonResponse({ error: "Access denied", reason: publicAccess.reason }, 403);
        }

        filePath = publicAccess.filePath || null;
      }

      if (!filePath) {
        return jsonResponse({ error: "Content not found" }, 404);
      }

      const bucket = content_type === "audiobook" ? "audiobooks" : "ebooks";
      const path = extractStoragePath(filePath, bucket);

      if (!path) {
        return jsonResponse({ error: "Invalid file path" }, 400);
      }

      const mimeType = await getObjectMimeType(serviceClient, bucket, path);
      if (content_type === "audiobook" && !isSupportedAudioMimeType(mimeType, path)) {
        return jsonResponse(
          { error: "Audio format is not supported", mime_type: mimeType, path },
          415
        );
      }

      // Try R2 first, fall back to Supabase
      const signedResult = await generateSignedUrl(serviceClient, bucket, path);

      if (!signedResult.url) {
        return jsonResponse({ error: "Failed to generate secure URL" }, 500);
      }

      return jsonResponse({
        signed_url: signedResult.url,
        expires_in: 300,
        mime_type: mimeType,
        source: signedResult.source,
      });
    }

    // --- Batch signed URLs for all audiobook tracks ---
    if (action === "batch_signed_urls") {
      if (!user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { book_id } = body;
      if (!book_id) {
        return jsonResponse({ error: "book_id required" }, 400);
      }

      const startMs = Date.now();

      const { data: accessResult, error: rpcError } = await serviceClient.rpc(
        "check_content_access",
        { p_user_id: user.id, p_book_id: book_id, p_format: "audiobook" }
      );

      const hasAccess = rpcError
        ? { granted: false, reason: rpcError.message }
        : accessResult;

      if (!hasAccess.granted) {
        // Preview-only tracks
        const { data: format } = await serviceClient
          .from("book_formats")
          .select("id")
          .eq("book_id", book_id)
          .eq("format", "audiobook")
          .single();

        if (!format) {
          return jsonResponse({ error: "Audiobook not found" }, 404);
        }

        const { data: previewTracks } = await serviceClient
          .from("audiobook_tracks")
          .select("track_number, audio_url")
          .eq("book_format_id", format.id)
          .eq("is_preview", true)
          .order("track_number", { ascending: true });

        const previewUrls: Record<number, { signed_url: string; expires_in: number; source: string }> = {};
        const signPromises = (previewTracks || [])
          .filter((t: any) => t.audio_url)
          .map(async (track: any) => {
            const path = extractStoragePath(track.audio_url, "audiobooks");
            if (!path) return;
            const result = await generateSignedUrl(serviceClient, "audiobooks", path);
            if (result.url) {
              previewUrls[track.track_number] = { signed_url: result.url, expires_in: 300, source: result.source };
            }
          });

        await Promise.all(signPromises);

        return jsonResponse({
          urls: previewUrls,
          full_access: false,
          tracks_count: Object.keys(previewUrls).length,
          duration_ms: Date.now() - startMs,
        });
      }

      // Full access: all tracks
      const { data: format } = await serviceClient
        .from("book_formats")
        .select("id")
        .eq("book_id", book_id)
        .eq("format", "audiobook")
        .single();

      if (!format) {
        return jsonResponse({ error: "Audiobook not found" }, 404);
      }

      const { data: allTracks } = await serviceClient
        .from("audiobook_tracks")
        .select("track_number, audio_url")
        .eq("book_format_id", format.id)
        .order("track_number", { ascending: true });

      const urls: Record<number, { signed_url: string; expires_in: number; source: string }> = {};
      const signPromises = (allTracks || [])
        .filter((t: any) => t.audio_url)
        .map(async (track: any) => {
          const path = extractStoragePath(track.audio_url, "audiobooks");
          if (!path) return;
          const result = await generateSignedUrl(serviceClient, "audiobooks", path);
          if (result.url) {
            urls[track.track_number] = { signed_url: result.url, expires_in: 300, source: result.source };
          }
        });

      await Promise.all(signPromises);

      await serviceClient.from("content_access_logs").insert({
        user_id: user.id,
        book_id,
        content_type: "audiobook",
        access_granted: true,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: req.headers.get("user-agent") || null,
      });

      console.log("[secure-content] batch_signed_urls", {
        book_id,
        tracks: Object.keys(urls).length,
        durationMs: Date.now() - startMs,
      });

      // Fire-and-forget metrics flush
      flushReqMetrics(serviceClient);

      return jsonResponse({
        urls,
        full_access: true,
        tracks_count: Object.keys(urls).length,
        duration_ms: Date.now() - startMs,
      });
    }

    // Also flush metrics for single get_content calls
    flushReqMetrics(serviceClient);

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("secure-content error:", err);
    await captureException(err, {
      functionName: "secure-content",
      userId: user?.id,
      action: body?.action,
    });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Unified signed URL generator (R2 → Supabase fallback) ──

async function generateSignedUrl(
  serviceClient: any,
  bucket: string,
  path: string,
): Promise<{ url: string | null; source: "r2" | "supabase" }> {
  const r2 = getR2Config();

  // Read rollout percent from DB config (cached per-request via service client)
  let rolloutPercent = 0;
  if (r2.configured) {
    try {
      const { data: cfg } = await serviceClient
        .from("r2_rollout_config")
        .select("current_percent")
        .eq("id", 1)
        .single();
      rolloutPercent = cfg?.current_percent ?? 0;
    } catch {
      // If DB read fails, fall back to 0% (Supabase only)
    }
  }

  if (r2.configured && rolloutPercent > 0 && shouldUseR2(rolloutPercent)) {
    reqMetrics.r2_requests++;
    try {
      const url = await generateR2PresignedUrl(
        r2.accountId!, r2.accessKey!, r2.secretKey!, r2.bucket!,
        `${bucket}/${path}`, 300
      );
      return { url, source: "r2" };
    } catch (err) {
      reqMetrics.r2_errors++;
      reqMetrics.fallback_count++;
      console.warn("[secure-content] R2 presign failed, falling back to Supabase:", err);
    }
  }

  // Supabase Storage fallback
  reqMetrics.supabase_requests++;
  const { data, error } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(path, 300);

  if (error || !data) {
    reqMetrics.supabase_errors++;
    return { url: null, source: "supabase" };
  }

  return { url: data.signedUrl, source: "supabase" };
}

/** Fire-and-forget: report accumulated metrics to rollout controller */
async function flushReqMetrics(serviceClient: any) {
  const hasActivity = reqMetrics.r2_requests > 0 || reqMetrics.supabase_requests > 0;
  if (!hasActivity) return;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    await fetch(`${supabaseUrl}/functions/v1/r2-rollout-controller`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "report_metrics",
        ...reqMetrics,
      }),
    });
  } catch {
    // Non-critical, don't block response
  }
}

// ── Helpers ──

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getContentFilePath(
  client: any, bookId: string, contentType: string, trackNumber?: number
): Promise<string | null> {
  if (contentType === "audiobook") {
    const { data: format } = await client
      .from("book_formats").select("id")
      .eq("book_id", bookId).eq("format", "audiobook").single();
    if (!format) return null;

    let query = client
      .from("audiobook_tracks").select("audio_url")
      .eq("book_format_id", format.id)
      .order("track_number", { ascending: true }).limit(1);

    if (trackNumber) {
      query = client
        .from("audiobook_tracks").select("audio_url")
        .eq("book_format_id", format.id)
        .eq("track_number", trackNumber).limit(1);
    }

    const { data: tracks } = await query;
    return tracks?.[0]?.audio_url || null;
  }

  const { data: format } = await client
    .from("book_formats").select("file_url")
    .eq("book_id", bookId).eq("format", "ebook").single();
  return format?.file_url || null;
}

async function checkPublicAccess(
  client: any, bookId: string, contentType: string, trackNumber?: number
): Promise<{ granted: boolean; reason?: string; filePath?: string | null }> {
  if (contentType === "audiobook") {
    const { data: format } = await client
      .from("book_formats").select("id, price")
      .eq("book_id", bookId).eq("format", "audiobook").single();
    if (!format) return { granted: false, reason: "Audiobook format not found" };

    const { data: book } = await client
      .from("books").select("is_free").eq("id", bookId).single();
    const isFreeBook = Boolean(book?.is_free) || Number(format.price || 0) === 0;
    if (isFreeBook) {
      const filePath = await getContentFilePath(client, bookId, contentType, trackNumber);
      return { granted: Boolean(filePath), filePath };
    }

    if (!trackNumber) return { granted: false, reason: "Authentication required for premium content" };

    const { data: track } = await client
      .from("audiobook_tracks").select("audio_url, is_preview")
      .eq("book_format_id", format.id).eq("track_number", trackNumber).maybeSingle();
    if (track?.is_preview) return { granted: true, filePath: track.audio_url };

    return { granted: false, reason: "Authentication required for premium content" };
  }

  const { data: format } = await client
    .from("book_formats").select("file_url, price")
    .eq("book_id", bookId).eq("format", "ebook").single();
  return { granted: Boolean(format?.file_url), filePath: format?.file_url || null };
}

function extractStoragePath(filePath: string, bucket: string): string | null {
  const trimmed = String(filePath || "").trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];
    for (const marker of markers) {
      if (trimmed.includes(marker)) {
        const value = trimmed.split(marker)[1];
        if (!value) return null;
        return decodeURIComponent(value.split("?")[0] || "").replace(/^\/+/, "");
      }
    }
    return null;
  }

  return trimmed.replace(/^\/+/, "");
}

async function getObjectMimeType(client: any, bucket: string, path: string): Promise<string | null> {
  const { data } = await client
    .schema("storage").from("objects").select("metadata")
    .eq("bucket_id", bucket).eq("name", path).maybeSingle();
  const mime = data?.metadata?.mimetype;
  return typeof mime === "string" ? mime.toLowerCase() : null;
}

function isSupportedAudioMimeType(mimeType: string | null, path: string): boolean {
  const supportedMimes = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "video/mp4"];
  if (mimeType) return supportedMimes.includes(mimeType);
  const lowerPath = path.toLowerCase();
  return lowerPath.endsWith(".mp3") || lowerPath.endsWith(".m4a") || lowerPath.endsWith(".mp4");
}

async function getSetting(client: any, key: string, fallback: number): Promise<number> {
  const { data } = await client
    .from("platform_settings").select("value").eq("key", key).single();
  return data ? parseInt(data.value) || fallback : fallback;
}

// ── R2 Presigned URL (AWS Sig V4) ──

async function generateR2PresignedUrl(
  accountId: string, accessKeyId: string, secretAccessKey: string,
  bucket: string, key: string, expiresInSec: number,
): Promise<string> {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const datestamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateOnly = datestamp.substring(0, 8);
  const credentialScope = `${dateOnly}/auto/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": datestamp,
    "X-Amz-Expires": String(expiresInSec),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalUri = `/${bucket}/${key}`;
  const canonicalQuerystring = queryParams.toString().replace(/\+/g, "%20");
  const canonicalHeaders = `host:${host}\n`;

  const canonicalRequest = [
    "GET", canonicalUri, canonicalQuerystring, canonicalHeaders, "host", "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256", datestamp, credentialScope, await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(secretAccessKey, dateOnly, "auto", "s3");
  const signature = await hmacHex(signingKey, stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(
  key: string, dateStamp: string, region: string, service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key).buffer as ArrayBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}
