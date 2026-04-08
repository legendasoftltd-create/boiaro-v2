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
    const client = createClient(supabaseUrl, serviceKey);

    const [
      activeConnections,
      slowQueries,
      tableStats,
      indexUsage,
      cacheHitRatio,
      dbSize,
      lockInfo,
      poolStats,
    ] = await Promise.all([
      client.rpc("get_active_connections").then(r => r.data ?? []),
      client.rpc("get_slow_queries").then(r => r.data ?? []),
      client.rpc("get_table_stats").then(r => r.data ?? []),
      client.rpc("get_index_usage").then(r => r.data ?? []),
      client.rpc("get_cache_hit_ratio").then(r => r.data),
      client.rpc("get_db_size").then(r => r.data),
      client.rpc("get_lock_info").then(r => r.data ?? []),
      client.rpc("get_connection_pool_stats").then(r => r.data),
    ]);

    const connCount = Array.isArray(activeConnections) ? activeConnections.length : 0;
    const slowCount = Array.isArray(slowQueries) ? slowQueries.length : 0;
    const cacheRatio = cacheHitRatio?.ratio ?? 0;
    const saturation = poolStats?.saturation_pct ?? 0;

    let healthScore = 100;
    if (saturation > 80) healthScore -= 25;
    else if (saturation > 60) healthScore -= 15;
    else if (connCount > 30) healthScore -= 10;
    if (slowCount > 10) healthScore -= 20;
    else if (slowCount > 5) healthScore -= 10;
    if (cacheRatio < 0.95) healthScore -= 15;
    if (cacheRatio < 0.90) healthScore -= 15;

    const healthStatus = healthScore >= 80 ? "healthy" : healthScore >= 60 ? "degraded" : "critical";

    return new Response(JSON.stringify({
      health: { score: Math.max(0, healthScore), status: healthStatus },
      connections: { active: connCount, details: activeConnections },
      slow_queries: { count: slowCount, queries: slowQueries },
      pool: poolStats,
      tables: tableStats,
      index_usage: indexUsage,
      cache: cacheHitRatio,
      db_size: dbSize,
      locks: lockInfo,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[db-health-check] Error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Internal error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
