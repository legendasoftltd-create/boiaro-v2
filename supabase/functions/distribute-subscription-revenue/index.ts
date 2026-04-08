import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Pool-based subscription revenue distribution.
 * 
 * Logic:
 * 1. Collect total subscription revenue for the period
 * 2. Deduct platform share (default 40%)
 * 3. Distribute remaining 60% to creators proportional to consumption time
 * 
 * Called on a schedule (e.g., monthly) or manually by admin.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // Admin authorization check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await db.auth.getUser(token);
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: isAdmin } = await db.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { period_start, period_end } = body;

    if (!period_start || !period_end) {
      return json({ error: "period_start and period_end required (YYYY-MM-DD)" }, 400);
    }

    // 1. Get total subscription revenue for the period
    const { data: subs } = await db
      .from("user_subscriptions")
      .select("amount_paid")
      .gte("start_date", period_start)
      .lte("start_date", period_end)
      .eq("status", "active");

    const totalRevenue = (subs || []).reduce(
      (sum: number, s: any) => sum + (Number(s.amount_paid) || 0),
      0
    );

    if (totalRevenue <= 0) {
      return json({ success: true, skipped: true, reason: "no_revenue", total: 0 });
    }

    // 2. Get platform/creator split percentages
    const { data: settings } = await db
      .from("platform_settings")
      .select("key, value")
      .in("key", ["subscription_pool_platform_pct", "subscription_pool_creator_pct"]);

    const settingsMap: Record<string, string> = {};
    (settings || []).forEach((s: any) => { settingsMap[s.key] = s.value; });

    const platformPct = parseFloat(settingsMap.subscription_pool_platform_pct || "40");
    const creatorPool = totalRevenue * ((100 - platformPct) / 100);

    // 3. Get total consumption time per book in the period
    const { data: consumption } = await db
      .from("content_consumption_time")
      .select("book_id, duration_seconds")
      .gte("session_date", period_start)
      .lte("session_date", period_end);

    if (!consumption || consumption.length === 0) {
      // Log platform income only
      await db.from("accounting_ledger").insert({
        type: "income",
        category: "subscription",
        description: `Subscription revenue ${period_start} to ${period_end}`,
        amount: totalRevenue,
        entry_date: period_end,
        reference_type: "subscription_pool",
        reference_id: `sub_pool_${period_start}_${period_end}`,
      });

      return json({
        success: true,
        total_revenue: totalRevenue,
        platform_share: totalRevenue,
        creator_pool: 0,
        reason: "no_consumption_data",
      });
    }

    // Aggregate by book
    const bookTime: Record<string, number> = {};
    let totalSeconds = 0;
    for (const c of consumption) {
      bookTime[c.book_id] = (bookTime[c.book_id] || 0) + c.duration_seconds;
      totalSeconds += c.duration_seconds;
    }

    if (totalSeconds === 0) {
      return json({ success: true, skipped: true, reason: "zero_consumption" });
    }

    // 4. For each book, distribute proportional share to contributors
    const bookIds = Object.keys(bookTime);
    const { data: contributors } = await db
      .from("book_contributors")
      .select("book_id, user_id, role")
      .in("book_id", bookIds);

    const earningsMap: Record<string, number> = {};

    for (const [bookId, seconds] of Object.entries(bookTime)) {
      const bookShare = creatorPool * (seconds / totalSeconds);
      const bookContribs = (contributors || []).filter((c: any) => c.book_id === bookId);

      if (bookContribs.length === 0) continue;

      // Equal split among contributors for simplicity
      const perContrib = bookShare / bookContribs.length;
      for (const c of bookContribs) {
        earningsMap[c.user_id] = (earningsMap[c.user_id] || 0) + perContrib;
      }
    }

    // 5. Record in accounting ledger
    await db.from("accounting_ledger").insert({
      type: "income",
      category: "subscription",
      description: `Subscription pool: ${period_start} to ${period_end} (৳${totalRevenue.toFixed(2)})`,
      amount: totalRevenue,
      entry_date: period_end,
      reference_type: "subscription_pool",
      reference_id: `sub_pool_${period_start}_${period_end}`,
    });

    return json({
      success: true,
      total_revenue: totalRevenue,
      platform_share: totalRevenue - creatorPool,
      creator_pool: creatorPool,
      creators_paid: Object.keys(earningsMap).length,
      books_consumed: bookIds.length,
      total_consumption_hours: Math.round(totalSeconds / 3600),
    });
  } catch (err) {
    console.error("distribute-subscription-revenue error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
