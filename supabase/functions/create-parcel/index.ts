import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: authErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Verify admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: claims.claims.sub, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: corsHeaders });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id is required" }), { status: 400, headers: corsHeaders });
    }

    // Fetch order with shipping details
    const { data: order, error: orderErr } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: corsHeaders });
    }

    // Check for existing shipment
    const { data: existingShipment } = await adminClient
      .from("shipments")
      .select("id")
      .eq("order_id", order_id)
      .maybeSingle();

    if (existingShipment) {
      return new Response(JSON.stringify({ error: "Shipment already exists for this order" }), { status: 409, headers: corsHeaders });
    }

    // Get shipping method
    const { data: shippingMethod } = await adminClient
      .from("shipping_methods")
      .select("*")
      .eq("id", order.shipping_method_id)
      .maybeSingle();

    const providerCode = shippingMethod?.provider_code || null;
    let parcelId = null;
    let trackingCode = null;
    let requestPayload = null;
    let responsePayload = null;
    let shipmentStatus = "pending";

    // If provider is RedX, attempt API call only if credentials exist
    if (providerCode === "redx") {
      const redxBaseUrl = Deno.env.get("REDX_BASE_URL");
      const redxToken = Deno.env.get("REDX_API_TOKEN");

      if (redxBaseUrl && redxToken) {
        // API mode: call RedX
        const weightKg = order.total_weight || 1;
        const weightGrams = Math.round(weightKg * 1000);

        const redxPayload = {
          customer_name: order.shipping_name,
          customer_phone: order.shipping_phone,
          delivery_area: order.shipping_area || order.shipping_district,
          delivery_area_id: null,
          merchant_invoice_id: order.id,
          cash_collection_amount: order.total_amount.toString(),
          parcel_weight: weightGrams.toString(),
          instruction: `Order ${order.id.slice(0, 8)}`,
          value: order.total_amount.toString(),
          customer_address: `${order.shipping_address || ""}, ${order.shipping_area || ""}, ${order.shipping_district || ""}`,
        };

        requestPayload = redxPayload;

        try {
          const res = await fetch(`${redxBaseUrl}/v1.0.0-beta/parcel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "API-ACCESS-TOKEN": `Bearer ${redxToken}`,
            },
            body: JSON.stringify(redxPayload),
          });

          const result = await res.json();
          responsePayload = result;

          if (res.ok && result.tracking_id) {
            parcelId = result.parcel_id || result.tracking_id;
            trackingCode = result.tracking_id;
            shipmentStatus = "created";
          }
        } catch (e) {
          responsePayload = { error: (e as Error).message };
        }
      } else {
        // Manual mode: no API credentials, just record shipment
        responsePayload = { mode: "manual", message: "RedX API credentials not configured. Shipment created in manual mode." };
      }
    }

    // Create shipment record
    const { data: shipment, error: shipErr } = await adminClient
      .from("shipments")
      .insert({
        order_id,
        provider_code: providerCode,
        shipping_method_code: shippingMethod?.code || null,
        parcel_id: parcelId,
        tracking_code: trackingCode,
        status: shipmentStatus,
        total_weight: order.total_weight || 0,
        delivery_charge: order.shipping_cost || 0,
        recipient_name: order.shipping_name,
        recipient_phone: order.shipping_phone,
        address: order.shipping_address,
        district: order.shipping_district || order.shipping_city,
        area: order.shipping_area,
        postal_code: order.shipping_zip,
        request_payload: requestPayload,
        response_payload: responsePayload,
      })
      .select("id, tracking_code, status")
      .single();

    if (shipErr) {
      return new Response(JSON.stringify({ error: shipErr.message }), { status: 500, headers: corsHeaders });
    }

    // Create initial event
    await adminClient.from("shipment_events").insert({
      shipment_id: shipment.id,
      status: shipmentStatus,
      message: shipmentStatus === "created" ? "Parcel created with courier" : "Shipment record created, awaiting courier dispatch",
    });

    // Update order status to shipped if parcel was created
    if (shipmentStatus === "created") {
      await adminClient.from("orders").update({ status: "shipped" }).eq("id", order_id);
    }

    return new Response(JSON.stringify({ success: true, shipment }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
