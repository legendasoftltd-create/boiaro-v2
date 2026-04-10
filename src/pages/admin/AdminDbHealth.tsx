import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Database, Activity, AlertTriangle, CheckCircle2, RefreshCw,
  HardDrive, Gauge, Lock, BarChart3, Zap,
  Spade,
  User,
  Timer,
} from "lucide-react";

import SummaryCard from "@/components/admin/SummaryCard";

interface PoolStats {
  max_connections: number;
  current_used: number;
  active: number;
  idle: number;
  idle_in_transaction: number;
  waiting: number;
  saturation_pct: number;
  avg_idle_seconds: number | null;
  longest_idle_seconds: number | null;
  by_state: Array<{ state: string; count: number }>;
}

interface DbHealth {
  health: { score: number; status: string };
  connections: { active: number; details: any[] };
  slow_queries: { count: number; queries: any[] };
  pool: PoolStats | null;
  tables: any[];
  index_usage: any[];
  cache: { ratio: number; blocks_hit: number; blocks_read: number } | null;
  db_size: { size_pretty: string; size_bytes: number } | null;
  locks: any[];
  timestamp: string;
}

function healthColor(status: string) {
  if (status === "healthy") return "text-green-500";
  if (status === "degraded") return "text-amber-500";
  return "text-destructive";
}

function healthBg(status: string) {
  if (status === "healthy") return "border-green-500/20 bg-green-500/5";
  if (status === "degraded") return "border-amber-500/20 bg-amber-500/5";
  return "border-destructive/20 bg-destructive/5";
}

export default function AdminDbHealth() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<DbHealth>({
    queryKey: ["db-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("db-health-check", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Database Health</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
        </div>
      </div>
    );
  }

  const health = data?.health;
  const connections = data?.connections;
  const slowQueries = data?.slow_queries;
  const pool = data?.pool;
  const tables = data?.tables || [];
  const indexUsage = data?.index_usage || [];
  const cache = data?.cache;
  const dbSize = data?.db_size;
  const locks = data?.locks || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-black font-bold flex items-center gap-2">
          Database Health
        </h1>
        <Button className="bg-[#017B51] text-white hover:bg-[#017B51]/80 hover:text-white border-0" variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Health Score */}
      {/* {health && (
        <Card className={healthBg(health.status)}>
          <CardContent className="p-4 flex items-center gap-4">
            {health.status === "healthy" ? (
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            ) : health.status === "degraded" ? (
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-destructive animate-pulse" />
            )}
            <div>
              <p className={`text-xl font-bold ${healthColor(health.status)}`}>
                {health.score}/100 — {health.status.toUpperCase()}
              </p>
              <p className="text-sm text-muted-foreground">
                {connections?.active ?? 0} active connections • {slowQueries?.count ?? 0} slow queries • Cache hit {((cache?.ratio ?? 0) * 100).toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      )} */}




      {/* Connection Pressure Alert */}
      {connections && connections.active > 40 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-destructive animate-pulse" />
            <div>
              <p className="font-semibold text-destructive">Connection Pressure Warning</p>
              <p className="text-sm text-muted-foreground">
                {connections.active} active connections — approaching pool limit.
                Consider enabling PgBouncer (transaction mode) immediately.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3  gap-3">
        {health && (
          <SummaryCard
            icon={health.status === "healthy" ? (
              CheckCircle2
            ) : health.status === "degraded" ? (
              AlertTriangle
            ) : (
              AlertTriangle
            )}
            title={`${connections?.active ?? 0} active connections • ${slowQueries?.count ?? 0} slow queries • Cache hit ${((cache?.ratio ?? 0) * 100).toFixed(1)}%`}
            value={`${health.score}/100 — ${health.status.toUpperCase()}`}
            color="#EF4444"
          />
        )}


        <SummaryCard
          icon={Activity}
          title={`${(pool?.saturation_pct ?? 0) > 70
            ? "HIGH"
            : (pool?.saturation_pct ?? 0) > 40
              ? " MODERATE"
              : " OK"} / ${pool?.max_connections ?? 90} max (${pool?.saturation_pct ?? 0}%)`}
          value={pool?.current_used ?? connections?.active ?? 0}
          color="#017B51"
        />

        
        <SummaryCard
          icon={Gauge}
          title="Slow Queries"
          value={slowQueries?.count ?? 0}
          color="#017B51"
        />

        <SummaryCard
          icon={Zap}
          title="Cache Hit"
          value={`${((cache?.ratio ?? 0) * 100).toFixed(1)}%`}
          color="#017B51"
        />

        <SummaryCard
          icon={HardDrive}
          title="DB Size"
          value={dbSize?.size_pretty ?? "—"}
          color="#017B51"
        />

        <SummaryCard
          icon={Lock}
          title="Blocked Locks"
          value={locks.length}
          color="#017B51"
        />

      </div>

      {/* Connection Pool Stats */}
      {pool && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 mb-2">
              Connection Pool
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">

              {/* <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Used / Max</p>
                <p className="text-lg font-bold">{pool.current_used} / {pool.max_connections}</p>
              </div> */}

              <SummaryCard
                icon={User}
                title="Used / Max"
                value={`${pool.current_used} / ${pool.max_connections}`}
                color="#017B51"
              />

              {/* <div className={`p-3 rounded-lg ${pool.saturation_pct > 70 ? "bg-destructive/10" : pool.saturation_pct > 50 ? "bg-amber-500/10" : "bg-green-500/10"}`}>
                <p className="text-xs text-muted-foreground">Saturation</p>
                <p className="text-lg font-bold">{pool.saturation_pct}%</p>
              </div> */}

              <SummaryCard
                icon={User}
                title="Saturation"
                value={`${pool.saturation_pct}%`}
                color={` ${pool.saturation_pct > 70 ? "#017B51" : pool.saturation_pct > 50 ? "#F5005B" : "#017B51"}`}
              />

              {/* <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Active / Idle</p>
                <p className="text-lg font-bold">{pool.active} / {pool.idle}</p>
              </div> */}
              <SummaryCard
                  icon={Activity}
                  title="Active / Idle"
                  value={`${pool.active} / ${pool.idle}`}
                  color="#017B51"
                />

              {/* <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Avg Idle Time</p>
                <p className="text-lg font-bold">{pool.avg_idle_seconds != null ? `${Math.round(pool.avg_idle_seconds)}s` : "—"}</p>
              </div> */}

              <SummaryCard
                  icon={Timer}
                  title="Avg Idle Time"
                  value={
                      pool.avg_idle_seconds != null
                        ? `${Math.round(pool.avg_idle_seconds)}s`
                        : "—"
                    }
                  color="#017B51"
                />

            </div>
            {pool.waiting > 0 && (
              <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-sm">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="font-medium">{pool.waiting} connections waiting for locks</span>
              </div>
            )}
            {pool.idle_in_transaction > 0 && (
              <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 text-sm mt-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{pool.idle_in_transaction} idle-in-transaction (potential leak)</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Slow Queries */}
      {(slowQueries?.queries?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
               Active Slow Queries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PID</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Query</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowQueries!.queries.map((q: any) => (
                    <TableRow key={q.pid}>
                      <TableCell className="font-mono text-xs">{q.pid}</TableCell>
                      <TableCell>
                        <Badge variant={q.duration_ms > 5000 ? "destructive" : "secondary"}>
                          {q.duration_ms > 1000 ? `${(q.duration_ms / 1000).toFixed(1)}s` : `${q.duration_ms}ms`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{q.state}</TableCell>
                      <TableCell className="text-xs font-mono max-w-md truncate">{q.query_preview}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table Sizes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
             Table Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">Est. Rows</TableHead>
                  <TableHead className="text-right">Total Size</TableHead>
                  <TableHead className="text-right">Index Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t: any) => (
                  <TableRow key={t.table_name}>
                    <TableCell className="font-mono text-xs">{t.table_name}</TableCell>
                    <TableCell className="text-right font-mono">{(t.estimated_rows ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{t.total_size}</TableCell>
                    <TableCell className="text-right font-mono">{t.index_size}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top Indexes by Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
             Index Usage (Top 20)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Index</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">Scans</TableHead>
                  <TableHead className="text-right">Rows Read</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indexUsage.slice(0, 20).map((idx: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{idx.index_name}</TableCell>
                    <TableCell className="text-xs">{idx.table_name}</TableCell>
                    <TableCell className="text-right font-mono">{(idx.idx_scan ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{(idx.idx_tup_read ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{idx.size}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Active Connections */}
      {(connections?.details?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
               Active Connections ({connections!.active})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PID</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Wait</TableHead>
                    <TableHead>Query</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections!.details.slice(0, 30).map((c: any) => (
                    <TableRow key={c.pid}>
                      <TableCell className="font-mono text-xs">{c.pid}</TableCell>
                      <TableCell>
                        <Badge variant={c.state === "active" ? "default" : "secondary"} className="text-xs">
                          {c.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{c.wait_event || "—"}</TableCell>
                      <TableCell className="text-xs font-mono max-w-sm truncate">{c.query_preview || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PgBouncer Readiness & Scaling */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Pooling Readiness</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-4 ">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-[#017B51]/80   text-white">
            <p className="font-semibold mb-2 text-white">Migration Steps</p>
            <ol className="text-xs space-y-1.5 list-decimal list-inside">
              <li>Switch connection string to pooler port (6543 instead of 5432)</li>
              <li>Set pool mode to <code className="bg-muted px-1 rounded">transaction</code></li>
              <li>Set pool size to 15–25 per service</li>
              <li>Test with staging traffic before production cutover</li>
              <li>Monitor idle connection count — should drop 50–70%</li>
            </ol>
          </div>

          <div className="p-3 rounded-lg bg-[#017B51]/80   text-white">
            <p className="font-semibold mb-2">PgBouncer Checklist (Transaction Mode)</p>
            <ul className="text-xs space-y-1.5">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                No PREPARE statements in application code
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                No SET session variables (Supabase client uses none)
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                No LISTEN/NOTIFY in app code (only PostgREST internal)
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                All queries are short-lived (no long transactions)
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                Presence heartbeat debounced (45s intervals)
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                Access checks use single RPC call (was 3 queries)
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                5-min React Query caching reduces DB hits
              </li>
            </ul>
          </div>

          </div>

          

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="font-semibold text-green-600 mb-1">≤ 1,500 users</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>✓ Current setup (optimized)</li>
                <li>✓ Single RPC access checks</li>
                <li>✓ Debounced presence</li>
                <li>✓ Batch signed URLs</li>
              </ul>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="font-semibold text-amber-600 mb-1">1,500–5,000 users</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>→ Enable PgBouncer</li>
                <li>→ Upgrade instance size</li>
                <li>→ R2 CDN at 100%</li>
                <li>→ Read replicas for analytics</li>
              </ul>
            </div>
            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <p className="font-semibold text-destructive mb-1">5,000–10,000+ users</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>→ Dedicated DB instance</li>
                <li>→ Redis for session/access cache</li>
                <li>→ CDN edge caching</li>
                <li>→ Horizontal edge scaling</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
