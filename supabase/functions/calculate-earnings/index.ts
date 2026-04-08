import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { order_id, _internal } = body;

    // Support three auth modes: admin user, order owner, OR internal webhook call
    if (_internal !== true) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: caller } } = await supabase.auth.getUser(token);
      if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Allow admin OR the order owner to trigger earnings
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: caller.id, _role: "admin" });
      if (!isAdmin) {
        // Check if caller owns this order
        if (order_id) {
          const { data: orderOwner } = await supabase
            .from("orders")
            .select("user_id")
            .eq("id", order_id)
            .single();
          if (!orderOwner || orderOwner.user_id !== caller.id) {
            return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } else {
          return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Idempotency: check if earnings already exist for this order
    const { data: existingEarnings } = await supabase
      .from("contributor_earnings")
      .select("id")
      .eq("order_id", order_id)
      .limit(1);

    if (existingEarnings && existingEarnings.length > 0) {
      return new Response(
        JSON.stringify({ success: true, earnings_created: 0, skipped: true, reason: "earnings_already_exist" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order items
    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("id, book_id, format, unit_price, quantity")
      .eq("order_id", order_id);

    if (itemsErr || !items?.length) {
      return new Response(JSON.stringify({ error: "No order items found", details: itemsErr }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const earningsToInsert: any[] = [];

    for (const item of items) {
      if (!item.book_id) continue;
      const saleAmount = (item.unit_price || 0) * (item.quantity || 1);
      if (saleAmount <= 0) continue;

      // Check format-level payout_model
      const { data: bookFormat } = await supabase
        .from("book_formats")
        .select("payout_model, publisher_id")
        .eq("book_id", item.book_id)
        .eq("format", item.format)
        .maybeSingle();

      const payoutModel = bookFormat?.payout_model || 'revenue_share';

      // For inventory_resale (hardcopy), skip ALL earnings rows entirely
      // Platform profit is tracked via accounting_ledger, not contributor_earnings
      if (payoutModel === 'inventory_resale') {
        continue;
      }

      // Revenue share model
      let split: any = null;
      const { data: override } = await supabase
        .from("format_revenue_splits")
        .select("*")
        .eq("book_id", item.book_id)
        .eq("format", item.format)
        .maybeSingle();

      if (override) {
        split = override;
      } else {
        const { data: defaultRule } = await supabase
          .from("default_revenue_rules")
          .select("*")
          .eq("format", item.format)
          .maybeSingle();
        split = defaultRule;
      }

      if (!split) continue;

      const { data: contributors } = await supabase
        .from("book_contributors")
        .select("user_id, role, format")
        .eq("book_id", item.book_id);

      const relevantContribs = (contributors || []).filter(
        (c) => !c.format || c.format === "all" || c.format === item.format
      );

      const roleGroups: Record<string, string[]> = { writer: [], publisher: [], narrator: [] };
      relevantContribs.forEach((c) => {
        if (roleGroups[c.role]) roleGroups[c.role].push(c.user_id);
      });

      const roles = [
        { role: "writer", percentage: split.writer_percentage },
        { role: "publisher", percentage: split.publisher_percentage },
        { role: "narrator", percentage: split.narrator_percentage },
      ];

      for (const { role, percentage } of roles) {
        if (percentage <= 0) continue;
        const users = roleGroups[role] || [];
        if (users.length === 0) continue;

        const perUser = percentage / users.length;
        for (const userId of users) {
          earningsToInsert.push({
            user_id: userId,
            order_id,
            order_item_id: item.id,
            book_id: item.book_id,
            format: item.format,
            role,
            sale_amount: saleAmount,
            percentage: perUser,
            earned_amount: (saleAmount * perUser) / 100,
            fulfillment_amount: role === "publisher" && item.format === "hardcopy" ? (saleAmount * (split.fulfillment_cost_percentage || 0)) / 100 : 0,
            status: "pending",
          });
        }
      }

      if (split.platform_percentage > 0) {
        earningsToInsert.push({
          user_id: "00000000-0000-0000-0000-000000000000",
          order_id,
          order_item_id: item.id,
          book_id: item.book_id,
          format: item.format,
          role: "platform",
          sale_amount: saleAmount,
          percentage: split.platform_percentage,
          earned_amount: (saleAmount * split.platform_percentage) / 100,
          fulfillment_amount: 0,
          status: "confirmed",
        });
      }
    }

    if (earningsToInsert.length > 0) {
      const { error: insertErr } = await supabase.from("contributor_earnings").insert(earningsToInsert);
      if (insertErr) {
        return new Response(JSON.stringify({ error: "Failed to insert earnings", details: insertErr }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(
      JSON.stringify({ success: true, earnings_created: earningsToInsert.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await captureException(err, { functionName: "calculate-earnings" });
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
