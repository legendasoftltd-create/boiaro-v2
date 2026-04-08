import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Invalid token");

    const { order_id } = await req.json();
    if (!order_id) throw new Error("order_id is required");

    // Fetch order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .single();
    if (orderErr || !order) throw new Error("Order not found");

    // Fetch gateway config
    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("config, mode, is_enabled")
      .eq("gateway_key", "sslcommerz")
      .single();
    if (!gateway?.is_enabled) throw new Error("SSLCommerz is not enabled");

    // Credentials ONLY from environment secrets — never from DB
    const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID");
    const storePass = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD");

    if (!storeId || !storePass) {
      throw new Error("SSLCommerz credentials not configured. Please set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD in environment secrets.");
    }

    const isLive = gateway.mode === "live";

    // Prevent live mode without real credentials
    if (isLive && (storeId.includes("test") || storeId.includes("sandbox") || storeId.length < 5)) {
      throw new Error("Cannot use live mode with test/sandbox credentials. Please configure production SSLCommerz credentials.");
    }

    const baseUrl = isLive
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";

    // Build frontend callback URLs
    const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://boiaro.com.bd";
    const successUrl = `${siteUrl}/payment/callback?status=success&order_id=${order_id}`;
    const failUrl = `${siteUrl}/payment/callback?status=failed&order_id=${order_id}`;
    const cancelUrl = `${siteUrl}/payment/callback?status=cancelled&order_id=${order_id}`;

    // IPN URL (server-side webhook)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const ipnUrl = `${supabaseUrl}/functions/v1/sslcommerz-webhook`;

    // Build SSLCommerz session payload
    const params = new URLSearchParams();
    params.append("store_id", storeId);
    params.append("store_passwd", storePass);
    params.append("total_amount", String(order.total_amount));
    params.append("currency", "BDT");
    params.append("tran_id", order_id);
    params.append("success_url", successUrl);
    params.append("fail_url", failUrl);
    params.append("cancel_url", cancelUrl);
    params.append("ipn_url", ipnUrl);
    params.append("cus_name", order.shipping_name || user.email || "Customer");
    params.append("cus_email", user.email || "no-reply@boiaro.com.bd");
    params.append("cus_phone", order.shipping_phone || "01700000000");
    params.append("cus_add1", order.shipping_address || "N/A");
    params.append("cus_city", order.shipping_city || "Dhaka");
    params.append("cus_postcode", order.shipping_zip || "1000");
    params.append("cus_country", "Bangladesh");
    params.append("shipping_method", "NO");
    params.append("product_name", "Book Order");
    params.append("product_category", "Books");
    params.append("product_profile", "general");

    // Log initiation event
    await supabaseAdmin.from("payment_events").insert({
      order_id,
      gateway: "sslcommerz",
      event_type: "initiate",
      status: "pending",
      amount: order.total_amount,
    });

    // Update order status to awaiting_payment
    await supabaseAdmin.from("orders").update({ status: "awaiting_payment" }).eq("id", order_id);

    // Call SSLCommerz API
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/gwprocess/v4`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    } catch (fetchErr) {
      await supabaseAdmin.from("payment_events").insert({
        order_id,
        gateway: "sslcommerz",
        event_type: "network_error",
        status: "failed",
        raw_response: { error: String(fetchErr), baseUrl },
      });
      throw new Error("Cannot reach SSLCommerz server. Please try again.");
    }

    let result: any;
    try {
      result = await response.json();
    } catch {
      const text = await response.text().catch(() => "");
      throw new Error(`SSLCommerz returned invalid response (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }

    if (result.status === "SUCCESS" && result.GatewayPageURL) {
      await supabaseAdmin.from("payment_events").insert({
        order_id,
        gateway: "sslcommerz",
        event_type: "session_created",
        status: "success",
        transaction_id: result.sessionkey,
        raw_response: result,
      });

      return new Response(JSON.stringify({
        success: true,
        gateway_url: result.GatewayPageURL,
        session_key: result.sessionkey,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Session creation failed
    await supabaseAdmin.from("payment_events").insert({
      order_id,
      gateway: "sslcommerz",
      event_type: "session_failed",
      status: "failed",
      raw_response: result,
    });

    const reason = result.failedreason || result.error || "Unknown error from SSLCommerz";
    throw new Error(`SSLCommerz session failed: ${reason}`);
  } catch (err) {
    await captureException(err, { functionName: "sslcommerz-initiate" });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
