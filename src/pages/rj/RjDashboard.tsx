import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { useRjProfile, useMyLiveSession, useBroadcastToken, useRjTerms } from "@/hooks/useLiveSession"
import { useRadioStations } from "@/hooks/useRadioStation"
import { useSiteSettings } from "@/hooks/useSiteSettings"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Radio, Mic, MicOff, Loader2, AlertTriangle, Clock, Wifi, MessageCircle, KeyRound, Copy, ShieldCheck, Antenna, Megaphone, PhoneCall } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { AudioFileUpload } from "@/components/admin/AudioFileUpload"
import { BroadcastSettingsForm, DEFAULT_BROADCAST_SETTINGS, type BroadcastSettingsValue } from "@/components/rj/BroadcastSettingsForm"
import { Checkbox } from "@/components/ui/checkbox"

// Keep in sync with server/src/lib/rjTermsClauses.ts's RJ_TERMS_CLAUSE_KEYS —
// itemized broadcaster-terms clauses, replacing one blanket checkbox.
// Mirrors server/src/lib/icecastMount.ts's deriveIcecastMountPath: a
// station's stream_url is the public *listening* URL (reverse-proxied
// through this same prefix), not the raw Icecast mount an encoder connects
// to — the mount is whatever's left after stripping it.
const ICECAST_PROXY_PREFIX = "/radio-stream"
function deriveMountFromStreamUrl(streamUrl: string): string | null {
  try {
    const path = new URL(streamUrl).pathname
    return path.startsWith(ICECAST_PROXY_PREFIX + "/") ? path.slice(ICECAST_PROXY_PREFIX.length) : path
  } catch {
    return null
  }
}

const TERMS_CLAUSES: { key: string; label: string }[] = [
  { key: "prohibited_content", label: "I will only broadcast music/content I own or am licensed to play, and I'm responsible for copyright compliance." },
  { key: "recording_consent", label: "I consent to the platform recording my broadcasts for catch-up playback." },
  { key: "callin_consent", label: "I understand listener call-ins (where enabled) may be recorded and are subject to moderation." },
  { key: "complaint_system", label: "I understand listeners and rights-holders can file complaints against my content through the platform's reporting system." },
  { key: "unpublish_on_complaint", label: "I understand a recording may be unpublished without prior notice if a complaint against it is upheld." },
]

export default function RjDashboard() {
  const { profile } = useRjProfile()
  const { session: liveSession, goLive, endLive } = useMyLiveSession()
  const { status: tokenStatus, regenerate: regenerateToken, revoke: revokeToken, isRegenerating } = useBroadcastToken()
  const { status: termsStatus, accept: acceptTerms, isAccepting } = useRjTerms()
  const { get: getSetting, isLoading: settingsLoading } = useSiteSettings()
  const { data: stations } = useRadioStations()
  // The admin-managed programming schedule and this "Go Live" form used to
  // be completely disconnected — nothing here knew what the schedule said
  // this RJ should be broadcasting right now, so the station picker just
  // defaulted to whichever station happened to be first in the list.
  // Confirmed live: an RJ scheduled for one station went live on a
  // different one because of exactly this gap.
  const { data: currentShow } = trpc.rj.myCurrentShow.useQuery()

  const broadcastHost = getSetting("radio_broadcast_host")
  const broadcastPort = getSetting("radio_broadcast_port")
  const broadcastMount = getSetting("radio_broadcast_mount")
  const publicStreamUrl = getSetting("radio_public_stream_url")

  const [stationId, setStationId] = useState("")
  const [streamUrl, setStreamUrl] = useState("")
  // The Broadcast Setup card below used to always show the site-wide
  // radio_broadcast_mount setting, regardless of which station was actually
  // selected — harmless back when every station shared one mount, but with
  // multiple stations now expected to have distinct mounts (see the
  // station-uniqueness fix), that static value silently told the RJ to
  // point their encoder at the *wrong* mount whenever they picked any
  // station other than whichever one the global setting happened to match.
  // Reproduced live: a station showed as live with the right RJ/details,
  // but never actually received audio, while a *different* station started
  // unexpectedly playing that RJ's stream — the encoder was still pointed
  // at the old global mount instead of the selected station's.
  const effectiveMount = deriveMountFromStreamUrl(streamUrl) || broadcastMount
  const [broadcastSettings, setBroadcastSettings] = useState<BroadcastSettingsValue>(DEFAULT_BROADCAST_SETTINGS)
  const [broadcastToken, setBroadcastToken] = useState("")
  const [isTestBroadcast, setIsTestBroadcast] = useState(false)
  const [isGoingLive, setIsGoingLive] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)

  const needsTerms = !!termsStatus?.needsAcceptance

  useEffect(() => {
    document.title = "RJ Dashboard — BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [])

  // Defaults the station to whatever the schedule says this RJ should be
  // broadcasting right now, if anything — otherwise falls back to the
  // first active station so a fresh RJ doesn't have to know to pick one,
  // and finally to the old single-station behavior (platform's public
  // stream URL, no station attached) when there are no stations at all.
  // currentShow can still arrive after stations/the first-station default
  // already ran, so this re-checks even once stationId is set — but only
  // ever overrides an *auto*-picked station, never one the RJ chose.
  const [stationAutoPicked, setStationAutoPicked] = useState(true)
  useEffect(() => {
    if (stationId && !stationAutoPicked) return
    if (currentShow) {
      if (currentShow.station_id !== stationId) {
        setStationId(currentShow.station_id)
        setStreamUrl(currentShow.station.stream_url)
        setBroadcastSettings((f) => ({ ...f, showTitle: f.showTitle || currentShow.show_title }))
      }
      return
    }
    if (stationId) return
    if (stations && stations.length > 0) {
      setStationId(stations[0].id)
      setStreamUrl(stations[0].stream_url)
    } else if (publicStreamUrl) {
      setStreamUrl(publicStreamUrl)
    }
  }, [stations, publicStreamUrl, currentShow, stationId, stationAutoPicked])

  const handleStationChange = (value: string) => {
    setStationAutoPicked(false)
    if (value === "__none__") {
      setStationId("")
      return
    }
    setStationId(value)
    const station = stations?.find((s) => s.id === value)
    if (station) setStreamUrl(station.stream_url)
  }

  const handleGenerateToken = async () => {
    try {
      const result = await regenerateToken()
      setFreshToken(result.token)
      setBroadcastToken(result.token)
      toast.success("New broadcast token generated — copy it now, it won't be shown again")
    } catch (err: any) {
      toast.error(err.message || "Failed to generate token")
    }
  }

  const [checkedClauses, setCheckedClauses] = useState<Record<string, boolean>>({})
  const allClausesChecked = TERMS_CLAUSES.every((c) => checkedClauses[c.key])

  const handleAcceptTerms = async () => {
    try {
      await acceptTerms(TERMS_CLAUSES.map((c) => c.key))
      toast.success("Broadcaster terms accepted")
      setCheckedClauses({})
    } catch (err: any) {
      toast.error(err.message || "Failed to accept terms")
    }
  }

  const handleGoLive = async () => {
    if (!streamUrl.trim()) {
      toast.error("Please enter your stream URL")
      return
    }
    if (!broadcastToken.trim()) {
      toast.error("Enter your broadcast token — generate one below if you don't have it")
      return
    }
    if (!profile?.is_approved) {
      toast.error("Your account is not yet approved by admin")
      return
    }
    if (needsTerms) {
      toast.error("Accept the broadcaster terms first")
      return
    }

    setIsGoingLive(true)
    try {
      await goLive({
        streamUrl: streamUrl.trim(),
        showTitle: broadcastSettings.showTitle.trim() || undefined,
        description: broadcastSettings.description.trim() || undefined,
        coverImageUrl: broadcastSettings.coverImageUrl.trim() || undefined,
        category: broadcastSettings.category.trim() || undefined,
        stationId: stationId || undefined,
        broadcastToken: broadcastToken.trim(),
        isTest: isTestBroadcast,
        chatEnabled: broadcastSettings.chatEnabled,
        requestsEnabled: broadcastSettings.requestsEnabled,
        recordingEnabled: broadcastSettings.recordingEnabled,
        callinEnabled: broadcastSettings.callinEnabled,
      })
      toast.success(isTestBroadcast ? "🔧 Test broadcast started (private — not visible to listeners)" : "🎙️ You are now LIVE!")
    } catch (err: any) {
      toast.error(err.message || "Failed to go live")
    }
    setIsGoingLive(false)
  }

  const handleEndLive = async () => {
    setIsEnding(true)
    try {
      await endLive()
      toast.success("Live session ended")
    } catch {
      toast.error("Failed to end session")
    }
    setIsEnding(false)
  }

  const isLive = liveSession?.status === "live" || liveSession?.status === "reconnecting"
  const isReconnecting = liveSession?.status === "reconnecting"
  const { data: streamHealth } = trpc.rj.liveSession.streamHealth.useQuery(
    { sessionId: liveSession?.id ?? "" },
    { enabled: isLive && !!liveSession?.id, refetchInterval: 20_000 }
  )
  // Call-in requests otherwise only ever surface on the separate /live chat
  // page — an RJ who stays on this dashboard has no way to know someone's
  // waiting. Found live: two real requests sat unanswered indefinitely
  // because of exactly this (confirmed via their CallInRequest rows —
  // created, never responded to).
  const { data: callInQueue = [] } = trpc.rj.callIn.queue.useQuery(
    { sessionId: liveSession?.id ?? "" },
    { enabled: isLive && !!liveSession?.id && !!liveSession?.callin_enabled, refetchInterval: 5_000 }
  )
  const pendingCallIns = callInQueue.filter((c: any) => c.status === "requested")

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-serif">RJ Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Welcome, {profile?.stage_name || "Radio Jockey"}
        </p>
      </div>

      {needsTerms && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <ShieldCheck className="w-4 h-4" /> Broadcaster terms require your acceptance
            </div>
            <p className="text-xs text-muted-foreground">
              Please read and individually confirm each of the following before you can go live:
            </p>
            <div className="space-y-2.5">
              {TERMS_CLAUSES.map((c) => (
                <label key={c.key} className="flex items-start gap-2.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={!!checkedClauses[c.key]}
                    onCheckedChange={(v) => setCheckedClauses((prev) => ({ ...prev, [c.key]: !!v }))}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">{c.label}</span>
                </label>
              ))}
            </div>
            <Button size="sm" onClick={handleAcceptTerms} disabled={isAccepting || !allClausesChecked}>
              {isAccepting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              I Accept All of the Above
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Broadcast setup — where to point your encoder */}
      {!settingsLoading && broadcastHost && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Antenna className="w-4 h-4" /> Broadcast Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Configure BUTT, Mixxx, or any Icecast-compatible encoder with these details, then start
              broadcasting there before clicking Go Live below.
            </p>
            <div className="text-xs bg-muted/50 rounded-lg p-3 space-y-1 font-mono">
              <p><span className="text-muted-foreground font-sans">Host:</span> {broadcastHost}</p>
              <p><span className="text-muted-foreground font-sans">Port:</span> {broadcastPort}</p>
              <p><span className="text-muted-foreground font-sans">Mount:</span> {effectiveMount}</p>
              <p><span className="text-muted-foreground font-sans">Protocol:</span> Icecast2</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {stationId
                ? "Mount matches the station selected below — re-check this if you switch stations, your encoder needs to point at the new mount too."
                : "Pick a station below to see its exact mount, or enter a custom stream URL."}
            </p>
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" /> Ask an admin for your source password — not your BoiAro login.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Broadcast credential */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4" /> Broadcast Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A secret separate from your login, required to go live. Generate one and paste it into the Go Live
            form below each time you broadcast — regenerating replaces the old one immediately.
          </p>
          {freshToken && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
              <p className="text-[11px] text-emerald-400 font-medium">Copy this now — it won't be shown again:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background/60 rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">{freshToken}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { navigator.clipboard.writeText(freshToken); toast.success("Copied") }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleGenerateToken} disabled={isRegenerating}>
              {isRegenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              {tokenStatus?.hasToken ? "Regenerate Token" : "Generate Token"}
            </Button>
            {tokenStatus?.hasToken && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revokeToken().then(() => toast.success("Token revoked"))}>
                Revoke
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Status Card */}
      <Card className={isLive ? "border-destructive/40 bg-destructive/5" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Radio className={`w-5 h-5 ${isLive ? "text-destructive animate-pulse" : "text-muted-foreground"}`} />
            {isLive ? (liveSession?.is_test ? "Test Broadcast Running" : "You are LIVE") : "Go Live"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLive && liveSession ? (
            <>
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${isReconnecting ? "bg-amber-500/10 border-amber-500/20" : "bg-destructive/10 border-destructive/20"}`}>
                <span className={`w-3 h-3 rounded-full animate-pulse ${isReconnecting ? "bg-amber-500" : "bg-destructive"}`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isReconnecting ? "text-amber-400" : "text-destructive"}`}>
                    {isReconnecting ? "Reconnecting…" : liveSession.is_test ? "Private Test Broadcast" : "Broadcasting Live"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Since {new Date(liveSession.started_at).toLocaleTimeString()}
                  </p>
                  {liveSession.show_title && (
                    <p className="text-xs text-muted-foreground mt-0.5">Show: {liveSession.show_title}</p>
                  )}
                </div>
                <div className={`flex items-center gap-1 text-xs ${isReconnecting ? "text-amber-400" : "text-emerald-400"}`}>
                  <Wifi className="w-3 h-3" /> {isReconnecting ? "Lost signal" : "Connected"}
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p><strong>Stream URL:</strong> {liveSession.stream_url}</p>
              </div>

              {(streamHealth === "down" || streamHealth === "degraded") && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {streamHealth === "down"
                    ? "Your stream isn't reaching the server — listeners may not be able to hear you. Check your encoder/connection."
                    : "Your stream connection looks unstable — some listeners may be dropping in and out."}
                </div>
              )}

              {pendingCallIns.length > 0 && (
                <Link to="/live" className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-500 hover:bg-amber-500/15 transition-colors animate-pulse">
                  <PhoneCall className="w-4 h-4 shrink-0" />
                  {pendingCallIns.length === 1
                    ? "একজন শ্রোতা কল করতে চাইছেন — দেখতে ট্যাপ করুন"
                    : `${pendingCallIns.length} জন শ্রোতা কল করতে চাইছেন — দেখতে ট্যাপ করুন`}
                </Link>
              )}

              {!liveSession.is_test && (
                <Button asChild variant="outline" className="w-full gap-2">
                  <Link to="/live"><MessageCircle className="w-4 h-4" /> Manage Chat & Song Requests</Link>
                </Button>
              )}

              <Button
                variant="destructive"
                className="w-full"
                onClick={handleEndLive}
                disabled={isEnding}
              >
                {isEnding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
                {liveSession.is_test ? "End Test Broadcast" : "End Live Session"}
              </Button>
            </>
          ) : (
            <>
              {!profile?.is_approved && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Your account needs admin approval before going live.
                </div>
              )}

              {stations && stations.length > 0 && (
                <div className="space-y-2">
                  <Label>Station</Label>
                  <Select value={stationId || "__none__"} onValueChange={handleStationChange}>
                    <SelectTrigger disabled={!profile?.is_approved}><SelectValue placeholder="Select a station" /></SelectTrigger>
                    <SelectContent>
                      {stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      <SelectItem value="__none__">No station (custom stream)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Which station this broadcast goes out on — picking one fills in its stream URL below and stops another host going live on the same station while you're on air.
                  </p>
                  {currentShow && currentShow.station_id === stationId && (
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      Scheduled now: "{currentShow.show_title}" on {currentShow.station.name} — auto-selected below.
                    </p>
                  )}
                  {currentShow && currentShow.station_id !== stationId && (
                    <p className="text-[11px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Your schedule has "{currentShow.show_title}" on {currentShow.station.name} right now — double check you meant to pick a different station.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Stream URL *</Label>
                <Input
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://stream.example.com/live.mp3"
                  disabled={!profile?.is_approved}
                />
                <p className="text-[11px] text-muted-foreground">
                  {stationId
                    ? "Filled in from the selected station — only change this if your encoder pushes somewhere else."
                    : publicStreamUrl
                    ? "Pre-filled with the platform's public listener URL — only change this if you're broadcasting to a different stream."
                    : "Enter your Icecast, Shoutcast, or any audio stream URL"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Broadcast Token *</Label>
                <Input
                  value={broadcastToken}
                  onChange={(e) => setBroadcastToken(e.target.value)}
                  placeholder="Paste the token generated above"
                  disabled={!profile?.is_approved}
                  type="password"
                />
              </div>

              <BroadcastSettingsForm
                value={broadcastSettings}
                onChange={setBroadcastSettings}
                disabled={!profile?.is_approved}
              />

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Test Broadcast</p>
                  <p className="text-[11px] text-muted-foreground">Private — not shown to listeners, no follower notification</p>
                </div>
                <Switch checked={isTestBroadcast} onCheckedChange={setIsTestBroadcast} disabled={!profile?.is_approved} />
              </div>

              <Button
                className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={handleGoLive}
                disabled={isGoingLive || !profile?.is_approved || needsTerms}
              >
                {isGoingLive ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Mic className="w-4 h-4 mr-2" />
                )}
                {isTestBroadcast ? "Start Test Broadcast" : "Go Live"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Special Announcement */}
      <SpecialAnnouncementCard />

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Recent Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecentSessionsList />
        </CardContent>
      </Card>
    </div>
  )
}

function SpecialAnnouncementCard() {
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const sendMutation = trpc.rj.sendSpecialAnnouncement.useMutation({
    onSuccess: () => { setTitle(""); setMessage(""); toast.success("ঘোষণা পাঠানো হয়েছে") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="w-4 h-4" /> Special Announcement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          একটা বিশেষ ঘোষণা (যেমন হঠাৎ লাইভ, বিশেষ অতিথি) সরাসরি আপনার সব ফলোয়ারকে পাঠান — নির্ধারিত শোর বাইরে যেকোনো সময়।
        </p>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="শিরোনাম" maxLength={100} />
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="বার্তা" maxLength={500} rows={2} />
        <Button
          size="sm"
          className="w-full"
          disabled={sendMutation.isPending || !title.trim() || !message.trim()}
          onClick={() => sendMutation.mutate({ title: title.trim(), message: message.trim() })}
        >
          {sendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
          ফলোয়ারদের পাঠান
        </Button>
      </CardContent>
    </Card>
  )
}

function RecentSessionsList() {
  const utils = trpc.useUtils()
  const { data: sessions = [], isLoading } = trpc.rj.mySessions.useQuery()
  const attachMutation = trpc.rj.attachRecording.useMutation({
    onSuccess: () => { utils.rj.mySessions.invalidate(); toast.success("Recording attached — now available as catch-up audio") },
    onError: (e) => toast.error(e.message),
  })
  const [recordingInputs, setRecordingInputs] = useState<Record<string, string>>({})

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>
  if (!sessions.length) return <p className="text-sm text-muted-foreground">No sessions yet. Go live to start!</p>

  return (
    <div className="space-y-2">
      {sessions.map((s: any) => (
        <div key={s.id} className="p-2.5 rounded-lg bg-muted/30 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{s.show_title || "Untitled Show"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.started_at).toLocaleDateString()} · {new Date(s.started_at).toLocaleTimeString()}
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              s.status === "live" ? "bg-destructive/15 text-destructive" :
              s.status === "ended" ? "bg-emerald-500/15 text-emerald-400" :
              "bg-amber-500/15 text-amber-400"
            }`}>
              {s.status}
            </span>
          </div>
          {s.status === "ended" && (
            s.recording_url ? (
              <p className="text-xs text-emerald-400">✓ Recording attached — available as catch-up audio</p>
            ) : (
              <div className="space-y-1.5">
                <AudioFileUpload
                  value={recordingInputs[s.id] || ""}
                  onChange={(url) => setRecordingInputs((prev) => ({ ...prev, [s.id]: url }))}
                  fieldKey={`recording-${s.id}`}
                  placeholder="Upload a file or paste a recording URL"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs w-full"
                  disabled={attachMutation.isPending || !recordingInputs[s.id]?.trim()}
                  onClick={() => attachMutation.mutate({ sessionId: s.id, recordingUrl: recordingInputs[s.id].trim() })}
                >
                  Attach as Catch-up Audio
                </Button>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  )
}
