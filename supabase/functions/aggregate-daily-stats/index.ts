import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    // Admin authorization check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await client.auth.getUser(token);
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: isAdmin } = await client.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Determine target date: yesterday by default, or from request body
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body?.date || getYesterday();
    } catch {
      targetDate = getYesterday();
    }

    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    console.log(`[aggregate-daily-stats] Processing date: ${targetDate}`);

    // 1. Get views from user_activity_logs (event_type = 'book_view')
    const { data: viewRows, error: viewErr } = await client
      .from("user_activity_logs")
      .select("book_id, user_id")
      .eq("event_type", "book_view")
      .not("book_id", "is", null)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    if (viewErr) throw viewErr;

    // 2. Get reads from book_reads
    const { data: readRows, error: readErr } = await client
      .from("book_reads")
      .select("book_id, user_id")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    if (readErr) throw readErr;

    // 3. Get purchases from user_activity_logs
    const { data: purchaseRows, error: purchaseErr } = await client
      .from("user_activity_logs")
      .select("book_id, user_id")
      .eq("event_type", "purchase")
      .not("book_id", "is", null)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    if (purchaseErr) throw purchaseErr;

    // Aggregate per book_id
    const statsMap = new Map<string, {
      views: number;
      reads: number;
      purchases: number;
      uniqueUsers: Set<string>;
    }>();

    const ensure = (bookId: string) => {
      if (!statsMap.has(bookId)) {
        statsMap.set(bookId, { views: 0, reads: 0, purchases: 0, uniqueUsers: new Set() });
      }
      return statsMap.get(bookId)!;
    };

    for (const r of viewRows || []) {
      if (!r.book_id) continue;
      const s = ensure(r.book_id);
      s.views++;
      if (r.user_id) s.uniqueUsers.add(r.user_id);
    }

    for (const r of readRows || []) {
      if (!r.book_id) continue;
      const s = ensure(r.book_id);
      s.reads++;
      if (r.user_id) s.uniqueUsers.add(r.user_id);
    }

    for (const r of purchaseRows || []) {
      if (!r.book_id) continue;
      const s = ensure(r.book_id);
      s.purchases++;
      if (r.user_id) s.uniqueUsers.add(r.user_id);
    }

    // Upsert into daily_book_stats
    const rows = Array.from(statsMap.entries()).map(([bookId, s]) => ({
      book_id: bookId,
      stat_date: targetDate,
      views: s.views,
      reads: s.reads,
      purchases: s.purchases,
      unique_readers: s.uniqueUsers.size,
    }));

    if (rows.length === 0) {
      console.log("[aggregate-daily-stats] No activity found for", targetDate);
      return new Response(
        JSON.stringify({ success: true, date: targetDate, books_processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert in batches of 100
    let totalUpserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: upsertErr } = await client
        .from("daily_book_stats")
        .upsert(batch, { onConflict: "book_id,stat_date" });

      if (upsertErr) throw upsertErr;
      totalUpserted += batch.length;
    }

    console.log(`[aggregate-daily-stats] Upserted ${totalUpserted} book stats for ${targetDate}`);

    return new Response(
      JSON.stringify({ success: true, date: targetDate, books_processed: totalUpserted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[aggregate-daily-stats] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getYesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}
