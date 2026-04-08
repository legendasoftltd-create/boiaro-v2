import { Sun, Moon, Minus, Plus, Type, BookOpen, Sparkles, Volume2, Play, Music, Waves } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { BANGLA_PREVIEW_TEXT, preprocessForNarration, getVoiceParamsForEmotion } from "@/lib/narrationPreprocessor";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import type { TtsMode } from "@/hooks/useTtsEngine";
import type { MusicGenre } from "@/hooks/useBackgroundMusic";

const GENRE_OPTIONS: { value: MusicGenre; label: string; emoji: string }[] = [
  { value: "calm", label: "শান্ত", emoji: "🌿" },
  { value: "romance", label: "রোমান্স", emoji: "💕" },
  { value: "horror", label: "ভৌতিক", emoji: "👻" },
  { value: "suspense", label: "সাসপেন্স", emoji: "⚡" },
  { value: "adventure", label: "অ্যাডভেঞ্চার", emoji: "⚔️" },
];

interface ReaderSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  fontSize: number;
  setFontSize: (v: number) => void;
  fileType: "pdf" | "epub";
  ttsMode?: TtsMode;
  onTtsModeChange?: (mode: TtsMode) => void;
  autoReadEnabled?: boolean;
  onAutoReadChange?: (enabled: boolean) => void;
  ambientEnabled?: boolean;
  onAmbientEnabledChange?: (enabled: boolean) => void;
  ambientGenre?: MusicGenre;
  onAmbientGenreChange?: (genre: MusicGenre) => void;
  ambientVolume?: number;
  onAmbientVolumeChange?: (v: number) => void;
  ambientMuted?: boolean;
  onAmbientMuteToggle?: () => void;
}

export function ReaderSettingsSheet({
  open, onOpenChange, isDarkMode, setIsDarkMode, fontSize, setFontSize, fileType,
  ttsMode, onTtsModeChange,
  autoReadEnabled, onAutoReadChange,
  ambientEnabled, onAmbientEnabledChange, ambientGenre, onAmbientGenreChange,
  ambientVolume = 0.15, onAmbientVolumeChange, ambientMuted, onAmbientMuteToggle,
}: ReaderSettingsSheetProps) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { trackTtsPreview } = useActivityTracker();

  const handlePreviewVoice = useCallback(() => {
    if (isPreviewing) return;
    trackTtsPreview(ttsMode === "premium" ? "premium" : "browser");

    window.speechSynthesis.cancel();
    const segments = preprocessForNarration(BANGLA_PREVIEW_TEXT);
    if (segments.length === 0) return;

    setIsPreviewing(true);
    let idx = 0;

    const speakNext = () => {
      if (idx >= segments.length) { setIsPreviewing(false); return; }
      const seg = segments[idx];
      const utt = new SpeechSynthesisUtterance(seg.text);
      utt.lang = "bn-BD";
      const voices = window.speechSynthesis.getVoices();
      const bnVoice = voices.find((v) => v.lang === "bn-BD") || voices.find((v) => v.lang.startsWith("bn"));
      if (bnVoice) utt.voice = bnVoice;
      const params = getVoiceParamsForEmotion(seg.emotion);
      utt.rate = params.rate; utt.pitch = params.pitch; utt.volume = params.volume;
      utt.onend = () => { idx++; previewTimeoutRef.current = setTimeout(speakNext, seg.postPauseMs); };
      utt.onerror = () => { setIsPreviewing(false); };
      window.speechSynthesis.speak(utt);
    };
    speakNext();
    previewTimeoutRef.current = setTimeout(() => { window.speechSynthesis.cancel(); setIsPreviewing(false); }, 8000);
  }, [isPreviewing, ttsMode]);

  const stopPreview = useCallback(() => {
    window.speechSynthesis.cancel();
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    setIsPreviewing(false);
  }, []);

  const SectionHeader = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground tracking-wide">{title}</h3>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) stopPreview(); onOpenChange(v); }}>
      <SheetContent side="right" className="w-[320px] sm:w-80 bg-background border-border overflow-y-auto max-h-[100dvh] p-0">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-5 pt-5 pb-3">
          <SheetHeader>
            <SheetTitle className="text-foreground font-serif flex items-center gap-2 text-base">
              <BookOpen className="w-5 h-5 text-primary" />
              Reader Settings
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="px-5 py-4 space-y-5 pb-10">

          {/* ═══ AMBIENT SOUND — Top priority section ═══ */}
          {fileType === "epub" && onAmbientEnabledChange && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15">
                    <Waves className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Ambient Sound</p>
                    <p className="text-[10px] text-muted-foreground">Mood atmosphere while reading</p>
                  </div>
                </div>
                <Switch checked={!!ambientEnabled} onCheckedChange={onAmbientEnabledChange} />
              </div>

              {ambientEnabled && (
                <div className="space-y-3 pt-1">
                  {/* Genre chips */}
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2 font-medium">Choose Atmosphere</p>
                    <div className="flex flex-wrap gap-1.5">
                      {GENRE_OPTIONS.map((g) => (
                        <button
                          key={g.value}
                          onClick={() => onAmbientGenreChange?.(g.value)}
                          className={`text-[11px] px-3 py-1.5 rounded-full border transition-all font-medium ${
                            ambientGenre === g.value
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:border-border"
                          }`}
                        >
                          {g.emoji} {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Volume slider */}
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2 font-medium">Volume</p>
                    <div className="flex items-center gap-3">
                      <Waves className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <Slider
                        min={0} max={30} step={1}
                        value={[Math.round(ambientVolume * 100)]}
                        onValueChange={([v]) => onAmbientVolumeChange?.(v / 100)}
                        className="flex-1"
                      />
                      <span className="text-xs font-mono text-foreground w-10 text-right font-semibold">
                        {Math.round(ambientVolume * 100)}%
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                    Soft ambient atmosphere — narration always stays dominant.
                  </p>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* ═══ THEME ═══ */}
          <div>
            <SectionHeader icon={isDarkMode ? Moon : Sun} title="Theme" />
            <div className="flex gap-2">
              <Button variant={!isDarkMode ? "default" : "outline"} size="sm" onClick={() => setIsDarkMode(false)} className="flex-1">
                <Sun className="w-4 h-4 mr-2" /> Light
              </Button>
              <Button variant={isDarkMode ? "default" : "outline"} size="sm" onClick={() => setIsDarkMode(true)} className="flex-1">
                <Moon className="w-4 h-4 mr-2" /> Dark
              </Button>
            </div>
          </div>

          {/* ═══ FONT SIZE (EPUB only) ═══ */}
          {fileType === "epub" && (
            <>
              <Separator />
              <div>
                <SectionHeader icon={Type} title="Font Size" />
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setFontSize(Math.max(12, fontSize - 2))}>
                    <Minus className="w-4 h-4" />
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-sm font-semibold text-foreground">{fontSize}px</span>
                  </div>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setFontSize(Math.min(32, fontSize + 2))}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-foreground" style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}>
                    পড়ার নমুনা টেক্সট — Preview text
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ═══ VOICE MODE (EPUB only) ═══ */}
          {fileType === "epub" && onTtsModeChange && (
            <>
              <Separator />
              <div>
                <SectionHeader icon={ttsMode === "premium" ? Sparkles : Volume2} title="Voice Mode" />
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={ttsMode === "premium" ? "default" : "secondary"} className="text-[10px]">
                    {ttsMode === "premium" ? (
                      <><Sparkles className="w-3 h-3 mr-1" /> Premium (Natural)</>
                    ) : (
                      <><Volume2 className="w-3 h-3 mr-1" /> Free (Basic)</>
                    )}
                  </Badge>
                  <Switch
                    checked={ttsMode === "premium"}
                    onCheckedChange={(checked) => onTtsModeChange(checked ? "premium" : "browser")}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                  {ttsMode === "premium"
                    ? "AI-generated natural Bangla narration voice."
                    : "Free browser voice. Toggle for premium quality."}
                </p>
                <Button variant="outline" size="sm" className="w-full text-xs h-8"
                  onClick={isPreviewing ? stopPreview : handlePreviewVoice}>
                  {isPreviewing ? <>■ Stop Preview</> : <><Play className="w-3 h-3 mr-1.5" /> Preview Voice</>}
                </Button>
              </div>
            </>
          )}

          {/* ═══ AUTO-READ (EPUB only) ═══ */}
          {fileType === "epub" && onAutoReadChange && (
            <>
              <Separator />
              <div>
                <SectionHeader icon={Play} title="Auto-Read" />
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">Start reading aloud automatically</p>
                  <Switch checked={!!autoReadEnabled} onCheckedChange={onAutoReadChange} />
                </div>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  TTS starts when you open a book and continues to the next page seamlessly.
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
