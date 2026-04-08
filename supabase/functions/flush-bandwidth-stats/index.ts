import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Receives client-side bandwidth metrics and upserts into daily_bandwidth_stats.
 * Called periodically from the client or on session end.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      bytes_served = 0,
      requests = 0,
      cache_hits = 0,
      cache_misses = 0,
      signed_urls = 0,
      top_books = [],
    } = body;

    if (bytes_served === 0 && requests === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    // Fetch existing row for today
    const { data: existing } = await client
      .from("daily_bandwidth_stats")
      .select("*")
      .eq("stat_date", today)
      .maybeSingle();

    const newTotalBytes = (existing?.total_bytes_served || 0) + bytes_served;
    const newTotalRequests = (existing?.total_requests || 0) + requests;
    const newCacheHits = (existing?.cache_hits || 0) + cache_hits;
    const newCacheMisses = (existing?.cache_misses || 0) + cache_misses;
    const newSignedUrls = (existing?.signed_urls_generated || 0) + signed_urls;
    const newAvgSession = newTotalRequests > 0 ? Math.round(newTotalBytes / newTotalRequests) : 0;

    // Merge top books
    const existingTopBooks: Array<{ bookId: string; bytes: number }> = existing?.top_books_by_bandwidth || [];
    const bookMap = new Map<string, number>();
    for (const b of existingTopBooks) bookMap.set(b.bookId, b.bytes);
    for (const b of top_books) bookMap.set(b.bookId, (bookMap.get(b.bookId) || 0) + b.bytes);
    const mergedTopBooks = Array.from(bookMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([bookId, bytes]) => ({ bookId, bytes }));

    // Determine alert level (configurable thresholds)
    // Default: 50GB/day warn, 90GB/day critical
    const WARN_THRESHOLD = 50_000_000_000;
    const CRITICAL_THRESHOLD = 90_000_000_000;
    const alertLevel = newTotalBytes > CRITICAL_THRESHOLD ? "critical"
      : newTotalBytes > WARN_THRESHOLD ? "warn"
      : "none";

    const { error: upsertErr } = await client
      .from("daily_bandwidth_stats")
      .upsert({
        stat_date: today,
        total_bytes_served: newTotalBytes,
        total_requests: newTotalRequests,
        avg_session_bytes: newAvgSession,
        cache_hits: newCacheHits,
        cache_misses: newCacheMisses,
        signed_urls_generated: newSignedUrls,
        top_books_by_bandwidth: mergedTopBooks,
        alert_level: alertLevel,
      }, { onConflict: "stat_date" });

    if (upsertErr) {
      console.error("[flush-bandwidth-stats] upsert error:", upsertErr);
      return new Response(
        JSON.stringify({ error: upsertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log alert if threshold crossed
    if (alertLevel !== "none") {
      console.warn(`[flush-bandwidth-stats] ALERT: ${alertLevel} — ${newTotalBytes} bytes served today`);
    }

    return new Response(
      JSON.stringify({ success: true, alert_level: alertLevel, total_bytes: newTotalBytes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[flush-bandwidth-stats] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
