import { ChevronLeft, Bookmark, BookmarkCheck, Menu, Settings, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReaderTopBarProps {
  title: string;
  chapterTitle?: string;
  isBookmarked: boolean;
  show: boolean;
  isDarkMode: boolean;
  isTtsPlaying?: boolean;
  showTtsButton?: boolean;
  onBack: () => void;
  onToggleBookmark: () => void;
  onOpenToc: () => void;
  onOpenSettings: () => void;
  onToggleTts?: () => void;
}

export function ReaderTopBar({
  title, chapterTitle, isBookmarked, show, isDarkMode,
  isTtsPlaying, showTtsButton,
  onBack, onToggleBookmark, onOpenToc, onOpenSettings, onToggleTts,
}: ReaderTopBarProps) {
  const borderClass = isDarkMode ? "border-border/30" : "border-border";
  const bgClass = isDarkMode ? "bg-background/95" : "bg-background/95";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        show ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      } ${bgClass} ${borderClass} border-b backdrop-blur-xl`}
    >
      <div className="flex items-center justify-between h-14 px-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-muted-foreground shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-[300px] text-foreground">{title}</p>
            {chapterTitle && (
              <p className="text-xs text-muted-foreground truncate">{chapterTitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {showTtsButton && (
            <Button variant="ghost" size="icon" onClick={onToggleTts}
              className={isTtsPlaying ? "text-primary" : "text-muted-foreground"}
              title="Listen to TTS">
              <Headphones className="w-5 h-5" />
              {isTtsPlaying && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onToggleBookmark}
            className={isBookmarked ? "text-primary" : "text-muted-foreground"}>
            {isBookmarked ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenToc} className="text-muted-foreground">
            <Menu className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenSettings} className="text-muted-foreground">
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
