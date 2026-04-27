import {
  Play, Pause, SkipBack, SkipForward, ChevronDown,
  Volume2, VolumeX, List, Rewind, FastForward, MessageSquare,
} from "lucide-react"
import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { VideoPlayer } from "./VideoPlayer"
import { PlayerCommentsDrawer } from "./PlayerCommentsDrawer"
import { useAudiobookBackgroundMusic } from "./AudiobookBackgroundMusic"
import { BgMusicControls } from "./BgMusicControls"
import type { MusicGenre } from "@/hooks/useBackgroundMusic"

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function FullPlayer() {
  const {
    book, audiobook, isPlaying, isFullPlayerOpen, currentTime, duration, tracks, currentTrackIndex,
    playbackRate, volume, isLoading, currentMediaType,
    togglePlay, nextTrack, prevTrack, goToTrack, seekTo,
    setPlaybackRate, setVolume, closeFullPlayer, formatTime,
    skipForward10, skipBackward10, showPaywall, isPreviewMode, previewLimitSeconds,
  } = useAudioPlayer()

  const [showChapters, setShowChapters] = useState(false)
  const [showSpeed, setShowSpeed] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentCount, setCommentCount] = useState(0)
  const onCountChange = useCallback((n: number) => setCommentCount(n), [])

  // Background music
  const [bgMusicEnabled, setBgMusicEnabled] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}").enabled === true; } catch { return false; }
  })
  const [bgMusicGenre, setBgMusicGenre] = useState<MusicGenre | undefined>(() => {
    try { const g = JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}").genre; return g || undefined; } catch { return undefined; }
  })
  const bgMusic = useAudiobookBackgroundMusic({ genreOverride: bgMusicGenre, enabled: bgMusicEnabled })

  const handleBgMusicToggle = useCallback((val: boolean) => {
    setBgMusicEnabled(val)
    try { const p = JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}"); localStorage.setItem("bgmusic_prefs", JSON.stringify({ ...p, enabled: val })); } catch {}
  }, [])
  const handleGenreChange = useCallback((g: MusicGenre) => {
    setBgMusicGenre(g)
    try { const p = JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}"); localStorage.setItem("bgmusic_prefs", JSON.stringify({ ...p, genre: g })); } catch {}
  }, [])

  if (!book || !audiobook || !isFullPlayerOpen) return null

  const currentTrack = tracks[currentTrackIndex]
  const trackDurationSec = duration || 300
  const controlsLocked = showPaywall || (isPreviewMode && currentTime >= previewLimitSeconds - 1)
  const narratorName = audiobook.narrator?.name && audiobook.narrator.name !== ""
    ? audiobook.narrator.name
    : "Narrator not assigned"

  return (
    <div className="fixed inset-0 z-[100] bg-[hsl(240,15%,5%)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-8 h-14 border-b border-border/30">
        <Button variant="ghost" size="icon" onClick={closeFullPlayer} className="text-muted-foreground hover:text-foreground">
          <ChevronDown className="w-6 h-6" />
        </Button>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Now Playing</p>
        <Button
          variant="ghost" size="icon"
          onClick={() => setShowChapters(!showChapters)}
          className={showChapters ? "text-[hsl(220,70%,60%)]" : "text-muted-foreground"}
        >
          <List className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main player area */}
        <div className="flex-1 flex flex-col items-center px-6 py-4 relative overflow-y-auto">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[hsl(220,60%,20%)] opacity-[0.08] blur-[120px]" />
          </div>

          <div className="relative z-10 flex flex-col items-center w-full max-w-md">
            {/* Cover art or Video */}
            {currentMediaType === "video" ? (
              <div className="w-full max-w-lg mb-6"><VideoPlayer /></div>
            ) : (
              <div className="relative w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 mb-6 ring-1 ring-border/20">
                <img src={book.cover} alt={book.titleEn} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>
            )}

            {/* Track info */}
            <h2 className="text-lg md:text-xl font-serif font-bold text-foreground text-center mb-1 line-clamp-2">{book.title}</h2>
            <p className="text-sm text-muted-foreground mb-0.5">{book.author.name}</p>
            <p className="text-xs text-muted-foreground/70 mb-3">Narrated by {narratorName}</p>
            <Badge variant="secondary" className="mb-6 text-xs bg-[hsl(220,30%,15%)] border border-[hsl(220,30%,22%)] text-muted-foreground">
              Ep. {currentTrackIndex + 1}/{tracks.length} — {currentTrack?.title || `Episode ${currentTrackIndex + 1}`}
            </Badge>

            {/* Progress */}
            <div className="w-full space-y-2 mb-6">
              <Slider value={[currentTime]} max={trackDurationSec} step={1} onValueChange={([v]) => seekTo(v)} className="w-full" disabled={controlsLocked} />
              <div className="flex justify-between text-[11px] text-muted-foreground/70 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(Math.max(0, trackDurationSec - currentTime))}</span>
              </div>
            </div>

            {/* Main controls */}
            <div className={`flex items-center gap-4 mb-6 ${controlsLocked ? "opacity-50 pointer-events-none" : ""}`}>
              <Button variant="ghost" size="icon" onClick={prevTrack} className="text-muted-foreground hover:text-foreground w-10 h-10" disabled={controlsLocked}>
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={skipBackward10} className="text-muted-foreground hover:text-foreground w-10 h-10 relative" disabled={controlsLocked}>
                <Rewind className="w-5 h-5" />
                <span className="absolute -bottom-0.5 text-[8px] font-bold">10</span>
              </Button>
              <Button
                size="icon"
                className="w-16 h-16 rounded-full bg-foreground text-background hover:bg-foreground/90 shadow-xl shadow-foreground/10"
                onClick={togglePlay}
                disabled={isLoading || controlsLocked}
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                ) : controlsLocked ? (
                  <Play className="w-7 h-7 ml-0.5 opacity-50" />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7" />
                ) : (
                  <Play className="w-7 h-7 ml-0.5" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={skipForward10} className="text-muted-foreground hover:text-foreground w-10 h-10 relative" disabled={controlsLocked}>
                <FastForward className="w-5 h-5" />
                <span className="absolute -bottom-0.5 text-[8px] font-bold">10</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={nextTrack} className="text-muted-foreground hover:text-foreground w-10 h-10" disabled={controlsLocked}>
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>

            {/* Speed + Volume + Comments */}
            <div className="flex items-center justify-center gap-3 w-full mb-5 flex-wrap">
              <div className="relative">
                <Button variant="ghost" size="sm" onClick={() => setShowSpeed(!showSpeed)}
                  className="text-xs text-muted-foreground hover:text-foreground font-mono h-9 px-4 rounded-lg bg-secondary/50">
                  Speed {playbackRate}x
                </Button>
                {showSpeed && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl p-1.5 shadow-2xl flex gap-1">
                    {SPEEDS.map((s) => (
                      <Button key={s} variant={playbackRate === s ? "default" : "ghost"} size="sm"
                        className="text-xs px-2.5 h-8 rounded-lg" onClick={() => { setPlaybackRate(s); setShowSpeed(false) }}>
                        {s}x
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <Button variant="ghost" size="sm" onClick={() => setShowComments(true)}
                className="text-xs text-muted-foreground hover:text-foreground h-9 px-4 rounded-lg bg-secondary/50 gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                {commentCount > 0 ? commentCount : "মন্তব্য"}
              </Button>
            </div>

            {/* ═══════ NARRATION VOLUME ═══════ */}
            <div className="w-full rounded-xl border border-border/30 bg-secondary/10 p-4 mb-4 space-y-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Narration Volume</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setVolume(volume === 0 ? 1 : 0)} className="shrink-0">
                  {volume === 0 ? <VolumeX className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4 text-primary" />}
                </button>
                <Slider value={[volume * 100]} max={100} step={1} onValueChange={([v]) => setVolume(v / 100)} className="flex-1" />
                <span className="text-xs font-mono font-bold text-foreground w-10 text-right">{Math.round(volume * 100)}%</span>
              </div>
            </div>

            {/* ═══════ AMBIENT SOUND ═══════ */}
            <div className="w-full rounded-xl border border-border/30 bg-secondary/10 p-4 mb-4">
              <BgMusicControls
                enabled={bgMusicEnabled}
                onToggleEnabled={handleBgMusicToggle}
                genre={bgMusic.genre}
                onGenreChange={handleGenreChange}
                musicAvailable={bgMusic.musicAvailable}
                musicMuted={bgMusic.musicMuted}
                musicVolume={bgMusic.musicVolume}
                onToggleMute={bgMusic.toggleMute}
                onVolumeChange={bgMusic.setMusicVolume}
                needsUnlock={bgMusic.needsUnlock}
                onManualUnlock={bgMusic.manualUnlock}
                isRealAudio={bgMusic.isRealAudio}
              />
            </div>
          </div>
        </div>

        {/* Chapter sidebar */}
        {showChapters && (
          <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-border/30 bg-[hsl(240,12%,7%)]">
            <div className="p-4 border-b border-border/30">
              <h3 className="text-sm font-semibold text-foreground">
                Episodes <span className="text-muted-foreground font-normal">({tracks.length})</span>
              </h3>
            </div>
            <ScrollArea className="h-64 lg:h-[calc(100vh-7rem)]">
              <div className="p-2 space-y-0.5">
                {tracks.map((track, i) => {
                  const isActive = i === currentTrackIndex
                  const isCurrentlyPlaying = isActive && isPlaying
                  return (
                    <button
                      key={track.id}
                      onClick={() => goToTrack(i)}
                      className={`w-full flex items-center gap-3 py-3 px-3 rounded-xl transition-all text-left ${
                        isActive
                          ? "bg-[hsl(220,50%,15%)] ring-1 ring-[hsl(220,50%,25%)]"
                          : "hover:bg-secondary/40 text-foreground"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-all ${
                        isActive ? "bg-[hsl(220,70%,50%)] text-white" : "bg-secondary text-muted-foreground"
                      }`}>
                        {isCurrentlyPlaying ? (
                          <div className="flex gap-[3px] items-end h-3">
                            <div className="w-[3px] rounded-full bg-white animate-pulse" style={{ height: '100%' }} />
                            <div className="w-[3px] rounded-full bg-white animate-pulse" style={{ height: '55%', animationDelay: '100ms' }} />
                            <div className="w-[3px] rounded-full bg-white animate-pulse" style={{ height: '80%', animationDelay: '200ms' }} />
                          </div>
                        ) : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? "text-[hsl(220,70%,65%)]" : ""}`}>{track.title}</p>
                        <p className="text-xs text-muted-foreground">{track.duration}</p>
                      </div>
                      {isActive && (
                        <Badge className="bg-[hsl(220,70%,50%)] text-white text-[10px] border-0 flex-shrink-0">
                          {isPlaying ? "Playing" : "Paused"}
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      <PlayerCommentsDrawer bookId={book.id} open={showComments} onOpenChange={setShowComments} commentCount={commentCount} onCountChange={onCountChange} />
    </div>
  )
}
