import { Sun, Moon, Minus, Plus, Type, BookOpen, Sparkles, Play, Waves, Mic, Lock, Coins, Zap } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { BANGLA_PREVIEW_TEXT, preprocessForNarration, getVoiceParamsForEmotion } from "@/lib/narrationPreprocessor";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import type { TtsMode } from "@/hooks/useTtsEngine";
import type { MusicGenre } from "@/hooks/useBackgroundMusic";
import { BENGALI_VOICES, type BengaliVoiceId, type PremiumTTSSpeed } from "@/hooks/usePremiumTTS";

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
  premiumVoiceAvailable?: boolean;
  voiceUnlocked?: boolean;
  voiceCoinPrice?: number;
  selectedVoiceId?: BengaliVoiceId;
  onVoiceChange?: (id: BengaliVoiceId) => void;
  ttsSpeed?: PremiumTTSSpeed;
  onTtsSpeedChange?: (s: PremiumTTSSpeed) => void;
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
  currentPageText?: string;
  onPlayOnPage?: () => void;
}

const SPEED_OPTIONS: { value: PremiumTTSSpeed; label: string }[] = [
  { value: 0.7, label: "০.৭×" },
  { value: 0.85, label: "০.৮×" },
  { value: 1, label: "১×" },
  { value: 1.1, label: "১.১×" },
  { value: 1.2, label: "১.২×" },
];

export function ReaderSettingsSheet({
  open, onOpenChange, isDarkMode, setIsDarkMode, fontSize, setFontSize, fileType,
  ttsMode, onTtsModeChange,
  premiumVoiceAvailable, voiceUnlocked, voiceCoinPrice = 0,
  selectedVoiceId, onVoiceChange,
  ttsSpeed = 1, onTtsSpeedChange,
  autoReadEnabled, onAutoReadChange,
  ambientEnabled, onAmbientEnabledChange, ambientGenre, onAmbientGenreChange,
  ambientVolume = 0.15, onAmbientVolumeChange,
  currentPageText, onPlayOnPage,
}: ReaderSettingsSheetProps) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { trackTtsPreview } = useActivityTracker();

  const handlePreviewVoice = useCallback(() => {
    if (isPreviewing) return;
    trackTtsPreview(ttsMode === "premium" ? "premium" : "browser");

    window.speechSynthesis.cancel();
    // Use actual page text (first 300 chars) when available, else fall back to sample
    const previewSource = currentPageText?.trim()
      ? currentPageText.trim().substring(0, 300)
      : BANGLA_PREVIEW_TEXT;
    const segments = preprocessForNarration(previewSource);
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
  }, [isPreviewing, ttsMode, currentPageText]);

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

          {/* ═══ ভয়েস মোড ═══ */}
          <>
            <Separator />
            <div className="space-y-3">
              <SectionHeader icon={Sparkles} title="ভয়েস মোড" />

              {/* Free / Premium toggle — two large buttons */}
              <div className="grid grid-cols-2 gap-2">
                {/* ফ্রি button */}
                <button
                  onClick={() => onTtsModeChange?.("browser")}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-sm font-semibold transition-all ${
                    ttsMode === "browser"
                      ? "bg-secondary border-border text-foreground shadow-sm"
                      : "bg-transparent border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  <Mic className="w-4 h-4 shrink-0" />
                  <span>ফ্রি</span>
                </button>

                {/* প্রিমিয়াম AI HD button */}
                <button
                  onClick={() => premiumVoiceAvailable ? onTtsModeChange?.("premium") : undefined}
                  disabled={!premiumVoiceAvailable}
                  className={`flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    ttsMode === "premium"
                      ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                      : "bg-transparent border-amber-500/30 text-amber-400 hover:border-amber-500/60"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>প্রিমিয়াম</span>
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${ttsMode === "premium" ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-400"}`}>
                    AI HD
                  </span>
                  {premiumVoiceAvailable && !voiceUnlocked && voiceCoinPrice > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px]">
                      <Coins className="w-2.5 h-2.5" />{voiceCoinPrice}
                    </span>
                  )}
                  {premiumVoiceAvailable && !voiceUnlocked && voiceCoinPrice === 0 && (
                    <Lock className="w-3 h-3 opacity-60" />
                  )}
                </button>
              </div>

              {/* Description */}
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {ttsMode === "premium"
                  ? "এআই-জেনারেটেড প্রাকৃতিক বাংলা কণ্ঠস্বর।"
                  : "ফ্রি ব্রাউজার ভয়েস — ডিভাইসের ডিফল্ট কণ্ঠস্বর ব্যবহার করে।"}
              </p>

              {/* Voice selector — when premium is active and unlocked */}
              {ttsMode === "premium" && premiumVoiceAvailable && voiceUnlocked && onVoiceChange && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <Mic className="w-3 h-3" /> ভয়েস বেছে নিন
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BENGALI_VOICES.map(v => (
                      <button key={v.id}
                        onClick={() => onVoiceChange(v.id as BengaliVoiceId)}
                        className={`text-[11px] px-2 py-2 rounded-lg border text-center transition-all ${selectedVoiceId === v.id ? "bg-amber-500 text-black border-amber-500 font-semibold" : "bg-muted/30 text-muted-foreground border-border/50 hover:border-amber-500/50"}`}>
                        {v.name}
                        <div className="text-[9px] opacity-70">{v.label.split("(")[1]?.replace(")", "") ?? ""}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Speed selector */}
              {onTtsSpeedChange && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" /> পড়ার গতি
                  </p>
                  <div className="flex gap-1">
                    {SPEED_OPTIONS.map(s => (
                      <button key={s.value}
                        onClick={() => onTtsSpeedChange(s.value)}
                        className={`flex-1 text-[11px] py-1.5 rounded-lg border transition-all ${ttsSpeed === s.value ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-muted/30 text-muted-foreground border-border/50 hover:border-border"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Play on page — AI Voice shortcut */}
              {ttsMode === "premium" && voiceUnlocked && onPlayOnPage && (
                <Button
                  size="sm"
                  className="w-full h-9 bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold"
                  onClick={() => { stopPreview(); onPlayOnPage(); onOpenChange(false); }}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  এই পাতা AI Voice দিয়ে পড়ুন
                </Button>
              )}

              {/* ভয়েস প্রিভিউ */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs font-medium border-border/60"
                onClick={isPreviewing ? stopPreview : handlePreviewVoice}
              >
                {isPreviewing
                  ? <><span className="mr-1.5 text-base leading-none">■</span>বন্ধ করুন</>
                  : <><Play className="w-3.5 h-3.5 mr-1.5" />ভয়েস প্রিভিউ</>}
              </Button>
            </div>
          </>

          {/* ═══ অটো-রিড (EPUB only) ═══ */}
          {fileType === "epub" && onAutoReadChange && (
            <>
              <Separator />
              <div>
                <SectionHeader icon={Play} title="অটো-রিড" />
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">স্বয়ংক্রিয়ভাবে জোরে পড়া শুরু করুন</p>
                  <Switch checked={!!autoReadEnabled} onCheckedChange={onAutoReadChange} />
                </div>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  বই খুললেই TTS শুরু হবে এবং পরবর্তী পাতায় স্বয়ংক্রিয়ভাবে চলবে।
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
