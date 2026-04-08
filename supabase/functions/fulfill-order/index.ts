import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Unified post-payment success handler.
 * Called by: demo checkout (client), sslcommerz-webhook (server), future gateways.
 *
 * Expects JSON body:
 *   { order_id, transaction_id, gateway, paid_amount }
 *
 * When called from the client (demo), the caller's JWT is verified.
 * When called internally (webhook with _internal flag), service-role is used.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { order_id, transaction_id, gateway, paid_amount, _internal } = body;

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If not an internal call, verify the caller owns the order
    if (!_internal) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Authorization required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Ensure user owns this order
      const { data: orderCheck } = await supabaseAdmin
        .from("orders")
        .select("user_id")
        .eq("id", order_id)
        .eq("user_id", user.id)
        .single();

      if (!orderCheck) {
        return new Response(
          JSON.stringify({ error: "Order not found or not yours" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Idempotency: skip if already fulfilled ---
    const { data: currentOrder } = await supabaseAdmin
      .from("orders")
      .select("status, total_amount, user_id, payment_method")
      .eq("id", order_id)
      .single();

    if (!currentOrder) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (
      ["confirmed", "paid", "access_granted", "completed", "delivered"].includes(
        currentOrder.status
      )
    ) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Already fulfilled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const effectiveGateway = gateway || currentOrder.payment_method || "unknown";
    const effectiveTxnId = transaction_id || `${effectiveGateway.toUpperCase()}-${Date.now()}`;
    const effectiveAmount = paid_amount ?? currentOrder.total_amount;

    // ===== UNIFIED SUCCESS FLOW =====

    // 1. Update payment record → status = 'paid'
    //    This triggers DB trigger: sync_order_on_payment_paid (sets order status)
    await supabaseAdmin
      .from("payments")
      .update({ status: "paid", transaction_id: effectiveTxnId })
      .eq("order_id", order_id);

    // 2. Get order items
    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("book_id, format")
      .eq("order_id", order_id);

    const userId = currentOrder.user_id;
    const items = orderItems || [];

    // 3. Determine digital vs hardcopy
    const hasDigital = items.some(
      (i: any) => i.format === "ebook" || i.format === "audiobook"
    );
    const hasHardcopy = items.some((i: any) => i.format === "hardcopy");
    const isFullyDigital = hasDigital && !hasHardcopy;

    // 4. Set order status (also handled by DB trigger, but explicit for reliability)
    const orderStatus = isFullyDigital ? "access_granted" : "paid";
    await supabaseAdmin
      .from("orders")
      .update({ status: orderStatus })
      .eq("id", order_id)
      .not("status", "in", '("paid","completed","access_granted","delivered")');

    // 5. Unlock digital content + create purchase records
    if (userId && items.length > 0) {
      for (const item of items) {
        if (item.format === "ebook" || item.format === "audiobook") {
          await supabaseAdmin.from("content_unlocks").upsert(
            {
              user_id: userId,
              book_id: item.book_id,
              format: item.format,
              unlock_method: "purchase",
              coins_spent: 0,
              status: "active",
            },
            { onConflict: "user_id,book_id,format" }
          );

          await supabaseAdmin.from("user_purchases").upsert(
            {
              user_id: userId,
              book_id: item.book_id,
              format: item.format,
              amount: effectiveAmount,
              status: "active",
              payment_method: effectiveGateway,
            },
            { onConflict: "user_id,book_id,format" }
          );
        }

        // 6. Increment daily_book_stats
        if (item.book_id) {
          const today = new Date().toISOString().split("T")[0];
          const { data: existing } = await supabaseAdmin
            .from("daily_book_stats")
            .select("id, purchases")
            .eq("book_id", item.book_id)
            .eq("stat_date", today)
            .maybeSingle();

          if (existing) {
            await supabaseAdmin
              .from("daily_book_stats")
              .update({ purchases: (existing.purchases || 0) + 1 })
              .eq("id", existing.id);
          } else {
            await supabaseAdmin.from("daily_book_stats").insert({
              book_id: item.book_id,
              stat_date: today,
              purchases: 1,
              reads: 0,
              views: 0,
              unique_readers: 0,
            });
          }
        }
      }
    }

    // 7. Calculate earnings
    try {
      await supabaseAdmin.functions.invoke("calculate-earnings", {
        body: { order_id, _internal: true },
      });
    } catch (e) {
      console.error("Earnings calculation failed:", e);
    }

    // 8. Create notification
    if (userId) {
      try {
        const accessMsg = isFullyDigital
          ? "আপনার ডিজিটাল কন্টেন্ট এখনই অ্যাক্সেস করতে পারবেন।"
          : hasDigital
          ? "ডিজিটাল কন্টেন্ট এখনই অ্যাক্সেস করতে পারবেন। হার্ডকপি শীঘ্রই পাঠানো হবে।"
          : "আপনার অর্ডার কনফার্ম হয়েছে।";

        const { data: notification } = await supabaseAdmin
          .from("notifications")
          .insert({
            title: "অর্ডার কনফার্ম ✅",
            message: `অর্ডার #${order_id.substring(0, 8)} সফলভাবে পেমেন্ট হয়েছে। ${accessMsg}`,
            type: "order",
            channel: "in_app",
            audience: "individual",
            target_user_id: userId,
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (notification) {
          await supabaseAdmin
            .from("user_notifications")
            .insert({ user_id: userId, notification_id: notification.id });
        }
      } catch (e) {
        console.error("Notification creation failed:", e);
      }
    }

    // 9. Log fulfillment event
    await supabaseAdmin.from("payment_events").insert({
      order_id,
      gateway: effectiveGateway,
      event_type: "payment_confirmed",
      status: "paid",
      transaction_id: effectiveTxnId,
      amount: effectiveAmount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        order_status: orderStatus,
        items_fulfilled: items.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await captureException(err, { functionName: "fulfill-order" });
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
