import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify admin
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleCheck } = await adminClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, order_id, duplicate_ledger_ids, missing_orders } = body;
    const fixes: string[] = [];

    // Action: fix_order — fix a single order's issues
    if (action === "fix_order" && order_id) {
      const { data: order } = await adminClient.from("orders").select("*").eq("id", order_id).single();
      if (!order) {
        return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: payment } = await adminClient.from("payments").select("*").eq("order_id", order_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: ledgerEntries } = await adminClient.from("accounting_ledger").select("*").eq("order_id", order_id);
      const incomeEntries = (ledgerEntries || []).filter((e: any) => e.type === "income" && e.category === "book_sale" && Number(e.amount) > 0);

      // Fix 1: Status mismatch — payment is paid but order status doesn't reflect it
      if (payment && payment.status === "paid" && !["paid", "completed", "access_granted", "delivered"].includes(order.status) && order.payment_method !== "cod") {
        const { data: items } = await adminClient.from("order_items").select("format").eq("order_id", order_id);
        const hasDigital = (items || []).some((i: any) => ["ebook", "audiobook"].includes(i.format));
        const hasHardcopy = (items || []).some((i: any) => i.format === "hardcopy");
        const newStatus = hasDigital && !hasHardcopy ? "access_granted" : "paid";

        await adminClient.from("orders").update({ status: newStatus }).eq("id", order_id);
        fixes.push(`Resynced order status: ${order.status} → ${newStatus}`);

        await adminClient.from("system_logs").insert({
          level: "warning", module: "revenue_audit_fix",
          message: `Auto-fix: order status resynced`,
          fingerprint: "fix_status_" + order_id.slice(0, 8),
          metadata: { order_id, old_status: order.status, new_status: newStatus, payment_status: payment.status },
        });
      }

      // Fix 2: Missing ledger entry
      if (incomeEntries.length === 0) {
        const verifiedStatuses = ["paid", "completed", "access_granted", "delivered"];
        const orderStatus = order.status;
        // Only create ledger if order qualifies as revenue
        const isRevenue = order.payment_method === "cod"
          ? order.cod_payment_status === "settled_to_merchant" || order.cod_payment_status === "paid"
          : verifiedStatuses.includes(orderStatus) || (payment && payment.status === "paid");

        if (isRevenue) {
          await adminClient.from("accounting_ledger").insert({
            type: "income", category: "book_sale",
            description: `Auto-fix: Order #${order_id.slice(0, 8)} ledger backfill`,
            amount: order.total_amount,
            entry_date: new Date().toISOString().split("T")[0],
            order_id, reference_type: "order", reference_id: order_id,
          });
          fixes.push(`Created missing ledger income entry (৳${order.total_amount})`);

          await adminClient.from("system_logs").insert({
            level: "warning", module: "revenue_audit_fix",
            message: `Auto-fix: missing ledger entry created`,
            fingerprint: "fix_ledger_" + order_id.slice(0, 8),
            metadata: { order_id, amount: order.total_amount },
          });
        }
      }

      // Fix 3: Duplicate ledger entries — keep first, remove rest
      if (incomeEntries.length > 1) {
        const toDelete = incomeEntries.slice(1).map((e: any) => e.id);
        await adminClient.from("accounting_ledger").delete().in("id", toDelete);
        fixes.push(`Removed ${toDelete.length} duplicate ledger entries`);

        await adminClient.from("system_logs").insert({
          level: "warning", module: "revenue_audit_fix",
          message: `Auto-fix: removed ${toDelete.length} duplicate ledger entries`,
          fingerprint: "fix_dupe_" + order_id.slice(0, 8),
          metadata: { order_id, removed_ids: toDelete },
        });
      }
    }

    // Action: bulk_fix — fix all detected issues from consistency check
    if (action === "bulk_fix") {
      // Fix missing ledger entries
      if (missing_orders && Array.isArray(missing_orders)) {
        for (const mo of missing_orders) {
          const { data: existCheck } = await adminClient.from("accounting_ledger")
            .select("id").eq("order_id", mo.id).eq("type", "income").eq("category", "book_sale").limit(1);
          if (!existCheck || existCheck.length === 0) {
            await adminClient.from("accounting_ledger").insert({
              type: "income", category: "book_sale",
              description: `Auto-fix: Order #${(mo.order_number || mo.id).slice(0, 12)} ledger backfill`,
              amount: mo.total_amount,
              entry_date: new Date().toISOString().split("T")[0],
              order_id: mo.id, reference_type: "order", reference_id: mo.id,
            });
            fixes.push(`Created ledger for order ${mo.order_number || mo.id}`);
          }
        }
      }

      // Fix duplicate ledger entries
      if (duplicate_ledger_ids && Array.isArray(duplicate_ledger_ids) && duplicate_ledger_ids.length > 0) {
        await adminClient.from("accounting_ledger").delete().in("id", duplicate_ledger_ids);
        fixes.push(`Removed ${duplicate_ledger_ids.length} duplicate ledger entries`);
      }

      if (fixes.length > 0) {
        await adminClient.from("system_logs").insert({
          level: "warning", module: "revenue_audit_fix",
          message: `Bulk auto-fix: ${fixes.length} fixes applied`,
          fingerprint: "bulk_fix_" + new Date().toISOString().slice(0, 10),
          metadata: { fixes, missing_count: missing_orders?.length || 0, duplicate_count: duplicate_ledger_ids?.length || 0 },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, fixes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
