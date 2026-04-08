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

    const { shipment_id } = await req.json();
    if (!shipment_id) {
      return new Response(JSON.stringify({ error: "shipment_id is required" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get shipment
    const { data: shipment } = await adminClient
      .from("shipments")
      .select("*")
      .eq("id", shipment_id)
      .single();

    if (!shipment) {
      return new Response(JSON.stringify({ error: "Shipment not found" }), { status: 404, headers: corsHeaders });
    }

    // Verify user has access (owner or admin)
    const userId = claims.claims.sub as string;
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      const { data: order } = await adminClient.from("orders").select("user_id").eq("id", shipment.order_id).single();
      if (!order || order.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: corsHeaders });
      }
    }

    let courierStatus = null;

    // If RedX, fetch live tracking
    if (shipment.provider_code === "redx" && shipment.tracking_code) {
      const redxBaseUrl = Deno.env.get("REDX_BASE_URL");
      const redxToken = Deno.env.get("REDX_API_TOKEN");

      if (redxBaseUrl && redxToken) {
        try {
          const res = await fetch(`${redxBaseUrl}/v1.0.0-beta/parcel/track/${shipment.tracking_code}`, {
            headers: { "API-ACCESS-TOKEN": `Bearer ${redxToken}` },
          });
          if (res.ok) {
            courierStatus = await res.json();

            // Map RedX status to our status
            const statusMap: Record<string, string> = {
              "Pending": "pending",
              "Picked Up": "picked_up",
              "In Transit": "in_transit",
              "Delivered": "delivered",
              "Cancelled": "cancelled",
              "Returned": "returned",
            };

            const newStatus = statusMap[courierStatus?.status] || shipment.status;
            if (newStatus !== shipment.status) {
              await adminClient.from("shipments").update({ status: newStatus }).eq("id", shipment_id);
              await adminClient.from("shipment_events").insert({
                shipment_id, status: newStatus,
                message: `Status updated from courier: ${courierStatus?.status}`,
                raw_payload: courierStatus,
              });
            }
          }
        } catch (_e) { /* silently ignore courier errors */ }
      }
    }

    // Get events
    const { data: events } = await adminClient
      .from("shipment_events")
      .select("*")
      .eq("shipment_id", shipment_id)
      .order("event_time", { ascending: false });

    return new Response(JSON.stringify({
      shipment: { ...shipment, request_payload: undefined, response_payload: undefined },
      events: events || [],
      courier_status: courierStatus,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
