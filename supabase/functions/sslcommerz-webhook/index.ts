import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const formData = await req.formData();
    const ipnData: Record<string, string> = {};
    formData.forEach((value, key) => {
      ipnData[key] = String(value);
    });

    const {
      tran_id: orderId,
      val_id: validationId,
      amount,
      status,
      bank_tran_id: bankTranId,
      currency,
      store_amount: storeAmount,
    } = ipnData;

    if (!orderId) {
      return new Response("Missing tran_id", { status: 400 });
    }

    // Skip coin purchase transactions (handled by coin-purchase-webhook)
    if (orderId.startsWith("coin_purchase_")) {
      return new Response("Not an order transaction", { status: 400 });
    }

    // Log the IPN event
    await supabaseAdmin.from("payment_events").insert({
      order_id: orderId,
      gateway: "sslcommerz",
      event_type: "ipn_received",
      status: status?.toLowerCase() || "unknown",
      transaction_id: validationId || bankTranId,
      amount: parseFloat(amount || "0"),
      currency: currency || "BDT",
      raw_response: ipnData,
    });

    // --- Idempotency: if order is already confirmed/paid/access_granted, skip ---
    const { data: currentOrder } = await supabaseAdmin
      .from("orders")
      .select("status, total_amount, user_id")
      .eq("id", orderId)
      .single();

    if (
      currentOrder &&
      ["confirmed", "paid", "access_granted", "completed", "delivered"].includes(
        currentOrder.status
      )
    ) {
      await supabaseAdmin.from("payment_events").insert({
        order_id: orderId,
        gateway: "sslcommerz",
        event_type: "idempotent_skip",
        status: "skipped",
        raw_response: {
          reason: "Order already processed",
          current_status: currentOrder.status,
        },
      });
      return new Response("Already processed", { status: 200 });
    }

    const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID");
    const storePass = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD");

    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("mode")
      .eq("gateway_key", "sslcommerz")
      .single();

    if (validationId && storeId && storePass) {
      const isLive = gateway?.mode === "live";
      const validateUrl = isLive
        ? "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
        : "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";

      const valResponse = await fetch(
        `${validateUrl}?val_id=${validationId}&store_id=${storeId}&store_passwd=${storePass}&format=json`
      );
      const valResult = await valResponse.json();

      await supabaseAdmin.from("payment_events").insert({
        order_id: orderId,
        gateway: "sslcommerz",
        event_type: "validation_response",
        status: valResult.status?.toLowerCase() || "unknown",
        transaction_id: validationId,
        amount: parseFloat(valResult.amount || amount || "0"),
        raw_response: valResult,
      });

      const isValid = ["VALID", "VALIDATED"].includes(valResult.status);

      if (isValid) {
        // Verify amount
        const paidAmount = parseFloat(valResult.amount || amount || "0");
        if (
          currentOrder &&
          Math.abs(paidAmount - currentOrder.total_amount) > 1
        ) {
          await supabaseAdmin.from("payment_events").insert({
            order_id: orderId,
            gateway: "sslcommerz",
            event_type: "amount_mismatch",
            status: "suspicious",
            amount: paidAmount,
            raw_response: {
              expected: currentOrder.total_amount,
              received: paidAmount,
              validation: valResult,
            },
          });
          await supabaseAdmin
            .from("orders")
            .update({ status: "payment_failed" })
            .eq("id", orderId);
          return new Response("Amount mismatch", { status: 400 });
        }

        // --- Delegate to unified fulfill-order handler ---
        console.log(
          `[sslcommerz-webhook] Delegating to fulfill-order for ${orderId}`
        );
        const fulfillResponse = await supabaseAdmin.functions.invoke(
          "fulfill-order",
          {
            body: {
              order_id: orderId,
              transaction_id: bankTranId || validationId,
              gateway: "sslcommerz",
              paid_amount: paidAmount,
              _internal: true,
            },
          }
        );

        if (fulfillResponse.error) {
          console.error("fulfill-order error:", fulfillResponse.error);
        } else {
          console.log(
            `[sslcommerz-webhook] fulfill-order success for ${orderId}:`,
            fulfillResponse.data
          );
        }
      } else {
        await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("order_id", orderId);
        await supabaseAdmin
          .from("orders")
          .update({ status: "payment_failed" })
          .eq("id", orderId);
        await supabaseAdmin.from("payment_events").insert({
          order_id: orderId,
          gateway: "sslcommerz",
          event_type: "validation_failed",
          status: "failed",
          transaction_id: validationId,
          raw_response: valResult,
        });
      }
    } else if (status === "FAILED" || status === "CANCELLED") {
      const newStatus = status === "CANCELLED" ? "cancelled" : "failed";
      await supabaseAdmin
        .from("payments")
        .update({ status: newStatus })
        .eq("order_id", orderId);
      await supabaseAdmin
        .from("orders")
        .update({
          status: status === "CANCELLED" ? "cancelled" : "payment_failed",
        })
        .eq("id", orderId);
    } else if (!storeId || !storePass) {
      await supabaseAdmin.from("payment_events").insert({
        order_id: orderId,
        gateway: "sslcommerz",
        event_type: "validation_skipped",
        status: "error",
        raw_response: {
          reason:
            "Missing SSLCOMMERZ_STORE_ID or SSLCOMMERZ_STORE_PASSWORD environment secrets",
        },
      });
    }

    return new Response("IPN Received", { status: 200 });
  } catch (err) {
    await captureException(err, { functionName: "sslcommerz-webhook" });
    return new Response("Internal error", { status: 500 });
  }
});
