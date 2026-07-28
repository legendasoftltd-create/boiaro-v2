import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ShieldAlert, Activity, Cpu, MemoryStick, HardDrive, Users, Radio,
  AlertTriangle, RefreshCw, Flag, ScrollText, SlidersHorizontal, CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"

const TABS = [
  { value: "health", label: "Server Health", icon: Activity },
  { value: "toggles", label: "Feature Toggles", icon: SlidersHorizontal },
  { value: "reports", label: "Reports", icon: Flag },
  { value: "audit", label: "Audit Log", icon: ScrollText },
] as const

function metricColor(pct: number) {
  if (pct >= 95) return "text-destructive"
  if (pct >= 70) return "text-amber-500"
  return "text-emerald-500"
}

function AdminRadioSafetyHealth() {
  const { data, isLoading, refetch, dataUpdatedAt } = trpc.admin.serverMetrics.useQuery(undefined, {
    refetchInterval: 15_000,
  })

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Last updated: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
      </div>

      {(data?.alerts?.length ?? 0) > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" /> Capacity alerts
            </div>
            {data!.alerts.map((a: any, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">
                <strong className="text-foreground">{a.metric}</strong> at {a.value}% — crossed the {a.threshold}% threshold
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border/30"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Cpu className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">CPU Load</span></div>
          <p className={`text-2xl font-bold ${metricColor(data?.cpuLoadPct ?? 0)}`}>{data?.cpuLoadPct ?? 0}%</p>
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><MemoryStick className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Memory</span></div>
          <p className={`text-2xl font-bold ${metricColor(data?.memoryUsedPct ?? 0)}`}>{data?.memoryUsedPct ?? 0}%</p>
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><HardDrive className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Disk</span></div>
          <p className={`text-2xl font-bold ${metricColor(data?.diskUsedPct ?? 0)}`}>{data?.diskUsedPct ?? "—"}%</p>
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-destructive" /><span className="text-xs text-muted-foreground">Current Listeners</span></div>
          <p className="text-2xl font-bold">{data?.currentListeners ?? 0}</p>
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Radio className="w-4 h-4 text-destructive" /><span className="text-xs text-muted-foreground">Live Sessions</span></div>
          <p className="text-2xl font-bold">{data?.liveSessionCount ?? 0}</p>
        </CardContent></Card>
      </div>

      <p className="text-[11px] text-muted-foreground">{data?.bandwidthNote}</p>
    </div>
  )
}

const TOGGLE_KEYS: { key: string; label: string; help: string }[] = [
  { key: "radio_chat_enabled", label: "Live chat", help: "Blocks chat sending platform-wide when off (history stays visible)" },
  { key: "radio_reactions_enabled", label: "Reactions", help: "Floating emoji reactions" },
  { key: "radio_requests_enabled", label: "Song / topic requests", help: "Blocks request sending platform-wide when off" },
  { key: "radio_catchup_enabled", label: "Catch-up archive", help: "Public catch-up listing returns empty when off" },
  { key: "radio_recording_enabled", label: "Recording", help: "Whether sessions are eligible to have a recording attached" },
  { key: "radio_guest_listening_enabled", label: "Guest listening", help: "Signed-out visitors get a playable stream URL" },
  { key: "radio_callin_enabled", label: "Listener call-in", help: "State machine only — no audio transport yet. Off by default." },
]

const NUMERIC_KEYS: { key: string; label: string; help: string; placeholder: string }[] = [
  { key: "radio_callin_max_concurrent", label: "Max concurrent on-air callers", help: "", placeholder: "1" },
  { key: "radio_max_concurrent_listeners", label: "Max concurrent listeners", help: "Blank = unlimited", placeholder: "unlimited" },
  { key: "radio_reconnect_grace_seconds", label: "Reconnect grace period (seconds)", help: "How long before a dropped host shows as \"Reconnecting\"", placeholder: "120" },
  { key: "radio_reconnect_timeout_seconds", label: "Reconnect timeout (seconds)", help: "Total silence before the session auto-ends", placeholder: "600" },
  { key: "radio_terms_version", label: "Broadcaster terms version", help: "Bump this to force every RJ to re-accept terms before going live", placeholder: "1" },
]

function AdminRadioSafetyToggles() {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.admin.radioSettings.useQuery()
  const [pending, setPending] = useState<Record<string, string>>({})
  const saveMutation = trpc.admin.updateRadioSettings.useMutation({
    onSuccess: () => {
      utils.admin.radioSettings.invalidate()
      setPending({})
      toast.success("Settings saved")
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
  }

  const value = (key: string) => pending[key] ?? (data as Record<string, string>)[key] ?? ""
  const setValue = (key: string, v: string) => setPending((p) => ({ ...p, [key]: v }))
  const hasChanges = Object.keys(pending).length > 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">On / off switches</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {TOGGLE_KEYS.map((t) => (
            <div key={t.key} className="flex items-center justify-between py-2.5 border-b border-border/20 last:border-0">
              <div className="pr-4">
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">{t.help}</p>
              </div>
              <Switch
                checked={value(t.key) === "true"}
                onCheckedChange={(checked) => setValue(t.key, checked ? "true" : "false")}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Limits &amp; timing</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {NUMERIC_KEYS.map((n) => (
            <div key={n.key} className="space-y-1.5">
              <Label className="text-[12px]">{n.label}</Label>
              <Input
                value={value(n.key)}
                onChange={(e) => setValue(n.key, e.target.value)}
                placeholder={n.placeholder}
                className="h-9 text-[13px]"
              />
              {n.help && <p className="text-[11px] text-muted-foreground">{n.help}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate(pending)} disabled={!hasChanges || saveMutation.isPending}>
          {saveMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
          Save changes{hasChanges ? ` (${Object.keys(pending).length})` : ""}
        </Button>
      </div>
    </div>
  )
}

function AdminRadioSafetyReports() {
  const utils = trpc.useUtils()
  const [status, setStatus] = useState<string>("pending")
  const { data: reports = [], isLoading } = trpc.admin.radioReports.useQuery({ status: status || undefined })
  const reviewMutation = trpc.admin.reviewRadioReport.useMutation({
    onSuccess: () => { utils.admin.radioReports.invalidate(); toast.success("Report updated") },
    onError: (e) => toast.error(e.message),
  })

  const statusBadge = (s: string) => {
    const c: Record<string, string> = {
      pending: "bg-amber-500/15 text-amber-500",
      reviewed: "bg-blue-500/15 text-blue-400",
      dismissed: "bg-secondary text-muted-foreground",
      actioned: "bg-emerald-500/15 text-emerald-400",
    }
    return <Badge className={c[s] || "bg-secondary"}>{s}</Badge>
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["pending", "reviewed", "dismissed", "actioned", ""].map((s) => (
          <Button key={s || "all"} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="text-xs">
            {s || "All"}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : reports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No reports{status ? ` with status "${status}"` : ""}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reports as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{r.target_type}</Badge></TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{r.reason}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, status: "reviewed" })}>Reviewed</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, status: "dismissed" })}>Dismiss</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] text-emerald-500" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, status: "actioned" })}>Actioned</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AdminRadioSafetyAudit() {
  const { data: logs = [], isLoading, refetch } = trpc.admin.radioAuditLog.useQuery({ limit: 100 })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No radio actions logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs as any[]).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-medium">{l.action}</TableCell>
                    <TableCell className="text-[11px] font-mono text-muted-foreground">{l.actor_id?.slice(0, 8)}…</TableCell>
                    <TableCell className="text-[11px] font-mono text-muted-foreground max-w-sm truncate">
                      {l.details ? JSON.stringify(l.details) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AdminRadioSafety() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("health")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" /> Radio Safety &amp; Controls
        </h1>
        <p className="text-muted-foreground text-sm">Server health, feature toggles, listener reports, and the radio activity log</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="bg-secondary/40 border border-border/30 h-auto p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-[12px] px-3 py-1.5 gap-1.5">
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "health" && <AdminRadioSafetyHealth />}
      {tab === "toggles" && <AdminRadioSafetyToggles />}
      {tab === "reports" && <AdminRadioSafetyReports />}
      {tab === "audit" && <AdminRadioSafetyAudit />}
    </div>
  )
}
