import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
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
  AlertTriangle, RefreshCw, Flag, ScrollText, SlidersHorizontal, CheckCircle2, BarChart3, PhoneOff,
} from "lucide-react"
import { toast } from "sonner"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

const TABS = [
  { value: "health", label: "Server Health", icon: Activity },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "toggles", label: "Feature Toggles", icon: SlidersHorizontal },
  { value: "callins", label: "Call-ins", icon: PhoneOff },
  { value: "reports", label: "Reports", icon: Flag },
  { value: "audit", label: "Audit Log", icon: ScrollText },
] as const

function metricColor(pct: number) {
  if (pct >= 95) return "text-destructive"
  if (pct >= 70) return "text-amber-500"
  return "text-emerald-500"
}

const STREAM_HEALTH_BADGE: Record<string, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-400" },
  degraded: { label: "Degraded", className: "bg-amber-500/15 text-amber-400" },
  down: { label: "Down", className: "bg-destructive/15 text-destructive" },
  unknown: { label: "Checking…", className: "bg-muted text-muted-foreground" },
}

function AdminRadioSafetyHealth() {
  const { data, isLoading, refetch, dataUpdatedAt } = trpc.admin.serverMetrics.useQuery(undefined, {
    refetchInterval: 15_000,
  })
  const { data: liveSessions = [] } = trpc.admin.liveSessionsHealth.useQuery(undefined, { refetchInterval: 15_000 })

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

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Radio className="w-4 h-4" /> Live Now ({liveSessions.length})</CardTitle></CardHeader>
        <CardContent>
          {liveSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing live right now.</p>
          ) : (
            <div className="space-y-2">
              {liveSessions.map((s: any) => {
                const badge = STREAM_HEALTH_BADGE[s.streamHealth] ?? STREAM_HEALTH_BADGE.unknown
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.show_title || "Untitled Show"}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.rj_stage_name ?? "Unknown RJ"}{s.station_name ? ` · ${s.station_name}` : ""} · since {new Date(s.started_at).toLocaleTimeString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`shrink-0 ${badge.className}`}>{badge.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-border/30"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><HardDrive className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Recording Storage</span></div>
          <p className="text-xl font-bold">{data?.storageUsedGb ?? 0} GB</p>
          {data?.storageLimitGb ? <p className="text-[10px] text-muted-foreground">of {data.storageLimitGb} GB limit</p> : null}
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Activity className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Bandwidth (30d, est.)</span></div>
          <p className="text-xl font-bold">{data?.estimatedBandwidthGb30d ?? 0} GB</p>
          {data?.bandwidthLimitGb ? <p className="text-[10px] text-muted-foreground">of {data.bandwidthLimitGb} GB/mo limit</p> : null}
        </CardContent></Card>
        {data?.estimatedMonthlyCost != null && (
          <Card className="border-border/30"><CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1"><span className="text-xs text-muted-foreground">Est. Monthly Cost</span></div>
            <p className="text-xl font-bold">{Math.round(data.estimatedMonthlyCost * 100) / 100}</p>
          </CardContent></Card>
        )}
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
  { key: "radio_callin_enabled", label: "Listener call-in", help: "Peer-to-peer WebRTC audio (public STUN only until a TURN relay is provisioned — see docs). Off by default." },
  { key: "radio_chat_links_enabled", label: "Links in chat", help: "Turn off to strip any message containing a URL" },
]

const NUMERIC_KEYS: { key: string; label: string; help: string; placeholder: string }[] = [
  { key: "radio_callin_max_concurrent", label: "Max concurrent on-air callers", help: "", placeholder: "1" },
  { key: "radio_max_concurrent_listeners", label: "Max concurrent listeners", help: "Blank = unlimited", placeholder: "unlimited" },
  { key: "radio_reconnect_grace_seconds", label: "Reconnect grace period (seconds)", help: "How long before a dropped host shows as \"Reconnecting\"", placeholder: "120" },
  { key: "radio_reconnect_timeout_seconds", label: "Reconnect timeout (seconds)", help: "Total silence before the session auto-ends", placeholder: "600" },
  { key: "radio_terms_version", label: "Broadcaster terms version", help: "Bump this to force every RJ to re-accept terms before going live", placeholder: "1" },
  { key: "radio_slow_mode_seconds", label: "Chat slow mode (seconds)", help: "Minimum gap between messages from the same person", placeholder: "2" },
  { key: "radio_duplicate_message_window_seconds", label: "Duplicate message window (seconds)", help: "Blocks an identical repeat from the same person within this window", placeholder: "30" },
  { key: "radio_recording_draft_retention_days", label: "Draft recording retention (days)", help: "Auto-deletes never-published recordings after this long", placeholder: "7" },
  { key: "radio_recording_published_retention_days", label: "Published recording retention (days)", help: "Blank = keep forever", placeholder: "unlimited" },
  { key: "radio_recording_storage_limit_gb", label: "Recording storage limit (GB)", help: "Blank = unlimited — alert-only, nothing auto-deletes to enforce it", placeholder: "unlimited" },
  { key: "radio_monthly_bandwidth_limit_gb", label: "Monthly bandwidth limit (GB)", help: "Blank = unlimited — used for the capacity alert only", placeholder: "unlimited" },
  { key: "radio_estimated_bitrate_kbps", label: "Estimated stream bitrate (kbps)", help: "Used only to compute the bandwidth/cost estimate below", placeholder: "128" },
  { key: "radio_estimated_cost_per_gb", label: "Estimated cost per GB", help: "Your currency, admin-entered — blank disables the cost estimate", placeholder: "0" },
]

const BLOCKED_WORDS_KEY = "radio_blocked_words"

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

      <Card>
        <CardHeader><CardTitle className="text-base">Blocked words</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <Label className="text-[12px]">Comma-separated, case-insensitive</Label>
          <Input
            value={value(BLOCKED_WORDS_KEY)}
            onChange={(e) => setValue(BLOCKED_WORDS_KEY, e.target.value)}
            placeholder="e.g. spam, badword, another phrase"
            className="h-9 text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground">Any chat message or song request containing one of these is rejected.</p>
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

const STAT_LABELS: { key: string; label: string }[] = [
  { key: "totalSessions", label: "Total Sessions" },
  { key: "uniqueListeners", label: "Unique Listeners" },
  { key: "returningListeners", label: "Returning Listeners" },
  { key: "newListeners", label: "New Listeners" },
  { key: "peakConcurrentListeners", label: "Peak Concurrent (Chat)" },
  { key: "icecastPeakListeners", label: "Stream Peak (Icecast)" },
  { key: "icecastAverageListeners", label: "Stream Avg (Icecast)" },
  { key: "totalListeningMinutes", label: "Total Listening (min)" },
  { key: "averageListeningMinutes", label: "Avg. Listening (min)" },
  { key: "newFollowers", label: "New Followers" },
  { key: "chatCount", label: "Chat Messages" },
  { key: "uniqueChatUsers", label: "Unique Chat Users" },
  { key: "reactionCount", label: "Reactions" },
  { key: "requestCount", label: "Song Requests" },
  { key: "catchupPlays", label: "Catch-up Plays" },
  { key: "catchupUniqueListeners", label: "Catch-up Unique Listeners" },
  { key: "catchupCompletionRatePct", label: "Catch-up Completion %" },
]

const GROUP_BY_LABEL: Record<"none" | "rj" | "station" | "show", string> = {
  none: "Nothing", rj: "RJ", station: "STATION", show: "Program",
}

const SERIES_BUCKET_LABEL: Record<"day" | "week" | "month", string> = { day: "Daily", week: "Weekly", month: "Monthly" }

function AdminRadioSafetyAnalytics() {
  const [range, setRange] = useState<"7" | "30" | "90">("30")
  const [groupBy, setGroupBy] = useState<"none" | "rj" | "station" | "show">("none")
  const [bucket, setBucket] = useState<"day" | "week" | "month">("day")
  // Memoized on `range` only — recomputing this fresh on every render (as a
  // bare `new Date(...)` below the hook) was producing a brand-new `from`
  // string each render, which changed the query key, refetched, re-rendered,
  // and recomputed `from` again: an infinite refetch loop (verified live —
  // hundreds of requests/sec). Only needs to change when the user actually
  // picks a different range.
  const from = useMemo(() => new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString(), [range])
  const { data, isLoading } = trpc.admin.radioAnalytics.useQuery({ from, groupBy })
  const { data: seriesData } = trpc.admin.radioAnalyticsSeries.useQuery({ from, bucket })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(["7", "30", "90"] as const).map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)} className="text-xs">Last {r}d</Button>
        ))}
        <span className="text-muted-foreground text-xs mx-1">Group by:</span>
        {(["none", "rj", "station", "show"] as const).map((g) => (
          <Button key={g} size="sm" variant={groupBy === g ? "default" : "outline"} onClick={() => setGroupBy(g)} className="text-xs">{GROUP_BY_LABEL[g]}</Button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STAT_LABELS.map((s) => (
              <Card key={s.key} className="border-border/30"><CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{(data.summary as any)[s.key]}</p>
              </CardContent></Card>
            ))}
          </div>

          {Object.keys(data.summary.deviceBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Device / Platform Breakdown</CardTitle></CardHeader>
              <CardContent className="flex gap-4 flex-wrap">
                {Object.entries(data.summary.deviceBreakdown).map(([platform, count]) => (
                  <div key={platform} className="text-sm"><span className="font-medium capitalize">{platform}</span>: {count as number}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.summary.countryBreakdown && Object.keys(data.summary.countryBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Country Breakdown</CardTitle></CardHeader>
              <CardContent className="flex gap-4 flex-wrap">
                {Object.entries(data.summary.countryBreakdown).map(([country, count]) => (
                  <div key={country} className="text-sm"><span className="font-medium">{country}</span>: {count as number}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.summary.cityBreakdown && Object.keys(data.summary.cityBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">City Breakdown</CardTitle></CardHeader>
              <CardContent className="flex gap-4 flex-wrap">
                {Object.entries(data.summary.cityBreakdown).map(([city, count]) => (
                  <div key={city} className="text-sm"><span className="font-medium">{city}</span>: {count as number}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.summary.qualityBreakdown && Object.keys(data.summary.qualityBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Quality Tier Breakdown</CardTitle></CardHeader>
              <CardContent className="flex gap-4 flex-wrap">
                {Object.entries(data.summary.qualityBreakdown).map(([quality, count]) => (
                  <div key={quality} className="text-sm"><span className="font-medium capitalize">{quality}</span>: {count as number}</div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Listener Trend</CardTitle>
              <div className="flex gap-2">
                {(["day", "week", "month"] as const).map((b) => (
                  <Button key={b} size="sm" variant={bucket === b ? "default" : "outline"} onClick={() => setBucket(b)} className="text-xs">
                    {SERIES_BUCKET_LABEL[b]}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {seriesData && seriesData.series.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={seriesData.series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="uniqueListeners" name="Unique Listeners" stroke="#f97316" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="totalSessions" name="Sessions" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No data for this range.</p>
              )}
            </CardContent>
          </Card>

          {data.groups && data.groups.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">By {GROUP_BY_LABEL[groupBy]}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md px-3 py-2">
                  🏆 Top {GROUP_BY_LABEL[groupBy]} this period: <span className="font-semibold">{(data.groups as any[])[0].label}</span>
                  {" "}({(data.groups as any[])[0].uniqueListeners} unique listeners)
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{GROUP_BY_LABEL[groupBy]}</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Unique Listeners</TableHead>
                        <TableHead className="text-right">Peak (Chat)</TableHead>
                        <TableHead className="text-right">Stream Peak</TableHead>
                        <TableHead className="text-right">Stream Avg</TableHead>
                        <TableHead className="text-right">Avg. Min</TableHead>
                        <TableHead className="text-right">Chat</TableHead>
                        <TableHead className="text-right">Catch-up %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.groups as any[]).map((g) => (
                        <TableRow key={g.key}>
                          <TableCell className="font-medium">{g.label}</TableCell>
                          <TableCell className="text-right">{g.totalSessions}</TableCell>
                          <TableCell className="text-right">{g.uniqueListeners}</TableCell>
                          <TableCell className="text-right">{g.peakConcurrentListeners}</TableCell>
                          <TableCell className="text-right">{g.icecastPeakListeners}</TableCell>
                          <TableCell className="text-right">{g.icecastAverageListeners}</TableCell>
                          <TableCell className="text-right">{g.averageListeningMinutes}</TableCell>
                          <TableCell className="text-right">{g.chatCount}</TableCell>
                          <TableCell className="text-right">{g.catchupCompletionRatePct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function AdminRadioSafetyCallIns() {
  const utils = trpc.useUtils()
  const { data: calls = [], isLoading } = trpc.admin.activeCallIns.useQuery(undefined, { refetchInterval: 5_000 })
  const emergencyEndMutation = trpc.admin.emergencyEndCallIn.useMutation({
    onSuccess: () => { utils.admin.activeCallIns.invalidate(); toast.success("Caller disconnected") },
    onError: (e) => toast.error(e.message),
  })

  const statusBadge = (s: string) => {
    const c: Record<string, string> = {
      waiting: "bg-secondary text-muted-foreground",
      previewing: "bg-amber-500/15 text-amber-500",
      on_air: "bg-destructive/15 text-destructive",
      muted: "bg-blue-500/15 text-blue-400",
    }
    return <Badge className={c[s] || "bg-secondary"}>{s}</Badge>
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Active Call-ins — All Stations</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : calls.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No active call-ins right now.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caller</TableHead>
                <TableHead>Show</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(calls as any[]).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{c.display_name || "Anonymous"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.session?.show_title || "Untitled"}</TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(c.requested_at).toLocaleTimeString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-[11px]"
                      disabled={emergencyEndMutation.isPending}
                      onClick={() => {
                        if (window.confirm("Immediately disconnect this caller from the broadcast?")) {
                          emergencyEndMutation.mutate({ callId: c.id })
                        }
                      }}
                    >
                      <PhoneOff className="w-3 h-3 mr-1" /> Emergency Disconnect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
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
                      <div className="flex justify-end items-center gap-1">
                        {r.live_session_id && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                            <Link to={r.target_type === "recording" ? `/catchup?session=${r.live_session_id}` : `/live/${r.live_session_id}`} target="_blank">
                              {r.target_type === "recording" ? "View Recording" : "View Room"}
                            </Link>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, status: "reviewed" })}>Reviewed</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, status: "dismissed" })}>Dismiss</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] text-emerald-500" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, status: "actioned" })}>
                          {r.target_type === "recording" ? "Unpublish" : "Actioned"}
                        </Button>
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
      {tab === "analytics" && <AdminRadioSafetyAnalytics />}
      {tab === "toggles" && <AdminRadioSafetyToggles />}
      {tab === "callins" && <AdminRadioSafetyCallIns />}
      {tab === "reports" && <AdminRadioSafetyReports />}
      {tab === "audit" && <AdminRadioSafetyAudit />}
    </div>
  )
}
