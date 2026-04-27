import { Waves, VolumeX, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { MusicGenre } from "@/hooks/useBackgroundMusic";

const GENRE_LABELS: Record<MusicGenre, string> = {
  calm: "🌿 Calm",
  romance: "💕 Romance",
  horror: "👻 Horror",
  suspense: "⚡ Suspense",
  adventure: "⚔️ Adventure",
};

interface BgMusicControlsProps {
  enabled: boolean;
  onToggleEnabled: (val: boolean) => void;
  genre: MusicGenre;
  onGenreChange: (g: MusicGenre) => void;
  musicAvailable: boolean;
  musicMuted: boolean;
  musicVolume: number;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  compact?: boolean;
  needsUnlock?: boolean;
  onManualUnlock?: () => void;
  isRealAudio?: boolean;
}

export function BgMusicControls({
  enabled, onToggleEnabled, genre, onGenreChange,
  musicAvailable, musicMuted, musicVolume,
  onToggleMute, onVolumeChange, compact,
  needsUnlock, onManualUnlock, isRealAudio,
}: BgMusicControlsProps) {
  // Compact mode for MiniPlayer
  if (compact) {
    if (needsUnlock && enabled) {
      return (
        <Button
          variant="ghost" size="icon"
          className="w-9 h-9 text-amber-500 animate-pulse"
          onClick={onManualUnlock}
          title="Tap to enable sound"
        >
          <Volume2 className="w-4 h-4" />
        </Button>
      );
    }

    return (
      <Button
        variant="ghost" size="icon"
        className={`w-9 h-9 ${enabled && !musicMuted ? "text-primary" : "text-muted-foreground"}`}
        onClick={() => {
          if (!enabled) onToggleEnabled(true);
          else onToggleMute();
        }}
        title={enabled ? (musicMuted ? "Turn on ambient sound" : "Turn off ambient sound") : "Enable ambient sound"}
      >
        {enabled && !musicMuted ? <Waves className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </Button>
    );
  }

  // Full controls panel
  return (
    <div className="w-full space-y-3">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Ambient Sound</p>
          {enabled && isRealAudio && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">MP3</span>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        You can change the sound and volume here
      </p>

      {/* Unlock prompt */}
      {enabled && needsUnlock && (
        <button
          onClick={onManualUnlock}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium animate-pulse"
        >
          <Volume2 className="w-4 h-4" />
          Tap to enable sound
        </button>
      )}

      {enabled && !needsUnlock && (
        <>
          {/* Genre selector */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(GENRE_LABELS) as MusicGenre[]).map((g) => (
              <button
                key={g}
                onClick={() => onGenreChange(g)}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition-all font-medium ${
                  genre === g
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted hover:border-border"
                }`}
              >
                {GENRE_LABELS[g]}
              </button>
            ))}
          </div>

          {/* Volume */}
          {musicAvailable && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium">Volume</span>
                <span className="font-mono font-bold text-foreground text-xs">{Math.round(musicVolume * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={onToggleMute} className="shrink-0">
                  {musicMuted ? (
                    <VolumeX className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Waves className="w-4 h-4 text-primary" />
                  )}
                </button>
                <Slider
                  min={0} max={30} step={1}
                  value={[Math.round(musicVolume * 100)]}
                  onValueChange={([v]) => onVolumeChange(v / 100)}
                  className="flex-1"
                />
                <Volume2 className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              </div>
            </div>
          )}

          {!musicAvailable && (
            <p className="text-[11px] text-muted-foreground/60">Preparing ambient sound…</p>
          )}
        </>
      )}
    </div>
  );
}
