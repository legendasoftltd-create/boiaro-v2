import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth: admin only
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { order_id, new_status } = await req.json();
    if (!order_id || !new_status) {
      return new Response(JSON.stringify({ error: "order_id and new_status required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get current order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(id, book_id, format, unit_price, quantity)")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const oldStatus = order.status;
    if (oldStatus === new_status) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "same_status" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Record<string, any> = { old_status: oldStatus, new_status };

    // 1. Update the order status with admin flag
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: new_status, updated_by_admin: true })
      .eq("id", order_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to update order", details: updateErr }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // DB triggers handle: deduct_stock_on_confirm, reverse_order_earnings (cancel/return), 
    // auto_ledger_on_order_paid (confirmed/paid/delivered for COD), revoke_access_on_cancel,
    // auto_settle_cod_on_delivery (COD payment → paid when delivered)

    // 2. If transitioning to access_granted/confirmed/paid → grant digital access + earnings
    //    OR if COD order delivered → trigger earnings for hardcopy items
    const isDigitalGrant = ["access_granted", "confirmed", "paid"].includes(new_status) &&
        !["access_granted", "confirmed", "paid", "completed", "delivered"].includes(oldStatus);
    const isCodDelivery = new_status === "delivered" && oldStatus !== "delivered" && order.payment_method === "cod";

    if (isDigitalGrant || isCodDelivery) {

      // Grant digital content access (only for digital grant transitions)
      if (isDigitalGrant) {
        const digitalItems = (order.order_items || []).filter(
          (i: any) => i.format === "ebook" || i.format === "audiobook"
        );

        for (const item of digitalItems) {
          await supabase.from("content_unlocks").upsert({
            user_id: order.user_id,
            book_id: item.book_id,
            format: item.format,
            unlock_method: "purchase",
            status: "active",
          }, { onConflict: "user_id,book_id,format" });

          await supabase.from("user_purchases").upsert({
            user_id: order.user_id,
            book_id: item.book_id,
            format: item.format,
            order_id: order_id,
            status: "active",
          }, { onConflict: "user_id,book_id,format" });
        }
        results.content_unlocked = digitalItems.length;
      }

      // Calculate earnings (idempotent — edge function checks for existing)
      const { data: earningsResult } = await supabase.functions.invoke("calculate-earnings", {
        body: { order_id, _internal: true },
      });
      results.earnings = earningsResult;

      // Increment daily_book_stats
      for (const item of order.order_items || []) {
        const today = new Date().toISOString().split("T")[0];
        const { data: existing } = await supabase
          .from("daily_book_stats")
          .select("id, purchases")
          .eq("book_id", item.book_id)
          .eq("stat_date", today)
          .maybeSingle();

        if (existing) {
          await supabase.from("daily_book_stats")
            .update({ purchases: (existing.purchases || 0) + 1 })
            .eq("id", existing.id);
        } else {
          await supabase.from("daily_book_stats")
            .insert({ book_id: item.book_id, stat_date: today, purchases: 1, views: 0, reads: 0, unique_readers: 0 });
        }
      }
      results.stats_updated = true;

      // For COD delivery, also log that payment was auto-settled
      if (isCodDelivery) {
        results.cod_settled = true;
      }
    }

    // 3. Log to order_status_history
    await supabase.from("order_status_history").insert({
      order_id,
      old_status: oldStatus,
      new_status,
      changed_by: caller.id,
      notes: "Admin manual override",
    });

    // 4. Create notification for user
    const statusLabels: Record<string, string> = {
      access_granted: "অর্ডার সফল ✅ — কন্টেন্ট আনলক হয়েছে",
      confirmed: "অর্ডার কনফার্ম ✅",
      cancelled: "অর্ডার বাতিল ❌",
      refunded: "অর্ডার রিফান্ড 💰",
      processing: "অর্ডার প্রসেসিং 📦",
      shipped: "অর্ডার শিপড 🚚",
      delivered: "অর্ডার ডেলিভারি সম্পন্ন ✅",
    };
    const notifTitle = statusLabels[new_status] || `অর্ডার স্ট্যাটাস: ${new_status}`;
    const { data: notif } = await supabase.from("notifications").insert({
      title: notifTitle,
      message: `অর্ডার #${order.order_number || order_id.substring(0, 8)} এর স্ট্যাটাস পরিবর্তন হয়েছে।`,
      type: "order",
      channel: "in_app",
      audience: "individual",
      target_user_id: order.user_id,
      status: "sent",
      sent_at: new Date().toISOString(),
    }).select("id").single();
    if (notif) {
      await supabase.from("user_notifications").insert({ user_id: order.user_id, notification_id: notif.id });
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await captureException(err, { functionName: "admin-update-order-status" });
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
