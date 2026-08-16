import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Mic, MicOff, UserX, ArrowUpCircle, Radio, PhoneOff, LogOut, MessageCircle, Music, Mic2 } from "lucide-react"
import { toast } from "sonner"
import { useStudioRoom } from "@/hooks/useStudioRoom"
import { useJoinToken, useStudioParticipants, useStudioModeration, useBroadcastControl, useMyStudioSessions } from "@/hooks/useStudioSession"
import { useRadioStations } from "@/hooks/useRadioStation"
import { trpc } from "@/lib/trpc"
import { BroadcastSettingsForm, DEFAULT_BROADCAST_SETTINGS, type BroadcastSettingsValue } from "@/components/rj/BroadcastSettingsForm"
import { StudioMixerPanel } from "@/components/studio/StudioMixerPanel"
import { StudioVoicePanel } from "@/components/studio/StudioVoicePanel"

const HEARTBEAT_INTERVAL_MS = 20_000
const MODERATOR_ROLES = ["host", "co_host"]
const BROADCAST_ROLES = ["host", "rj"]
const ROLE_LABEL: Record<string, string> = {
  host: "Host", co_host: "Co-host", producer: "Producer", rj: "RJ", guest: "Guest",
}

interface JoinState {
  token: string
  url: string
  role: string
}

export default function StudioRoom() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { getToken } = useJoinToken()
  const room = useStudioRoom()
  const { participants, refetch } = useStudioParticipants(sessionId)
  const { promoteToPublish, removeParticipant } = useStudioModeration(sessionId!)
  const { startBroadcast, endBroadcast, isStarting, isEnding } = useBroadcastControl(sessionId!)
  const { data: stations } = useRadioStations()
  const [stationId, setStationId] = useState("")
  const [broadcastSettings, setBroadcastSettings] = useState<BroadcastSettingsValue>(DEFAULT_BROADCAST_SETTINGS)
  const [recordingMode, setRecordingMode] = useState<"mixed" | "voice_only">("voice_only")
  // No session-status query wired up here yet — tracked locally from this
  // component's own start/end actions, same limitation the rest of this
  // page has (e.g. a page refresh mid-broadcast loses this).
  const [isLive, setIsLive] = useState(false)
  // Chat/song-requests live on a separate page (/live/:id) keyed by the
  // LiveSession this broadcast creates, not the Studio session id — needs
  // capturing from startBroadcast's response since nothing else here knows it.
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)
  const [mixerOpen, setMixerOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const connecting = useRef(false)
  const heartbeatMutation = trpc.rj.liveSession.heartbeat.useMutation()

  // Restores isLive/liveSessionId from the server on mount (and after a
  // refresh mid-broadcast, which previously lost this state entirely and —
  // combined with there being no heartbeat at all — silently stopped the
  // session from ever being recognized as live again).
  const { sessions: myStudioSessions } = useMyStudioSessions()
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current || !sessionId || myStudioSessions.length === 0) return
    const current = myStudioSessions.find((s) => s.id === sessionId)
    if (current?.status === "live") {
      setIsLive(true)
      setLiveSessionId(current.live_session_id)
    }
    restoredRef.current = true
  }, [sessionId, myStudioSessions])

  // Without this, every Studio broadcast silently drifts into "reconnecting"
  // (jobs/streamReconnect.ts) after ~2 minutes and auto-ends ~10 minutes
  // after that — REGARDLESS of whether the mic/WebRTC connection is fine —
  // because nothing was ever telling the backend "this broadcast is still
  // actually running". The external-encoder flow already does this (see
  // useLiveSession.ts); Studio never had it.
  useEffect(() => {
    if (!isLive || !liveSessionId) return
    const id = liveSessionId
    const timer = setInterval(() => {
      heartbeatMutation.mutate({ sessionId: id })
    }, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveSessionId])

  useEffect(() => {
    if (!stationId && stations && stations.length > 0) setStationId(stations[0].id)
  }, [stations])

  const me = participants.find((p) => p.user_id === user?.id)
  const myRole = me?.role
  const isModerator = !!myRole && MODERATOR_ROLES.includes(myRole)
  const canControlBroadcast = !!myRole && BROADCAST_ROLES.includes(myRole)

  useEffect(() => {
    if (!sessionId || connecting.current) return
    connecting.current = true

    const stateToken = (location.state as JoinState | null)
    const go = async () => {
      try {
        const join = stateToken ?? await getToken(sessionId)
        await room.connect(join.url!, join.token, ["host", "co_host", "producer", "rj"].includes((join as any).role));
      } catch (err: any) {
        toast.error(err.message || "Studio-এ যুক্ত হওয়া যায়নি")
      }
    }
    go()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const handleLeave = () => {
    room.disconnect()
    navigate("/rj/studio")
  }

  const handleStart = async () => {
    try {
      const result = await startBroadcast({
        stationId: stationId || undefined,
        showTitle: broadcastSettings.showTitle.trim() || undefined,
        description: broadcastSettings.description.trim() || undefined,
        coverImageUrl: broadcastSettings.coverImageUrl.trim() || undefined,
        category: broadcastSettings.category.trim() || undefined,
        chatEnabled: broadcastSettings.chatEnabled,
        requestsEnabled: broadcastSettings.requestsEnabled,
        recordingEnabled: broadcastSettings.recordingEnabled,
        callinEnabled: broadcastSettings.callinEnabled,
        recordingMode,
      })
      setIsLive(true)
      setLiveSessionId((result as { live_session_id: string | null })?.live_session_id ?? null)
      toast.success("সম্প্রচার শুরু হয়েছে")
    } catch (err: any) {
      toast.error(err.message || "সম্প্রচার শুরু করা যায়নি")
    }
  }

  const handleEnd = async () => {
    try {
      await endBroadcast()
      setIsLive(false)
      setLiveSessionId(null)
      toast.success("সম্প্রচার শেষ হয়েছে")
    } catch (err: any) {
      toast.error(err.message || "সম্প্রচার শেষ করা যায়নি")
    }
  }

  const handleRemove = async (targetUserId: string, targetRole: string) => {
    if (!["guest", "producer"].includes(targetRole)) {
      toast.error("শুধু Guest বা Producer-কে remove করা যায়")
      return
    }
    try {
      await removeParticipant(targetUserId)
      toast.success("Participant সরানো হয়েছে")
      refetch()
    } catch (err: any) {
      toast.error(err.message || "সরানো যায়নি")
    }
  }

  const handlePromote = async (targetUserId: string) => {
    try {
      await promoteToPublish(targetUserId)
      toast.success("মাইক অনুমতি দেওয়া হয়েছে")
    } catch (err: any) {
      toast.error(err.message || "অনুমতি দেওয়া যায়নি")
    }
  }

  if (!sessionId) return null

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <Radio className={`w-5 h-5 ${room.state === "connected" ? "text-destructive animate-pulse" : "text-muted-foreground"}`} />
              Studio Room
            </span>
            {myRole && <Badge variant="outline">{ROLE_LABEL[myRole]}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {room.state === "connecting" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> সংযুক্ত হচ্ছে...
            </div>
          )}
          {room.state === "failed" && (
            <p className="text-sm text-destructive">সংযোগ ব্যর্থ হয়েছে — পেজ রিলোড করে আবার চেষ্টা করুন।</p>
          )}

          {room.state === "connected" && (
            <>
              {canControlBroadcast && !isLive && stations && stations.length > 0 && (
                <Select value={stationId} onValueChange={setStationId}>
                  <SelectTrigger className="h-9 text-[13px] w-full sm:w-64"><SelectValue placeholder="কোন Station-এ সম্প্রচার হবে?" /></SelectTrigger>
                  <SelectContent>
                    {stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {canControlBroadcast && !isLive && (
                <BroadcastSettingsForm value={broadcastSettings} onChange={setBroadcastSettings} />
              )}

              {canControlBroadcast && !isLive && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-1.5">
                  <p className="text-xs font-medium">রেকর্ডিং</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={recordingMode === "voice_only" ? "default" : "outline"}
                      className="text-xs flex-1"
                      onClick={() => setRecordingMode("voice_only")}
                    >
                      শুধু কণ্ঠস্বর
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={recordingMode === "mixed" ? "default" : "outline"}
                      className="text-xs flex-1"
                      onClick={() => setRecordingMode("mixed")}
                    >
                      মিক্স (কণ্ঠ + মিউজিক)
                    </Button>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground leading-snug">
                    সরাসরি সম্প্রচারে সবসময় মাইক + মিউজিক/জিঙ্গেল একসাথে যায় — এটা শুধু ক্যাচ-আপ রেকর্ডিং কী ধারণ করবে তা ঠিক করে।
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" variant={room.micOn ? "default" : "outline"} onClick={room.toggleMic} className="gap-1.5">
                  {room.micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  {room.micOn ? "মাইক চালু" : "মাইক বন্ধ"}
                </Button>

                {canControlBroadcast && !isLive && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isStarting || isEnding}
                    onClick={handleStart}
                    className="gap-1.5"
                  >
                    {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
                    সম্প্রচার শুরু
                  </Button>
                )}
                {canControlBroadcast && isLive && (
                  <Button size="sm" variant="outline" disabled={isStarting || isEnding} onClick={handleEnd} className="gap-1.5">
                    {isEnding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5" />}
                    সম্প্রচার শেষ
                  </Button>
                )}

                {isLive && liveSessionId && (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={`/live/${liveSessionId}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-3.5 h-3.5" /> Chat ও Song Request দেখুন
                    </a>
                  </Button>
                )}

                {(canControlBroadcast || isModerator) && (
                  <Button size="sm" variant={mixerOpen ? "default" : "outline"} onClick={() => setMixerOpen((v) => !v)} className="gap-1.5">
                    <Music className="w-3.5 h-3.5" /> Mixer
                  </Button>
                )}

                {canControlBroadcast && room.micOn && room.voiceProcessor.isActive && (
                  <Button size="sm" variant={voiceOpen ? "default" : "outline"} onClick={() => setVoiceOpen((v) => !v)} className="gap-1.5">
                    <Mic2 className="w-3.5 h-3.5" /> Voice
                  </Button>
                )}

                <Button size="sm" variant="ghost" onClick={handleLeave} className="gap-1.5 ml-auto">
                  <LogOut className="w-3.5 h-3.5" /> Leave
                </Button>
              </div>

              {mixerOpen && (canControlBroadcast || isModerator) && (
                <StudioMixerPanel
                  sessionId={sessionId}
                  getRoom={room.getRoom}
                  isSpeaking={!!room.participants.find((p) => p.identity === user?.id)?.isSpeaking}
                />
              )}

              {voiceOpen && canControlBroadcast && room.micOn && room.voiceProcessor.isActive && (
                <StudioVoicePanel voiceProcessor={room.voiceProcessor} />
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Participants</p>
                {participants.filter((p) => !p.left_at).map((p) => {
                  const live = room.participants.find((rp) => rp.identity === p.user_id)
                  const isSelf = p.user_id === user?.id
                  return (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/30">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`w-2 h-2 rounded-full ${live?.isSpeaking ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"}`} />
                        {isSelf ? "আপনি" : p.user_id.slice(0, 8)}
                        <Badge variant="secondary" className="text-[10px]">{ROLE_LABEL[p.role]}</Badge>
                      </div>
                      {isModerator && !isSelf && ["guest", "producer"].includes(p.role) && (
                        <div className="flex items-center gap-1.5">
                          {!live?.isMicOn && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="মাইক অনুমতি দিন" onClick={() => handlePromote(p.user_id)}>
                              <ArrowUpCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="সরিয়ে দিন" onClick={() => handleRemove(p.user_id, p.role)}>
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
