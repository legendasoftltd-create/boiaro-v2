import { Play, Pause, Square, SkipBack, SkipForward, ChevronUp, Volume2, Waves, VolumeX, Sparkles, Mic } from "lucide-react";
import type { TtsMode } from "@/hooks/useTtsEngine";
import { Button } from "@/components/ui/button";
import type { EmotionTag } from "@/lib/narrationPreprocessor";

interface TtsMiniPlayerProps {
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  totalSentences: number;
  currentEmotion?: EmotionTag;
  elapsedSeconds: number;
  totalDurationSeconds: number;
  bookTitle: string;
  show: boolean;
  isPremium?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onOpenFullPlayer: () => void;
  musicAvailable?: boolean;
  musicMuted?: boolean;
  onMusicToggle?: () => void;
  ttsMode?: TtsMode;
  onTtsModeChange?: (mode: TtsMode) => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TtsMiniPlayer({
  isPlaying, isPaused, currentSentenceIndex, totalSentences,
  elapsedSeconds, totalDurationSeconds, bookTitle, show, isPremium,
  onPlay, onPause, onResume, onStop, onSkipForward, onSkipBackward, onOpenFullPlayer,
  musicAvailable, musicMuted, onMusicToggle,
  ttsMode, onTtsModeChange,
}: TtsMiniPlayerProps) {
  if (!show) return null;

  const progress = totalDurationSeconds > 0
    ? Math.min((elapsedSeconds / totalDurationSeconds) * 100, 100)
    : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/98 backdrop-blur-2xl border-t border-border/30">
      {/* Progress line */}
      <div className="h-[2px] bg-secondary/30">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="container mx-auto px-3 lg:px-6">
        <div className="flex items-center gap-2 h-[72px] md:h-[76px]">
          {/* Info + expand */}
          <button
            onClick={onOpenFullPlayer}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left group"
          >
            <div className="relative w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 shadow-md">
              <Volume2 className="w-5 h-5 text-primary" />
              {isPlaying && !isPaused && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{bookTitle}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {isPlaying
                  ? `${formatTime(elapsedSeconds)} • ${currentSentenceIndex + 1}/${totalSentences}`
                  : "Tap to open full player"}
              </p>
            </div>
            <ChevronUp className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors hidden md:block" />
          </button>

          {/* Quick controls row */}
          <div className="flex items-center gap-1">
            {/* Voice badge — always visible */}
            {ttsMode && onTtsModeChange && (
              <button
                onClick={() => onTtsModeChange(ttsMode === "browser" ? "premium" : "browser")}
                className={`flex items-center gap-1 h-8 px-2 rounded-lg text-[10px] font-semibold border transition-all ${
                  ttsMode === "premium"
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "bg-muted/50 border-border/50 text-muted-foreground"
                }`}
                title="Choose your reading voice"
              >
                {ttsMode === "premium" ? <Sparkles className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                <span className="hidden xs:inline">{ttsMode === "premium" ? "Premium" : "Free"}</span>
              </button>
            )}

            {/* Ambient sound toggle */}
            {musicAvailable && (
              <Button
                variant="ghost" size="icon"
                className={`w-9 h-9 ${musicMuted ? "text-muted-foreground" : "text-primary"}`}
                onClick={onMusicToggle}
                title={musicMuted ? "Turn on ambient sound" : "Turn off ambient sound"}
              >
                {musicMuted ? <VolumeX className="w-4 h-4" /> : <Waves className="w-4 h-4" />}
              </Button>
            )}

            {/* Skip back */}
            {isPlaying && (
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground w-9 h-9 hidden sm:flex" onClick={onSkipBackward}>
                <SkipBack className="w-4 h-4" />
              </Button>
            )}

            {/* Play/Pause */}
            <Button
              size="icon"
              className="w-11 h-11 rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={!isPlaying ? onPlay : isPaused ? onResume : onPause}
            >
              {!isPlaying || isPaused ? <Play className="w-5 h-5 ml-0.5" /> : <Pause className="w-5 h-5" />}
            </Button>

            {/* Skip forward + Stop */}
            {isPlaying && (
              <>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground w-9 h-9 hidden sm:flex" onClick={onSkipForward}>
                  <SkipForward className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive w-9 h-9" onClick={onStop}>
                  <Square className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
