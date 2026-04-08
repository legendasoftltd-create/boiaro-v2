import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const trackingId = body.tracking_id || body.tracking_code || body.parcel_tracking_id;
    const status = body.status || body.parcel_status;

    if (!trackingId || !status) {
      return new Response(JSON.stringify({ error: "Missing tracking_id or status" }), { status: 400, headers: corsHeaders });
    }

    const { data: shipment } = await adminClient
      .from("shipments")
      .select("id, order_id, status")
      .eq("tracking_code", trackingId)
      .maybeSingle();

    if (!shipment) {
      return new Response(JSON.stringify({ error: "Shipment not found" }), { status: 404, headers: corsHeaders });
    }

    const statusMap: Record<string, string> = {
      "Pending": "pending",
      "Picked Up": "picked_up",
      "In Transit": "in_transit",
      "Out for Delivery": "in_transit",
      "Delivered": "delivered",
      "Cancelled": "cancelled",
      "Returned": "returned",
      "picked_up": "picked_up",
      "in_transit": "in_transit",
      "delivered": "delivered",
      "cancelled": "cancelled",
      "returned": "returned",
    };

    const newStatus = statusMap[status] || status.toLowerCase();

    // Update shipment delivery status
    await adminClient.from("shipments").update({ status: newStatus }).eq("id", shipment.id);

    // Log event
    await adminClient.from("shipment_events").insert({
      shipment_id: shipment.id,
      status: newStatus,
      message: body.message || `Webhook: ${status}`,
      raw_payload: body,
    });

    // Sync order status based on shipment status
    const shipmentToOrderStatus: Record<string, string> = {
      picked_up: "pickup_received",
      in_transit: "in_transit",
      delivered: "delivered",
    };

    const orderStatus = shipmentToOrderStatus[newStatus];
    if (orderStatus) {
      const { data: order } = await adminClient
        .from("orders")
        .select("payment_method, cod_payment_status")
        .eq("id", shipment.order_id)
        .maybeSingle();

      const updatePayload: Record<string, string> = { status: orderStatus };

      // COD: when delivered, set payment to "cod_pending_collection"
      if (orderStatus === "delivered" && order?.payment_method === "cod") {
        updatePayload.cod_payment_status = "cod_pending_collection";
      }

      await adminClient.from("orders").update(updatePayload).eq("id", shipment.order_id);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
