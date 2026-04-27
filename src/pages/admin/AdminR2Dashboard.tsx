import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Cloud, Server, Activity, AlertTriangle, CheckCircle2, RefreshCw,
  Shield, Zap, BarChart3,
} from "lucide-react";
import { toast } from "sonner";

interface RolloutConfig {
  current_percent: number;
  auto_scale_enabled: boolean;
  min_percent: number;
  max_percent: number;
  scale_up_threshold: number;
  scale_down_threshold: number;
  step_size: number;
  last_adjusted_at: string | null;
  last_adjustment_reason: string | null;
}

interface DayMetrics {
  stat_date: string;
  r2_requests: number;
  origin_requests: number;
  r2_errors: number;
  origin_errors: number;
  r2_signed_url_failures: number;
  playback_successes: number;
  playback_failures: number;
  rollout_percent: number;
  auto_adjusted: boolean;
  error_rate_r2: number;
  error_rate_origin: number;
  fallback_count: number;
  circuit_breaker_tripped?: boolean;
  circuit_breaker_safe_percent?: number | null;
}

interface StatusResponse {
  config: RolloutConfig;
  today: DayMetrics | null;
  history: DayMetrics[];
  circuit_breaker: { tripped: boolean; safe_percent: number | null };
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

function toFiniteNumber(value: string, parser: (raw: string) => number): number | null {
  const parsed = parser(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AdminR2Dashboard() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const [pendingPercent, setPendingPercent] = useState<number | null>(null);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["r2-rollout-status"],
    queryFn: () => utils.admin.r2RolloutStatus.fetch() as Promise<StatusResponse>,
    refetchInterval: 30_000,
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<RolloutConfig> & { reset_circuit_breaker?: boolean }) =>
      utils.admin.updateR2RolloutConfig.fetch(updates as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["r2-rollout-status"] });
      toast.success("R2 config updated");
      setPendingPercent(null);
    },
    onError: (err: any) => toast.error("Update failed: " + err.message),
  });

  const triggerAutoAdjust = useMutation({
    mutationFn: () => utils.admin.autoAdjustR2Rollout.fetch(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["r2-rollout-status"] });
      if (data.adjusted) {
        toast.success(`Rollout adjusted: ${data.old_percent}% → ${data.new_percent}%`);
      } else {
        toast.info(`No adjustment needed (${data.reason})`);
      }
    },
  });

  const updateNumericConfig = (
    field: keyof Pick<RolloutConfig, "scale_up_threshold" | "scale_down_threshold" | "step_size" | "max_percent">,
    rawValue: string,
    parser: (value: string) => number
  ) => {
    const parsed = toFiniteNumber(rawValue, parser);
    if (parsed === null) return;
    updateConfig.mutate({ [field]: parsed } as Partial<RolloutConfig>);
  };

  const config = status?.config;
  const todayData = status?.today;
  const history = status?.history || [];
  const currentPercent = pendingPercent ?? config?.current_percent ?? 0;

  const totalRequestsToday = (todayData?.r2_requests || 0) + (todayData?.origin_requests || 0);
  const totalErrorsToday = (todayData?.r2_errors || 0) + (todayData?.origin_errors || 0);
  const overallErrorRate = totalRequestsToday > 0 ? (totalErrorsToday / totalRequestsToday) * 100 : 0;
  const playbackTotal = (todayData?.playback_successes || 0) + (todayData?.playback_failures || 0);
  const playbackSuccessRate = playbackTotal > 0 ? (todayData!.playback_successes / playbackTotal) * 100 : 100;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">R2 CDN Rollout Dashboard</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cloud className="w-6 h-6 text-primary" />
            R2 CDN Rollout
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control media delivery migration to Cloudflare R2
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => triggerAutoAdjust.mutate()} disabled={triggerAutoAdjust.isPending}>
            <Zap className="w-4 h-4 mr-1" />
            Run Auto-Adjust
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/30">
          <CardContent className="p-3 flex items-center gap-3">
            {overallErrorRate < 3 ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 animate-pulse" />
            )}
            <div>
              <p className="text-xs text-muted-foreground">Error Rate</p>
              <p className="font-bold">{overallErrorRate.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Activity className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Requests</p>
              <p className="font-bold">{fmtNum(totalRequestsToday)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Shield className="w-5 h-5 text-green-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Playback Success</p>
              <p className="font-bold">{playbackSuccessRate.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Server className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Fallbacks</p>
              <p className="font-bold">{fmtNum(todayData?.fallback_count || 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Circuit Breaker Alert */}
      {status?.circuit_breaker?.tripped && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive animate-pulse" />
              <div>
                <p className="font-semibold text-destructive">Circuit Breaker Tripped</p>
                <p className="text-sm text-muted-foreground">
                  R2 error rate exceeded 5%. Rollout automatically reduced to {status.circuit_breaker.safe_percent}%.
                  System is self-protecting. Review errors before resetting.
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => updateConfig.mutate({ reset_circuit_breaker: true } as any)}
              disabled={updateConfig.isPending}
            >
              Reset Circuit Breaker
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cloud className="w-5 h-5" />
            Rollout Percentage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-20">Origin</span>
            <div className="flex-1">
              <Slider
                value={[currentPercent]}
                onValueChange={([v]) => setPendingPercent(v)}
                max={100}
                min={0}
                step={5}
              />
            </div>
            <span className="text-sm text-muted-foreground w-12">R2</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant={currentPercent === 0 ? "secondary" : currentPercent < 50 ? "outline" : "default"}>
                {currentPercent}% → R2
              </Badge>
              <Badge variant="secondary">{100 - currentPercent}% → Origin</Badge>
            </div>
            {pendingPercent !== null && pendingPercent !== config?.current_percent && (
              <Button size="sm" onClick={() => updateConfig.mutate({ current_percent: pendingPercent })} disabled={updateConfig.isPending}>
                Apply
              </Button>
            )}
          </div>

          {config?.last_adjusted_at && (
            <p className="text-xs text-muted-foreground">
              Last auto-adjusted: {new Date(config.last_adjusted_at).toLocaleString()} — {config.last_adjustment_reason}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Auto-Scale Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="w-5 h-5" />
            Auto-Scale Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-scale enabled</Label>
              <p className="text-xs text-muted-foreground">
                Automatically adjust rollout based on error rates
              </p>
            </div>
            <Switch
              checked={config?.auto_scale_enabled || false}
              onCheckedChange={(v) => updateConfig.mutate({ auto_scale_enabled: v })}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Scale Up Below (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={config?.scale_up_threshold ?? 1}
                onChange={(e) => updateNumericConfig("scale_up_threshold", e.target.value, Number.parseFloat)}
                className="h-8 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Scale Down Above (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={config?.scale_down_threshold ?? 3}
                onChange={(e) => updateNumericConfig("scale_down_threshold", e.target.value, Number.parseFloat)}
                className="h-8 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Step Size (%)</Label>
              <Input
                type="number"
                value={config?.step_size ?? 10}
                onChange={(e) => updateNumericConfig("step_size", e.target.value, Number.parseInt)}
                className="h-8 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Max Percent</Label>
              <Input
                type="number"
                value={config?.max_percent ?? 100}
                onChange={(e) => updateNumericConfig("max_percent", e.target.value, Number.parseInt)}
                className="h-8 mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-500" /> R2 Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Requests</span>
              <span className="font-mono">{fmtNum(todayData?.r2_requests || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Errors</span>
              <span className="font-mono text-destructive">{fmtNum(todayData?.r2_errors || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Error Rate</span>
              <Badge variant={
                (todayData?.error_rate_r2 || 0) > 3 ? "destructive" :
                (todayData?.error_rate_r2 || 0) > 1 ? "secondary" : "default"
              }>
                {todayData?.error_rate_r2?.toFixed(2) || "0.00"}%
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Signed URL Failures</span>
              <span className="font-mono">{fmtNum(todayData?.r2_signed_url_failures || 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-green-500" /> Origin Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Requests</span>
              <span className="font-mono">{fmtNum(todayData?.origin_requests || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Errors</span>
              <span className="font-mono text-destructive">{fmtNum(todayData?.origin_errors || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Error Rate</span>
              <Badge variant={
                (todayData?.error_rate_origin || 0) > 3 ? "destructive" : "default"
              }>
                {todayData?.error_rate_origin?.toFixed(2) || "0.00"}%
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Fallback Serves</span>
              <span className="font-mono">{fmtNum(todayData?.fallback_count || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7-Day History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> 7-Day History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No historical data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">R2 Req</TableHead>
                    <TableHead className="text-right">Supa Req</TableHead>
                    <TableHead className="text-right">R2 Err%</TableHead>
                    <TableHead className="text-right">Playback%</TableHead>
                    <TableHead className="text-right">Rollout%</TableHead>
                    <TableHead className="text-center">Auto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row) => {
                    const playTotal = row.playback_successes + row.playback_failures;
                    return (
                      <TableRow key={row.stat_date}>
                        <TableCell className="font-mono text-xs">{row.stat_date}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(row.r2_requests)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(row.origin_requests)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={row.error_rate_r2 > 3 ? "destructive" : row.error_rate_r2 > 1 ? "secondary" : "default"} className="text-xs">
                            {row.error_rate_r2.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {playTotal > 0 ? `${((row.playback_successes / playTotal) * 100).toFixed(0)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{row.rollout_percent}%</TableCell>
                        <TableCell className="text-center">
                          {row.auto_adjusted ? (
                            <Zap className="w-3 h-3 text-amber-500 inline" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
