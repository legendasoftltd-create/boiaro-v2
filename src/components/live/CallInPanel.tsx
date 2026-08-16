import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useCallInAudio } from "@/hooks/useCallInAudio"
import { trpc } from "@/lib/trpc"
import { toMediaUrl } from "@/lib/mediaUrl"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { PhoneCall, PhoneOff, Mic, MicOff, UserX, Flag, Volume2 } from "lucide-react"
import { toast } from "sonner"

interface CallInPanelProps {
  sessionId: string
  isHost: boolean
  hostUserId: string
  getSocket: () => import("socket.io-client").Socket | null
  /**
   * Host-only: fires with the connected caller's MediaStream whenever that
   * caller is actually on_air/muted (never during preview — preview is
   * intentionally private, see the output-device warning below), and with
   * null once they stop being on-air. Lets an embedding page (StudioRoom)
   * publish the caller's voice into the LiveKit room so it actually reaches
   * listeners/the master recording — without this, "on air" only ever meant
   * a private RJ<->caller preview channel that never reached the broadcast.
   */
  onRemoteStreamChange?: (stream: MediaStream | null) => void
}

export function CallInPanel({ sessionId, isHost, hostUserId, getSocket, onRemoteStreamChange }: CallInPanelProps) {
  const { user } = useAuth()
  const { remoteStream, state, localMuted, peerUserId, startCall, hangup, toggleLocalMute } = useCallInAudio(getSocket, sessionId)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [consent, setConsent] = useState(false)
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const canPickOutput = typeof (HTMLMediaElement.prototype as any).setSinkId === "function"

  const utils = trpc.useUtils()
  const { data: myStatus } = trpc.rj.callIn.myStatus.useQuery({ sessionId }, { enabled: !isHost && !!user, refetchInterval: 4000 })
  const { data: queue = [] } = trpc.rj.callIn.queue.useQuery({ sessionId }, { enabled: isHost, refetchInterval: 4000 })

  const requestMutation = trpc.rj.callIn.request.useMutation({ onSuccess: () => utils.rj.callIn.myStatus.invalidate() })
  const acceptMutation = trpc.rj.callIn.accept.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const rejectMutation = trpc.rj.callIn.reject.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const previewMutation = trpc.rj.callIn.previewCall.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const goOnAirMutation = trpc.rj.callIn.goOnAir.useMutation({ onSuccess: () => { utils.rj.callIn.queue.invalidate(); toast.success("এই কলার এখন সরাসরি সম্প্রচারে আছে") } })
  const muteMutation = trpc.rj.callIn.muteCaller.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const unmuteCallerMutation = trpc.rj.callIn.unmuteCaller.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const removeMutation = trpc.rj.callIn.remove.useMutation({ onSuccess: () => { utils.rj.callIn.queue.invalidate(); hangup() } })
  const endMutation = trpc.rj.callIn.end.useMutation({ onSuccess: () => { utils.rj.callIn.myStatus.invalidate(); hangup() } })
  const reportCallerMutation = trpc.rj.liveSession.reportContent.useMutation({
    onSuccess: () => toast.success("রিপোর্ট পাঠানো হয়েছে"),
    onError: (e) => toast.error(e.message),
  })
  const handleReportCaller = (callId: string) => {
    const reason = window.prompt("এই কলারকে রিপোর্ট করার কারণ লিখুন:")
    if (!reason || !reason.trim()) return
    reportCallerMutation.mutate({ sessionId, targetType: "call_in", targetId: callId, reason: reason.trim() })
  }

  // Play whatever remote audio arrives (caller hears host mixed in via their
  // own speakers/headphones already — this element is for the OTHER side).
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = remoteStream
  }, [remoteStream])

  // Host: tell the embedding page about the connected caller's stream, but
  // only once they're genuinely on_air/muted — during "previewing" the RJ
  // is listening privately and it must not leak into the broadcast.
  useEffect(() => {
    if (!isHost || !onRemoteStreamChange) return
    const activeCall = (queue as any[]).find((c) => c.user_id === peerUserId)
    const isBroadcastable = activeCall?.status === "on_air" || activeCall?.status === "muted"
    onRemoteStreamChange(remoteStream && isBroadcastable ? remoteStream : null)
  }, [isHost, onRemoteStreamChange, remoteStream, peerUserId, queue])

  // Host preview: list available output devices (Chrome/Edge only — see
  // canPickOutput) so the RJ can route the preview to headphones instead of
  // whatever output their broadcast encoder is capturing.
  useEffect(() => {
    if (!isHost || !canPickOutput) return
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => setOutputDevices(devices.filter((d) => d.kind === "audiooutput")))
      .catch(() => {})
  }, [isHost, canPickOutput])

  const handleOutputChange = (deviceId: string) => {
    (audioRef.current as any)?.setSinkId?.(deviceId).catch(() => toast.error("এই ডিভাইসে সুইচ করা যায়নি"))
  }

  // Caller: once the host previews or puts them on air, start the WebRTC handshake.
  useEffect(() => {
    if (!isHost && (myStatus?.status === "on_air" || myStatus?.status === "previewing") && state === "idle") {
      startCall(hostUserId).catch(() => toast.error("মাইক্রোফোন অ্যাক্সেস করা যায়নি"))
    }
  }, [isHost, myStatus?.status, state, hostUserId, startCall])

  if (isHost) {
    return (
      <div className="border border-border/30 rounded-xl bg-card/60 p-3">
        <div className="flex items-center gap-2 mb-2">
          <PhoneCall className="w-4 h-4 text-primary" />
          <span className="text-[13px] font-semibold">Call-in Queue</span>
        </div>
        <audio ref={audioRef} autoPlay />
        {canPickOutput && outputDevices.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5">
            <Volume2 className="w-3 h-3 text-muted-foreground shrink-0" />
            <select
              className="text-[10px] bg-secondary/40 border border-border/30 rounded px-1.5 py-1 flex-1 min-w-0"
              onChange={(e) => handleOutputChange(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>প্রিভিউ কোন ডিভাইসে শুনবেন বাছাই করুন</option>
              {outputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Output device"}</option>)}
            </select>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
          ⚠️ প্রিভিউ অডিও এই ব্রাউজার ট্যাব থেকে বাজে — আপনার এনকোডার যদি এই আউটপুট ক্যাপচার করে, প্রিভিউ শ্রোতারাও শুনতে পারবেন। সরাসরি সম্প্রচার এড়াতে হেডফোন/ভিন্ন আউটপুট ডিভাইস বাছাই করুন।
        </p>
        {queue.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-2">No one is requesting to speak right now.</p>
        ) : (
          <div className="space-y-2">
            {(queue as any[]).map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 text-[12px]">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6"><AvatarImage src={toMediaUrl(c.avatar_url) || undefined} /><AvatarFallback className="text-[9px]">{(c.display_name || "U")[0]}</AvatarFallback></Avatar>
                  <div>
                    <p className="font-medium">{c.display_name || "Anonymous"}</p>
                    <Badge variant="outline" className={`text-[9px] ${c.status === "previewing" ? "border-amber-500/40 text-amber-500" : c.status === "on_air" ? "border-destructive/40 text-destructive" : ""}`}>
                      {c.status === "previewing" ? "🎧 previewing" : c.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  {c.status === "requested" && (
                    <>
                      <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => acceptMutation.mutate({ callId: c.id })}>Accept</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => rejectMutation.mutate({ callId: c.id })}>Reject</Button>
                    </>
                  )}
                  {c.status === "waiting" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => previewMutation.mutate({ callId: c.id })}>Preview</Button>
                  )}
                  {c.status === "previewing" && (
                    <>
                      <Button size="sm" className="h-6 text-[10px] px-2 bg-destructive hover:bg-destructive/90" onClick={() => goOnAirMutation.mutate({ callId: c.id })}>Send to Air</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => removeMutation.mutate({ callId: c.id })}>End Preview</Button>
                    </>
                  )}
                  {(c.status === "on_air" || c.status === "muted") && (
                    <>
                      {c.status === "muted" ? (
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-amber-500" title="Unmute" onClick={() => unmuteCallerMutation.mutate({ callId: c.id })}><Mic className="w-3 h-3" /></Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Mute" onClick={() => muteMutation.mutate({ callId: c.id })}><MicOff className="w-3 h-3" /></Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeMutation.mutate({ callId: c.id })}><UserX className="w-3 h-3" /></Button>
                    </>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" title="রিপোর্ট করুন" onClick={() => handleReportCaller(c.id)}>
                    <Flag className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Listener side.
  const status = myStatus?.status
  return (
    <div className="border border-border/30 rounded-xl bg-card/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <PhoneCall className="w-4 h-4 text-primary" />
        <span className="text-[13px] font-semibold">Request to Speak</span>
      </div>
      <audio ref={audioRef} autoPlay />
      {!status || status === "rejected" || status === "ended" || status === "removed" ? (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
            আমি সম্মত যে আমার কণ্ঠ সরাসরি সম্প্রচার হতে পারে এবং রেকর্ড হতে পারে।
          </label>
          <Button size="sm" disabled={!consent || !user} onClick={() => requestMutation.mutate({ sessionId, consentGiven: true })}>
            কথা বলার অনুরোধ করুন
          </Button>
        </div>
      ) : status === "requested" ? (
        <p className="text-[12px] text-muted-foreground">আপনার অনুরোধ হোস্টের কাছে গেছে — অপেক্ষা করুন।</p>
      ) : status === "waiting" ? (
        <p className="text-[12px] text-emerald-500">আপনি গৃহীত হয়েছেন! হোস্ট শীঘ্রই আপনাকে অন-এয়ার করবেন।</p>
      ) : status === "previewing" ? (
        <div className="space-y-2">
          <p className="text-[12px] text-amber-500">🎧 হোস্ট আপনার অডিও প্রিভিউ করছেন — এখনও সরাসরি সম্প্রচারে যাননি।</p>
          <Button size="sm" variant="destructive" onClick={() => endMutation.mutate({ callId: myStatus!.id })}>
            <PhoneOff className="w-3.5 h-3.5 mr-1.5" /> শেষ করুন
          </Button>
        </div>
      ) : status === "on_air" || status === "muted" ? (
        <div className="space-y-2">
          <p className="text-[12px] text-destructive font-medium">🔴 আপনি এখন লাইভ! {state !== "connected" && "(সংযুক্ত হচ্ছে...)"}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleLocalMute(!localMuted)}>
              <MicOff className="w-3.5 h-3.5 mr-1.5" /> {localMuted ? "Unmute" : "Mute"}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => endMutation.mutate({ callId: myStatus!.id })}>
              <PhoneOff className="w-3.5 h-3.5 mr-1.5" /> শেষ করুন
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
