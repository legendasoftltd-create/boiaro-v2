import { useState, useRef, useEffect } from "react"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentLiveSession, useLiveSessionById } from "@/hooks/useLiveSession"
import { useLiveSocket } from "@/hooks/useLiveSocket"
import { useCallInAudio } from "@/hooks/useCallInAudio"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import type { MasterBook, AudiobookFormat } from "@/lib/types"
import { trpc } from "@/lib/trpc"
import { toMediaUrl } from "@/lib/mediaUrl"
import { Mic, Send, Music, Users, Trash2, Radio, PhoneCall, PhoneOff, MicOff, UserX, Play, Pause, Loader2, Volume2 } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"

const REACTION_EMOJIS = ["❤️", "🔥", "👏", "😂", "🎉"]

export default function LiveShow() {
  const { user } = useAuth()
  const { sessionId } = useParams<{ sessionId?: string }>()

  // /live/:sessionId deep-links (go-live notifications, shared links) to
  // that exact broadcast — several stations can be live at once, so
  // "whichever's live" (the no-param fallback below) can't be assumed to
  // be the one the link was actually sent for.
  const byId = useLiveSessionById(sessionId)
  const fallback = useCurrentLiveSession({ enabled: !sessionId })
  const { session, loading } = sessionId ? byId : fallback
  const hasEnded = !!session && !["live", "reconnecting"].includes(session.status)

  const isHost = !!user && !!session && session.rj_user_id === user.id

  useEffect(() => {
    document.title = session?.show_title ? `${session.show_title} — BoiAro On Air` : "BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [session?.show_title])

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-4xl">
        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : !session ? (
          <div className="text-center py-20">
            <Radio className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h1 className="text-xl font-serif font-bold">এখন কোনো লাইভ শো চলছে না</h1>
            <p className="text-muted-foreground text-sm mt-1">পরে আবার চেষ্টা করুন, অথবা হোম পেজে ফিরে যান।</p>
            <Button asChild className="mt-4"><Link to="/">হোম পেজে যান</Link></Button>
          </div>
        ) : hasEnded ? (
          <div className="text-center py-20">
            <Radio className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h1 className="text-xl font-serif font-bold">এই শো শেষ হয়ে গেছে</h1>
            <p className="text-muted-foreground text-sm mt-1">{session.show_title || "এই সম্প্রচার"} আর লাইভ নেই — ক্যাচ-আপে রেকর্ডিং থাকতে পারে।</p>
            <div className="flex gap-2 justify-center mt-4">
              <Button asChild variant="outline"><Link to="/catchup">ক্যাচ-আপ দেখুন</Link></Button>
              <Button asChild><Link to="/">হোম পেজে যান</Link></Button>
            </div>
          </div>
        ) : (
          <LiveShowRoom sessionId={session.id} showTitle={session.show_title} rjName={session.rj_profile?.stage_name} rjUserId={session.rj_user_id} isHost={isHost} callinEnabled={!!session.callin_enabled} streamUrl={session.stream_url} artworkUrl={session.rj_profile?.avatar_url} />
        )}
      </main>
      <Footer />
    </div>
  )
}

function LiveShowRoom({ sessionId, showTitle, rjName, rjUserId, isHost, callinEnabled, streamUrl, artworkUrl }: { sessionId: string; showTitle: string | null; rjName?: string; rjUserId: string; isHost: boolean; callinEnabled: boolean; streamUrl?: string | null; artworkUrl?: string | null }) {
  const { user } = useAuth()
  const {
    connected, listenerCount, messages, reactions, songRequests,
    sendMessage, sendReaction, sendSongRequest, deleteMessage, updateSongRequestStatus,
    setMessages, setSongRequests, getSocket,
  } = useLiveSocket(sessionId)

  // Listening the actual audio here is a separate concern from the chat
  // socket above — this page is the deep-link destination for "go live"
  // notifications/shared links, so it needs its own way to start playback
  // rather than assuming the listener already pressed play from the
  // homepage's Live Radio card. Mirrors LiveRadio.tsx's RadioCard, minus
  // the quality-tier switching (a live session only ever has one URL).
  const { book, isPlaying, togglePlay, loadBook } = useAudioPlayer()
  const isRadioActive = book?.id === `radio-live-${sessionId}`
  const [streamStatus, setStreamStatus] = useState<"idle" | "loading" | "playing" | "error">("idle")
  const testAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (testAudioRef.current) {
        testAudioRef.current.src = ""
        testAudioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (isRadioActive && isPlaying) setStreamStatus("playing")
    else if (isRadioActive && !isPlaying && streamStatus === "playing") setStreamStatus("idle")
  }, [isRadioActive, isPlaying])

  const handleListenToggle = () => {
    if (isRadioActive) {
      togglePlay()
      return
    }
    if (!streamUrl) {
      toast.error("এই সম্প্রচারের স্ট্রিম এখন পাওয়া যাচ্ছে না")
      return
    }

    setStreamStatus("loading")

    const radioBook: MasterBook = {
      id: `radio-live-${sessionId}`, title: showTitle || rjName || "BoiAro On Air", titleEn: "",
      slug: `radio-live-${sessionId}`, cover: artworkUrl || "/placeholder.svg",
      description: showTitle || "BoiAro On Air — live", descriptionBn: showTitle || "",
      language: "bn", isFeatured: false, isBestseller: false, isNew: false, isFree: true,
      rating: 0, reviewsCount: 0, totalReads: "0", publishedDate: "", tags: [],
      author: { id: "", name: rjName || "BoiAro Radio", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false },
      category: { id: "", name: "Radio", nameBn: "রেডিও", icon: "", count: "0", color: "" },
      publisher: { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false },
      formats: { audiobook: { available: true, price: 0, duration: "Live", narrator: { id: "", name: rjName || "BoiAro Radio", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false }, chapters: 1, quality: "standard" } },
    }
    const radioAudiobook: AudiobookFormat = {
      available: true, price: 0, duration: "Live",
      narrator: { id: "", name: rjName || "BoiAro Radio", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
      chapters: 1, quality: "standard",
    }
    const radioTrack = { id: sessionId, trackNumber: 1, title: radioBook.title, duration: "Live", audioUrl: streamUrl, isPreview: false, isActive: true }

    loadBook(radioBook, radioAudiobook, [radioTrack])

    // Reachability check before flipping to "playing" — same pattern as
    // RadioCard, so a dead stream surfaces as an error instead of silently
    // sitting in "loading" forever.
    const testAudio = new Audio()
    testAudio.preload = "none"
    const cleanup = () => {
      testAudio.removeEventListener("canplay", onCanPlay)
      testAudio.removeEventListener("error", onError)
      testAudio.src = ""
    }
    const onCanPlay = () => { cleanup(); setStreamStatus("playing"); setTimeout(() => togglePlay(), 100) }
    const onError = () => { cleanup(); setStreamStatus("error") }
    testAudio.addEventListener("canplay", onCanPlay, { once: true })
    testAudio.addEventListener("error", onError, { once: true })
    testAudio.src = streamUrl
    testAudio.load()
    testAudioRef.current = testAudio

    setTimeout(() => {
      if (testAudioRef.current === testAudio) { cleanup(); setStreamStatus("playing"); togglePlay() }
    }, 15000)
  }

  const { data: history } = trpc.rj.liveSession.chatHistory.useQuery({ sessionId }, { enabled: !!sessionId })
  const { data: hostQueue } = trpc.rj.liveSession.songRequests.useQuery({ sessionId }, { enabled: isHost })

  useEffect(() => { if (history) setMessages(history as any) }, [history])
  useEffect(() => { if (hostQueue) setSongRequests(hostQueue as any) }, [hostQueue])

  const [chatInput, setChatInput] = useState("")
  const [requestInput, setRequestInput] = useState("")
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages.length])

  const handleSend = () => {
    if (!chatInput.trim()) return
    sendMessage(chatInput.trim())
    setChatInput("")
  }

  const handleRequest = () => {
    if (!requestInput.trim()) return
    sendSongRequest(requestInput.trim())
    setRequestInput("")
    toast.success("অনুরোধ পাঠানো হয়েছে!")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-serif font-bold flex items-center gap-2">
            <Mic className="w-5 h-5 text-destructive" /> {showTitle || "লাইভ শো"}
          </h1>
          {rjName && (
            <p className="text-sm text-muted-foreground">
              <Link to={`/host/${rjUserId}`} className="hover:text-foreground hover:underline">{rjName}</Link> সঞ্চালনা করছেন
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isHost && (
            <Button
              size="sm"
              variant={streamStatus === "playing" ? "default" : "outline"}
              className="gap-1.5"
              onClick={handleListenToggle}
              disabled={streamStatus === "loading"}
            >
              {streamStatus === "loading" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : streamStatus === "playing" ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {streamStatus === "playing" ? "প্লে হচ্ছে" : streamStatus === "loading" ? "সংযুক্ত হচ্ছে..." : "শুনুন"}
            </Button>
          )}
          <Badge variant="outline" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> {listenerCount} জন শুনছেন
            {!connected && <span className="text-[10px] text-muted-foreground">(সংযুক্ত হচ্ছে...)</span>}
          </Badge>
        </div>
      </div>
      {!isHost && streamStatus === "error" && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5" /> স্ট্রিম লোড করা যায়নি — আবার চেষ্টা করুন
        </p>
      )}

      {/* Floating reactions overlay */}
      <div className="relative h-0">
        {reactions.map((r) => (
          <span key={r.key} className="absolute bottom-0 right-4 text-2xl animate-[float-up_3s_ease-out_forwards]" style={{ animationName: "none" }}>
            {r.emoji}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chat */}
        <div className="md:col-span-2 border border-border/30 rounded-xl bg-card/60 flex flex-col h-[500px]">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-2 group">
                <Avatar className="w-6 h-6 shrink-0">
                  <AvatarImage src={toMediaUrl(m.avatar_url) || undefined} />
                  <AvatarFallback className="text-[9px]">{(m.display_name || "U")[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium">{m.display_name || "Anonymous"}</span>
                  <span className="text-[13px] ml-2 break-words">{m.message}</span>
                </div>
                {isHost && (
                  <button onClick={() => deleteMessage(m.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-2 border-t border-border/20 flex gap-2">
            <div className="flex gap-1">
              {REACTION_EMOJIS.map((e) => (
                <button key={e} onClick={() => sendReaction(e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="মন্তব্য লিখুন..."
              className="h-9 text-[13px]"
              disabled={!user}
            />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!user}><Send className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Song request / host queue */}
        <div className="border border-border/30 rounded-xl bg-card/60 flex flex-col h-[500px]">
          <div className="p-3 border-b border-border/20">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-primary" />
              <span className="text-[13px] font-semibold">{isHost ? "অনুরোধের তালিকা" : "গান/টপিক অনুরোধ করুন"}</span>
            </div>
            {isHost && (
              <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug">
                এখান থেকে সরাসরি গান বাজে না — অনুরোধ পড়ে আপনার নিজের এনকোডার/ডিভাইস থেকে গানটি বাজান, তারপর এখানে "Played" চেপে জানিয়ে দিন।
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(isHost ? songRequests : songRequests.filter((r) => r.user_id === user?.id)).map((r) => (
              <div key={r.id} className="p-2 rounded-lg bg-secondary/20 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.display_name || "Anonymous"}</span>
                  <Badge variant="outline" className="text-[9px]">{r.status}</Badge>
                </div>
                <p className="mt-0.5">{r.request_text}</p>
                {isHost && r.status === "pending" && (
                  <div className="flex gap-1.5 mt-1.5">
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => updateSongRequestStatus(r.id, "played")}>Played</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => updateSongRequestStatus(r.id, "rejected")}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!isHost && (
            <div className="p-2 border-t border-border/20 flex gap-2">
              <Input
                value={requestInput}
                onChange={(e) => setRequestInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRequest()}
                placeholder="গান বা টপিক লিখুন..."
                className="h-9 text-[13px]"
                disabled={!user}
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleRequest} disabled={!user}><Send className="w-4 h-4" /></Button>
            </div>
          )}
        </div>
      </div>

      {callinEnabled && (
        <CallInPanel sessionId={sessionId} isHost={isHost} hostUserId={rjUserId} getSocket={getSocket} />
      )}
    </div>
  )
}

function CallInPanel({ sessionId, isHost, hostUserId, getSocket }: { sessionId: string; isHost: boolean; hostUserId: string; getSocket: () => import("socket.io-client").Socket | null }) {
  const { user } = useAuth()
  const { remoteStream, state, localMuted, startCall, hangup, toggleLocalMute } = useCallInAudio(getSocket, sessionId)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [consent, setConsent] = useState(false)

  const utils = trpc.useUtils()
  const { data: myStatus } = trpc.rj.callIn.myStatus.useQuery({ sessionId }, { enabled: !isHost && !!user, refetchInterval: 4000 })
  const { data: queue = [] } = trpc.rj.callIn.queue.useQuery({ sessionId }, { enabled: isHost, refetchInterval: 4000 })

  const requestMutation = trpc.rj.callIn.request.useMutation({ onSuccess: () => utils.rj.callIn.myStatus.invalidate() })
  const acceptMutation = trpc.rj.callIn.accept.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const rejectMutation = trpc.rj.callIn.reject.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const goOnAirMutation = trpc.rj.callIn.goOnAir.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const muteMutation = trpc.rj.callIn.muteCaller.useMutation({ onSuccess: () => utils.rj.callIn.queue.invalidate() })
  const removeMutation = trpc.rj.callIn.remove.useMutation({ onSuccess: () => { utils.rj.callIn.queue.invalidate(); hangup() } })
  const endMutation = trpc.rj.callIn.end.useMutation({ onSuccess: () => { utils.rj.callIn.myStatus.invalidate(); hangup() } })

  // Play whatever remote audio arrives (caller hears host mixed in via their
  // own speakers/headphones already — this element is for the OTHER side).
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = remoteStream
  }, [remoteStream])

  // Caller: once the host puts them on air, start the WebRTC handshake.
  useEffect(() => {
    if (!isHost && myStatus?.status === "on_air" && state === "idle") {
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
                    <Badge variant="outline" className="text-[9px]">{c.status}</Badge>
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
                    <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => goOnAirMutation.mutate({ callId: c.id })}>Go On Air</Button>
                  )}
                  {(c.status === "on_air" || c.status === "muted") && (
                    <>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => muteMutation.mutate({ callId: c.id })}><MicOff className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeMutation.mutate({ callId: c.id })}><UserX className="w-3 h-3" /></Button>
                    </>
                  )}
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
