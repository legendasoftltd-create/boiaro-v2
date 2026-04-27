import { Play, Pause, SkipForward, SkipBack, ChevronUp, Rewind, FastForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"

export function MiniPlayer() {
  const {
    book, audiobook, isPlaying, currentTime, duration, tracks, currentTrackIndex,
    togglePlay, nextTrack, prevTrack, seekTo, openFullPlayer, formatTime, progressPercentage, isLoading,
    skipForward10, skipBackward10, showPaywall, isPreviewMode, previewLimitSeconds,
  } = useAudioPlayer()

  if (!book || !audiobook || tracks.length === 0) return null

  const currentTrack = tracks[currentTrackIndex]
  const trackDurationSec = duration || 300
  const controlsLocked = showPaywall || (isPreviewMode && currentTime >= previewLimitSeconds - 1)
  const narratorName = audiobook.narrator?.name && audiobook.narrator.name !== ""
    ? audiobook.narrator.name
    : "Narrator not assigned"

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[hsl(240,15%,7%)]/98 backdrop-blur-2xl border-t border-border/30">
      {/* Progress line */}
      <div className="h-[2px] bg-secondary/30">
        <div
          className="h-full bg-[hsl(220,70%,50%)] transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="container mx-auto px-3 lg:px-6">
        <div className="flex items-center gap-3 h-[68px] md:h-[72px]">
          {/* Cover + info */}
          <button
            onClick={openFullPlayer}
            className="flex items-center gap-3 flex-1 min-w-0 text-left group"
          >
            <div className="relative w-11 h-11 md:w-12 md:h-12 rounded-lg overflow-hidden ring-1 ring-border/20 flex-shrink-0 shadow-md">
              <img src={book.cover} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{book.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {currentTrack?.title || `Ep. ${currentTrackIndex + 1}`} • {narratorName}
              </p>
            </div>
            <ChevronUp className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors hidden md:block" />
          </button>

          {/* Desktop seek bar */}
          <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground/70 w-56 font-mono">
            <span className="w-10 text-right">{formatTime(currentTime)}</span>
            <Slider
              value={[currentTime]}
              max={trackDurationSec}
              step={1}
              onValueChange={([v]) => seekTo(v)}
              className="flex-1"
              disabled={controlsLocked}
            />
            <span className="w-10">{formatTime(trackDurationSec)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hidden sm:flex w-9 h-9"
              onClick={prevTrack}
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hidden md:flex w-8 h-8 relative"
              onClick={skipBackward10}
            >
              <Rewind className="w-3.5 h-3.5" />
              <span className="absolute -bottom-0.5 text-[7px] font-bold text-muted-foreground">10</span>
            </Button>
            <Button
              size="icon"
              className="w-10 h-10 rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={controlsLocked ? openFullPlayer : togglePlay}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
              ) : controlsLocked ? (
                <Play className="w-5 h-5 ml-0.5 opacity-50" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hidden md:flex w-8 h-8 relative"
              onClick={skipForward10}
            >
              <FastForward className="w-3.5 h-3.5" />
              <span className="absolute -bottom-0.5 text-[7px] font-bold text-muted-foreground">10</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hidden sm:flex w-9 h-9"
              onClick={nextTrack}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
