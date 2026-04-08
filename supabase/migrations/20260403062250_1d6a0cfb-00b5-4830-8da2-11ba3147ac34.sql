-- Active connections (safe view of pg_stat_activity)
CREATE OR REPLACE FUNCTION public.get_active_connections()
RETURNS TABLE(pid integer, state text, query_start timestamptz, wait_event text, query_preview text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    pid,
    state,
    query_start,
    wait_event_type || ':' || wait_event AS wait_event,
    LEFT(query, 120) AS query_preview
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid != pg_backend_pid()
    AND state IS NOT NULL
  ORDER BY query_start ASC NULLS LAST
  LIMIT 100;
$$;

-- Slow queries (currently running > 500ms)
CREATE OR REPLACE FUNCTION public.get_slow_queries()
RETURNS TABLE(pid integer, duration_ms numeric, state text, query_preview text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    pid,
    ROUND(EXTRACT(EPOCH FROM (now() - query_start)) * 1000) AS duration_ms,
    state,
    LEFT(query, 200) AS query_preview
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND state = 'active'
    AND pid != pg_backend_pid()
    AND query_start < now() - interval '500 milliseconds'
  ORDER BY query_start ASC
  LIMIT 20;
$$;

-- Table stats (row estimates + sizes for critical tables)
CREATE OR REPLACE FUNCTION public.get_table_stats()
RETURNS TABLE(table_name text, estimated_rows bigint, total_size text, index_size text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    relname::text AS table_name,
    reltuples::bigint AS estimated_rows,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_size
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND relname IN (
      'books', 'book_formats', 'orders', 'order_items',
      'content_unlocks', 'user_purchases', 'user_subscriptions',
      'content_access_logs', 'content_access_tokens', 'audiobook_tracks',
      'profiles', 'user_roles', 'coin_transactions', 'contributor_earnings',
      'system_logs', 'reviews', 'book_reads', 'daily_bandwidth_stats',
      'r2_rollout_metrics', 'r2_rollout_config'
    )
  ORDER BY pg_total_relation_size(c.oid) DESC;
$$;

-- Index usage stats
CREATE OR REPLACE FUNCTION public.get_index_usage()
RETURNS TABLE(table_name text, index_name text, idx_scan bigint, idx_tup_read bigint, idx_tup_fetch bigint, size text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    schemaname || '.' || relname AS table_name,
    indexrelname AS index_name,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
  ORDER BY idx_scan DESC
  LIMIT 30;
$$;

-- Cache hit ratio
CREATE OR REPLACE FUNCTION public.get_cache_hit_ratio()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'ratio', ROUND(
      CASE WHEN (blks_hit + blks_read) = 0 THEN 1
      ELSE blks_hit::numeric / (blks_hit + blks_read) END, 4
    ),
    'blocks_hit', blks_hit,
    'blocks_read', blks_read
  )
  FROM pg_stat_database
  WHERE datname = current_database();
$$;

-- DB size
CREATE OR REPLACE FUNCTION public.get_db_size()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'size_pretty', pg_size_pretty(pg_database_size(current_database())),
    'size_bytes', pg_database_size(current_database())
  );
$$;

-- Lock info
CREATE OR REPLACE FUNCTION public.get_lock_info()
RETURNS TABLE(pid integer, lock_type text, relation_name text, mode text, granted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.pid,
    l.locktype AS lock_type,
    COALESCE(c.relname, l.locktype)::text AS relation_name,
    l.mode,
    l.granted
  FROM pg_locks l
  LEFT JOIN pg_class c ON c.oid = l.relation
  WHERE l.pid != pg_backend_pid()
    AND NOT l.granted
  ORDER BY l.pid
  LIMIT 20;
$$;