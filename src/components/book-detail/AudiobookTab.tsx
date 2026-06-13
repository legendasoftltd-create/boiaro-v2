import { useEffect, useRef, useState, useCallback } from "react"
import { Play, Pause, Clock, Mic, Headphones, AlertCircle, Loader2, Lock, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAudioPlayer, type AudioTrack } from "@/contexts/AudioPlayerContext"
import { useAuth } from "@/contexts/AuthContext"
import { useAudiobookAccess } from "@/hooks/useAudiobookAccess"
import { AudiobookChapterUnlock } from "@/components/book-detail/AudiobookChapterUnlock"
import { AudiobookPaywallModal } from "@/components/audio-player/AudiobookPaywallModal"
import { MobileAppPromptModal } from "@/components/MobileAppPromptModal"
import { VideoPlayer } from "@/components/audio-player/VideoPlayer"
import { QuickUnlockModal } from "@/components/book-detail/QuickUnlockModal"
import { useSiteSettings } from "@/hooks/useSiteSettings"
import { trpc } from "@/lib/trpc"
import type { MasterBook, AudiobookFormat } from "@/lib/types"
import { durationToSeconds, formatDuration } from "@/lib/duration"

interface Props {
  book: MasterBook
  audiobook: AudiobookFormat
  audioTracks?: AudioTrack[]
}

export function AudiobookTab({ book, audiobook, audioTracks = [] }: Props) {
  const {
    loadBook, book: activeBook, isPlaying, togglePlay, tracks, currentTrackIndex,
    goToTrack, openFullPlayer, progressPercentage, isLoading, error, currentTime, duration, formatTime,
    setPreviewLimitSeconds, setHasFullAccess, isPreviewMode, showPaywall, setShowPaywall,
    setAccessLoading, seekTo, pause,
  } = useAudioPlayer()

  const { user } = useAuth()

  const isThisBookActive = activeBook?.id === book.id
  // Is the currently-playing track a video?
  const isCurrentTrackVideo = isThisBookActive && tracks[currentTrackIndex]?.mediaType === "video"
  const totalDurSec = durationToSeconds(audiobook.duration)
  const isFree = audiobook.price === 0 || book.isFree

  // ── Chapter-level unlock state (shared with AudiobookChapterUnlock via tRPC cache) ──
  const { data: coinSettings } = trpc.wallet.coinSettings.useQuery(undefined, { enabled: !!user })
  const { data: userUnlocks = [] } = trpc.wallet.userUnlocks.useQuery(undefined, { enabled: !!user })
  const coinEnabled = coinSettings ? coinSettings.systemEnabled && coinSettings.unlockEnabled : false
  const bookUnlocks = (userUnlocks as any[]).filter((u: any) => u.book_id === book.id && u.status === "active")
  const hasFullUnlock = bookUnlocks.some((u: any) => u.format === "audiobook")
  const unlockedChapterIds = new Set<string>(
    bookUnlocks.map((u: any) => u.format?.match(/^audiobook_chapter_(.+)$/)?.[1]).filter(Boolean)
  )
  const [lockedTrack, setLockedTrack] = useState<(AudioTrack & { chapterPrice: number }) | null>(null)
  const unlockContentMutation = trpc.wallet.unlockContent.useMutation()

  // Pass live audio element duration so preview recalculates with actual metadata
  const liveDuration = isThisBookActive && duration > 0 ? duration : undefined
  // access MUST be declared before any useCallback that references it
  const access = useAudiobookAccess(book.id, isFree, totalDurSec, audiobook.previewPercentage, liveDuration)

  // ── Full-book unlock cost (computed after access is defined) ──────────────
  const lockedTracks = audioTracks.filter(t =>
    !t.isPreview && !unlockedChapterIds.has(t.id) && Number((t as any).chapterPrice) > 0
  )
  const remainingIndividualCost = lockedTracks.reduce((sum, t) => sum + (Number((t as any).chapterPrice) || 0), 0)
  const BUNDLE_DISCOUNT = 0.2
  const fullUnlockCost = remainingIndividualCost > 1 ? Math.round(remainingIndividualCost * (1 - BUNDLE_DISCOUNT)) : 0
  const fullUnlockSavingsPercent = fullUnlockCost > 0 ? BUNDLE_DISCOUNT * 100 : 0

  const handleFullUnlock = useCallback(async () => {
    if (!user || !fullUnlockCost) return
    try {
      const { toast } = await import("sonner")
      await unlockContentMutation.mutateAsync({ bookId: book.id, format: "audiobook", coinCost: fullUnlockCost })
      setLockedTrack(null)
      access.checkAccess()
      toast.success("সম্পূর্ণ অডিওবুক আনলক হয়েছে!")
    } catch (e: any) {
      const { toast } = await import("sonner")
      toast.error(e.message || "আনলক ব্যর্থ হয়েছে")
    }
  }, [user, fullUnlockCost, book.id, unlockContentMutation, access])

  /**
   * CRITICAL: Sync access state into audio player context.
   * accessLoading MUST be synced so preview enforcement is paused while checking ownership.
   * hasFullAccess and previewLimitSeconds define the actual access rules.
   */
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[AudiobookTab] syncing access →", {
        hasFullAccess: access.hasFullAccess,
        previewLimitSeconds: access.previewLimitSeconds,
        loading: access.loading,
        previewPercentage: access.previewPercentage,
        isFree,
        bookId: book.id,
      })
    }
    setHasFullAccess(access.hasFullAccess)
    setPreviewLimitSeconds(access.previewLimitSeconds)
    setAccessLoading(access.loading)
  }, [access.hasFullAccess, access.previewLimitSeconds, access.loading, setHasFullAccess, setPreviewLimitSeconds, setAccessLoading])


  // ── Guard: intercept auto-advance into paid locked chapters ──────────────
  // The audio player's auto-advance (track ended) and nextTrack() both
  // bypass handleChapterClick. This effect fires whenever the active track
  // index changes and pauses + shows the lock modal if the new track is paid
  // and not yet unlocked by the user.
  useEffect(() => {
    if (!isThisBookActive || isFree || hasFullUnlock) return
    const sourceTracks = audioTracks.length > 0 ? audioTracks : tracks
    const track = sourceTracks[currentTrackIndex] as AudioTrack & { chapterPrice?: number }
    if (!track) return
    const isLocked =
      !track.isPreview &&
      Number((track as any).chapterPrice) > 0 &&
      !unlockedChapterIds.has(track.id)
    if (isLocked) {
      pause()
      setLockedTrack(track as AudioTrack & { chapterPrice: number })
    }
  }, [currentTrackIndex, isThisBookActive])

  // ── Mobile app prompt: threshold from admin settings ──
  const { get: getSetting } = useSiteSettings()
  const promptEnabled = getSetting("app_prompt_enabled", "true") !== "false"
  const FREE_PLAY_THRESHOLD_SECONDS = Math.max(10, Number(getSetting("app_prompt_audio_seconds", "300")) || 300)
  const appStoreUrl  = getSetting("app_ios_url")     || getSetting("app_store_url")
  const playStoreUrl = getSetting("app_android_url") || getSetting("google_play_url")
  const brandName    = getSetting("brand_name", "BoiAro")

  const [showAppPrompt, setShowAppPrompt] = useState(false)
  // Once locked, content cannot be played until the user downloads the app
  const [contentLocked, setContentLocked] = useState(() =>
    Boolean(isFree && sessionStorage.getItem(`app_prompt_locked_audio_${book.id}`))
  )
  const playedSecondsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Re-check lock from storage when bookId changes (component reuse)
  useEffect(() => {
    if (isFree && sessionStorage.getItem(`app_prompt_locked_audio_${book.id}`)) {
      setContentLocked(true)
    }
  }, [book.id, isFree])

  // Pause audio whenever the prompt is showing or content is locked
  useEffect(() => {
    if ((showAppPrompt || contentLocked) && isThisBookActive && isPlaying) {
      togglePlay()
    }
  }, [showAppPrompt, contentLocked]) // intentionally minimal — only fire on prompt/lock state change

  useEffect(() => {
    const sessionKey = `app_prompt_audio_${book.id}`
    if (!promptEnabled || !isFree || showAppPrompt || contentLocked || sessionStorage.getItem(sessionKey)) return

    if (isThisBookActive && isPlaying) {
      timerRef.current = setInterval(() => {
        playedSecondsRef.current += 1
        if (playedSecondsRef.current >= FREE_PLAY_THRESHOLD_SECONDS) {
          sessionStorage.setItem(sessionKey, "1")
          setShowAppPrompt(true)
          clearInterval(timerRef.current!)
        }
      }, 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  }, [promptEnabled, isFree, isThisBookActive, isPlaying, showAppPrompt, contentLocked, book.id])

  const handleDownloadClick = () => {
    sessionStorage.setItem(`app_prompt_locked_audio_${book.id}`, "1")
    setContentLocked(true)
    setShowAppPrompt(false)
  }

  const displayTracks = isThisBookActive ? tracks : audioTracks
  const realTrackCount = displayTracks.length
  const hasNoTracks = realTrackCount === 0
  const hasPlayableSource = displayTracks.some((track) => Boolean((track.storagePath || track.audioUrl || "").trim()))
  const allNarrators: any[] = (book as any).allNarrators || (audiobook.narrator?.id ? [audiobook.narrator] : [])
  const narratorName = allNarrators.length > 0
    ? allNarrators.map((n: any) => n.name).join(", ")
    : "Narrator not assigned"
  const narratorAvatar = allNarrators[0]?.avatar || ""

  const handleListen = () => {
    if (!hasPlayableSource || contentLocked) return
    if (!isThisBookActive) {
      loadBook(book, audiobook, audioTracks.length > 0 ? audioTracks : undefined, true)
      return
    }
    togglePlay()
  }

  const handleChapterClick = (index: number) => {
    const track = (audioTracks.length > 0 ? audioTracks : displayTracks)[index] as AudioTrack & { chapterPrice?: number }
    // Gate on chapterPrice alone — don't require coinEnabled so the lock
    // works even while coin settings are still loading or the coin-earn
    // system is disabled by admin.
    if (track && !track.isPreview && Number(track.chapterPrice) > 0) {
      if (!hasFullUnlock && !unlockedChapterIds.has(track.id)) {
        setLockedTrack(track as AudioTrack & { chapterPrice: number })
        return
      }
    }
    if (!isThisBookActive) {
      loadBook(book, audiobook, audioTracks.length > 0 ? audioTracks : undefined)
    }
    goToTrack(index)
  }

  return (
    <div className="relative max-w-4xl mx-auto space-y-8">
      {/* Hero CTA card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(220,60%,12%)] to-[hsl(240,30%,8%)] border border-[hsl(220,40%,20%)]">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(220 60% 50%), transparent 70%)' }} />
        <div className="relative p-5 lg:p-7">

          {/* ── Inline video player (video tracks only) ── */}
          {isCurrentTrackVideo && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <Video className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">
                  {tracks[currentTrackIndex]?.title || `Track ${currentTrackIndex + 1}`}
                </span>
              </div>
              <VideoPlayer />
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Narrator info — hidden while video is playing to save space */}
            {!isCurrentTrackVideo && (
              <div className="flex items-center gap-4 flex-1">
                {allNarrators.length > 1 ? (
                  <div className="flex -space-x-3">
                    {allNarrators.map((n: any, i: number) => (
                      n.avatar ? (
                        <img key={n.id || i} src={n.avatar} alt={n.name} className="w-12 h-12 rounded-full object-cover ring-2 ring-[hsl(220,50%,30%)] shadow-lg" />
                      ) : (
                        <div key={n.id || i} className="w-12 h-12 rounded-full bg-[hsl(220,40%,18%)] flex items-center justify-center ring-2 ring-[hsl(220,50%,30%)] shadow-lg">
                          <Mic className="w-5 h-5 text-[hsl(220,60%,60%)]" />
                        </div>
                      )
                    ))}
                  </div>
                ) : narratorAvatar ? (
                  <img src={narratorAvatar} alt={narratorName} className="w-16 h-16 rounded-full object-cover ring-2 ring-[hsl(220,50%,30%)] shadow-lg" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[hsl(220,40%,18%)] flex items-center justify-center ring-2 ring-[hsl(220,50%,30%)] shadow-lg">
                    <Mic className="w-7 h-7 text-[hsl(220,60%,60%)]" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Narrated by</p>
                  <p className="text-lg font-semibold text-foreground">{narratorName}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(audiobook.duration)}</span>
                    <span className="flex items-center gap-1"><Headphones className="w-3 h-3" /> {realTrackCount} episodes</span>
                    <span className="uppercase">{audiobook.quality || "standard"}</span>
                  </div>
                </div>
              </div>
            )}

            {/* When video is playing, show compact narrator + episode info instead */}
            {isCurrentTrackVideo && (
              <div className="flex items-center gap-3 flex-1 text-xs text-muted-foreground">
                {narratorAvatar
                  ? <img src={narratorAvatar} alt={narratorName} className="w-8 h-8 rounded-full object-cover ring-1 ring-[hsl(220,50%,30%)]" />
                  : <div className="w-8 h-8 rounded-full bg-[hsl(220,40%,18%)] flex items-center justify-center"><Mic className="w-4 h-4 text-[hsl(220,60%,60%)]" /></div>
                }
                <span>{narratorName}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Headphones className="w-3 h-3" /> {realTrackCount} episodes</span>
              </div>
            )}

            {/* Price + CTA — same for audio and video */}
            <div className="flex flex-col items-end gap-3 w-full sm:w-auto flex-shrink-0">
              <span className="text-3xl font-bold text-foreground font-serif">
                {isFree ? "Free" : `৳${audiobook.price}`}
              </span>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  size="lg"
                  className="bg-[hsl(220,70%,50%)] text-white hover:bg-[hsl(220,70%,45%)] font-semibold gap-2 flex-1 sm:flex-initial rounded-xl shadow-lg shadow-[hsl(220,70%,50%)]/20"
                  onClick={handleListen}
                  disabled={hasNoTracks || !hasPlayableSource || isLoading}
                >
                  {isLoading && isThisBookActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isThisBookActive && isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                  {isThisBookActive && isPlaying ? "Pause" : isThisBookActive ? "Resume" : isFree ? "Play Free" : "Play Now"}
                </Button>
                {/* Full Player only shown for audio tracks — video plays inline */}
                {isThisBookActive && !isCurrentTrackVideo && (
                  <Button size="lg" variant="outline" onClick={openFullPlayer} className="gap-2 rounded-xl border-[hsl(220,40%,25%)]">
                    Full Player
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar — shared for audio and video */}
          {isThisBookActive && tracks.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[hsl(220,30%,18%)]">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Track {currentTrackIndex + 1} of {tracks.length} — {tracks[currentTrackIndex]?.title}</span>
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              {/* Clickable seek bar */}
              <div
                className="h-1.5 bg-[hsl(220,30%,15%)] rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pct = (e.clientX - rect.left) / rect.width
                  seekTo(Math.max(0, pct * (duration || 0)))
                }}
              >
                <div
                  className="h-full bg-[hsl(220,70%,50%)] rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          )}

          {error && isThisBookActive && (
            <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* No tracks warning */}
      {hasNoTracks && (
        <div className="rounded-2xl border border-[hsl(45,60%,30%)]/30 bg-[hsl(45,30%,10%)] p-6 text-center">
          <AlertCircle className="w-8 h-8 text-[hsl(45,70%,50%)] mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No audio tracks available for this audiobook yet.</p>
        </div>
      )}

      {!hasNoTracks && !hasPlayableSource && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Audio files could not be loaded.</p>
        </div>
      )}

      {/* Chapter-level ad/coin unlock for audiobooks */}
      {!isFree && !access.hasFullAccess && user && (
        <AudiobookChapterUnlock
          bookId={book.id}
          tracks={displayTracks as AudioTrack[]}
          audiobookPrice={audiobook.price}
          onUnlocked={() => access.checkAccess()}
        />
      )}

      {/* Episode list */}
      {realTrackCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-serif font-bold text-foreground">
              Episodes <span className="text-muted-foreground font-normal text-sm">({realTrackCount})</span>
            </h3>
            {!user && <p className="text-xs text-muted-foreground">Sign in to save progress</p>}
          </div>

          <div className="space-y-1">
            {displayTracks.map((trackOrUndef, i) => {
              const track = trackOrUndef as AudioTrack | undefined
              const isActive = isThisBookActive && currentTrackIndex === i
              const isCurrentlyPlaying = isActive && isPlaying
              const isPreview = track?.isPreview
              const trackHasSource = Boolean((track?.storagePath || track?.audioUrl || "").trim())

              return (
                <button
                  key={track?.id || i}
                  onClick={() => trackHasSource && handleChapterClick(i)}
                  disabled={!trackHasSource}
                  className={`w-full flex items-center gap-4 py-3.5 px-4 rounded-xl transition-all text-left group ${
                    isActive
                      ? "bg-[hsl(220,50%,15%)] ring-1 ring-[hsl(220,60%,35%)]"
                      : trackHasSource
                        ? "hover:bg-secondary/60"
                        : "opacity-40 cursor-not-allowed"
                  }`}
                >
                  {/* Track number / playing indicator */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-all ${
                    isActive
                      ? "bg-[hsl(220,70%,50%)] text-white shadow-md shadow-[hsl(220,70%,50%)]/30"
                      : "bg-secondary text-muted-foreground group-hover:bg-[hsl(220,50%,20%)] group-hover:text-foreground"
                  }`}>
                    {isCurrentlyPlaying ? (
                      <div className="flex gap-[3px] items-end h-3.5">
                        <div className="w-[3px] rounded-full bg-white animate-pulse" style={{ height: '100%' }} />
                        <div className="w-[3px] rounded-full bg-white animate-pulse" style={{ height: '60%', animationDelay: '100ms' }} />
                        <div className="w-[3px] rounded-full bg-white animate-pulse" style={{ height: '85%', animationDelay: '200ms' }} />
                      </div>
                    ) : isActive ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? "text-[hsl(220,70%,65%)]" : "text-foreground"}`}>
                      {track?.title || `Episode ${i + 1}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {track?.duration && (
                        <span className="text-xs text-muted-foreground">{track.duration}</span>
                      )}
                      {isPreview ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-[hsl(150,50%,15%)] text-[hsl(150,60%,55%)] border-0">
                          Free Preview
                        </Badge>
                      ) : (track as any)?.chapterPrice ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0">
                          {(track as any).chapterPrice} coins
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Right side indicator */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isActive && (
                      <Badge className="bg-[hsl(220,70%,50%)] text-white text-[10px] border-0">
                        {isPlaying ? "Playing" : "Paused"}
                      </Badge>
                    )}
                    {!trackHasSource && (
                      <Lock className="w-4 h-4 text-muted-foreground" />
                    )}
                    {trackHasSource && !isActive && (
                      <Play className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Preview badge */}
      {isPreviewMode && isThisBookActive && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
          <Badge className="bg-primary/90 text-primary-foreground px-4 py-1.5 text-xs shadow-lg">
            <Headphones className="w-3.5 h-3.5 mr-1.5" />
            Free Preview — {formatTime(access.previewLimitSeconds - currentTime > 0 ? access.previewLimitSeconds - currentTime : 0)} remaining
          </Badge>
        </div>
      )}

      {/* Locked overlay — shown after user clicks download (persists for session) */}
      {contentLocked && (
        <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-8 text-center gap-4 min-h-[300px]">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Headphones className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground mb-1">{brandName} অ্যাপে শুনুন</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              সম্পূর্ণ অডিওবুকটি বিনামূল্যে শুনতে অ্যাপ ডাউনলোড করুন।
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-[240px]">
            {playStoreUrl && (
              <a href={playStoreUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-foreground text-background rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                </svg>
                Google Play
              </a>
            )}
            {appStoreUrl && (
              <a href={appStoreUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                App Store
              </a>
            )}
          </div>
        </div>
      )}

      {/* Mobile app download prompt (free audiobooks only) */}
      <MobileAppPromptModal
        open={showAppPrompt}
        type="audiobook"
        bookTitle={book.title}
        onDownloadClick={handleDownloadClick}
      />

      {/* Paywall modal */}
      <AudiobookPaywallModal
        open={showPaywall}
        bookTitle={book.title}
        bookSlug={book.slug}
        bookId={book.id}
        audiobookPrice={audiobook.price}
        previewPercentage={access.previewPercentage}
        onUnlocked={() => {
          access.markUnlocked()
          setShowPaywall(false)
        }}
        onClose={() => setShowPaywall(false)}
      />

      {/* Chapter unlock modal — shown when user clicks a paid locked chapter */}
      <QuickUnlockModal
        open={!!lockedTrack}
        onOpenChange={(open) => { if (!open) setLockedTrack(null) }}
        track={lockedTrack}
        bookId={book.id}
        audiobookPrice={audiobook.price}
        fullUnlockCost={fullUnlockCost}
        fullUnlockSavingsPercent={fullUnlockSavingsPercent}
        remainingIndividualCost={remainingIndividualCost}
        lockedCount={lockedTracks.length}
        onChapterUnlocked={(trackId) => {
          setLockedTrack(null)
          unlockedChapterIds.add(trackId)
        }}
        onFullUnlock={handleFullUnlock}
      />
    </div>
  )
}
