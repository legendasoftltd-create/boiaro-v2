import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useSecureContent } from "@/hooks/useSecureContent"
import { recordPlaybackError } from "@/hooks/useSecureContent"
import { trpc } from "@/lib/trpc"
import type { MasterBook, AudiobookFormat } from "@/lib/types"
import { toast } from "sonner"
import type { MediaType } from "@/lib/audioValidation"

export interface AudioTrack {
  id: string
  trackNumber: number
  title: string
  duration: string
  audioUrl: string | null
  storagePath?: string | null
  mimeType?: string | null
  mediaType?: MediaType
  isActive?: boolean
  isPreview: boolean
}

interface PlayerState {
  book: MasterBook | null
  audiobook: AudiobookFormat | null
  tracks: AudioTrack[]
  currentTrackIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  volume: number
  isFullPlayerOpen: boolean
  progressPercentage: number
  isLoading: boolean
  error: string | null
}

interface AudioPlayerContextType extends PlayerState {
  loadBook: (book: MasterBook, audiobook: AudiobookFormat, tracks?: AudioTrack[], autoPlay?: boolean) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  seekTo: (time: number) => void
  nextTrack: () => void
  prevTrack: () => void
  goToTrack: (index: number) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (vol: number) => void
  openFullPlayer: () => void
  closeFullPlayer: () => void
  formatTime: (seconds: number) => string
  skipForward10: () => void
  skipBackward10: () => void
  currentMediaType: MediaType
  resolveTrackUrl: (track: AudioTrack, bookId: string) => Promise<string | null>
  // Preview/paywall
  previewLimitSeconds: number
  setPreviewLimitSeconds: (limit: number) => void
  hasFullAccess: boolean
  setHasFullAccess: (val: boolean) => void
  /** True only when access check is done AND user does NOT have full access */
  isPreviewMode: boolean
  showPaywall: boolean
  setShowPaywall: (val: boolean) => void
  /** Whether the access check is still in progress — preview enforcement is paused while true */
  accessLoading: boolean
  setAccessLoading: (val: boolean) => void
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined)

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { getSecureUrl, prefetchBatchUrls } = useSecureContent()
  const utils = trpc.useUtils()
  const updateListeningProgressMutation = trpc.profiles.updateListeningProgress.useMutation()
  const updateListeningProgressRef = useRef(updateListeningProgressMutation.mutateAsync)
  updateListeningProgressRef.current = updateListeningProgressMutation.mutateAsync
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadRequestRef = useRef(0)
  const pendingSeekRef = useRef<number | null>(null)
  // Track whether play was triggered by user gesture
  const userGesturePlayRef = useRef(false)

  // Preview/paywall state
  const [previewLimitSeconds, setPreviewLimitSeconds] = useState(300)
  const [hasFullAccess, setHasFullAccess] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  /**
   * CRITICAL: accessLoading must be true while the access hook is still checking ownership.
   * Preview enforcement is PAUSED while accessLoading is true to prevent false paywall triggers.
   */
  const [accessLoading, setAccessLoading] = useState(true)
  const hasFullAccessRef = useRef(hasFullAccess)
  hasFullAccessRef.current = hasFullAccess
  const previewLimitSecondsRef = useRef(previewLimitSeconds)
  previewLimitSecondsRef.current = previewLimitSeconds
  const accessLoadingRef = useRef(accessLoading)
  accessLoadingRef.current = accessLoading
  const showPaywallRef = useRef(showPaywall)
  showPaywallRef.current = showPaywall

  const [state, setState] = useState<PlayerState>({
    book: null,
    audiobook: null,
    tracks: [],
    currentTrackIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    volume: 1,
    isFullPlayerOpen: false,
    progressPercentage: 0,
    isLoading: false,
    error: null,
  })

  const debugLog = (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.debug("[AudioPlayer]", ...args)
    }
  }

  const dispatchBgMusicUnlock = useCallback(() => {
    window.dispatchEvent(new CustomEvent("bgmusic-unlock"))
  }, [])

  /** Returns the media type of the currently active track */
  const currentMediaType: MediaType = state.tracks[state.currentTrackIndex]?.mediaType || "audio"

  // Resolve audio URL for a track
  const resolveTrackUrl = useCallback(async (track: AudioTrack, bookId: string): Promise<string | null> => {
    const rawSource = (track.storagePath || track.audioUrl || "").trim()
    let url: string | null = null

    if (isHttpUrl(rawSource)) {
      url = rawSource
    } else if (rawSource) {
      try {
        const result = await getSecureUrl(bookId, "audiobook", track.trackNumber)
        if (result?.url) url = result.url
      } catch (e) {
        debugLog("Signed URL generation failed", e)
      }
    }

    return url
  }, [getSecureUrl])

  // Actually start playback on the audio element — call ONLY from user gesture chain
  const playAudio = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !audio.src || audio.src === "" || audio.src === window.location.href) return

    try {
      await audio.play()
      setState((prev) => ({ ...prev, isPlaying: true, error: null }))
    } catch (e: any) {
      if (e.name === "AbortError") return // benign: src changed mid-play
      debugLog("play() rejected", e.name, e.message)
      setState((prev) => ({ ...prev, isPlaying: false }))
      toast.error("Tap the play button to start playback")
    }
  }, [])

  // Load a track's source into the audio element (does NOT auto-play)
  const loadTrackSource = useCallback(async (trackIndex: number, shouldPlay: boolean) => {
    const audio = audioRef.current
    const currentState = stateRef.current
    if (!audio || !currentState.book || currentState.tracks.length === 0) return

    const track = currentState.tracks[trackIndex]
    if (!track) return

    const requestId = ++loadRequestRef.current
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    const rawSource = (track.storagePath || track.audioUrl || "").trim()
    const url = await resolveTrackUrl(track, currentState.book!.id)

    if (requestId !== loadRequestRef.current) return

    if (!url) {
      const errorMsg = rawSource ? "Audio file could not be loaded" : "No audio file available for this track"
      setState((prev) => ({ ...prev, isLoading: false, isPlaying: false, error: errorMsg }))
      return
    }

    debugLog("Loading track", { trackIndex, url: url.slice(0, 80) })
    audio.pause()
    audio.src = url
    audio.playbackRate = currentState.playbackRate
    audio.volume = currentState.volume

    // If we have a saved position, seek after metadata loads
    if (currentState.currentTime > 0 && !shouldPlay) {
      pendingSeekRef.current = currentState.currentTime
    }

    audio.load()

    // If triggered by user gesture, play immediately after load
    if (shouldPlay) {
      const onCanPlay = async () => {
        audio.removeEventListener("canplay", onCanPlay)
        if (requestId !== loadRequestRef.current) return
        await playAudio()
      }
      audio.addEventListener("canplay", onCanPlay, { once: true })
    }
  }, [resolveTrackUrl, playAudio])

  // Use a ref to always have current state in callbacks
  const stateRef = useRef(state)
  stateRef.current = state

  // Create media element once (audio — video tracks use the embedded <video> in FullPlayer)
  useEffect(() => {
    const audio = new Audio()
    audio.preload = "metadata"
    audioRef.current = audio

    audio.addEventListener("timeupdate", () => {
      const currentSec = audio.currentTime
      const dur = audio.duration

      /**
       * PREVIEW ENFORCEMENT — triggered on every timeupdate.
       * CRITICAL: Do NOT enforce while accessLoading is true — this prevents
       * false paywall triggers before the access hook resolves ownership.
       * Only enforce when: access is loaded AND user does NOT have full access.
       */
      const isAccessLoading = accessLoadingRef.current
      const accessRef = hasFullAccessRef.current
      const limitRef = previewLimitSecondsRef.current

      // Log preview enforcement state periodically (every ~5 seconds)
      if (import.meta.env.DEV && Math.floor(currentSec) % 5 === 0 && Math.floor(currentSec) !== Math.floor(currentSec - 0.3)) {
        console.debug("[AudioPlayer] preview check", {
          currentSec: Math.floor(currentSec),
          previewLimit: limitRef,
          hasFullAccess: accessRef,
          accessLoading: isAccessLoading,
          enforcing: !isAccessLoading && !accessRef && limitRef > 0,
        })
      }

      if (!isAccessLoading && !accessRef && limitRef > 0 && currentSec >= limitRef) {
        audio.pause()
        audio.currentTime = Math.max(0, limitRef - 1)
        setShowPaywall(true)
        setState((prev) => ({ ...prev, isPlaying: false, currentTime: limitRef - 1 }))
        console.warn("[AudioPlayer] 🔒 Preview limit reached — paywall triggered", {
          currentSec: Math.floor(currentSec),
          previewLimit: limitRef,
        })
        return
      }

      setState((prev) => ({
        ...prev,
        currentTime: currentSec,
        duration: dur || prev.duration,
        progressPercentage: dur ? (currentSec / dur) * 100 : 0,
      }))
    })

    audio.addEventListener("ended", () => {
      setState((prev) => {
        if (prev.currentTrackIndex < prev.tracks.length - 1) {
          // Move to next track — will be loaded via effect
          return { ...prev, currentTrackIndex: prev.currentTrackIndex + 1, currentTime: 0, isPlaying: false }
        }
        return { ...prev, isPlaying: false }
      })
      // Auto-advance: load next track and play
      const prev = stateRef.current
      if (prev.currentTrackIndex < prev.tracks.length - 1) {
        setTimeout(() => loadTrackSource(prev.currentTrackIndex + 1, true), 50)
      }
    })

    audio.addEventListener("loadedmetadata", () => {
      if (pendingSeekRef.current !== null && Number.isFinite(pendingSeekRef.current)) {
        audio.currentTime = Math.min(pendingSeekRef.current, audio.duration || pendingSeekRef.current)
      }
      pendingSeekRef.current = null
      setState((prev) => ({ ...prev, duration: audio.duration, isLoading: false }))
    })

    audio.addEventListener("canplay", () => {
      setState((prev) => ({ ...prev, isLoading: false }))
    })

    audio.addEventListener("play", () => {
      // CRITICAL: If paywall is active or we're past the preview limit, immediately re-pause.
      // This prevents any code path (Media Session, OS controls, etc.) from bypassing the paywall.
      if (!accessLoadingRef.current && !hasFullAccessRef.current && previewLimitSecondsRef.current > 0) {
        if (showPaywallRef.current || audio.currentTime >= previewLimitSecondsRef.current) {
          audio.pause()
          audio.currentTime = Math.max(0, previewLimitSecondsRef.current - 1)
          setShowPaywall(true)
          setState((prev) => ({ ...prev, isPlaying: false }))
          debugLog("play event BLOCKED — paywall active or past preview limit")
          return
        }
      }
      setState((prev) => ({ ...prev, isPlaying: true, error: null }))
    })

    audio.addEventListener("pause", () => {
      setState((prev) => ({ ...prev, isPlaying: false }))
    })

    audio.addEventListener("error", () => {
      if (!audio.currentSrc || audio.currentSrc === "" || audio.currentSrc === window.location.href) return

      const mediaError = audio.error
      const errorMsg = mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? "Audio file could not be loaded — format may not be supported"
        : "Audio file could not be loaded"

      debugLog("Audio error event", {
        src: audio.currentSrc,
        code: mediaError?.code,
        message: mediaError?.message,
      })

      recordPlaybackError()
      setState((prev) => ({ ...prev, isPlaying: false, isLoading: false, error: errorMsg }))
      toast.error(errorMsg)

      /**
       * CRITICAL: If audio fails to load and user does NOT have full access,
       * show paywall. Audio load errors must NOT silently bypass paywall flow.
       */
      if (!accessLoadingRef.current && !hasFullAccessRef.current) {
        debugLog("Audio load error + no access → triggering paywall")
        setShowPaywall(true)
      }
    })

    audio.addEventListener("waiting", () => {
      setState((prev) => ({ ...prev, isLoading: true }))
    })

    return () => {
      audio.pause()
      audio.src = ""
    }
  }, [])

  // TIGHT PREVIEW ENFORCEMENT: 200ms interval as backup to timeupdate (~250ms)
  // Catches any audio that slips past the timeupdate check
  useEffect(() => {
    if (hasFullAccess || accessLoading || !state.isPlaying || previewLimitSeconds <= 0) return

    const interval = setInterval(() => {
      const audio = audioRef.current
      if (!audio || audio.paused) return

      if (audio.currentTime >= previewLimitSecondsRef.current) {
        audio.pause()
        audio.currentTime = Math.max(0, previewLimitSecondsRef.current - 1)
        setShowPaywall(true)
        setState((prev) => ({ ...prev, isPlaying: false, currentTime: previewLimitSecondsRef.current - 1 }))
        console.warn("[AudioPlayer] 🔒 Tight enforcement caught playback past preview limit")
      }
    }, 200)

    return () => clearInterval(interval)
  }, [hasFullAccess, accessLoading, state.isPlaying, previewLimitSeconds])

  // Load audio source when track index changes (but don't auto-play)
  const prevTrackKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!state.book || state.tracks.length === 0) return
    const trackKey = `${state.book.id}:${state.currentTrackIndex}`
    if (prevTrackKeyRef.current === trackKey) return
    prevTrackKeyRef.current = trackKey

    // Only auto-play if user gesture triggered it
    const shouldPlay = userGesturePlayRef.current
    userGesturePlayRef.current = false
    loadTrackSource(state.currentTrackIndex, shouldPlay)
  }, [state.currentTrackIndex, state.book?.id, state.tracks, loadTrackSource])

  // Save progress periodically
  useEffect(() => {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    if (!state.isPlaying || !user || !state.book) return

    saveTimerRef.current = setInterval(() => {
      saveProgress()
    }, 15000)

    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    }
  }, [state.isPlaying, user, state.book, state.currentTrackIndex])

  const saveProgress = useCallback(async () => {
    if (!user || !state.book) return
    const audio = audioRef.current
    await updateListeningProgressRef.current({
      bookId: state.book.id,
      currentPosition: Math.floor(state.currentTime),
      totalDuration: Math.floor(audio?.duration || 0),
      currentTrack: state.currentTrackIndex + 1,
    }).catch(() => {}) // silent — progress save is best-effort
  }, [user, state.book, state.currentTime, state.currentTrackIndex])

  const loadBook = useCallback((book: MasterBook, audiobook: AudiobookFormat, tracks?: AudioTrack[], autoPlay?: boolean) => {
    const finalTracks: AudioTrack[] = (tracks || [])
      .filter((track) => (track.isActive ?? true) && Boolean((track.storagePath || track.audioUrl || "").trim()))
      .sort((a, b) => a.trackNumber - b.trackNumber)

    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ""
    }

    prevTrackKeyRef.current = null

    // CRITICAL: Reset access state when loading a new book.
    // The AudiobookTab sync effect will set correct values once access check completes.
    setHasFullAccess(false)
    setAccessLoading(true)
    setShowPaywall(false)

    console.debug("[AudioPlayer] loadBook — access reset to loading", {
      bookId: book.id,
      isFree: audiobook.price === 0,
      trackCount: finalTracks.length,
      autoPlay,
    })

    // If autoPlay requested, set the gesture ref so the load effect will play
    if (autoPlay && finalTracks.length > 0) {
      userGesturePlayRef.current = true
    }

    setState((prev) => ({
      ...prev,
      book,
      audiobook,
      tracks: finalTracks,
      currentTrackIndex: 0,
      currentTime: 0,
      isPlaying: false,
      progressPercentage: 0,
      error: null,
      isLoading: autoPlay ? true : false,
    }))

    if (user) {
      loadSavedProgress(book.id)
      // Batch prefetch all signed URLs for this audiobook in a single edge function call
      prefetchBatchUrls(book.id).catch((e) =>
        console.warn("[AudioPlayer] batch prefetch failed", e)
      )
    }
  }, [user, prefetchBatchUrls])

  const loadSavedProgress = async (bookId: string) => {
    if (!user) return
    const data = await utils.profiles.listeningProgressByBook.fetch({ bookId }).catch(() => null)
    if (data) {
      setState((prev) => ({
        ...prev,
        currentTrackIndex: Math.max(0, (data.current_track || 1) - 1),
        currentTime: Number(data.current_position) || 0,
        progressPercentage: Number(data.percentage) || 0,
      }))
    }
  }

  // --- User-gesture-safe controls ---

  const play = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    /**
     * PREVIEW GUARD: Block playback if user is past preview limit and has no access.
     * This prevents resuming after paywall has been triggered.
     */
    if (!accessLoadingRef.current && !hasFullAccessRef.current && previewLimitSecondsRef.current > 0) {
      if (audio.currentTime >= previewLimitSecondsRef.current) {
        setShowPaywall(true)
        debugLog("play() blocked — past preview limit, showing paywall")
        return
      }
    }

    if (audio.src && audio.src !== "" && audio.src !== window.location.href) {
      dispatchBgMusicUnlock()
      playAudio()
    } else {
      dispatchBgMusicUnlock()
      userGesturePlayRef.current = true
      prevTrackKeyRef.current = null
      setState((p) => ({ ...p }))
    }
  }, [dispatchBgMusicUnlock, playAudio])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (audio) audio.pause()
    setState((p) => ({ ...p, isPlaying: false }))
    saveProgress()
  }, [saveProgress])

  const togglePlay = useCallback(() => {
    const currentState = stateRef.current
    if (currentState.tracks.length === 0) {
      if (currentState.isLoading || currentState.book) {
        debugLog("togglePlay called while tracks still loading — ignoring")
        return
      }
      toast.error("No audio tracks available")
      return
    }

    const audio = audioRef.current
    if (!audio) return

    /**
     * PREVIEW GUARD: Block play toggle if past preview limit without access.
     */
    if (!currentState.isPlaying && !accessLoadingRef.current && !hasFullAccessRef.current && previewLimitSecondsRef.current > 0) {
      if (audio.currentTime >= previewLimitSecondsRef.current) {
        setShowPaywall(true)
        debugLog("togglePlay blocked — past preview limit, showing paywall")
        return
      }
    }

    if (currentState.isPlaying) {
      audio.pause()
      saveProgress()
    } else {
      if (audio.src && audio.src !== "" && audio.src !== window.location.href) {
        dispatchBgMusicUnlock()
        playAudio()
      } else {
        dispatchBgMusicUnlock()
        userGesturePlayRef.current = true
        prevTrackKeyRef.current = null
        setState((p) => ({ ...p, error: null }))
      }
    }
  }, [dispatchBgMusicUnlock, playAudio, saveProgress])

  const seekTo = useCallback((time: number) => {
    // Block seeking past preview limit
    if (!hasFullAccessRef.current && previewLimitSecondsRef.current > 0 && time >= previewLimitSecondsRef.current) {
      setShowPaywall(true)
      return
    }
    const audio = audioRef.current
    if (audio && audio.src) {
      audio.currentTime = time
    }
    setState((p) => ({ ...p, currentTime: time }))
  }, [])

  const nextTrack = useCallback(() => {
    setState((p) => {
      if (p.currentTrackIndex >= p.tracks.length - 1) return p
      userGesturePlayRef.current = p.isPlaying
      prevTrackKeyRef.current = null
      return { ...p, currentTrackIndex: p.currentTrackIndex + 1, currentTime: 0 }
    })
  }, [])

  const prevTrack = useCallback(() => {
    setState((p) => {
      if (p.currentTrackIndex <= 0) return p
      userGesturePlayRef.current = p.isPlaying
      prevTrackKeyRef.current = null
      return { ...p, currentTrackIndex: p.currentTrackIndex - 1, currentTime: 0 }
    })
  }, [])

  const goToTrack = useCallback((index: number) => {
    userGesturePlayRef.current = true
    prevTrackKeyRef.current = null
    setState((p) => ({ ...p, currentTrackIndex: index, currentTime: 0 }))
  }, [])

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate
    setState((p) => ({ ...p, playbackRate: rate }))
  }, [])

  const setVolume = useCallback((vol: number) => {
    if (audioRef.current) audioRef.current.volume = vol
    setState((p) => ({ ...p, volume: vol }))
  }, [])

  const skipForward10 = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.src) {
      seekTo(Math.min(audio.duration || Infinity, audio.currentTime + 10))
    }
  }, [seekTo])

  const skipBackward10 = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.src) {
      seekTo(Math.max(0, audio.currentTime - 10))
    }
  }, [seekTo])

  const openFullPlayer = useCallback(() => setState((p) => ({ ...p, isFullPlayerOpen: true })), [])
  const closeFullPlayer = useCallback(() => setState((p) => ({ ...p, isFullPlayerOpen: false })), [])

  // Media Session API for lock screen / notification controls & background play
  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.book) return

    if (state.isPlaying) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.tracks[state.currentTrackIndex]?.title || state.book.title,
        artist: state.book.author?.name || "Unknown",
        album: state.book.title,
        artwork: state.book.cover
          ? [
              { src: state.book.cover, sizes: "96x96", type: "image/jpeg" },
              { src: state.book.cover, sizes: "256x256", type: "image/jpeg" },
              { src: state.book.cover, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      })
      navigator.mediaSession.playbackState = "playing"
    } else if (state.book && state.tracks.length > 0) {
      navigator.mediaSession.playbackState = "paused"
    }
  }, [state.isPlaying, state.book, state.currentTrackIndex, state.tracks])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return

    const handlers: [MediaSessionAction, (() => void) | undefined][] = [
      ["play", play],
      ["pause", pause],
      ["nexttrack", nextTrack],
      ["previoustrack", prevTrack],
      ["seekforward", skipForward10],
      ["seekbackward", skipBackward10],
    ]

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler || null)
      } catch { /* unsupported action */ }
    }

    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* ignore */ }
      }
    }
  }, [play, pause, nextTrack, prevTrack, skipForward10, skipBackward10])

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00"
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  return (
    <AudioPlayerContext.Provider
      value={{
        ...state,
        loadBook,
        play,
        pause,
        togglePlay,
        seekTo,
        nextTrack,
        prevTrack,
        goToTrack,
        setPlaybackRate,
        setVolume,
        openFullPlayer,
        closeFullPlayer,
        skipForward10,
        skipBackward10,
        formatTime,
        currentMediaType,
        resolveTrackUrl,
        previewLimitSeconds,
        setPreviewLimitSeconds,
        hasFullAccess,
        setHasFullAccess,
        /**
         * isPreviewMode is true ONLY when access check is complete AND user lacks access.
         * While accessLoading is true, isPreviewMode is false to prevent premature paywall.
         */
        isPreviewMode: !accessLoading && !hasFullAccess,
        showPaywall,
        setShowPaywall,
        accessLoading,
        setAccessLoading,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  )
}

const defaultPlayerState = {
  book: null, audiobook: null, tracks: [], currentTrackIndex: 0,
  isPlaying: false, currentTime: 0, duration: 0, volume: 1, speed: 1,
  isBuffering: false, showFullPlayer: false, isMinimized: false,
  hasAccess: false, accessLoading: false,
} as const;

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext)
  if (!ctx) {
    // Return a safe no-op fallback so components outside the provider don't crash
    return {
      ...defaultPlayerState,
      playBook: () => {}, pause: () => {}, resume: () => {}, togglePlay: () => {},
      seekTo: () => {}, setVolume: () => {}, setSpeed: () => {},
      playTrack: () => {}, nextTrack: () => {}, prevTrack: () => {},
      openFullPlayer: () => {}, closeFullPlayer: () => {}, minimize: () => {},
      restore: () => {}, stop: () => {}, audioRef: { current: null },
    } as any;
  }
  return ctx
}

function parseDurationToSeconds(dur: string): number {
  const hMatch = dur.match(/(\d+)h/)
  const mMatch = dur.match(/(\d+)m/)
  return (parseInt(hMatch?.[1] || "0") * 3600) + (parseInt(mMatch?.[1] || "0") * 60)
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
