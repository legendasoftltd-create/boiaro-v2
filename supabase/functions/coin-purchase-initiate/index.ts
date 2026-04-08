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

    const { package_id } = await req.json();
    if (!package_id) throw new Error("package_id is required");

    // Fetch package
    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("coin_packages")
      .select("*")
      .eq("id", package_id)
      .eq("is_active", true)
      .single();
    if (pkgErr || !pkg) throw new Error("Package not found or inactive");

    const totalCoins = pkg.coins + (pkg.bonus_coins || 0);

    // Create coin purchase record
    const { data: purchase, error: purchaseErr } = await supabaseAdmin
      .from("coin_purchases")
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        coins_amount: totalCoins,
        price: pkg.price,
        payment_method: "sslcommerz",
        payment_status: "pending",
      })
      .select()
      .single();
    if (purchaseErr || !purchase) throw new Error("Failed to create purchase record");

    // Fetch gateway config
    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("config, mode, is_enabled")
      .eq("gateway_key", "sslcommerz")
      .single();
    if (!gateway?.is_enabled) throw new Error("SSLCommerz is not enabled");

    const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID");
    const storePass = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD");
    if (!storeId || !storePass) throw new Error("SSLCommerz credentials not configured");

    const isLive = gateway.mode === "live";
    if (isLive && (storeId.includes("test") || storeId.includes("sandbox"))) {
      throw new Error("Cannot use live mode with test credentials");
    }

    const baseUrl = isLive
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";

    const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://boiaro.com.bd";
    // Use coin_purchase_ prefix so webhook knows it's a coin purchase
    const tranId = `coin_purchase_${purchase.id}`;
    const successUrl = `${siteUrl}/payment/callback?status=success&type=coin&purchase_id=${purchase.id}`;
    const failUrl = `${siteUrl}/payment/callback?status=failed&type=coin&purchase_id=${purchase.id}`;
    const cancelUrl = `${siteUrl}/payment/callback?status=cancelled&type=coin&purchase_id=${purchase.id}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const ipnUrl = `${supabaseUrl}/functions/v1/coin-purchase-webhook`;

    // Get user profile for customer info
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, phone")
      .eq("user_id", user.id)
      .maybeSingle();

    const params = new URLSearchParams();
    params.append("store_id", storeId);
    params.append("store_passwd", storePass);
    params.append("total_amount", String(pkg.price));
    params.append("currency", "BDT");
    params.append("tran_id", tranId);
    params.append("success_url", successUrl);
    params.append("fail_url", failUrl);
    params.append("cancel_url", cancelUrl);
    params.append("ipn_url", ipnUrl);
    params.append("cus_name", profile?.display_name || user.email || "Customer");
    params.append("cus_email", user.email || "no-reply@boiaro.com.bd");
    params.append("cus_phone", profile?.phone || "01700000000");
    params.append("cus_add1", "N/A");
    params.append("cus_city", "Dhaka");
    params.append("cus_postcode", "1000");
    params.append("cus_country", "Bangladesh");
    params.append("shipping_method", "NO");
    params.append("product_name", `Coin Package: ${pkg.name} (${totalCoins} coins)`);
    params.append("product_category", "Digital Coins");
    params.append("product_profile", "non-physical-goods");

    const response = await fetch(`${baseUrl}/gwprocess/v4`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const result = await response.json();

    if (result.status === "SUCCESS" && result.GatewayPageURL) {
      // Update purchase with session info
      await supabaseAdmin
        .from("coin_purchases")
        .update({ transaction_id: result.sessionkey })
        .eq("id", purchase.id);

      return new Response(JSON.stringify({
        success: true,
        gateway_url: result.GatewayPageURL,
        purchase_id: purchase.id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Failed
    await supabaseAdmin
      .from("coin_purchases")
      .update({ payment_status: "failed" })
      .eq("id", purchase.id);

    throw new Error(result.failedreason || "Failed to create payment session");
  } catch (err) {
    await captureException(err, { functionName: "coin-purchase-initiate" });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
