import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const alerts: Array<{ alert_type: string; severity: string; title: string; message: string; metric_value: number; threshold: number; metadata?: Record<string, unknown> }> = [];

    // 1. Check DB connection saturation
    const { data: poolStats } = await client.rpc("get_connection_pool_stats");
    if (poolStats) {
      const sat = poolStats.saturation_pct ?? 0;
      if (sat > 80) {
        alerts.push({ alert_type: "db_saturation", severity: "critical", title: "DB Connection Saturation Critical", message: `Connection saturation at ${sat}% — risk of connection exhaustion`, metric_value: sat, threshold: 80, metadata: poolStats });
      } else if (sat > 60) {
        alerts.push({ alert_type: "db_saturation", severity: "warning", title: "DB Connection Saturation High", message: `Connection saturation at ${sat}% — monitor closely`, metric_value: sat, threshold: 60, metadata: poolStats });
      }
      if ((poolStats.idle_in_transaction ?? 0) > 0) {
        alerts.push({ alert_type: "db_idle_tx", severity: "warning", title: "Idle-in-Transaction Detected", message: `${poolStats.idle_in_transaction} connections idle in transaction — potential leak`, metric_value: poolStats.idle_in_transaction, threshold: 0 });
      }
    }

    // 2. Check slow queries
    const { data: slowQueries } = await client.rpc("get_slow_queries");
    const slowCount = Array.isArray(slowQueries) ? slowQueries.length : 0;
    if (slowCount > 5) {
      alerts.push({ alert_type: "slow_queries", severity: slowCount > 10 ? "critical" : "warning", title: `${slowCount} Slow Queries Active`, message: `${slowCount} queries running longer than 500ms`, metric_value: slowCount, threshold: 5 });
    }

    // 3. Check R2 rollout metrics for error spikes
    const { data: r2Metrics } = await client.from("r2_rollout_metrics").select("error_count, success_count, created_at").order("created_at", { ascending: false }).limit(10);
    if (r2Metrics && r2Metrics.length > 0) {
      const totalErrors = r2Metrics.reduce((s: number, r: any) => s + (r.error_count || 0), 0);
      const totalSuccess = r2Metrics.reduce((s: number, r: any) => s + (r.success_count || 0), 0);
      const total = totalErrors + totalSuccess;
      if (total > 0) {
        const errorRate = (totalErrors / total) * 100;
        if (errorRate > 5) {
          alerts.push({ alert_type: "r2_errors", severity: "critical", title: "R2 Error Rate Spike", message: `R2 error rate at ${errorRate.toFixed(1)}% — circuit breaker may trigger`, metric_value: errorRate, threshold: 5 });
        } else if (errorRate > 2) {
          alerts.push({ alert_type: "r2_errors", severity: "warning", title: "R2 Error Rate Elevated", message: `R2 error rate at ${errorRate.toFixed(1)}%`, metric_value: errorRate, threshold: 2 });
        }
      }
    }

    // 4. Check bandwidth
    const { data: bwStats } = await client.from("daily_bandwidth_stats").select("total_bytes_served, alert_level").order("stat_date", { ascending: false }).limit(1).maybeSingle();
    if (bwStats && bwStats.alert_level && bwStats.alert_level !== "none" && bwStats.alert_level !== "normal") {
      alerts.push({ alert_type: "bandwidth", severity: bwStats.alert_level === "critical" ? "critical" : "warning", title: "Bandwidth Alert", message: `Daily bandwidth at ${(bwStats.total_bytes_served / (1024 * 1024 * 1024)).toFixed(2)} GB — ${bwStats.alert_level} level`, metric_value: bwStats.total_bytes_served, threshold: 0 });
    }

    // 5. Check cache hit ratio
    const { data: cacheData } = await client.rpc("get_cache_hit_ratio");
    if (cacheData && (cacheData.ratio ?? 1) < 0.95) {
      alerts.push({ alert_type: "cache_ratio", severity: (cacheData.ratio ?? 1) < 0.90 ? "critical" : "warning", title: "Low Cache Hit Ratio", message: `Cache hit ratio at ${((cacheData.ratio ?? 0) * 100).toFixed(1)}% — below 95% threshold`, metric_value: cacheData.ratio ?? 0, threshold: 0.95 });
    }

    // Deduplicate: skip if same alert_type already exists unresolved in last hour
    let inserted = 0;
    for (const alert of alerts) {
      const { data: existing } = await client.from("system_alerts")
        .select("id")
        .eq("alert_type", alert.alert_type)
        .eq("is_resolved", false)
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        await client.from("system_alerts").insert(alert);
        inserted++;
      }
    }

    return new Response(JSON.stringify({
      checked: ["db_saturation", "slow_queries", "r2_errors", "bandwidth", "cache_ratio"],
      alerts_found: alerts.length,
      alerts_inserted: inserted,
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[system-alerts-check] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
