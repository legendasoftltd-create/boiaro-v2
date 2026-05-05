import {
  Play, Pause, Square, ChevronDown,
  Volume2, VolumeX, Rewind, FastForward, Mic, Sparkles, Waves,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { EmotionTag } from "@/lib/narrationPreprocessor";
import type { TTSSpeed } from "@/hooks/useBanglaTTS";
import type { TtsMode } from "@/hooks/useTtsEngine";

const TTS_SPEEDS: TTSSpeed[] = [0.75, 1, 1.25, 1.5];

const emotionLabels: Record<EmotionTag, { icon: string; label: string }> = {
  neutral: { icon: "🎧", label: "Normal" },
  soft: { icon: "🌸", label: "Soft" },
  deep: { icon: "🎭", label: "Deep" },
  suspense: { icon: "⚡", label: "Suspense" },
  fear: { icon: "😨", label: "Fear" },
  whisper: { icon: "🤫", label: "Whisper" },
  joy: { icon: "😊", label: "Joy" },
  anger: { icon: "🔥", label: "Anger" },
  sad: { icon: "😢", label: "Sad" },
};

interface TtsFullPlayerProps {
  open: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  totalSentences: number;
  currentEmotion: EmotionTag;
  playbackRate: TTSSpeed;
  elapsedSeconds: number;
  totalDurationSeconds: number;
  bookTitle: string;
  bookCover?: string;
  isPremium?: boolean;
  onClose: () => void;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onSeekToIndex: (index: number) => void;
  onSetSpeed: (speed: TTSSpeed) => void;
  musicAvailable?: boolean;
  musicMuted?: boolean;
  musicVolume?: number;
  onMusicToggle?: () => void;
  onMusicVolumeChange?: (v: number) => void;
  ttsMode?: TtsMode;
  onTtsModeChange?: (mode: TtsMode) => void;
  premiumVoiceAvailable?: boolean;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TtsFullPlayer({
  open, isPlaying, isPaused, currentSentenceIndex, totalSentences, currentEmotion,
  playbackRate, elapsedSeconds, totalDurationSeconds, bookTitle, bookCover,
  onClose, onPlay, onPause, onResume, onStop,
  onSkipForward, onSkipBackward, onSeekToIndex, onSetSpeed,
  musicAvailable, musicMuted, musicVolume = 0.15, onMusicToggle, onMusicVolumeChange,
  ttsMode, onTtsModeChange, premiumVoiceAvailable,
}: TtsFullPlayerProps) {
  const [showSpeed, setShowSpeed] = useState(false);

  if (!open) return null;

  const emotion = emotionLabels[currentEmotion] || emotionLabels.neutral;
  const progress = totalSentences > 0 ? currentSentenceIndex : 0;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-8 h-14 border-b border-border/30">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <ChevronDown className="w-6 h-6" />
        </Button>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Reading Aloud</p>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 overflow-y-auto">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        </div>

        <div className="relative z-10 flex flex-col items-center w-full max-w-md">
          {/* Cover / icon */}
          <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 mb-6 ring-1 ring-border/20 flex items-center justify-center bg-secondary/30">
            {bookCover ? (
              <img src={bookCover} alt={bookTitle} className="w-full h-full object-cover" />
            ) : (
              <Volume2 className="w-16 h-16 text-primary/40" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>

          {/* Title */}
          <h2 className="text-lg md:text-xl font-serif font-bold text-foreground text-center mb-1 line-clamp-2">{bookTitle}</h2>
          <Badge variant="secondary" className="mb-6 text-xs bg-secondary border border-border text-muted-foreground">
            {emotion.icon} {emotion.label} • {Math.max(currentSentenceIndex + 1, 1)}/{totalSentences || "—"}
          </Badge>

          {/* Seek slider */}
          <div className="w-full space-y-2 mb-6">
            <Slider
              value={[progress]}
              max={Math.max(totalSentences - 1, 1)}
              step={1}
              onValueChange={([v]) => onSeekToIndex(v)}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground/70 font-mono">
              <span>{formatTime(elapsedSeconds)}</span>
              <span>-{formatTime(Math.max(0, totalDurationSeconds - elapsedSeconds))}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={onSkipBackward} className="text-muted-foreground hover:text-foreground w-10 h-10 relative">
              <Rewind className="w-5 h-5" />
              <span className="absolute -bottom-0.5 text-[8px] font-bold">3</span>
            </Button>

            <Button
              size="icon"
              className="w-16 h-16 rounded-full bg-foreground text-background hover:bg-foreground/90 shadow-xl shadow-foreground/10"
              onClick={!isPlaying ? onPlay : isPaused ? onResume : onPause}
            >
              {!isPlaying || isPaused ? <Play className="w-7 h-7 ml-0.5" /> : <Pause className="w-7 h-7" />}
            </Button>

            <Button variant="ghost" size="icon" onClick={onSkipForward} className="text-muted-foreground hover:text-foreground w-10 h-10 relative">
              <FastForward className="w-5 h-5" />
              <span className="absolute -bottom-0.5 text-[8px] font-bold">3</span>
            </Button>
          </div>

          {/* Stop + Speed row */}
          <div className="flex items-center justify-center gap-3 mb-6">
            {isPlaying && (
              <Button variant="ghost" size="sm" onClick={onStop} className="text-destructive hover:text-destructive h-9 px-4 rounded-lg">
                <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
              </Button>
            )}
            <div className="relative">
              <Button
                variant="ghost" size="sm"
                onClick={() => setShowSpeed(!showSpeed)}
                className="text-xs text-muted-foreground hover:text-foreground font-mono h-9 px-4 rounded-lg bg-secondary/50"
              >
                Speed {playbackRate}x
              </Button>
              {showSpeed && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl p-1.5 shadow-2xl flex gap-1">
                  {TTS_SPEEDS.map((s) => (
                    <Button
                      key={s}
                      variant={playbackRate === s ? "default" : "ghost"}
                      size="sm"
                      className="text-xs px-2.5 h-8 rounded-lg"
                      onClick={() => { onSetSpeed(s); setShowSpeed(false); }}
                    >
                      {s}x
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══════ VOICE SELECTION — only when book has premium voice ═══════ */}
          {ttsMode && onTtsModeChange && premiumVoiceAvailable && (
            <div className="w-full rounded-xl border border-border/30 bg-secondary/10 p-4 mb-4 space-y-3">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Voice</p>
                <p className="text-[11px] text-muted-foreground ml-auto">Choose your reading voice</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onTtsModeChange("browser")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                    ttsMode === "browser"
                      ? "bg-foreground text-background border-foreground shadow-md"
                      : "bg-muted/30 text-muted-foreground border-border/50 hover:border-border"
                  }`}
                >
                  <Mic className="w-4 h-4" /> Free TTS
                </button>
                <button
                  onClick={() => onTtsModeChange("premium")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                    ttsMode === "premium"
                      ? "bg-amber-500 text-black border-amber-500 shadow-md"
                      : "bg-muted/30 text-muted-foreground border-border/50 hover:border-amber-500/50 hover:text-amber-400"
                  }`}
                >
                  <Sparkles className="w-4 h-4" /> AI Voice
                </button>
              </div>
            </div>
          )}

          {/* ═══════ AMBIENT SOUND — Clear grouped section ═══════ */}
          {musicAvailable && (
            <div className="w-full rounded-xl border border-border/30 bg-secondary/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Waves className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Ambient Sound</p>
                </div>
                <Switch
                  checked={!musicMuted}
                  onCheckedChange={() => onMusicToggle?.()}
                />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                You can change the sound and volume here
              </p>

              {!musicMuted && onMusicVolumeChange && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-medium">Volume</span>
                    <span className="font-mono font-bold text-foreground text-xs">{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <VolumeX className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                    <Slider
                      min={0} max={30} step={1}
                      value={[Math.round(musicVolume * 100)]}
                      onValueChange={([v]) => onMusicVolumeChange(v / 100)}
                      className="flex-1"
                    />
                    <Volume2 className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
