import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: "Invalid session" }, 401);

    const db = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { action } = body;

    // Check if referral system is enabled
    const enabled = await getSetting(db, "referral_enabled", "true");
    if (enabled !== "true" && action !== "get_settings") {
      return json({ error: "Referral system is disabled" }, 400);
    }

    // === COMPLETE REFERRAL (new user was referred) ===
    if (action === "complete_referral") {
      const { referral_code } = body;
      if (!referral_code || typeof referral_code !== "string") {
        return json({ error: "referral_code required" }, 400);
      }

      const code = referral_code.trim().toUpperCase();

      // Find referrer by code
      const { data: referrer } = await db
        .from("profiles")
        .select("user_id, referral_code")
        .eq("referral_code", code)
        .single();

      if (!referrer) return json({ error: "Invalid referral code" }, 400);

      // Anti-fraud: prevent self-referral
      if (referrer.user_id === user.id) {
        return json({ error: "Cannot refer yourself" }, 400);
      }

      // Check if already referred
      const { data: existing } = await db
        .from("referrals")
        .select("id")
        .eq("referred_user_id", user.id)
        .maybeSingle();

      if (existing) return json({ error: "Already referred" }, 400);

      // Check daily limit for referrer
      const maxPerDay = parseInt(await getSetting(db, "referral_max_per_day", "10"));
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const { count } = await db
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", referrer.user_id)
        .gte("created_at", todayStart.toISOString());

      if ((count || 0) >= maxPerDay) {
        return json({ error: "Referrer has reached daily limit" }, 400);
      }

      // Get reward amount
      const rewardAmount = parseInt(await getSetting(db, "referral_signup_reward", "10"));
      const referredBonus = parseInt(await getSetting(db, "referral_referred_bonus", "5"));

      // Create referral record
      await db.from("referrals").insert({
        referrer_id: referrer.user_id,
        referred_user_id: user.id,
        referral_code: code,
        status: "completed",
        reward_amount: rewardAmount,
        reward_status: "paid",
        source: body.source || "link",
        ip_address: req.headers.get("x-forwarded-for") || null,
        completed_at: new Date().toISOString(),
      });

      // Update referred_by on profile
      await db.from("profiles").update({ referred_by: referrer.user_id }).eq("user_id", user.id);

      // Add coins to referrer via secure RPC
      if (rewardAmount > 0) {
        await db.rpc("adjust_user_coins", {
          p_user_id: referrer.user_id,
          p_amount: rewardAmount,
          p_type: "earn",
          p_description: "Referral reward - new user signup",
          p_reference_id: `referral_${user.id}`,
          p_source: "referral",
        });
      }

      // Add bonus to referred user via secure RPC
      if (referredBonus > 0) {
        await db.rpc("adjust_user_coins", {
          p_user_id: user.id,
          p_amount: referredBonus,
          p_type: "earn",
          p_description: "Welcome bonus via referral",
          p_reference_id: `referral_bonus_${referrer.user_id}`,
          p_source: "referral_bonus",
        });
      }

      return json({ success: true, reward: rewardAmount, bonus: referredBonus });
    }

    // === GET USER REFERRAL INFO ===
    if (action === "get_info") {
      const { data: profile } = await db
        .from("profiles")
        .select("referral_code, referred_by")
        .eq("user_id", user.id)
        .single();

      const { data: referrals, count } = await db
        .from("referrals")
        .select("*", { count: "exact" })
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });

      const totalEarned = (referrals || [])
        .filter((r: any) => r.reward_status === "paid")
        .reduce((sum: number, r: any) => sum + (r.reward_amount || 0), 0);

      const pending = (referrals || []).filter((r: any) => r.status === "pending").length;

      return json({
        referral_code: profile?.referral_code || "",
        total_referrals: count || 0,
        total_earned: totalEarned,
        pending_referrals: pending,
        referrals: (referrals || []).slice(0, 50),
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("process-referral error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSetting(client: any, key: string, fallback: string): Promise<string> {
  const { data } = await client
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value || fallback;
}
