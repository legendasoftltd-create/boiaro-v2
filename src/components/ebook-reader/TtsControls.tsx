import { Play, Pause, Square, Volume2, Music, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { EmotionTag } from "@/lib/narrationPreprocessor";

const emotionLabels: Record<EmotionTag, string> = {
  neutral: "",
  soft: "🌸",
  deep: "🎭",
  suspense: "⚡",
  fear: "😨",
  whisper: "🤫",
  joy: "😊",
  anger: "🔥",
  sad: "😢",
};

interface TtsControlsProps {
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  totalSentences: number;
  currentEmotion?: EmotionTag;
  show: boolean;
  isDarkMode: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  // Ambient sound props
  musicAvailable?: boolean;
  musicMuted?: boolean;
  musicVolume?: number;
  onMusicToggle?: () => void;
  onMusicVolumeChange?: (v: number) => void;
}

export function TtsControls({
  isPlaying, isPaused, currentSentenceIndex, totalSentences, currentEmotion,
  show, isDarkMode, onPlay, onPause, onResume, onStop,
  musicAvailable, musicMuted, musicVolume = 0.1, onMusicToggle, onMusicVolumeChange,
}: TtsControlsProps) {
  if (!show) return null;

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-xl shadow-lg border transition-all duration-300 ${
        isDarkMode
          ? "bg-background/90 border-border/30"
          : "bg-background/90 border-border"
      }`}
    >
      <Volume2 className="w-4 h-4 text-primary shrink-0" />

      {!isPlaying ? (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={onPlay}>
          <Play className="w-4 h-4" />
        </Button>
      ) : (
        <>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={isPaused ? onResume : onPause}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onStop}>
            <Square className="w-4 h-4" />
          </Button>
        </>
      )}

      {isPlaying && totalSentences > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {currentEmotion && emotionLabels[currentEmotion] ? `${emotionLabels[currentEmotion]} ` : ""}
          {currentSentenceIndex + 1}/{totalSentences}
        </span>
      )}

      {/* Ambient sound controls */}
      {musicAvailable && (
        <>
          <div className="w-px h-5 bg-border/50 mx-1" />
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={onMusicToggle}
            title={musicMuted ? "Unmute music" : "Mute music"}
          >
            {musicMuted ? (
              <VolumeX className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Music className="w-4 h-4 text-primary" />
            )}
          </Button>
          {!musicMuted && onMusicVolumeChange && (
            <>
              <Slider
                min={0}
                max={30}
                step={1}
                value={[Math.round(musicVolume * 100)]}
                onValueChange={([v]) => onMusicVolumeChange(v / 100)}
                className="w-16"
              />
              <span className="text-[10px] text-muted-foreground font-mono">
                {Math.round(musicVolume * 100)}%
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}
