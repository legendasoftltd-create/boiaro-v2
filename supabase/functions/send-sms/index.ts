import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SmsRequest {
  recipients: { phone: string; name?: string; group?: string }[];
  message: string;
}

function normalizePhone(raw: string): string | null {
  let cleaned = raw.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  if (cleaned.startsWith("0")) cleaned = "+880" + cleaned.slice(1);
  if (!cleaned.startsWith("+")) cleaned = "+880" + cleaned;
  // Basic BD number check: +880 followed by 10 digits
  if (/^\+880\d{10}$/.test(cleaned)) return cleaned;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin check
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: SmsRequest = await req.json();
    if (!body.message?.trim() || !body.recipients?.length) {
      return new Response(
        JSON.stringify({ error: "Message and recipients required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiToken = Deno.env.get("SSL_SMS_API_TOKEN");
    const sid = Deno.env.get("SSL_SMS_SID");
    const credentialsMissing = !apiToken || !sid;

    const results = { total: 0, sent: 0, failed: 0, skipped: 0, details: [] as any[] };

    // De-duplicate by normalized phone
    const seen = new Set<string>();
    const unique: typeof body.recipients = [];
    for (const r of body.recipients) {
      const norm = normalizePhone(r.phone);
      if (!norm) {
        results.skipped++;
        results.details.push({ phone: r.phone, status: "skipped", reason: "invalid" });
        continue;
      }
      if (seen.has(norm)) {
        results.skipped++;
        results.details.push({ phone: r.phone, status: "skipped", reason: "duplicate" });
        continue;
      }
      seen.add(norm);
      unique.push({ ...r, phone: norm });
    }

    results.total = unique.length + results.skipped;

    for (const recipient of unique) {
      let status = "pending";
      let apiResponse: any = null;

      if (credentialsMissing) {
        status = "failed";
        apiResponse = { error: "SSL_SMS_API_TOKEN or SSL_SMS_SID not configured" };
        results.failed++;
      } else {
        try {
          const sslRes = await fetch(
            "https://smsplus.sslwireless.com/api/v3/send-sms",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                api_token: apiToken,
                sid: sid,
                msisdn: recipient.phone.replace("+", ""),
                sms: body.message,
                csms_id: crypto.randomUUID().replace(/-/g, "").slice(0, 20),
              }),
            }
          );
          apiResponse = await sslRes.json();
          status =
            apiResponse?.status === "SUCCESS" ||
            apiResponse?.status_code === "200"
              ? "sent"
              : "failed";
          if (status === "sent") results.sent++;
          else results.failed++;
        } catch (e) {
          status = "failed";
          apiResponse = { error: String(e) };
          results.failed++;
        }
      }

      // Log to DB
      await supabase.from("sms_logs").insert({
        recipient_phone: recipient.phone,
        recipient_name: recipient.name || null,
        recipient_group: recipient.group || null,
        message: body.message,
        status,
        api_response: apiResponse,
        sent_by: user.id,
      });

      results.details.push({
        phone: recipient.phone,
        name: recipient.name,
        status,
      });
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-sms error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
