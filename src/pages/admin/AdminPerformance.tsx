import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge, RefreshCw, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function AdminPerformance() {
  // Edge function performance from analytics
  const { data: edgeLogs = [], refetch } = useQuery({
    queryKey: ["admin-edge-perf"],
    queryFn: async () => {
      // Use system_performance_logs if available
      const { data } = await supabase
        .from("system_performance_logs")
        .select("function_name, response_time_ms, status_code, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    staleTime: 30_000,
  });

  // System logs errors (last 24h)
  const { data: errorLogs = [] } = useQuery({
    queryKey: ["admin-error-rates"],
    queryFn: async () => {
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("system_logs")
        .select("level, created_at, module")
        .in("level", ["error", "critical"])
        .gte("created_at", oneDayAgo)
        .order("created_at", { ascending: true });
      if (!data) return [];
      const byHour: Record<string, number> = {};
      data.forEach(r => {
        const h = r.created_at.slice(0, 13);
        byHour[h] = (byHour[h] || 0) + 1;
      });
      return Object.entries(byHour).map(([hour, count]) => ({ hour: hour.slice(11) + ":00", errors: count }));
    },
    staleTime: 60_000,
  });

  // DB health quick check
  const { data: dbHealth } = useQuery({
    queryKey: ["admin-perf-db"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("db-health-check", { body: {} });
      return data;
    },
    staleTime: 30_000,
  });

  // Aggregate edge function stats
  const fnStats: Record<string, { count: number; avgMs: number; errors: number }> = {};
  edgeLogs.forEach((l: any) => {
    if (!fnStats[l.function_name]) fnStats[l.function_name] = { count: 0, avgMs: 0, errors: 0 };
    fnStats[l.function_name].count++;
    fnStats[l.function_name].avgMs += l.response_time_ms || 0;
    if (l.status_code >= 400) fnStats[l.function_name].errors++;
  });
  const fnStatsArr = Object.entries(fnStats).map(([name, s]) => ({
    name: name.length > 20 ? name.slice(0, 18) + "…" : name,
    fullName: name,
    calls: s.count,
    avgMs: s.count > 0 ? Math.round(s.avgMs / s.count) : 0,
    errors: s.errors,
    errorRate: s.count > 0 ? ((s.errors / s.count) * 100).toFixed(1) : "0",
  })).sort((a, b) => b.calls - a.calls);

  const totalErrors24h = errorLogs.reduce((s, e) => s + e.errors, 0);
  const healthScore = dbHealth?.health?.score ?? 0;
  const healthStatus = dbHealth?.health?.status ?? "unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="w-6 h-6 text-primary" /> Performance Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">API latency, error rates, and system performance</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={healthStatus === "healthy" ? "border-green-500/20" : "border-amber-500/20"}>
          <CardContent className="p-4 text-center">
            {healthStatus === "healthy" ? <CheckCircle2 className="w-5 h-5 mx-auto text-green-500 mb-1" /> : <AlertTriangle className="w-5 h-5 mx-auto text-amber-500 mb-1" />}
            <p className="text-2xl font-bold">{healthScore}/100</p>
            <p className="text-xs text-muted-foreground">DB Health</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{dbHealth?.connections?.active ?? 0}</p>
            <p className="text-xs text-muted-foreground">Active Conns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Gauge className="w-5 h-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">{dbHealth?.slow_queries?.count ?? 0}</p>
            <p className="text-xs text-muted-foreground">Slow Queries</p>
          </CardContent>
        </Card>
        <Card className={totalErrors24h > 10 ? "border-destructive/20" : ""}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto text-destructive mb-1" />
            <p className="text-2xl font-bold">{totalErrors24h}</p>
            <p className="text-xs text-muted-foreground">Errors (24h)</p>
          </CardContent>
        </Card>
      </div>

      {/* Error Rate Over Time */}
      {errorLogs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Error Rate (24h by hour)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={errorLogs}>
                  <XAxis dataKey="hour" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Line type="monotone" dataKey="errors" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Function Performance */}
      {fnStatsArr.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Backend Function Performance</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fnStatsArr.slice(0, 15)} layout="vertical">
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={140} fontSize={10} />
                  <Tooltip formatter={(v: number) => [`${v}ms`, "Avg Latency"]} />
                  <Bar dataKey="avgMs" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1">Function</th>
                    <th className="text-right py-1">Calls</th>
                    <th className="text-right py-1">Avg (ms)</th>
                    <th className="text-right py-1">Errors</th>
                    <th className="text-right py-1">Error %</th>
                  </tr>
                </thead>
                <tbody>
                  {fnStatsArr.map((fn, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="py-1.5 font-mono">{fn.fullName}</td>
                      <td className="text-right font-mono">{fn.calls}</td>
                      <td className="text-right font-mono">{fn.avgMs}ms</td>
                      <td className="text-right font-mono">{fn.errors}</td>
                      <td className="text-right font-mono">{fn.errorRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {fnStatsArr.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No performance logs recorded yet. Logs will populate as backend functions are called.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
