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
    formData.forEach((value, key) => { ipnData[key] = String(value); });

    const {
      tran_id: tranId,
      val_id: validationId,
      amount,
      status,
      bank_tran_id: bankTranId,
      store_amount: storeAmount,
    } = ipnData;

    if (!tranId || !tranId.startsWith("coin_purchase_")) {
      return new Response("Not a coin purchase transaction", { status: 400 });
    }

    const purchaseId = tranId.replace("coin_purchase_", "");

    // Fetch the purchase record
    const { data: purchase, error: purchaseErr } = await supabaseAdmin
      .from("coin_purchases")
      .select("*")
      .eq("id", purchaseId)
      .single();

    if (purchaseErr || !purchase) {
      return new Response("Purchase not found", { status: 404 });
    }

    // Prevent double-fulfillment
    if (purchase.payment_status === "completed") {
      return new Response("Already fulfilled", { status: 200 });
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

      const isValid = ["VALID", "VALIDATED"].includes(valResult.status);

      if (isValid) {
        // Verify amount
        const paidAmount = parseFloat(valResult.amount || amount || "0");
        if (Math.abs(paidAmount - Number(purchase.price)) > 1) {
          await supabaseAdmin
            .from("coin_purchases")
            .update({ payment_status: "amount_mismatch" })
            .eq("id", purchaseId);
          return new Response("Amount mismatch", { status: 400 });
        }

        // Mark purchase as completed
        await supabaseAdmin
          .from("coin_purchases")
          .update({
            payment_status: "completed",
            transaction_id: bankTranId || validationId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchaseId);

        // Add coins to user wallet using RPC
        const { error: rpcErr } = await supabaseAdmin.rpc("adjust_user_coins", {
          p_user_id: purchase.user_id,
          p_amount: purchase.coins_amount,
          p_type: "earn",
          p_description: `কয়েন ক্রয় - ৳${purchase.price} (${purchase.coins_amount} কয়েন)`,
          p_reference_id: `coin_purchase_${purchaseId}`,
          p_source: "coin_purchase",
        });

        if (rpcErr) {
          console.error("Failed to add coins:", rpcErr);
          // Still mark as needing manual resolution
          await supabaseAdmin
            .from("coin_purchases")
            .update({ payment_status: "paid_pending_coins" })
            .eq("id", purchaseId);
        }

        // Create accounting ledger entry
        await supabaseAdmin.from("accounting_ledger").insert({
          type: "income",
          category: "coin_purchase",
          description: `Coin purchase: ${purchase.coins_amount} coins for ৳${purchase.price}`,
          amount: Number(storeAmount || purchase.price),
          entry_date: new Date().toISOString().split("T")[0],
          reference_type: "coin_purchase",
          reference_id: purchaseId,
        });
      } else {
        await supabaseAdmin
          .from("coin_purchases")
          .update({ payment_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", purchaseId);
      }
    } else if (status === "FAILED" || status === "CANCELLED") {
      await supabaseAdmin
        .from("coin_purchases")
        .update({
          payment_status: status === "CANCELLED" ? "cancelled" : "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseId);
    }

    return new Response("IPN Received", { status: 200 });
  } catch (err) {
    await captureException(err, { functionName: "coin-purchase-webhook" });
    return new Response("Internal error", { status: 500 });
  }
});
