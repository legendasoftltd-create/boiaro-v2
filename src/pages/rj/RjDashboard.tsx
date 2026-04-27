import { useState } from "react"
import { useRjProfile, useMyLiveSession } from "@/hooks/useLiveSession"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Radio, Mic, MicOff, Loader2, AlertTriangle, Clock, Wifi } from "lucide-react"
import { toast } from "sonner"

export default function RjDashboard() {
  const { profile } = useRjProfile()
  const { session: liveSession, goLive, endLive } = useMyLiveSession()
  const [streamUrl, setStreamUrl] = useState("")
  const [showTitle, setShowTitle] = useState("")
  const [isGoingLive, setIsGoingLive] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const handleGoLive = async () => {
    if (!streamUrl.trim()) {
      toast.error("Please enter your stream URL")
      return
    }
    if (!profile?.is_approved) {
      toast.error("Your account is not yet approved by admin")
      return
    }

    setIsGoingLive(true)
    try {
      await goLive(streamUrl.trim(), showTitle.trim() || undefined)
      toast.success("🎙️ You are now LIVE!")
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

  const isLive = liveSession?.status === "live"

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-serif">RJ Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Welcome, {profile?.stage_name || "Radio Jockey"}
        </p>
      </div>

      {/* Live Status Card */}
      <Card className={isLive ? "border-destructive/40 bg-destructive/5" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Radio className={`w-5 h-5 ${isLive ? "text-destructive animate-pulse" : "text-muted-foreground"}`} />
            {isLive ? "You are LIVE" : "Go Live"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLive && liveSession ? (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <span className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Broadcasting Live</p>
                  <p className="text-xs text-muted-foreground">
                    Since {new Date(liveSession.started_at).toLocaleTimeString()}
                  </p>
                  {liveSession.show_title && (
                    <p className="text-xs text-muted-foreground mt-0.5">Show: {liveSession.show_title}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <Wifi className="w-3 h-3" /> Connected
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p><strong>Stream URL:</strong> {liveSession.stream_url}</p>
              </div>

              <Button
                variant="destructive"
                className="w-full"
                onClick={handleEndLive}
                disabled={isEnding}
              >
                {isEnding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
                End Live Session
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

              <div className="space-y-2">
                <Label>Stream URL *</Label>
                <Input
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://stream.example.com/live.mp3"
                  disabled={!profile?.is_approved}
                />
                <p className="text-[11px] text-muted-foreground">
                  Enter your Icecast, Shoutcast, or any audio stream URL
                </p>
              </div>

              <div className="space-y-2">
                <Label>Show Title (optional)</Label>
                <Input
                  value={showTitle}
                  onChange={(e) => setShowTitle(e.target.value)}
                  placeholder="Evening Poetry Reading"
                  disabled={!profile?.is_approved}
                />
              </div>

              <Button
                className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={handleGoLive}
                disabled={isGoingLive || !profile?.is_approved}
              >
                {isGoingLive ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Mic className="w-4 h-4 mr-2" />
                )}
                Go Live
              </Button>
            </>
          )}
        </CardContent>
      </Card>

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

function RecentSessionsList() {
  const { data: sessions = [], isLoading } = trpc.rj.mySessions.useQuery()

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>
  if (!sessions.length) return <p className="text-sm text-muted-foreground">No sessions yet. Go live to start!</p>

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
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
      ))}
    </div>
  )
}
