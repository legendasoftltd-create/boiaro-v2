-- Connection pool monitoring function for PgBouncer readiness
CREATE OR REPLACE FUNCTION public.get_connection_pool_stats()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'max_connections', (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'),
    'current_used', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
    'active', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active'),
    'idle', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle'),
    'idle_in_transaction', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'),
    'waiting', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'),
    'saturation_pct', ROUND(
      (SELECT count(*)::numeric FROM pg_stat_activity WHERE datname = current_database()) /
      NULLIF((SELECT setting::numeric FROM pg_settings WHERE name = 'max_connections'), 0) * 100, 1
    ),
    'avg_idle_seconds', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (now() - state_change))))
      FROM pg_stat_activity
      WHERE datname = current_database() AND state = 'idle' AND state_change IS NOT NULL
    ),
    'longest_idle_seconds', (
      SELECT ROUND(MAX(EXTRACT(EPOCH FROM (now() - state_change))))
      FROM pg_stat_activity
      WHERE datname = current_database() AND state = 'idle' AND state_change IS NOT NULL
    ),
    'by_state', (
      SELECT json_agg(json_build_object('state', COALESCE(state, 'null'), 'count', cnt))
      FROM (SELECT state, count(*) as cnt FROM pg_stat_activity WHERE datname = current_database() GROUP BY state) s
    )
  );
$$;