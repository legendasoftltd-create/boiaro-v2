import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react"
import Hls from "hls.js"
import { useAuth } from "@/contexts/AuthContext"
import { useSecureContent } from "@/hooks/useSecureContent"
import { recordPlaybackError } from "@/hooks/useSecureContent"
import { usePresence } from "@/hooks/usePresence"
import { useConsumptionTracker } from "@/hooks/useConsumptionTracker"
import { useActivityTracker } from "@/hooks/useActivityTracker"
import { trpc } from "@/lib/trpc"
import type { MasterBook, AudiobookFormat } from "@/lib/types"
import { toast } from "sonner"
import type { MediaType } from "@/lib/audioValidation"
import { BackgroundAudio, isNativeAudioSupported } from "@/native/backgroundAudio"

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
  chapterPrice?: number
  chapterTakaPrice?: number
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
  loadBook: (book: MasterBook, audiobook: AudiobookFormat, tracks?: AudioTrack[], autoPlay?: boolean, startTrackId?: string) => void
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
  /**
   * True when the free-book "download the app to keep listening" prompt has
   * locked playback. Must be respected by every play control (MiniPlayer,
   * FullPlayer, Media Session) — not just the in-page Listen button — or the
   * lock can be bypassed by simply pressing play again elsewhere.
   */
  appPromptLocked: boolean
  setAppPromptLocked: (val: boolean) => void
  /**
   * Set the free-play threshold in seconds for the current book.
   * AudioPlayerContext enforces this across navigation (timer no longer lives in AudiobookTab).
   * Pass null to clear (paid book, or book already locked).
   */
  setFreePlayThreshold: (seconds: number | null) => void
  /** Register IDs of tracks that must not auto-play without explicit unlock */
  setLockedTrackIds: (ids: Set<string>) => void
  /** Check synchronously whether a track ID is chapter-locked (reads ref, no re-render) */
  isTrackLocked: (trackId: string) => boolean
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined)

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { getSecureUrl, prefetchBatchUrls } = useSecureContent()
  const { setActivity } = usePresence()
  const { trackListeningProgress } = useActivityTracker()
  const utils = trpc.useUtils()
  const updateListeningProgressMutation = trpc.profiles.updateListeningProgress.useMutation()
  const updateListeningProgressRef = useRef(updateListeningProgressMutation.mutateAsync)
  updateListeningProgressRef.current = updateListeningProgressMutation.mutateAsync
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Only ever non-null for HLS (.m3u8) sources — e.g. a radio station
  // streaming HLS — since Chrome/Firefox/Edge can't play those natively
  // (only Safari can). Every other source (audiobook files, direct
  // MP3/AAC/OGG radio streams) still goes through plain audio.src.
  const hlsRef = useRef<Hls | null>(null)
  // Auto-reconnect attempt count for a dropped LIVE radio stream — reset to
  // 0 whenever playback actually recovers. Deliberately not used for
  // regular book/audiobook files: a permanently corrupt file should surface
  // its error immediately, not retry forever.
  const radioReconnectAttemptsRef = useRef(0)
  const radioReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Elapsed-since-open timer for the current book's listening session — the
  // backend uses this to credit goal minutes on the very first periodic
  // save, which otherwise has no prior last_listened_at to diff against and
  // silently credits zero (see updateListeningProgress).
  const sessionStartRef = useRef<number>(Date.now())
  const loadRequestRef = useRef(0)
  const pendingSeekRef = useRef<number | null>(null)
  // Track whether play was triggered by user gesture
  const userGesturePlayRef = useRef(false)
  // Set of track IDs that require unlock before playing — updated by AudiobookTab
  const lockedTrackIdsRef = useRef<Set<string>>(new Set())

  // Preview/paywall state
  const [previewLimitSeconds, setPreviewLimitSeconds] = useState(300)
  const [hasFullAccess, setHasFullAccess] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  /**
   * CRITICAL: accessLoading must be true while the access hook is still checking ownership.
   * Preview enforcement is PAUSED while accessLoading is true to prevent false paywall triggers.
   */
  const [accessLoading, setAccessLoading] = useState(true)
  const [appPromptLocked, setAppPromptLocked] = useState(false)
  // Free-book play threshold — set by AudiobookTab for free books with the prompt enabled.
  // Survives route changes because AudioPlayerContext is mounted at the app root, not per-route.
  const [freePlayThreshold, setFreePlayThresholdState] = useState<number | null>(null)
  const freePlayThresholdRef = useRef<number | null>(null)
  freePlayThresholdRef.current = freePlayThreshold
  const setFreePlayThreshold = useCallback((s: number | null) => setFreePlayThresholdState(s), [])

  const hasFullAccessRef = useRef(hasFullAccess)
  hasFullAccessRef.current = hasFullAccess
  const previewLimitSecondsRef = useRef(previewLimitSeconds)
  previewLimitSecondsRef.current = previewLimitSeconds
  const accessLoadingRef = useRef(accessLoading)
  accessLoadingRef.current = accessLoading
  const showPaywallRef = useRef(showPaywall)
  showPaywallRef.current = showPaywall
  const appPromptLockedRef = useRef(appPromptLocked)
  appPromptLockedRef.current = appPromptLocked

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

  // Update user presence when playback starts/stops
  useEffect(() => {
    if (!user) return
    if (state.isPlaying && state.book?.id) {
      setActivity("listening", state.book.id)
    } else {
      setActivity("browsing")
    }
  }, [state.isPlaying, state.book?.id, user, setActivity])

  useConsumptionTracker(state.book?.id, "audiobook", state.isPlaying)

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

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // .m3u8 = HLS. Safari plays it natively (canPlayType), everyone else
    // needs hls.js to demux it into something <audio> understands — without
    // this, HLS radio streams silently fail to play on Chrome/Firefox/Edge.
    const isHls = /\.m3u8(\?|$)/i.test(url)
    const nativeHlsSupport = audio.canPlayType("application/vnd.apple.mpegurl") !== ""
    if (isHls && !nativeHlsSupport && Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(url)
      hls.attachMedia(audio)
      hlsRef.current = hls
    } else {
      audio.src = url
    }

    audio.playbackRate = currentState.playbackRate
    audio.volume = currentState.volume
    // For video tracks the <video> element in VideoPlayer handles audio+video.
    // Mute the background Audio element so there is no double audio.
    audio.muted = track.mediaType === "video"

    // If we have a saved position, seek after metadata loads
    if (currentState.currentTime > 0 && !shouldPlay) {
      pendingSeekRef.current = currentState.currentTime
    }

    if (!hlsRef.current) audio.load()

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

      // FREE-BOOK GATE: lock when position reaches the admin-configured threshold.
      // Running here (not in AudiobookTab) means it fires even after the user navigates
      // away from the book page and uses the mini-player.
      const freeThresh = freePlayThresholdRef.current
      if (freeThresh !== null && !appPromptLockedRef.current && currentSec >= freeThresh) {
        const bid = stateRef.current.book?.id
        try { if (bid) localStorage.setItem(`app_prompt_audio_${bid}`, "1") } catch {}
        try { if (bid) localStorage.setItem(`app_prompt_locked_audio_${bid}`, "1") } catch {}
        audio.pause()
        setAppPromptLocked(true)
        setFreePlayThresholdState(null)
        setState((prev) => ({ ...prev, isPlaying: false }))
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
      const prev = stateRef.current
      const nextIndex = prev.currentTrackIndex + 1
      if (nextIndex >= prev.tracks.length) {
        setState((p) => ({ ...p, isPlaying: false }))
        return
      }
      const nextTrackId = prev.tracks[nextIndex]?.id
      const nextIsLocked = nextTrackId ? lockedTrackIdsRef.current.has(nextTrackId) : false
      setState((p) => ({
        ...p,
        currentTrackIndex: nextIndex,
        currentTime: 0,
        isPlaying: false,
      }))
      // Only auto-play the next track if it is not chapter-locked
      if (!nextIsLocked) {
        setTimeout(() => loadTrackSource(nextIndex, true), 50)
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
      radioReconnectAttemptsRef.current = 0
    })

    audio.addEventListener("play", () => {
      // BFCACHE / SAFARI GUARD: iOS Safari restores the page from cache on back-navigation,
      // resetting React state to its pre-lock snapshot (appPromptLocked = false).
      // Check localStorage as the persistent source of truth on every play event.
      {
        const bid = stateRef.current.book?.id
        let storageLocked = false
        try { storageLocked = !!bid && !!localStorage.getItem(`app_prompt_locked_audio_${bid}`) } catch {}
        if (storageLocked) {
          if (!appPromptLockedRef.current) setAppPromptLocked(true)
          audio.pause()
          setState((prev) => ({ ...prev, isPlaying: false }))
          return
        }
      }

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
      // CRITICAL: Block play if the "download the app" prompt has locked this
      // free book. Re-pause immediately so MiniPlayer/FullPlayer/Media Session
      // controls can't resume playback behind the modal's back.
      if (appPromptLockedRef.current) {
        audio.pause()
        setState((prev) => ({ ...prev, isPlaying: false }))
        debugLog("play event BLOCKED — app prompt has locked this content")
        return
      }
      // CRITICAL: Block play if the current track requires chapter unlock.
      // This catches resume attempts (mini-player, Media Session, OS controls)
      // on a track that has not been unlocked via coin or taka payment.
      const currentTrack = stateRef.current.tracks[stateRef.current.currentTrackIndex]
      if (currentTrack && lockedTrackIdsRef.current.has(currentTrack.id)) {
        audio.pause()
        setState((prev) => ({ ...prev, isPlaying: false }))
        debugLog("play event BLOCKED — chapter requires unlock", currentTrack.id)
        return
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

      // Live radio streams drop and recover on their own (RJ reconnects,
      // network blip, etc.) — retry a few times with backoff instead of
      // dead-ending on the first error like a genuinely corrupt file would.
      // catchup-*/regular book ids are excluded on purpose: an audiobook
      // file that fails to load is actually broken, not "temporarily offline".
      const bookId = stateRef.current.book?.id
      const isLiveRadio = bookId?.startsWith("radio-")
      if (isLiveRadio && radioReconnectAttemptsRef.current < 5) {
        const attempt = radioReconnectAttemptsRef.current + 1
        radioReconnectAttemptsRef.current = attempt
        const delay = Math.min(2000 * attempt, 15000)
        setState((prev) => ({ ...prev, isLoading: true }))
        if (radioReconnectTimerRef.current) clearTimeout(radioReconnectTimerRef.current)
        radioReconnectTimerRef.current = setTimeout(() => {
          const src = audio.currentSrc
          if (!src || stateRef.current.book?.id !== bookId) return // switched away, don't resurrect
          audio.src = src
          audio.load()
          audio.play().catch(() => {})
        }, delay)
        return
      }

      setState((prev) => ({ ...prev, isPlaying: false, isLoading: false, error: errorMsg }))
      toast.error(isLiveRadio ? "স্ট্রিম সংযোগ বিচ্ছিন্ন — আবার চেষ্টা করতে প্লে চাপুন" : errorMsg)

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
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (radioReconnectTimerRef.current) clearTimeout(radioReconnectTimerRef.current)
    }
  }, [])

  // Network-change reconnect for live radio — a wifi/cellular handoff or a
  // brief connectivity drop often leaves the stream in the same dead state
  // the backoff retries above already handle, but this fires immediately on
  // reconnection instead of waiting out whatever backoff delay was in
  // flight (or, if retries had already been exhausted and the stream gave
  // up, this gives it one more shot without the listener having to press
  // play themselves). Scoped to live radio only, same as the retry logic
  // above — a genuinely broken book/audiobook file should stay failed.
  useEffect(() => {
    const handleOnline = () => {
      const audio = audioRef.current
      const bookId = stateRef.current.book?.id
      if (!audio || !bookId?.startsWith("radio-")) return
      const src = audio.currentSrc
      if (!src) return
      radioReconnectAttemptsRef.current = 0
      if (radioReconnectTimerRef.current) { clearTimeout(radioReconnectTimerRef.current); radioReconnectTimerRef.current = null }
      setState((prev) => ({ ...prev, isLoading: true, error: null }))
      audio.src = src
      audio.load()
      audio.play().catch(() => {})
    }
    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [])

  // TIGHT CHAPTER-LOCK ENFORCEMENT: 200ms interval catches any path that starts
  // playing a chapter that requires coin/taka unlock before it loads.
  useEffect(() => {
    if (!state.isPlaying) return
    const interval = setInterval(() => {
      const audio = audioRef.current
      if (!audio || audio.paused || lockedTrackIdsRef.current.size === 0) return
      const currentTrack = stateRef.current.tracks[stateRef.current.currentTrackIndex]
      if (currentTrack && lockedTrackIdsRef.current.has(currentTrack.id)) {
        audio.pause()
        setState((prev) => ({ ...prev, isPlaying: false }))
      }
    }, 200)
    return () => clearInterval(interval)
  }, [state.isPlaying])

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

  // FOREGROUND CATCH-UP ENFORCEMENT: timeupdate/setInterval can be throttled or
  // suspended entirely while the app is backgrounded (minimized, screen locked),
  // letting audio keep playing past the preview limit unobserved. The instant the
  // app/tab becomes visible again, immediately re-check and pause + paywall if the
  // limit was crossed while we weren't looking — don't wait for the next tick.
  useEffect(() => {
    const enforceOnForeground = () => {
      if (document.visibilityState !== "visible") return
      const audio = audioRef.current
      if (!audio) return
      if (accessLoadingRef.current || hasFullAccessRef.current || previewLimitSecondsRef.current <= 0) return
      if (audio.currentTime >= previewLimitSecondsRef.current) {
        audio.pause()
        audio.currentTime = Math.max(0, previewLimitSecondsRef.current - 1)
        setShowPaywall(true)
        setState((prev) => ({ ...prev, isPlaying: false, currentTime: previewLimitSecondsRef.current - 1 }))
        console.warn("[AudioPlayer] 🔒 Foreground catch-up — preview limit was exceeded while backgrounded")
      }
    }
    document.addEventListener("visibilitychange", enforceOnForeground)
    window.addEventListener("pageshow", enforceOnForeground)
    window.addEventListener("focus", enforceOnForeground)
    return () => {
      document.removeEventListener("visibilitychange", enforceOnForeground)
      window.removeEventListener("pageshow", enforceOnForeground)
      window.removeEventListener("focus", enforceOnForeground)
    }
  }, [])

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

  useEffect(() => {
    sessionStartRef.current = Date.now()
  }, [state.book?.id])

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
    const duration = Math.floor(audio?.duration || 0)
    await updateListeningProgressRef.current({
      bookId: state.book.id,
      currentPosition: Math.floor(state.currentTime),
      totalDuration: duration,
      currentTrack: state.currentTrackIndex + 1,
      playbackSpeed: state.playbackRate,
      sessionSeconds: (Date.now() - sessionStartRef.current) / 1000,
    }).catch(() => {}) // silent — progress save is best-effort

    // Real audiobooks only — radio/catch-up reuse this same player with
    // synthetic ids ("radio-…"/"catchup-…") that don't exist in the Book
    // table; this feeds the admin Reading Analytics "Active Listeners"
    // widget and daily/monthly audiobook column, which should only reflect
    // real audiobook listening, not live radio.
    if (!state.book.id.startsWith("radio-") && !state.book.id.startsWith("catchup-")) {
      trackListeningProgress(state.book.id, duration, duration > 0 ? Math.round((state.currentTime / duration) * 100) : 0)
    }
  }, [user, state.book, state.currentTime, state.currentTrackIndex, state.playbackRate, trackListeningProgress])

  const loadBook = useCallback((book: MasterBook, audiobook: AudiobookFormat, tracks?: AudioTrack[], autoPlay?: boolean, startTrackId?: string) => {
    const finalTracks: AudioTrack[] = (tracks || [])
      .filter((track) => (track.isActive ?? true) && Boolean((track.storagePath || track.audioUrl || "").trim()))
      .sort((a, b) => a.trackNumber - b.trackNumber)

    const startIndex = startTrackId ? Math.max(0, finalTracks.findIndex((t) => t.id === startTrackId)) : 0

    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ""
    }
    hlsRef.current?.destroy()
    hlsRef.current = null
    radioReconnectAttemptsRef.current = 0
    if (radioReconnectTimerRef.current) { clearTimeout(radioReconnectTimerRef.current); radioReconnectTimerRef.current = null }

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

    // Auto-open FullPlayer for video tracks so the user sees the video immediately
    const firstVideoTrack = finalTracks[0]?.mediaType === "video"

    setState((prev) => ({
      ...prev,
      book,
      audiobook,
      tracks: finalTracks,
      currentTrackIndex: startIndex,
      currentTime: 0,
      isPlaying: false,
      progressPercentage: 0,
      error: null,
      isLoading: autoPlay ? true : false,
      isFullPlayerOpen: prev.isFullPlayerOpen || firstVideoTrack,
    }))

    if (user) {
      // A specific starting chapter was requested (e.g. just-purchased chapter) —
      // skip restoring saved progress so we don't jump away from it.
      if (!startTrackId) loadSavedProgress(book.id)
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
      const savedSpeed = data.playback_speed ? Number(data.playback_speed) : null
      setState((prev) => ({
        ...prev,
        currentTrackIndex: Math.max(0, (data.current_track || 1) - 1),
        currentTime: Number(data.current_position) || 0,
        progressPercentage: Number(data.percentage) || 0,
        ...(savedSpeed && savedSpeed > 0 ? { playbackRate: savedSpeed } : {}),
      }))
      if (savedSpeed && savedSpeed > 0 && audioRef.current) {
        audioRef.current.playbackRate = savedSpeed
      }
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

    if (appPromptLockedRef.current) {
      debugLog("play() blocked — app prompt has locked this content")
      return
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

    if (!currentState.isPlaying && appPromptLockedRef.current) {
      debugLog("togglePlay blocked — app prompt has locked this content")
      return
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
    // Block seeking entirely while the app-prompt lock is active — Media
    // Session/OS seek controls call this directly, bypassing any UI disabled
    // attribute on the seek bar/skip buttons.
    if (appPromptLockedRef.current) return
    // Block seeking PAST the free-play threshold — fires the lock immediately
    // so fast-forwarding cannot bypass the "download app" gate.
    const freeThresh = freePlayThresholdRef.current
    if (freeThresh !== null && time >= freeThresh) {
      const bid = stateRef.current.book?.id
      try { if (bid) localStorage.setItem(`app_prompt_audio_${bid}`, "1") } catch {}
      try { if (bid) localStorage.setItem(`app_prompt_locked_audio_${bid}`, "1") } catch {}
      setAppPromptLocked(true)
      setFreePlayThresholdState(null)
      return
    }
    const audio = audioRef.current
    if (audio && audio.src) {
      audio.currentTime = time
    }
    setState((p) => ({ ...p, currentTime: time }))
  }, [])

  const nextTrack = useCallback(() => {
    if (appPromptLockedRef.current) return
    setState((p) => {
      if (p.currentTrackIndex >= p.tracks.length - 1) return p
      const nextId = p.tracks[p.currentTrackIndex + 1]?.id
      const nextIsLocked = nextId ? lockedTrackIdsRef.current.has(nextId) : false
      // Don't auto-play if the next track is chapter-locked
      userGesturePlayRef.current = p.isPlaying && !nextIsLocked
      prevTrackKeyRef.current = null
      return { ...p, currentTrackIndex: p.currentTrackIndex + 1, currentTime: 0 }
    })
  }, [])

  const prevTrack = useCallback(() => {
    if (appPromptLockedRef.current) return
    setState((p) => {
      if (p.currentTrackIndex <= 0) return p
      const prevId = p.tracks[p.currentTrackIndex - 1]?.id
      const prevIsLocked = prevId ? lockedTrackIdsRef.current.has(prevId) : false
      userGesturePlayRef.current = p.isPlaying && !prevIsLocked
      prevTrackKeyRef.current = null
      return { ...p, currentTrackIndex: p.currentTrackIndex - 1, currentTime: 0 }
    })
  }, [])

  const goToTrack = useCallback((index: number) => {
    const targetId = stateRef.current.tracks[index]?.id
    const isLocked = targetId ? lockedTrackIdsRef.current.has(targetId) : false
    userGesturePlayRef.current = !isLocked
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

  // bfcache restore: iOS Safari unfreezes the page when user presses Back, resetting
  // React state. Re-apply the lock from localStorage so the gate survives back-navigation.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      const bid = stateRef.current.book?.id
      if (!bid) return
      let storageLocked = false
      try { storageLocked = !!localStorage.getItem(`app_prompt_locked_audio_${bid}`) } catch {}
      if (storageLocked && !appPromptLockedRef.current) {
        setAppPromptLocked(true)
        audioRef.current?.pause()
        setState((prev) => ({ ...prev, isPlaying: false }))
      }
    }
    window.addEventListener("pageshow", handlePageShow)
    return () => window.removeEventListener("pageshow", handlePageShow)
  }, [])

  const openFullPlayer = useCallback(() => setState((p) => ({ ...p, isFullPlayerOpen: true })), [])
  const closeFullPlayer = useCallback(() => setState((p) => ({ ...p, isFullPlayerOpen: false })), [])
  const setLockedTrackIds = useCallback((ids: Set<string>) => { lockedTrackIdsRef.current = ids }, [])
  const isTrackLocked = useCallback((trackId: string) => lockedTrackIdsRef.current.has(trackId), [])

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

  // Native background playback + lock-screen controls (Android — see
  // src/native/backgroundAudio.ts). A no-op on web/iOS. Mirrors the same
  // title/artist the web Media Session block above already computes, kept
  // as a separate effect so a native-bridge failure can never affect the
  // web Media Session path.
  useEffect(() => {
    if (!isNativeAudioSupported || !state.book) return
    const title = state.tracks[state.currentTrackIndex]?.title || state.book.title
    const artist = state.book.author?.name || "Unknown"
    if (state.isPlaying) {
      BackgroundAudio.start({ title, artist, isPlaying: true }).catch(() => {})
    } else if (state.tracks.length > 0) {
      BackgroundAudio.updatePlaybackState({ isPlaying: false }).catch(() => {})
    }
  }, [state.isPlaying, state.book, state.currentTrackIndex, state.tracks])

  // Relays native transport events (lock screen / notification / Bluetooth
  // tap, or an incoming-call audio-focus loss) back into the real <audio>
  // element — registered once, reads current play/pause via refs so it
  // never needs to re-subscribe.
  useEffect(() => {
    if (!isNativeAudioSupported) return
    const playListener = BackgroundAudio.addListener("play", () => play())
    const pauseListener = BackgroundAudio.addListener("pause", () => pause())
    const stopListener = BackgroundAudio.addListener("stop", () => pause())
    return () => {
      playListener.then((h) => h.remove())
      pauseListener.then((h) => h.remove())
      stopListener.then((h) => h.remove())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        appPromptLocked,
        setAppPromptLocked,
        setFreePlayThreshold,
        setLockedTrackIds,
        isTrackLocked,
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
      isTrackLocked: () => false,
    } as any;
  }
  return ctx
}


function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
