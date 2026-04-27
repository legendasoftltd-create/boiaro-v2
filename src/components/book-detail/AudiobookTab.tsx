import { useEffect } from "react"
import { Play, Pause, Clock, Mic, Headphones, AlertCircle, Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAudioPlayer, type AudioTrack } from "@/contexts/AudioPlayerContext"
import { useAuth } from "@/contexts/AuthContext"
import { useAudiobookAccess } from "@/hooks/useAudiobookAccess"
import { AudiobookChapterUnlock } from "@/components/book-detail/AudiobookChapterUnlock"
import { AudiobookPaywallModal } from "@/components/audio-player/AudiobookPaywallModal"
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
    setAccessLoading,
  } = useAudioPlayer()
  const { user } = useAuth()

  const isThisBookActive = activeBook?.id === book.id
  const totalDurSec = durationToSeconds(audiobook.duration)
  const isFree = audiobook.price === 0

  // Pass live audio element duration so preview recalculates with actual metadata
  const liveDuration = isThisBookActive && duration > 0 ? duration : undefined
  const access = useAudiobookAccess(book.id, isFree, totalDurSec, audiobook.previewPercentage, liveDuration)

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
    if (!hasPlayableSource) return
    if (!isThisBookActive) {
      // loadBook is async-state — pass autoPlay so context plays once tracks are ready
      loadBook(book, audiobook, audioTracks.length > 0 ? audioTracks : undefined, true)
      return // don't call togglePlay — loadBook will auto-play
    }
    togglePlay()
  }

  const handleChapterClick = (index: number) => {
    if (!isThisBookActive) {
      loadBook(book, audiobook, audioTracks.length > 0 ? audioTracks : undefined)
    }
    goToTrack(index)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Hero CTA card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(220,60%,12%)] to-[hsl(240,30%,8%)] border border-[hsl(220,40%,20%)]">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(220 60% 50%), transparent 70%)' }} />
        <div className="relative p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Narrator(s) + meta */}
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
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {allNarrators.length > 1 ? "Narrated by" : "Narrated by"}
                </p>
                <p className="text-lg font-semibold text-foreground">{narratorName}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(audiobook.duration)}</span>
                  <span className="flex items-center gap-1"><Headphones className="w-3 h-3" /> {realTrackCount} episodes</span>
                  <span className="uppercase">{(audiobook.quality || "standard")}</span>
                </div>
              </div>
            </div>

            {/* Price + CTA */}
            <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
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
                {isThisBookActive && (
                  <Button size="lg" variant="outline" onClick={openFullPlayer} className="gap-2 rounded-xl border-[hsl(220,40%,25%)]">
                    Full Player
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Active playback progress */}
          {isThisBookActive && tracks.length > 0 && (
            <div className="mt-6 pt-5 border-t border-[hsl(220,30%,18%)]">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Track {currentTrackIndex + 1} of {tracks.length} — {tracks[currentTrackIndex]?.title}</span>
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              <div className="h-1.5 bg-[hsl(220,30%,15%)] rounded-full overflow-hidden">
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
    </div>
  )
}
