import { useState, useRef, useCallback, useEffect } from "react"
import { Link } from "react-router-dom"
import { Radio, Play, Pause, Loader2, WifiOff, Mic, MessageCircle, Share2, Users, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRadioStations } from "@/hooks/useRadioStation"
import { useAllLiveSessions } from "@/hooks/useLiveSession"
import { useLiveSocket } from "@/hooks/useLiveSocket"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import type { MasterBook, AudiobookFormat } from "@/lib/types"
import { useSiteSettings } from "@/hooks/useSiteSettings"
import { stripHtml } from "@/lib/stripHtml"
import { toMediaUrl } from "@/lib/mediaUrl"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

export function LiveRadioSection() {
  const { data: stations, isLoading } = useRadioStations()
  const { sessions } = useAllLiveSessions()
  const { get } = useSiteSettings()
  const brandName = get("brand_name", "BoiAro")

  // Admin station list is the source of truth for homepage visibility.
  if (isLoading) return null
  if (!stations.length) return null

  // Several stations can be live at once — match each station to its own
  // session (if any) rather than assuming a single platform-wide one.
  const sessionByStation = new Map(sessions.filter((s) => s.station_id).map((s) => [s.station_id as string, s]))
  const liveCount = sessions.length

  return (
    <section className="section-container" data-section="live_radio">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="section-header flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="section-icon bg-destructive/15">
              {liveCount > 0 ? <Mic className="w-4 h-4 md:w-5 md:h-5 text-destructive" /> : <Radio className="w-4 h-4 md:w-5 md:h-5 text-destructive" />}
            </div>
            <div>
              <h2 className="text-lg md:text-2xl font-serif font-bold text-foreground">
                BoiAro <span className="text-destructive">On Air</span>
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground">
                {liveCount === 1
                  ? `${sessions[0].rj_profile?.stage_name || "An RJ"} is broadcasting live`
                  : liveCount > 1
                  ? `${liveCount} shows broadcasting live right now`
                  : "Listen to live streaming now"}
              </p>
            </div>
          </div>
        </div>

        <div className={stations.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-4" : undefined}>
          {stations.map((station) => {
            const liveSession = sessionByStation.get(station.id)
            const isRjLive = !!liveSession
            return (
              <div key={station.id}>
                {isRjLive && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground truncate">{liveSession.show_title || station.name}</span>
                    <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
                      <Link to={`/live/${liveSession.id}`}><MessageCircle className="w-3.5 h-3.5" /> Join Live Chat</Link>
                    </Button>
                  </div>
                )}
                <RadioCard
                  station={{
                    id: station.id,
                    name: liveSession?.rj_profile?.stage_name
                      ? `🎙️ ${liveSession.rj_profile.stage_name} — LIVE`
                      : station.name || `${brandName} Radio`,
                    stream_url: liveSession?.stream_url || station.stream_url,
                    // Quality tiers only apply to the station's own stream — an
                    // RJ's live session only ever provides one URL (no bitrate
                    // variants for ad-hoc broadcasts), so those tiers are
                    // skipped whenever a live session is what's actually playing.
                    stream_url_medium: isRjLive ? null : station.stream_url_medium,
                    stream_url_low: isRjLive ? null : station.stream_url_low,
                    artwork_url: station.artwork_url,
                    description: liveSession?.show_title || station.description,
                  }}
                  isLive={isRjLive}
                  liveSessionId={liveSession?.id}
                  liveSessionStatus={liveSession?.status}
                  startedAt={liveSession?.started_at}
                  rjAvatarUrl={liveSession?.rj_profile?.avatar_url}
                  stationId={station.id}
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

type StreamStatus = "idle" | "loading" | "playing" | "error"

type Quality = "high" | "medium" | "low"

function RadioCard({ station, isLive, liveSessionId, liveSessionStatus, startedAt, rjAvatarUrl, stationId }: {
  station: { id: string; name: string; stream_url: string; stream_url_medium?: string | null; stream_url_low?: string | null; artwork_url: string | null; description: string | null }
  isLive: boolean
  liveSessionId?: string
  liveSessionStatus?: string
  startedAt?: string
  rjAvatarUrl?: string | null
  stationId: string
}) {
  const { book, isPlaying, togglePlay, loadBook, pause } = useAudioPlayer()
  const { get } = useSiteSettings()
  const brandName = get("brand_name", "BoiAro")
  const isRadioActive = book?.id === `radio-${station.id}`

  const [quality, setQuality] = useState<Quality>("high")
  const hasQualityOptions = !!(station.stream_url_medium || station.stream_url_low)
  const resolveUrlForQuality = useCallback((q: Quality) =>
    q === "low" && station.stream_url_low ? station.stream_url_low :
    q === "medium" && station.stream_url_medium ? station.stream_url_medium :
    station.stream_url,
  [station.stream_url, station.stream_url_medium, station.stream_url_low])
  const effectiveStreamUrl = resolveUrlForQuality(quality)

  // Independent stream status tracking for radio
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle")
  const streamAudioRef = useRef<HTMLAudioElement | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 2

  // Homepage playback previously never joined the socket room, so anyone
  // listening from here (not the dedicated /live/:sessionId chat page) was
  // invisible to the listener badge and every persisted analytic. Track
  // exactly while this card is the one actively playing a live RJ session —
  // undefined otherwise, which makes useLiveSocket leave/disconnect.
  const [trackedSessionId, setTrackedSessionId] = useState<string | undefined>(undefined)
  const { reportQuality } = useLiveSocket(trackedSessionId)
  useEffect(() => {
    setTrackedSessionId(isRadioActive && isPlaying && liveSessionId ? liveSessionId : undefined)
  }, [isRadioActive, isPlaying, liveSessionId])

  // Reports whichever tier is actually selected once there's a tracked
  // session to attach it to, and again on every later quality switch.
  useEffect(() => {
    if (trackedSessionId) reportQuality(quality)
  }, [trackedSessionId, quality, reportQuality])

  const isReconnecting = liveSessionStatus === "reconnecting"

  // Live on-air duration — ticks every second from the session's real
  // started_at, not from whenever this listener happened to press play.
  const [elapsedLabel, setElapsedLabel] = useState("")
  useEffect(() => {
    if (!isLive || !startedAt) { setElapsedLabel(""); return }
    const start = new Date(startedAt).getTime()
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - start) / 1000))
      const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
      setElapsedLabel(h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isLive, startedAt])

  // Real listener count, not tied to whether *this* browser is playing —
  // pulled from the same in-memory count the socket layer already tracks.
  const { data: listenerData } = trpc.rj.liveSession.listenerCount.useQuery(
    { sessionId: liveSessionId! },
    { enabled: isLive && !!liveSessionId, refetchInterval: 20_000 }
  )

  const { data: nextShow } = trpc.rj.nextShowForStation.useQuery({ stationId }, { enabled: !isLive })

  const handleShare = async () => {
    const url = liveSessionId ? `${window.location.origin}/live/${liveSessionId}` : window.location.origin
    if (navigator.share) {
      try { await navigator.share({ title: station.name, url }); return } catch { /* cancelled — fall through to copy */ }
    }
    await navigator.clipboard.writeText(url)
    toast.success("লিংক কপি হয়েছে")
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamAudioRef.current) {
        streamAudioRef.current.pause()
        streamAudioRef.current.src = ""
        streamAudioRef.current = null
      }
    }
  }, [])

  // Sync status when audiobook player takes over
  useEffect(() => {
    if (isRadioActive && isPlaying) {
      setStreamStatus("playing")
    } else if (isRadioActive && !isPlaying && streamStatus === "playing") {
      setStreamStatus("idle")
    }
  }, [isRadioActive, isPlaying])

  const handlePlay = useCallback((urlOverride?: string) => {
    // If already active in shared player, just toggle (no override case —
    // quality switches always go through handleQualityChange's explicit
    // pause-then-replay path instead, never toggle while overriding).
    if (isRadioActive && !urlOverride) {
      togglePlay()
      return
    }

    const url = urlOverride || effectiveStreamUrl

    // Validate URL before attempting
    if (!url || !url.trim()) {
      setStreamStatus("error")
      return
    }
    const isHls = /\.m3u8(\?|$)/i.test(url)

    setStreamStatus("loading")
    retryCountRef.current = 0

    // Build radio book model for the shared player
    const radioBook: MasterBook = {
      id: `radio-${station.id}`,
      title: station.name,
      titleEn: "",
      slug: `radio-${station.id}`,
      cover: station.artwork_url || "/placeholder.svg",
      description: station.description || "BoiAro On Air stream",
      descriptionBn: station.description || "",
      language: "bn",
      isFeatured: false,
      isBestseller: false,
      isNew: false,
      isFree: true,
      rating: 0,
      reviewsCount: 0,
      totalReads: "0",
      publishedDate: "",
      tags: [],
      author: { id: "", name: `${brandName} Radio`, nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false },
      category: { id: "", name: "Radio", nameBn: "রেডিও", icon: "", count: "0", color: "" },
      publisher: { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false },
      formats: {
        audiobook: {
          available: true,
          price: 0,
          duration: "Live",
          narrator: { id: "", name: `${brandName} Radio`, nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
          chapters: 1,
          quality: "standard",
        },
      },
    }

    const radioAudiobook: AudiobookFormat = {
      available: true,
      price: 0,
      duration: "Live",
      narrator: { id: "", name: "BoiAro Radio", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
      chapters: 1,
      quality: "standard",
    }

    const radioTrack = {
      id: station.id,
      trackNumber: 1,
      title: station.name,
      duration: "Live",
      audioUrl: url,
      isPreview: false,
      isActive: true,
    }

    // Load into shared player — the AudioPlayerContext handles actual playback
    loadBook(radioBook, radioAudiobook, [radioTrack])

    // HLS (.m3u8) streams are played via hls.js inside the shared player,
    // not a plain <audio> element — a reachability pre-check here with a
    // bare Audio() would falsely fail (browsers without native HLS can't
    // load .m3u8 that way even though playback works fine via hls.js), so
    // skip straight to playing and let the shared player's own error
    // handling (hls.js error events -> toast) surface real failures.
    if (isHls) {
      setStreamStatus("playing")
      setTimeout(() => togglePlay(), 100)
      return
    }

    // Use a test audio element to verify the stream is reachable
    const testAudio = new Audio()
    testAudio.preload = "none"
    
    const cleanup = () => {
      testAudio.removeEventListener("canplay", onCanPlay)
      testAudio.removeEventListener("error", onError)
      testAudio.src = ""
    }

    const onCanPlay = () => {
      cleanup()
      setStreamStatus("playing")
      // Stream is valid — trigger play on the shared player
      setTimeout(() => togglePlay(), 100)
    }

    const onError = () => {
      cleanup()
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++
        // Retry after a short delay
        setTimeout(() => {
          testAudio.src = url
          testAudio.load()
        }, 1000)
      } else {
        setStreamStatus("error")
      }
    }

    testAudio.addEventListener("canplay", onCanPlay, { once: true })
    testAudio.addEventListener("error", onError, { once: true })
    
    testAudio.src = url
    testAudio.load()
    streamAudioRef.current = testAudio

    // Timeout fallback — if nothing happens in 15s, assume it works and try playing
    setTimeout(() => {
      if (streamStatus === "loading") {
        cleanup()
        setStreamStatus("playing")
        togglePlay()
      }
    }, 15000)
  }, [isRadioActive, station, effectiveStreamUrl, loadBook, togglePlay])

  const handlePause = useCallback(() => {
    if (isRadioActive) {
      pause()
    }
    setStreamStatus("idle")
  }, [isRadioActive, pause])

  const handleQualityChange = useCallback((next: Quality) => {
    setQuality(next)
    if (isRadioActive) {
      // Resolve the new URL directly rather than relying on `quality` state
      // (which won't have updated yet in this closure) — avoids a stale
      // reload that plays the old quality on the first switch.
      const nextUrl = resolveUrlForQuality(next)
      pause()
      setStreamStatus("idle")
      setTimeout(() => handlePlay(nextUrl), 50)
    }
  }, [isRadioActive, pause, handlePlay, resolveUrlForQuality])

  const isCurrentlyPlaying = isRadioActive && isPlaying
  const isBuffering = streamStatus === "loading"
  const hasError = streamStatus === "error"

  return (
    <div className="card-hover p-4 md:p-6 flex items-center gap-4 md:gap-6">
      {/* Artwork */}
      <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden ring-1 ring-border/30 flex-shrink-0">
        {station.artwork_url ? (
          <img src={station.artwork_url} alt={station.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-destructive/10 flex items-center justify-center">
            <Radio className="w-8 h-8 text-destructive" />
          </div>
        )}
        {/* Only shown when an RJ is actually broadcasting right now — this used
            to show for every station regardless of live status, which meant
            an idle station's card claimed to be "LIVE" whenever its stream
            just hadn't errored yet. Kept to just "LIVE" (color signals
            reconnecting vs healthy) rather than the full Bengali status
            phrase — that overflowed this 64-80px thumbnail badly; the full
            "reconnecting, RJ is coming back" message already has its own
            room in the text row below. */}
        {isLive && !hasError && (
          <div className={`absolute top-1 right-1 flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isReconnecting ? "bg-amber-500 text-white" : "bg-destructive text-destructive-foreground"}`}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isReconnecting ? "bg-white" : "bg-destructive-foreground"}`} />
            LIVE
          </div>
        )}
        {isLive && rjAvatarUrl && (
          <img
            src={toMediaUrl(rjAvatarUrl) || undefined}
            alt=""
            className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full ring-2 ring-background object-cover"
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-base md:text-lg font-serif font-bold text-foreground truncate">{station.name}</h3>
        {station.description && (
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-1 mt-0.5">{stripHtml(station.description)}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {hasError ? (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
              <WifiOff className="w-3 h-3" />
              Live stream is currently unavailable
            </span>
          ) : isReconnecting ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
              <WifiOff className="w-3 h-3" />
              সাময়িকভাবে সংযোগ বিচ্ছিন্ন — RJ পুনরায় সংযুক্ত হচ্ছেন
            </span>
          ) : isBuffering ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              Connecting to stream...
            </span>
          ) : isCurrentlyPlaying ? (
            <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
              <span className="w-1.5 h-1.5 bg-destructive rounded-full animate-pulse" />
              Streaming Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              Ready to play
            </span>
          )}
          {hasQualityOptions && (
            <div className="flex items-center gap-0.5 ml-1 rounded-full border border-border/30 p-0.5">
              {(["low", "medium", "high"] as Quality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => handleQualityChange(q)}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase transition-colors ${
                    quality === q ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
        {isLive ? (
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            {elapsedLabel && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {elapsedLabel}</span>}
            {typeof listenerData?.count === "number" && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {listenerData.count}</span>}
          </div>
        ) : nextShow ? (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            পরবর্তী: {nextShow.show_title} · {new Date(nextShow.next_occurrence_at).toLocaleString("bn-BD", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })}
          </p>
        ) : null}
      </div>

      <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" onClick={handleShare} title="শেয়ার করুন">
        <Share2 className="w-4 h-4" />
      </Button>

      {/* Play/Pause Button */}
      {hasError ? (
        <Button
          size="icon"
          variant="outline"
          className="w-12 h-12 md:w-14 md:h-14 rounded-full flex-shrink-0 border-muted-foreground/30"
          onClick={() => {
            setStreamStatus("idle")
            retryCountRef.current = 0
            handlePlay()
          }}
          title="Retry"
        >
          <Play className="w-5 h-5 md:w-6 md:h-6 ml-0.5 text-muted-foreground" />
        </Button>
      ) : (
        <Button
          size="icon"
          className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex-shrink-0 shadow-lg transition-all duration-300 ${
            isCurrentlyPlaying
              ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-destructive/25"
              : isBuffering
              ? "bg-amber-500 hover:bg-amber-500/90 text-white"
              : "bg-foreground text-background hover:bg-foreground/90"
          }`}
          onClick={() => (isCurrentlyPlaying ? handlePause() : handlePlay())}
          disabled={isBuffering}
        >
          {isBuffering ? (
            <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
          ) : isCurrentlyPlaying ? (
            <Pause className="w-5 h-5 md:w-6 md:h-6" />
          ) : (
            <Play className="w-5 h-5 md:w-6 md:h-6 ml-0.5" />
          )}
        </Button>
      )}
    </div>
  )
}
