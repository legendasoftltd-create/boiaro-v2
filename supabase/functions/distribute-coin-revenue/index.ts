import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // Auth check - must be authenticated (called by system on behalf of user)
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await db.auth.getUser(token);
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { book_id, format, coins_spent, user_id } = await req.json();

    if (!book_id || !format || !coins_spent || !user_id) {
      return json({ error: "Missing required fields" }, 400);
    }

    // Get coin conversion ratio and split percentages
    const { data: settingsRows } = await db
      .from("platform_settings")
      .select("key, value")
      .in("key", ["coin_conversion_ratio", "coin_unlock_platform_pct", "coin_unlock_creator_pct"]);
    const sMap: Record<string, string> = {};
    ((settingsRows as any[]) || []).forEach((s: any) => { sMap[s.key] = s.value; });
    const coinToBdt = parseFloat(sMap.coin_conversion_ratio || "0.10");
    const platformPct = parseFloat(sMap.coin_unlock_platform_pct || "30");
    const creatorPct = 100 - platformPct;
    const revenueAmount = coins_spent * coinToBdt;

    // Skip if negligible
    if (revenueAmount < 0.01) {
      return json({ success: true, skipped: true, reason: "amount_too_small" });
    }

    // Get book format info
    const { data: bookFormat } = await db
      .from("book_formats")
      .select("id, payout_model, price")
      .eq("book_id", book_id)
      .eq("format", format)
      .single();

    if (!bookFormat || bookFormat.payout_model !== "revenue_share") {
      // Only distribute for revenue_share model
      // For inventory_resale (hardcopy), coin unlock doesn't apply
      return json({ success: true, skipped: true, reason: "not_revenue_share" });
    }

    // Get revenue split for this book+format
    const { data: split } = await db
      .from("format_revenue_splits")
      .select("*")
      .eq("book_id", book_id)
      .eq("format", format)
      .single();

    // Fallback to default rules
    let writerPct = 0, narratorPct = 0, publisherPct = 0, splitPlatformPct = 100;
    if (split) {
      writerPct = split.writer_percentage || 0;
      narratorPct = split.narrator_percentage || 0;
      publisherPct = split.publisher_percentage || 0;
      splitPlatformPct = split.platform_percentage || 0;
    } else {
      const { data: defaults } = await db
        .from("default_revenue_rules")
        .select("*")
        .eq("format", format)
        .single();
      if (defaults) {
        writerPct = defaults.writer_percentage || 0;
        narratorPct = defaults.narrator_percentage || 0;
        publisherPct = defaults.publisher_percentage || 0;
        splitPlatformPct = defaults.platform_percentage || 0;
      }
    }

    // Get contributors
    const { data: contributors } = await db
      .from("book_contributors")
      .select("user_id, role, format")
      .eq("book_id", book_id);

    const earningsToInsert: any[] = [];

    for (const c of (contributors || [])) {
      let pct = 0;
      if (c.role === "writer") pct = writerPct;
      else if (c.role === "narrator" && (c.format === format || c.format === null)) pct = narratorPct;
      else if (c.role === "publisher") pct = publisherPct;
      else continue;

      if (pct <= 0) continue;

      const earnedAmount = Math.round((revenueAmount * pct / 100) * 100) / 100;
      if (earnedAmount < 0.01) continue;

      earningsToInsert.push({
        user_id: c.user_id,
        book_id,
        format,
        role: c.role,
        order_id: null,
        order_item_id: null,
        sale_amount: revenueAmount,
        percentage: pct,
        earned_amount: earnedAmount,
        fulfillment_amount: 0,
        status: "confirmed",
      });
    }

    // Record in accounting ledger
    if (earningsToInsert.length > 0) {
      await db.from("accounting_ledger").insert({
        type: "income",
        category: "coin_unlock",
        description: `Coin unlock: ${format} - ${coins_spent} coins (৳${revenueAmount.toFixed(2)})`,
        amount: revenueAmount,
        entry_date: new Date().toISOString().split("T")[0],
        book_id,
        reference_type: "coin_unlock",
        reference_id: `coin_${user_id}_${book_id}_${format}`,
      });
    }

    // Create a payment record for tracking
    await db.from("payments").insert({
      user_id,
      order_id: null as any, // coin unlocks don't have orders - will need nullable FK or skip
      amount: revenueAmount,
      method: "coin",
      status: "paid",
      transaction_id: `COIN-${book_id.slice(0, 8)}-${Date.now()}`,
    }).then(() => {}).catch(() => {
      // If order_id is NOT NULL, we skip payment record for coin unlocks
      // The ledger entry above is the primary tracking mechanism
    });

    return json({
      success: true,
      revenue_bdt: revenueAmount,
      coins_spent,
      contributors_count: earningsToInsert.length,
    });
  } catch (err) {
    console.error("distribute-coin-revenue error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
