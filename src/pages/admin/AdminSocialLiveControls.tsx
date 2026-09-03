import { useEffect, useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Radio, Square, AlertTriangle, Loader2, Antenna, Signal, OctagonX, Info, History,
} from "lucide-react"
import { toast } from "sonner"

/**
 * The Social Live control centre.
 *
 * Everything shown here is polled from the server. No control renders its own
 * optimistic state — a button click never decides what the status says, which
 * is the requirement that stops the dashboard claiming a stream is healthy
 * when the encoder disagrees.
 */

const POLL_MS = 3000

function elapsed(since: string | Date): string {
  const ms = Date.now() - new Date(since).getTime()
  if (ms < 0) return "0:00"
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

function StatePill({ state }: { state: string }) {
  const tone: Record<string, string> = {
    LIVE: "border-red-500/50 text-red-500",
    STARTING: "border-amber-500/50 text-amber-500",
    RECONNECTING: "border-amber-500/50 text-amber-500",
    STOPPING: "border-amber-500/50 text-amber-500",
    FAILED: "border-red-600/60 text-red-600",
    OFFLINE: "text-muted-foreground",
  }
  return (
    <Badge variant="outline" className={tone[state] ?? "text-muted-foreground"}>
      {state}
    </Badge>
  )
}

export function SocialLiveControls() {
  const utils = trpc.useUtils()
  const statusQuery = trpc.admin.socialBroadcastStatus.useQuery(undefined, { refetchInterval: POLL_MS })
  const connectionsQuery = trpc.admin.socialBroadcastConnections.useQuery()
  const historyQuery = trpc.admin.socialBroadcastHistory.useQuery({ limit: 10 }, { refetchInterval: POLL_MS * 2 })
  const settingsQuery = trpc.admin.radioSettings.useQuery()
  const updateSettings = trpc.admin.updateRadioSettings.useMutation()
  const startMutation = trpc.admin.startSocialBroadcast.useMutation()
  const stopMutation = trpc.admin.stopSocialBroadcast.useMutation()
  const emergencyMutation = trpc.admin.emergencyStopAllSocialBroadcasts.useMutation()

  const [selected, setSelected] = useState<string[]>([])
  const [dryRun, setDryRun] = useState(true)
  const [, setTick] = useState(0)

  // Re-render once a second so the running duration actually counts up
  // between polls, rather than jumping every few seconds.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const status = statusQuery.data
  const enabledConnections = (connectionsQuery.data ?? []).filter((c) => c.enabled && c.has_stream_key)
  const running = status?.broadcasts?.[0]
  const featureEnabled = status?.featureEnabled ?? false

  const preflightQuery = trpc.admin.socialBroadcastPreflight.useQuery(
    { connectionIds: selected },
    { enabled: selected.length > 0 && !running, refetchInterval: POLL_MS * 2 }
  )

  // Status and history have to move together. Refreshing only the status left
  // the history panel saying "nothing has been broadcast yet" while a
  // broadcast was visibly running above it.
  const refreshAll = () =>
    Promise.all([
      utils.admin.socialBroadcastStatus.invalidate(),
      utils.admin.socialBroadcastHistory.invalidate(),
    ])

  const toggleFeature = async (on: boolean) => {
    try {
      await updateSettings.mutateAsync({ social_live_enabled: on ? "true" : "false" })
      await Promise.all([utils.admin.radioSettings.invalidate(), utils.admin.socialBroadcastStatus.invalidate()])
      toast.success(on ? "Social Live switched on" : "Social Live switched off")
    } catch (e: any) {
      toast.error(e.message || "Could not change that setting")
    }
  }

  const handleStart = async () => {
    try {
      await startMutation.mutateAsync({ connectionIds: selected, dryRun })
      await refreshAll()
      toast.success(dryRun ? "Test encode started — publishing nowhere" : "Broadcast started")
    } catch (e: any) {
      toast.error(e.message || "Could not start the broadcast")
    }
  }

  const handleStop = async (broadcastId: string) => {
    try {
      await stopMutation.mutateAsync({ broadcastId })
      await refreshAll()
      toast.success("Broadcast stopped")
    } catch (e: any) {
      toast.error(e.message || "Could not stop the broadcast")
    }
  }

  const handleEmergency = async () => {
    if (!confirm("Stop every social stream immediately?\n\nBoiAro On Air itself is not affected — the app and website keep broadcasting.")) return
    try {
      const r = await emergencyMutation.mutateAsync()
      await refreshAll()
      toast.success(`Stopped ${r.stopped} stream(s)`)
    } catch (e: any) {
      toast.error(e.message || "Emergency stop failed")
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Status ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Signal className="w-5 h-5" />
            Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">BoiAro On Air</p>
              <div className="flex items-center gap-2">
                <Antenna className={`w-4 h-4 ${status?.onAir ? "text-red-500" : "text-muted-foreground"}`} />
                <span className="font-medium">{status?.onAir ? "On air" : "Off air"}</span>
              </div>
              {status?.currentShow ? (
                <p className="text-xs text-muted-foreground mt-2">
                  {status.currentShow.title || "Untitled show"}
                  {status.currentShow.station ? ` · ${status.currentShow.station}` : ""}
                  <br />
                  started {elapsed(status.currentShow.startedAt)} ago
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">No show is live right now.</p>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Social broadcast</p>
              <div className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${running ? "text-red-500" : "text-muted-foreground"}`} />
                <span className="font-medium">{running ? running.state : "Offline"}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {running
                  ? `running ${elapsed(running.startedAt)} · ${status?.activeEncoders ?? 0} encoder process`
                  : "Nothing is being published."}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Feature</p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{featureEnabled ? "Enabled" : "Switched off"}</span>
                <Switch
                  checked={featureEnabled}
                  disabled={settingsQuery.isLoading || updateSettings.isPending}
                  onCheckedChange={toggleFeature}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                The master switch. With it off, nothing can start a social stream.
              </p>
            </div>
          </div>

          {running ? (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">Destinations</span>
                  {running.destinations.map((d) => (
                    <span key={d.id} className="flex items-center gap-1.5">
                      <span className="text-sm capitalize">{d.platform}</span>
                      <StatePill state={d.state} />
                    </span>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => handleStop(running.id)} disabled={stopMutation.isPending}>
                  {stopMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
                  Stop broadcast
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  On screen:{" "}
                  <span className="font-medium text-foreground">
                    {running.scene === "live"
                      ? "Live"
                      : running.scene === "brb"
                        ? "Be right back"
                        : running.scene === "starting_soon"
                          ? "Starting soon"
                          : running.scene === "ended"
                            ? "Show ended"
                            : "—"}
                  </span>
                </span>
                {running.supervisor ? (
                  <span>
                    Audio source:{" "}
                    <span
                      className={
                        running.supervisor.degraded
                          ? "font-medium text-red-500"
                          : running.supervisor.failures > 0
                            ? "font-medium text-amber-500"
                            : "font-medium text-foreground"
                      }
                    >
                      {running.supervisor.degraded
                        ? "not responding"
                        : running.supervisor.failures > 0
                          ? `missed ${running.supervisor.failures} check(s)`
                          : "healthy"}
                    </span>
                  </span>
                ) : null}
              </div>

              {running.supervisor && running.supervisor.failures > 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-500 flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  The audio feed stopped answering, so the stream is holding on the "be right back" scene rather
                  than ending. It returns to the live scene by itself as soon as the feed is back.
                </p>
              ) : null}

              {running.destinations.some((d) => d.lastError) ? (
                <div className="text-xs text-red-500 space-y-1">
                  {running.destinations.filter((d) => d.lastError).map((d) => (
                    <p key={d.id}>{d.platform}: {d.lastError}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Go live ────────────────────────────────────────────────────── */}
      {!running ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-400" />
              Start a broadcast
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {enabledConnections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No platform is ready yet. Add a connection below, give it a stream key, and enable it.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Broadcast to</Label>
                  <div className="space-y-2">
                    {enabledConnections.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                        <Checkbox
                          checked={selected.includes(c.id)}
                          onCheckedChange={(v) =>
                            setSelected((prev) => (v ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                          }
                        />
                        <span className="text-sm">
                          <span className="capitalize font-medium">{c.platform}</span>
                          <span className="text-muted-foreground"> · {c.account_name}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Test encode only</Label>
                    <p className="text-xs text-muted-foreground">
                      Runs the full pipeline but publishes nowhere. Use it to check the audio source and the
                      server before anything reaches a real audience.
                    </p>
                  </div>
                  <Switch checked={dryRun} onCheckedChange={setDryRun} />
                </div>

                {selected.length > 0 && preflightQuery.data && !preflightQuery.data.ok ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Not ready to start
                    </p>
                    {preflightQuery.data.problems.map((p, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{p.message}</p>
                    ))}
                  </div>
                ) : null}

                {selected.length > 0 && preflightQuery.data?.ok ? (
                  <p className="text-xs text-muted-foreground">
                    Source: <span className="font-mono">{preflightQuery.data.sourceUrl}</span>
                  </p>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    onClick={handleStart}
                    disabled={
                      selected.length === 0 ||
                      startMutation.isPending ||
                      !featureEnabled ||
                      (preflightQuery.data ? !preflightQuery.data.ok : false)
                    }
                  >
                    {startMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />}
                    {dryRun ? "Start test encode" : "Go live"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Emergency ──────────────────────────────────────────────────── */}
      <Card className="border-red-500/30">
        <CardContent className="pt-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm">
            <p className="font-medium flex items-center gap-2">
              <OctagonX className="w-4 h-4 text-red-500" />
              Stop all social streams
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Ends every social broadcast at once. BoiAro On Air is not affected — the app and website keep
              playing throughout.
            </p>
          </div>
          <Button variant="destructive" onClick={handleEmergency} disabled={emergencyMutation.isPending}>
            {emergencyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Emergency stop
          </Button>
        </CardContent>
      </Card>

      {/* ── History ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Recent broadcasts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(historyQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nothing has been broadcast yet.</p>
          ) : (
            <div className="space-y-2">
              {(historyQuery.data ?? []).map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatePill state={b.state} />
                      <span className="text-muted-foreground">
                        {b.destinations.map((d) => d.platform).join(", ") || "no destination"}
                      </span>
                      {b.trigger === "scheduled" ? <Badge variant="outline">scheduled</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(b.startedAt).toLocaleString()}
                      {b.endedAt ? ` · ran ${elapsed2(b.startedAt, b.endedAt)}` : " · still running"}
                      {b.stopReason ? ` · ${b.stopReason.replace(/_/g, " ")}` : ""}
                    </p>
                    {b.destinations.filter((d) => d.lastError).map((d, i) => (
                      <p key={i} className="text-xs text-red-500 mt-1 break-all">{d.platform}: {d.lastError}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function elapsed2(from: string | Date, to: string | Date): string {
  const total = Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${String(s).padStart(2, "0")}s`
}
