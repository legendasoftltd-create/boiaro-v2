import { useState, useRef, useEffect } from "react"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/contexts/AuthContext"
import { useUserRole } from "@/hooks/useUserRole"
import { useCurrentLiveSession, useLiveSessionById } from "@/hooks/useLiveSession"
import { useLiveSocket } from "@/hooks/useLiveSocket"
import { useCallInAudio } from "@/hooks/useCallInAudio"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import type { MasterBook, AudiobookFormat } from "@/lib/types"
import { trpc } from "@/lib/trpc"
import { toMediaUrl } from "@/lib/mediaUrl"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Mic, Send, Music, Users, Trash2, Radio, PhoneCall, PhoneOff, MicOff, UserX, Play, Pause, Loader2, Volume2, MoreVertical, VolumeX, Ban, Flag, ShieldOff, ChevronUp, ChevronDown, Share2, Clock, WifiOff } from "lucide-react"
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
          <LiveShowRoom sessionId={session.id} showTitle={session.show_title} rjName={session.rj_profile?.stage_name} rjUserId={session.rj_user_id} isHost={isHost} callinEnabled={!!session.callin_enabled} streamUrl={session.stream_url} artworkUrl={session.rj_profile?.avatar_url} status={session.status} startedAt={session.started_at} />
        )}
      </main>
      <Footer />
    </div>
  )
}

function LiveShowRoom({ sessionId, showTitle, rjName, rjUserId, isHost, callinEnabled, streamUrl, artworkUrl, status, startedAt }: { sessionId: string; showTitle: string | null; rjName?: string; rjUserId: string; isHost: boolean; callinEnabled: boolean; streamUrl?: string | null; artworkUrl?: string | null; status: string; startedAt: string }) {
  const { user } = useAuth()
  const { hasRole } = useUserRole()
  // The backend's assertHostOrModerator already grants admins/moderators the
  // same rights as the RJ host — mirror that here so moderation controls
  // show up for them too, not just the broadcasting RJ.
  const isModerator = hasRole("admin") || hasRole("moderator")
  const isHostOrMod = isHost || isModerator
  const {
    connected, listenerCount, messages, reactions, songRequests,
    sendMessage, sendReaction, sendSongRequest, deleteMessage, updateSongRequestStatus, reorderSongRequest,
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
  const { data: hostQueue } = trpc.rj.liveSession.songRequests.useQuery({ sessionId }, { enabled: isHostOrMod })
  const utils = trpc.useUtils()

  // Reordering emits a bare "positions changed" signal (no payload) —
  // refetch the queue rather than trying to reconstruct the new order
  // client-side from a partial socket event.
  useEffect(() => {
    if (!isHostOrMod) return
    const socket = getSocket()
    if (!socket) return
    const onReordered = () => utils.rj.liveSession.songRequests.invalidate({ sessionId })
    socket.on("song_request:reordered", onReordered)
    return () => { socket.off("song_request:reordered", onReordered) }
  }, [isHostOrMod, getSocket, sessionId, utils])
  const { data: mutedUsers = [] } = trpc.rj.liveSession.mutedUsers.useQuery({ sessionId }, { enabled: isHostOrMod })

  const muteMutation = trpc.rj.liveSession.muteUser.useMutation({
    onSuccess: () => utils.rj.liveSession.mutedUsers.invalidate({ sessionId }),
    onError: (e) => toast.error(e.message),
  })
  const unmuteMutation = trpc.rj.liveSession.unmuteUser.useMutation({
    onSuccess: () => { utils.rj.liveSession.mutedUsers.invalidate({ sessionId }); toast.success("আনমিউট করা হয়েছে") },
    onError: (e) => toast.error(e.message),
  })
  const reportMutation = trpc.rj.liveSession.reportContent.useMutation({
    onSuccess: () => toast.success("রিপোর্ট পাঠানো হয়েছে"),
    onError: (e) => toast.error(e.message),
  })

  const handleMute = (targetUserId: string, type: "mute" | "ban") => {
    const reason = window.prompt(type === "ban" ? "ব্যান করার কারণ (ঐচ্ছিক):" : "মিউট করার কারণ (ঐচ্ছিক):") || undefined
    let durationMinutes: number | undefined
    if (type === "mute") {
      const raw = window.prompt("কত মিনিটের জন্য মিউট? (স্থায়ীভাবে মিউট করতে খালি রাখুন):")
      if (raw && raw.trim()) {
        const n = Number(raw.trim())
        if (!Number.isNaN(n) && n > 0) durationMinutes = n
      }
    }
    muteMutation.mutate({ sessionId, userId: targetUserId, reason, durationMinutes, type })
  }

  const handleReport = (targetId: string) => {
    const reason = window.prompt("রিপোর্ট করার কারণ লিখুন:")
    if (!reason || !reason.trim()) return
    reportMutation.mutate({ sessionId, targetType: "chat_message", targetId, reason: reason.trim() })
  }

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

  const isReconnecting = status === "reconnecting"

  const [elapsedLabel, setElapsedLabel] = useState("")
  useEffect(() => {
    if (!startedAt) return
    const start = new Date(startedAt).getTime()
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - start) / 1000))
      const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
      setElapsedLabel(h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const handleShare = async () => {
    const url = `${window.location.origin}/live/${sessionId}`
    if (navigator.share) {
      try { await navigator.share({ title: showTitle || "BoiAro On Air", url }); return } catch { /* cancelled — fall through to copy */ }
    }
    await navigator.clipboard.writeText(url)
    toast.success("লিংক কপি হয়েছে")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {artworkUrl && (
            <img src={toMediaUrl(artworkUrl) || undefined} alt="" className="w-11 h-11 rounded-full object-cover ring-1 ring-border/30 shrink-0" />
          )}
          <div>
            <h1 className="text-xl font-serif font-bold flex items-center gap-2">
              <Mic className="w-5 h-5 text-destructive" /> {showTitle || "লাইভ শো"}
            </h1>
            {rjName && (
              <p className="text-sm text-muted-foreground">
                <Link to={`/host/${rjUserId}`} className="hover:text-foreground hover:underline">{rjName}</Link> সঞ্চালনা করছেন
                {elapsedLabel && <span className="ml-2 inline-flex items-center gap-1 text-xs"><Clock className="w-3 h-3" /> {elapsedLabel}</span>}
              </p>
            )}
          </div>
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
          <Button size="icon" variant="ghost" onClick={handleShare} title="শেয়ার করুন">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {isReconnecting && (
        <p className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" /> সাময়িকভাবে সংযোগ বিচ্ছিন্ন — RJ পুনরায় সংযুক্ত হওয়ার চেষ্টা করছেন, শো এখনও চলছে
        </p>
      )}
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
                {user && (() => {
                  const isOwn = m.user_id === user.id
                  const canDelete = isOwn || isHostOrMod
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canDelete && (
                          <DropdownMenuItem onClick={() => deleteMessage(m.id)} className="text-destructive">
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> মুছে ফেলুন
                          </DropdownMenuItem>
                        )}
                        {!isOwn && isHostOrMod && (
                          <DropdownMenuItem onClick={() => handleMute(m.user_id, "mute")}>
                            <VolumeX className="w-3.5 h-3.5 mr-2" /> মিউট করুন
                          </DropdownMenuItem>
                        )}
                        {!isOwn && isHostOrMod && (
                          <DropdownMenuItem onClick={() => handleMute(m.user_id, "ban")} className="text-destructive">
                            <Ban className="w-3.5 h-3.5 mr-2" /> ব্যান করুন
                          </DropdownMenuItem>
                        )}
                        {!isOwn && (
                          <DropdownMenuItem onClick={() => handleReport(m.id)}>
                            <Flag className="w-3.5 h-3.5 mr-2" /> রিপোর্ট করুন
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                })()}
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
              <span className="text-[13px] font-semibold">{isHostOrMod ? "অনুরোধের তালিকা" : "গান/টপিক অনুরোধ করুন"}</span>
            </div>
            {isHostOrMod && (
              <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug">
                এখান থেকে সরাসরি গান বাজে না — অনুরোধ পড়ে আপনার নিজের এনকোডার/ডিভাইস থেকে গানটি বাজান, তারপর এখানে "Played" চেপে জানিয়ে দিন।
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(isHostOrMod ? songRequests : songRequests.filter((r) => r.user_id === user?.id)).map((r) => (
              <div key={r.id} className="p-2 rounded-lg bg-secondary/20 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.display_name || "Anonymous"}</span>
                  <Badge variant="outline" className={`text-[9px] ${r.status === "duplicate" ? "border-amber-500/40 text-amber-500" : ""}`}>{r.status}</Badge>
                </div>
                <p className="mt-0.5">{r.request_text}</p>
                {isHostOrMod && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => updateSongRequestStatus(r.id, "accepted")}>Accept</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => updateSongRequestStatus(r.id, "rejected")}>Reject</Button>
                      </>
                    )}
                    {r.status === "accepted" && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => updateSongRequestStatus(r.id, "played")}>Played</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => updateSongRequestStatus(r.id, "skipped")}>Skip</Button>
                      </>
                    )}
                    {r.status === "duplicate" && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => updateSongRequestStatus(r.id, "rejected")}>Dismiss</Button>
                    )}
                    {(r.status === "pending" || r.status === "accepted") && (
                      <div className="flex items-center gap-0.5 ml-auto">
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="উপরে সরান" onClick={() => reorderSongRequest(r.id, "up")}>
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="নিচে সরান" onClick={() => reorderSongRequest(r.id, "down")}>
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!isHostOrMod && (
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

      {isHostOrMod && mutedUsers.length > 0 && (
        <div className="border border-border/30 rounded-xl bg-card/60 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldOff className="w-4 h-4 text-destructive" />
            <span className="text-[13px] font-semibold">মিউট/ব্যান করা ইউজার ({mutedUsers.length})</span>
          </div>
          <div className="space-y-1.5">
            {(mutedUsers as any[]).map((mu) => (
              <div key={mu.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 text-[12px]">
                <div>
                  <span className="font-medium">{mu.type === "ban" ? "🚫 ব্যান" : "🔇 মিউট"}</span>
                  <span className="text-muted-foreground ml-2">{mu.reason || "কারণ উল্লেখ করা হয়নি"}</span>
                  {mu.expires_at && <span className="text-muted-foreground ml-2">· {new Date(mu.expires_at).toLocaleTimeString()} পর্যন্ত</span>}
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => unmuteMutation.mutate({ sessionId, userId: mu.user_id })} disabled={unmuteMutation.isPending}>
                  আনমিউট
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => muteMutation.mutate({ callId: c.id })}><MicOff className="w-3 h-3" /></Button>
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
