import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { action = "get_status" } = body;

    if (action === "get_status") {
      return jsonResponse(await getStatus(client));
    }

    if (action === "report_metrics") {
      return jsonResponse(await reportMetrics(client, body));
    }

    if (action === "auto_adjust") {
      return jsonResponse(await autoAdjust(client));
    }

    if (action === "set_config") {
      return jsonResponse(await setConfig(client, req, body, supabaseUrl, anonKey));
    }

    if (action === "retry_queue_status") {
      return jsonResponse(await getRetryQueueStatus(client));
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[r2-rollout-controller] Error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// ── GET STATUS ──
async function getStatus(client: any) {
  const [config, todayMetrics, weekMetrics] = await Promise.all([
    client.from("r2_rollout_config").select("*").eq("id", 1).single(),
    client.from("r2_rollout_metrics").select("*").eq("stat_date", today()).maybeSingle(),
    client.from("r2_rollout_metrics").select("*").gte("stat_date", daysAgo(7)).order("stat_date", { ascending: false }),
  ]);

  return {
    config: config.data,
    today: todayMetrics.data,
    history: weekMetrics.data || [],
    circuit_breaker: {
      tripped: todayMetrics.data?.circuit_breaker_tripped ?? false,
      safe_percent: todayMetrics.data?.circuit_breaker_safe_percent ?? null,
    },
  };
}

// ── REPORT METRICS ──
async function reportMetrics(client: any, body: any) {
  const {
    r2_requests = 0, supabase_requests = 0,
    r2_errors = 0, supabase_errors = 0,
    r2_signed_url_failures = 0,
    playback_successes = 0, playback_failures = 0,
    fallback_count = 0,
  } = body;

  const { data: existing } = await client
    .from("r2_rollout_metrics")
    .select("*")
    .eq("stat_date", today())
    .maybeSingle();

  const { data: config } = await client
    .from("r2_rollout_config")
    .select("current_percent")
    .eq("id", 1)
    .single();

  const newR2Req = (existing?.r2_requests || 0) + r2_requests;
  const newSupaReq = (existing?.supabase_requests || 0) + supabase_requests;
  const newR2Err = (existing?.r2_errors || 0) + r2_errors;
  const newSupaErr = (existing?.supabase_errors || 0) + supabase_errors;
  const newR2SigFail = (existing?.r2_signed_url_failures || 0) + r2_signed_url_failures;
  const newPlayOk = (existing?.playback_successes || 0) + playback_successes;
  const newPlayFail = (existing?.playback_failures || 0) + playback_failures;
  const newFallback = (existing?.fallback_count || 0) + fallback_count;

  const errorRateR2 = newR2Req > 0 ? Number(((newR2Err / newR2Req) * 100).toFixed(2)) : 0;
  const errorRateSupa = newSupaReq > 0 ? Number(((newSupaErr / newSupaReq) * 100).toFixed(2)) : 0;

  // ── Anomaly detection: sudden fallback spike ──
  const prevFallback = existing?.fallback_count || 0;
  const fallbackDelta = newFallback - prevFallback;
  const anomalyDetected = fallbackDelta > 10 && fallback_count > 5;

  await client.from("r2_rollout_metrics").upsert({
    stat_date: today(),
    r2_requests: newR2Req,
    supabase_requests: newSupaReq,
    r2_errors: newR2Err,
    supabase_errors: newSupaErr,
    r2_signed_url_failures: newR2SigFail,
    playback_successes: newPlayOk,
    playback_failures: newPlayFail,
    rollout_percent: config?.current_percent || 0,
    error_rate_r2: errorRateR2,
    error_rate_supabase: errorRateSupa,
    fallback_count: newFallback,
  }, { onConflict: "stat_date" });

  // ── Self-healing: circuit breaker at >5% error rate ──
  if (errorRateR2 > 5 && newR2Req >= 20) {
    await triggerCircuitBreaker(client, errorRateR2, config?.current_percent || 0);
  }

  // ── Anomaly: log sudden fallback increase ──
  if (anomalyDetected) {
    await logAnomaly(client, "fallback_spike", {
      fallback_delta: fallbackDelta,
      total_fallback: newFallback,
      r2_error_rate: errorRateR2,
    });
  }

  return { success: true, error_rate_r2: errorRateR2, anomaly: anomalyDetected };
}

// ── CIRCUIT BREAKER ──
async function triggerCircuitBreaker(client: any, errorRate: number, currentPercent: number) {
  const safePercent = Math.max(0, Math.min(10, Math.floor(currentPercent * 0.2)));

  await client.from("r2_rollout_config").update({
    current_percent: safePercent,
    last_adjusted_at: new Date().toISOString(),
    last_adjustment_reason: `CIRCUIT_BREAKER: error_rate ${errorRate}% > 5%, reduced ${currentPercent}% → ${safePercent}%`,
  }).eq("id", 1);

  await client.from("r2_rollout_metrics").update({
    circuit_breaker_tripped: true,
    circuit_breaker_safe_percent: safePercent,
    auto_adjusted: true,
    rollout_percent: safePercent,
  }).eq("stat_date", today());

  // Notify admins via system_logs
  await client.rpc("upsert_system_log", {
    p_level: "critical",
    p_module: "r2_circuit_breaker",
    p_message: `R2 circuit breaker tripped! Error rate ${errorRate}% exceeds 5%. Rollout reduced from ${currentPercent}% to ${safePercent}%.`,
    p_metadata: { error_rate: errorRate, old_percent: currentPercent, safe_percent: safePercent },
    p_fingerprint: `cb_trip_${today()}`,
  });

  console.error(`[CIRCUIT BREAKER] R2 error rate ${errorRate}% — rollout reduced to ${safePercent}%`);
}

// ── ANOMALY LOGGER ──
async function logAnomaly(client: any, type: string, metadata: Record<string, unknown>) {
  await client.rpc("upsert_system_log", {
    p_level: "warning",
    p_module: "r2_anomaly",
    p_message: `Anomaly detected: ${type}`,
    p_metadata: { type, ...metadata, detected_at: new Date().toISOString() },
    p_fingerprint: `anomaly_${type}_${today()}`,
  });
}

// ── AUTO ADJUST ──
async function autoAdjust(client: any) {
  const { data: config } = await client
    .from("r2_rollout_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (!config) return { error: "Config not found" };
  if (!config.auto_scale_enabled) {
    return { adjusted: false, reason: "auto_scale_disabled", current_percent: config.current_percent };
  }

  const { data: metrics } = await client
    .from("r2_rollout_metrics")
    .select("*")
    .eq("stat_date", today())
    .maybeSingle();

  if (!metrics || metrics.r2_requests < 50) {
    return { adjusted: false, reason: "insufficient_data", r2_requests: metrics?.r2_requests || 0 };
  }

  // Don't auto-increase if circuit breaker tripped today
  if (metrics.circuit_breaker_tripped) {
    return { adjusted: false, reason: "circuit_breaker_active", current_percent: config.current_percent };
  }

  const errorRate = metrics.error_rate_r2;
  let newPercent = config.current_percent;
  let reason = "no_change";

  if (errorRate > config.scale_down_threshold) {
    newPercent = Math.max(config.min_percent, config.current_percent - config.step_size * 2);
    reason = `error_rate_high (${errorRate}% > ${config.scale_down_threshold}%)`;
  } else if (errorRate < config.scale_up_threshold && config.current_percent < config.max_percent) {
    newPercent = Math.min(config.max_percent, config.current_percent + config.step_size);
    reason = `error_rate_low (${errorRate}% < ${config.scale_up_threshold}%)`;
  }

  if (newPercent !== config.current_percent) {
    await client.from("r2_rollout_config").update({
      current_percent: newPercent,
      last_adjusted_at: new Date().toISOString(),
      last_adjustment_reason: reason,
    }).eq("id", 1);

    await client.from("r2_rollout_metrics").update({
      auto_adjusted: true,
      rollout_percent: newPercent,
    }).eq("stat_date", today());

    console.log(`[r2-rollout] Auto-adjusted: ${config.current_percent}% → ${newPercent}% (${reason})`);
  }

  return {
    adjusted: newPercent !== config.current_percent,
    old_percent: config.current_percent,
    new_percent: newPercent,
    error_rate: errorRate,
    reason,
  };
}

// ── SET CONFIG (admin only) ──
async function setConfig(client: any, req: Request, body: any, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { error: "Unauthorized" };

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: claimsData } = await anonClient.auth.getClaims(token);
  if (!claimsData?.claims?.sub) return { error: "Unauthorized" };

  const userId = claimsData.claims.sub as string;
  const { data: isAdmin } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return { error: "Admin access required" };

  const updates: Record<string, unknown> = {};
  if (body.current_percent !== undefined) updates.current_percent = Math.max(0, Math.min(100, body.current_percent));
  if (body.auto_scale_enabled !== undefined) updates.auto_scale_enabled = Boolean(body.auto_scale_enabled);
  if (body.min_percent !== undefined) updates.min_percent = body.min_percent;
  if (body.max_percent !== undefined) updates.max_percent = body.max_percent;
  if (body.scale_up_threshold !== undefined) updates.scale_up_threshold = body.scale_up_threshold;
  if (body.scale_down_threshold !== undefined) updates.scale_down_threshold = body.scale_down_threshold;
  if (body.step_size !== undefined) updates.step_size = body.step_size;
  // Allow admin to reset circuit breaker
  if (body.reset_circuit_breaker === true) {
    await client.from("r2_rollout_metrics").update({
      circuit_breaker_tripped: false,
      circuit_breaker_safe_percent: null,
    }).eq("stat_date", today());
  }

  if (Object.keys(updates).length === 0 && !body.reset_circuit_breaker) {
    return { error: "No valid fields to update" };
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await client.from("r2_rollout_config").update(updates).eq("id", 1);
    if (error) return { error: error.message };
  }

  return { success: true, updated: updates, circuit_breaker_reset: body.reset_circuit_breaker || false };
}

// ── RETRY QUEUE STATUS ──
async function getRetryQueueStatus(client: any) {
  const { data } = await client
    .from("r2_retry_queue")
    .select("status, count(*)")
    .then((r: any) => r);

  // Simple aggregate from retry queue
  const { data: pending } = await client
    .from("r2_retry_queue")
    .select("id")
    .eq("status", "pending")
    .limit(1);

  const { data: recent } = await client
    .from("r2_retry_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return { queue: recent || [], has_pending: (pending?.length || 0) > 0 };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
