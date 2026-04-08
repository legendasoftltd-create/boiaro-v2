import { ChevronLeft, ChevronRight, Maximize, ZoomIn, ZoomOut, Waves, Music } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import type { MusicGenre } from "@/hooks/useBackgroundMusic";

const GENRE_LABELS: Record<MusicGenre, string> = {
  calm: "🌿 Calm",
  romance: "💕 Romance",
  horror: "👻 Horror",
  suspense: "⚡ Suspense",
  adventure: "⚔️ Adventure",
};

interface ReaderBottomBarProps {
  show: boolean;
  isDarkMode: boolean;
  currentPage: number;
  totalPages: number;
  percentage: number;
  fileType: "pdf" | "epub";
  zoom?: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFullscreen?: () => void;
  // Ambient sound props
  ambientEnabled?: boolean;
  ambientGenre?: MusicGenre;
  ambientVolume?: number;
  ambientMuted?: boolean;
  onAmbientGenreChange?: (g: MusicGenre) => void;
  onAmbientVolumeChange?: (v: number) => void;
  onAmbientMuteToggle?: () => void;
}

export function ReaderBottomBar({
  show, isDarkMode, currentPage, totalPages, percentage, fileType,
  zoom, onPrevPage, onNextPage, onZoomIn, onZoomOut, onFullscreen,
  ambientEnabled, ambientGenre, ambientVolume = 0.15, ambientMuted,
  onAmbientGenreChange, onAmbientVolumeChange, onAmbientMuteToggle,
}: ReaderBottomBarProps) {
  const [showAmbientPanel, setShowAmbientPanel] = useState(false);
  const borderClass = isDarkMode ? "border-border/30" : "border-border";
  const bgClass = isDarkMode ? "bg-background/95" : "bg-background/95";

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
        show ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      } ${bgClass} ${borderClass} border-t backdrop-blur-xl`}
    >
      <Progress value={percentage} className="h-1 rounded-none" />

      {/* Ambient sound quick-panel */}
      {ambientEnabled && showAmbientPanel && (
        <div className={`border-b ${borderClass} px-4 py-3 space-y-2.5`}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-primary" />
              Change Atmosphere
            </p>
            <span className="text-[10px] text-muted-foreground">
              {Math.round((ambientVolume ?? 0.15) * 100)}%
            </span>
          </div>
          {/* Genre row */}
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(GENRE_LABELS) as MusicGenre[]).map((g) => (
              <button
                key={g}
                onClick={() => onAmbientGenreChange?.(g)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all font-medium ${
                  ambientGenre === g
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border/40 hover:border-border"
                }`}
              >
                {GENRE_LABELS[g]}
              </button>
            ))}
          </div>
          {/* Volume */}
          <div className="flex items-center gap-2">
            <Waves className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Slider
              min={0} max={30} step={1}
              value={[Math.round((ambientVolume ?? 0.15) * 100)]}
              onValueChange={([v]) => onAmbientVolumeChange?.(v / 100)}
              className="flex-1"
            />
            <span className="text-[10px] font-mono text-foreground w-8 text-right font-semibold">
              {Math.round((ambientVolume ?? 0.15) * 100)}%
            </span>
          </div>
          <p className="text-[9px] text-muted-foreground/50">Adjust volume and atmosphere while listening</p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          {/* Page nav */}
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevPage} disabled={fileType === "pdf" && currentPage <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-[11px] text-muted-foreground min-w-[80px] text-center font-medium">
              {fileType === "pdf" ? `${currentPage} / ${totalPages}` : `${percentage}%`}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextPage} disabled={fileType === "pdf" && currentPage >= totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Center: ambient sound toggle (epub only) */}
          {ambientEnabled && fileType === "epub" && (
            <button
              onClick={() => setShowAmbientPanel((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-[10px] font-medium ${
                showAmbientPanel
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-muted/40 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Waves className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{ambientGenre ? GENRE_LABELS[ambientGenre]?.split(" ").pop() : "Ambient"}</span>
              <span className="font-mono">{Math.round((ambientVolume ?? 0.15) * 100)}%</span>
            </button>
          )}

          {/* Zoom controls (PDF only) */}
          {fileType === "pdf" && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">{Math.round((zoom || 1) * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-1.5">
            {onFullscreen && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onFullscreen}>
                <Maximize className="w-4 h-4" />
              </Button>
            )}
            <span className={`text-xs font-bold min-w-[36px] text-right ${percentage >= 100 ? "text-emerald-400" : "text-primary"}`}>
              {percentage}%
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
