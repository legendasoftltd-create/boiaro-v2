import { useState, useRef, useCallback, useEffect } from "react"
import { Radio, Play, Pause, Loader2, WifiOff, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRadioStation } from "@/hooks/useRadioStation"
import { useCurrentLiveSession } from "@/hooks/useLiveSession"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import type { MasterBook, AudiobookFormat } from "@/lib/types"
import { useSiteSettings } from "@/hooks/useSiteSettings"

export function LiveRadioSection() {
  const { data: station, isLoading } = useRadioStation()
  const { session: liveSession } = useCurrentLiveSession()
  const { get } = useSiteSettings()
  const brandName = get("brand_name", "BoiAro")

  // Admin station toggle is the source of truth for homepage visibility.
  if (isLoading) return null
  if (!station) return null

  // If there's a live RJ session, show that info
  const activeName = liveSession?.rj_profile?.stage_name
    ? `🎙️ ${liveSession.rj_profile.stage_name} — LIVE`
    : station?.name || `${brandName} Radio`
  const activeDescription = liveSession?.show_title || station?.description || null
  const activeStreamUrl = liveSession?.stream_url || station?.stream_url || ""
  const activeArtwork = station?.artwork_url || null
  const isRjLive = !!liveSession

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="section-header">
          <div className="section-icon bg-destructive/15">
            {isRjLive ? <Mic className="w-4 h-4 md:w-5 md:h-5 text-destructive" /> : <Radio className="w-4 h-4 md:w-5 md:h-5 text-destructive" />}
          </div>
          <div>
            <h2 className="text-lg md:text-2xl font-serif font-bold text-foreground">
              Live <span className="text-destructive">{isRjLive ? "Show" : "Radio"}</span>
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              {isRjLive ? `${liveSession.rj_profile?.stage_name || "RJ"} is broadcasting live` : "Listen to live streaming now"}
            </p>
          </div>
        </div>

        <RadioCard
          station={{
            id: station?.id || liveSession?.id || "live",
            name: activeName,
            stream_url: activeStreamUrl,
            artwork_url: activeArtwork,
            description: activeDescription,
          }}
        />
      </div>
    </section>
  )
}

type StreamStatus = "idle" | "loading" | "playing" | "error"

function RadioCard({ station }: { station: { id: string; name: string; stream_url: string; artwork_url: string | null; description: string | null } }) {
  const { book, isPlaying, togglePlay, loadBook, pause } = useAudioPlayer()
  const { get } = useSiteSettings()
  const brandName = get("brand_name", "BoiAro")
  const isRadioActive = book?.id === `radio-${station.id}`

  // Independent stream status tracking for radio
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle")
  const streamAudioRef = useRef<HTMLAudioElement | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 2

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

  const handlePlay = useCallback(() => {
    // If already active in shared player, just toggle
    if (isRadioActive) {
      togglePlay()
      return
    }

    // Validate URL before attempting
    if (!station.stream_url || !station.stream_url.trim()) {
      setStreamStatus("error")
      return
    }

    setStreamStatus("loading")
    retryCountRef.current = 0

    // Build radio book model for the shared player
    const radioBook: MasterBook = {
      id: `radio-${station.id}`,
      title: station.name,
      titleEn: "",
      slug: `radio-${station.id}`,
      cover: station.artwork_url || "/placeholder.svg",
      description: station.description || "Live radio stream",
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
      audioUrl: station.stream_url,
      isPreview: false,
      isActive: true,
    }

    // Load into shared player — the AudioPlayerContext handles actual playback
    loadBook(radioBook, radioAudiobook, [radioTrack])

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
          testAudio.src = station.stream_url
          testAudio.load()
        }, 1000)
      } else {
        setStreamStatus("error")
      }
    }

    testAudio.addEventListener("canplay", onCanPlay, { once: true })
    testAudio.addEventListener("error", onError, { once: true })
    
    testAudio.src = station.stream_url
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
  }, [isRadioActive, station, loadBook, togglePlay])

  const handlePause = useCallback(() => {
    if (isRadioActive) {
      pause()
    }
    setStreamStatus("idle")
  }, [isRadioActive, pause])

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
        {!hasError && (
          <div className="absolute top-1 right-1 flex items-center gap-1 bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-destructive-foreground rounded-full animate-pulse" />
            LIVE
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-base md:text-lg font-serif font-bold text-foreground truncate">{station.name}</h3>
        {station.description && (
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-1 mt-0.5">{station.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {hasError ? (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
              <WifiOff className="w-3 h-3" />
              Live stream is currently unavailable
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
        </div>
      </div>

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
          onClick={isCurrentlyPlaying ? handlePause : handlePlay}
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
