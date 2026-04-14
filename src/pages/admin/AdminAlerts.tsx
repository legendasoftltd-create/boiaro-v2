import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell, CheckCircle2, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import SummaryCard from '@/components/admin/SummaryCard';


interface SystemAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  metric_value: number;
  threshold: number;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

function severityBadge(s: string) {
  if (s === "critical") return <Badge variant="destructive">Critical</Badge>;
  if (s === "warning") return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">Warning</Badge>;
  return <Badge variant="secondary">Info</Badge>;
}

export default function AdminAlerts() {
  const qc = useQueryClient();

  const { data: alerts = [], isLoading, refetch } = useQuery({
    queryKey: ["system-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as SystemAlert[];
    },
    refetchInterval: 30_000,
  });

  const runCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("system-alerts-check", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Check complete: ${d.alerts_found} issues found, ${d.alerts_inserted} new alerts`);
      refetch();
    },
    onError: (e) => toast.error("Check failed: " + e.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("system_alerts")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Alert resolved"); qc.invalidateQueries({ queryKey: ["system-alerts"] }); },
  });

  const unresolved = alerts.filter(a => !a.is_resolved);
  const resolved = alerts.filter(a => a.is_resolved);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-black">
             System Alerts
          </h1>
          <p className="text-sm text-black mt-1">
            Automated platform health monitoring • {unresolved.length} active alerts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
            <Bell className="w-4 h-4 mr-1" /> {runCheck.isPending ? "Checking..." : "Run Check Now"}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        
        <SummaryCard
              icon={`s.icon`}
              title={"Critical"}
              value={unresolved.filter(a => a.severity === "critical").length}
              color="#c4200b"
            />
        
        <SummaryCard
              icon={`s.icon`}
              title={"Warnings"}
              value={unresolved.filter(a => a.severity === "warning").length}
              color="#a13a20"
            />
        
        <SummaryCard
              icon={`s.icon`}
              title={"Resolved"}
              value={resolved.length}
              color="#017B51"
            />
      </div>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Active Alerts ({unresolved.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : unresolved.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-green-500">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">All systems healthy — no active alerts</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unresolved.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>{severityBadge(a.severity)}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.message}</p>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {a.metric_value != null ? Number(a.metric_value).toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => resolve.mutate(a.id)}>
                        <CheckCircle2 className="w-4 h-4" /> Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolved Alerts */}
      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Recently Resolved ({resolved.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Resolved At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolved.slice(0, 20).map(a => (
                  <TableRow key={a.id} className="">
                    <TableCell>{severityBadge(a.severity)}</TableCell>
                    <TableCell className="text-sm">{a.title}</TableCell>
                    <TableCell className="text-xs">{a.resolved_at ? new Date(a.resolved_at).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
