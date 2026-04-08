import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * R2 Media Proxy — generates presigned URLs from Cloudflare R2.
 * Falls back to Supabase Storage if R2 is not configured or fails.
 * 
 * Required secrets:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 * 
 * Optional:
 *   R2_ROLLOUT_PERCENT (0-100) — percentage of traffic routed to R2 (default: 0)
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { bucket, path, fallback_supabase = true } = body;

    if (!bucket || !path) {
      return jsonResponse({ error: "bucket and path required" }, 400);
    }

    const r2AccountId = Deno.env.get("R2_ACCOUNT_ID");
    const r2AccessKey = Deno.env.get("R2_ACCESS_KEY_ID");
    const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const r2Bucket = Deno.env.get("R2_BUCKET_NAME");
    const r2PublicUrl = Deno.env.get("R2_PUBLIC_URL");
    const rolloutPercent = parseInt(Deno.env.get("R2_ROLLOUT_PERCENT") || "0");

    const r2Configured = !!(r2AccountId && r2AccessKey && r2SecretKey && r2Bucket);

    // Determine if this request should use R2
    const useR2 = r2Configured && (rolloutPercent >= 100 || Math.random() * 100 < rolloutPercent);

    if (useR2) {
      try {
        const signedUrl = await generateR2PresignedUrl(
          r2AccountId!,
          r2AccessKey!,
          r2SecretKey!,
          r2Bucket!,
          `${bucket}/${path}`,
          300
        );

        return jsonResponse({
          signed_url: signedUrl,
          expires_in: 300,
          source: "r2",
        });
      } catch (r2Err) {
        console.error("[r2-media-proxy] R2 presign failed, falling back:", r2Err);
        if (!fallback_supabase) {
          return jsonResponse({ error: "R2 presign failed" }, 502);
        }
        // Fall through to Supabase
      }
    }

    // Fallback: Supabase Storage signed URL
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const { data: signedData, error: signError } = await client.storage
      .from(bucket)
      .createSignedUrl(path, 300);

    if (signError || !signedData) {
      return jsonResponse({ error: "Failed to generate signed URL" }, 500);
    }

    return jsonResponse({
      signed_url: signedData.signedUrl,
      expires_in: 300,
      source: "supabase",
    });
  } catch (err) {
    console.error("[r2-media-proxy] Error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Generate an S3-compatible presigned URL for Cloudflare R2.
 * Uses AWS Signature Version 4 (R2 is S3-compatible).
 */
async function generateR2PresignedUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucket: string,
  key: string,
  expiresInSec: number,
): Promise<string> {
  const region = "auto";
  const service = "s3";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}`;

  const now = new Date();
  const datestamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateOnly = datestamp.substring(0, 8);
  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
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
  const signedHeaders = "host";

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datestamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(secretAccessKey, dateOnly, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  return `${endpoint}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
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
