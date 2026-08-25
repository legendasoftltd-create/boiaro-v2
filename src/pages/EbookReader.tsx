import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, Sparkles, Lock, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useConsumptionTracker } from "@/hooks/useConsumptionTracker";
import { useAuth } from "@/contexts/AuthContext";
import { useSecureContent } from "@/hooks/useSecureContent";
import { useDrmProtection } from "@/hooks/useDrmProtection";
import { useEbookAccess } from "@/hooks/useEbookAccess";
import { toast } from "sonner";
import { PaywallModal } from "@/components/ebook-reader/PaywallModal";
import { useSiteSettings } from "@/hooks/useSiteSettings";

// Lazy-loaded so a PDF book doesn't pay for epub.js's bundle and vice versa —
// each renderer (and its underlying library, pdfjs-dist/epubjs) only loads
// once we actually know which format this book is.
const PdfRenderer = lazy(() => import("@/components/ebook-reader/PdfRenderer").then((m) => ({ default: m.PdfRenderer })));
const EpubRenderer = lazy(() => import("@/components/ebook-reader/EpubRenderer").then((m) => ({ default: m.EpubRenderer })));
import type { EpubRendererHandle } from "@/components/ebook-reader/EpubRenderer";
import { ReaderTopBar } from "@/components/ebook-reader/ReaderTopBar";
import { ReaderBottomBar } from "@/components/ebook-reader/ReaderBottomBar";
import { ReaderSettingsSheet } from "@/components/ebook-reader/ReaderSettingsSheet";
import { TocSheet } from "@/components/ebook-reader/TocSheet";
import { DrmWatermark } from "@/components/ebook-reader/DrmWatermark";
import { DrmOverlay } from "@/components/ebook-reader/DrmOverlay";
import { TtsMiniPlayer } from "@/components/ebook-reader/TtsMiniPlayer";
import { TtsFullPlayer } from "@/components/ebook-reader/TtsFullPlayer";
import { useTtsEngine, type TtsMode } from "@/hooks/useTtsEngine";
import { useBackgroundMusic, detectMusicGenre, type MusicGenre } from "@/hooks/useBackgroundMusic";
import { useMediaSession } from "@/hooks/useMediaSession";
import { usePresenceContext } from "@/contexts/PresenceContext";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { trpc } from "@/lib/trpc";
import { toMediaUrl } from "@/lib/mediaUrl";
import { setAmbientTracks } from "@/lib/ambientAudioGenerator";
import { ContinueInAppPrompt } from "@/components/ContinueInAppPrompt";
import { Capacitor } from "@capacitor/core";
import { AdBannerBlock } from "@/components/AdBannerBlock";
import { useAdPlacementThreshold, isAdThresholdReached } from "@/hooks/useAdPlacementThreshold";

type FileType = "pdf" | "epub";

function detectFileType(url: string, mimeType?: string): FileType {
  if (mimeType) {
    if (mimeType.includes("epub")) return "epub";
    if (mimeType.includes("pdf")) return "pdf";
  }
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".epub")) return "epub";
  return "pdf";
}

function ReaderLoadingFallback({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className={`flex items-center justify-center py-24 ${isDarkMode ? "text-white/60" : "text-foreground/60"}`}>
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

export default function EbookReader() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getSecureUrl, logAccess } = useSecureContent();
  const { setActivity } = usePresenceContext();

  const [bookId, setBookId] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [bookSlug, setBookSlug] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<FileType>("pdf");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFreeBook, setIsFreeBook] = useState(false);
  const [ebookPrice, setEbookPrice] = useState(0);
  const [previewPct, setPreviewPct] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [epubPageTotal, setEpubPageTotal] = useState(0); // visual page total for EPUB
  const totalPagesRef = useRef(0);
  const [percentage, setPercentage] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [zoom, setZoom] = useState(1.2);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [contentLocked, setContentLocked] = useState(false);
  const [continueInAppDismissed, setContinueInAppDismissed] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("");
  const [tocItems, setTocItems] = useState<any[]>([]);
  const [currentHref, setCurrentHref] = useState("");
  const [epubCfi, setEpubCfi] = useState("");
  const [previewWarningShown, setPreviewWarningShown] = useState(false);
  const [musicGenre, setMusicGenreRaw] = useState<MusicGenre>(() => {
    try { const g = JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}").genre; return g || "calm"; } catch { return "calm"; }
  });
  const [userOverrodeGenre, setUserOverrodeGenre] = useState(false);
  const [ambientEnabled, setAmbientEnabledRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}").enabled === true; } catch { return false; }
  });

  // Centralized setters that always persist to localStorage
  const setMusicGenre = useCallback((g: MusicGenre) => {
    setMusicGenreRaw(g);
    try { const p = JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}"); localStorage.setItem("bgmusic_prefs", JSON.stringify({ ...p, genre: g })); } catch {}
  }, []);
  const setAmbientEnabled = useCallback((enabled: boolean) => {
    setAmbientEnabledRaw(enabled);
    try { const p = JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}"); localStorage.setItem("bgmusic_prefs", JSON.stringify({ ...p, enabled })); } catch {}
  }, []);
  const [showTtsFullPlayer, setShowTtsFullPlayer] = useState(false);
  const [bookCover, setBookCover] = useState<string | null>(null);
  const [premiumVoiceEnabled, setPremiumVoiceEnabled] = useState(false);
  const [voiceAccessType, setVoiceAccessType] = useState<"free" | "paid" | "subscription">("paid");
  const [voiceCoinPrice, setVoiceCoinPrice] = useState(0);

  const [showVoiceGate, setShowVoiceGate] = useState(false);
  const [pdfPageText, setPdfPageText] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<import("@/hooks/usePremiumTTS").BengaliVoiceId>("EXAVITQu4vr4xnSDxMaL");
  const [ttsSpeed, setTtsSpeed] = useState<import("@/hooks/usePremiumTTS").PremiumTTSSpeed>(1);
  const ttsAutoPlayRef = useRef(false);
  const ttsPlayRef = useRef<((text: string) => void) | null>(null);
  const [autoReadEnabled, setAutoReadEnabled] = useState(() => {
    try { return localStorage.getItem("tts_auto_read") === "true"; } catch { return false; }
  });
  const autoReadRef = useRef(autoReadEnabled);
  autoReadRef.current = autoReadEnabled;
  const access = useEbookAccess(bookId, isFreeBook, totalPages, previewPct);
  const { get: getSetting } = useSiteSettings();
  const promptEnabled = getSetting("app_prompt_enabled", "true") !== "false";
  const promptThresholdType = getSetting("app_prompt_ebook_threshold_type", "percent") as "percent" | "page";
  const promptThresholdValue = Math.max(1, Number(getSetting("app_prompt_ebook_value", "30")) || 30);
  const appStoreUrl  = getSetting("app_ios_url")     || getSetting("app_store_url");
  const playStoreUrl = getSetting("app_android_url") || getSetting("google_play_url");
  const brandName    = getSetting("brand_name", "BoiAro");

  // Restore lock from localStorage on mount / bookId change (try-catch for Safari private mode)
  useEffect(() => {
    if (!isFreeBook || !bookId) return
    let locked = false
    try { locked = !!localStorage.getItem(`app_prompt_locked_ebook_${bookId}`) } catch {}
    if (locked) setContentLocked(true)
  }, [bookId, isFreeBook]);

  // ── CRITICAL GATE: Preview/paywall enforcement ──
  // This flag MUST require !access.loading to prevent race conditions where
  // the reader defaults to "unpurchased" while the DB check is still in flight.
  // It MUST require !access.hasFullAccess so purchased/unlocked books are never restricted.
  // DO NOT add fallback paths that bypass this check.
  const shouldEnforcePreviewLimit = !loading && !access.loading && !isFreeBook && ebookPrice > 0 && !access.hasFullAccess;
  const shouldEnableReaderProtection = shouldEnforcePreviewLimit;
  const { isTabHidden, devToolsSuspected } = useDrmProtection(shouldEnableReaderProtection);

  // Show paywall immediately if 0% preview and not purchased
  useEffect(() => {
    if (shouldEnforcePreviewLimit && access.previewLimit === 0 && bookId) {
      setShowPaywall(true);
    }
  }, [shouldEnforcePreviewLimit, access.previewLimit, bookId]);

  useEffect(() => {
    if (!shouldEnforcePreviewLimit && showPaywall) {
      setShowPaywall(false);
    }
  }, [shouldEnforcePreviewLimit, showPaywall]);

  const epubRef = useRef<EpubRendererHandle>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { progress, saveProgress } = useReadingProgress(bookId || undefined);
  useConsumptionTracker(bookId, "ebook", !!bookId && !showPaywall);

  const utils = trpc.useUtils();
  const { data: bookmarkData, refetch: refetchBookmark } = trpc.books.isBookmarked.useQuery(
    { bookId: bookId! },
    { enabled: !!user && !!bookId }
  );
  const bookmarkMutation = trpc.books.bookmark.useMutation({ onSuccess: () => refetchBookmark() });

  // Premium Voice unlock gate — check for paid AND subscription types
  const { data: voiceUnlockData, isLoading: voiceUnlockLoading, refetch: refetchVoiceUnlock } = trpc.wallet.checkUnlock.useQuery(
    { bookId: bookId!, format: "premium_voice" },
    { enabled: !!user && !!bookId && premiumVoiceEnabled && (voiceAccessType === "paid" || voiceAccessType === "subscription") }
  );
  const { data: balanceData } = trpc.wallet.balance.useQuery(
    undefined,
    { enabled: !!user && showVoiceGate }
  );
  const unlockVoiceMutation = trpc.wallet.unlockContent.useMutation({
    onSuccess: () => {
      refetchVoiceUnlock();
      setShowVoiceGate(false);
      tts.setMode("premium");
      toast.success("Premium Voice unlocked! Enjoy ElevenLabs TTS.");
    },
    onError: (err) => toast.error(err.message || "Failed to unlock"),
  });

  // Dynamic TTS voices + ambient tracks from admin config
  const { data: dynamicVoices } = trpc.tts.listVoices.useQuery(undefined, { staleTime: 5 * 60_000 });
  const { data: ambientTracks } = trpc.tts.listAmbientTracks.useQuery(undefined, { staleTime: 5 * 60_000 });

  useEffect(() => {
    if (ambientTracks?.length) setAmbientTracks(ambientTracks);
  }, [ambientTracks]);

  useEffect(() => {
    if (bookmarkData !== undefined) setIsBookmarked(bookmarkData.bookmarked);
  }, [bookmarkData]);

  // TTS completion handler: auto-advance to next page
  const ttsAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTtsComplete = useCallback(() => {
    if (!ttsAutoPlayRef.current) return;
    if (fileType !== "epub" || !epubRef.current) return;
    // Check paywall
    if (shouldEnforcePreviewLimit && access.isPercentageBlocked(percentage)) {
      setShowPaywall(true);
      
      ttsAutoPlayRef.current = false;
      return;
    }
    // Clear any pending advance timer
    if (ttsAdvanceTimerRef.current) clearTimeout(ttsAdvanceTimerRef.current);
    // Go to next page, then extract text and continue reading
    epubRef.current.nextPage();
    // Use a polling approach to wait for the page content to be fully rendered
    let attempts = 0;
    const maxAttempts = 15;
    let lastText = "";
    const tryReadPage = () => {
      if (!epubRef.current || !ttsAutoPlayRef.current) return;
      const text = epubRef.current.getVisibleText();
      // Wait until text is stable (same on two consecutive checks) and long enough
      if (text && text.trim().length > 10 && text === lastText) {
        ttsPlayRef.current?.(text);
      } else if (attempts < maxAttempts) {
        lastText = text || "";
        attempts++;
        ttsAdvanceTimerRef.current = setTimeout(tryReadPage, 250);
      } else if (text && text.trim().length > 10) {
        // Use whatever we have after max attempts
        ttsPlayRef.current?.(text);
      } else {
        // End of book or empty page
        ttsAutoPlayRef.current = false;
      }
    };
    // Initial delay to let the page transition settle
    ttsAdvanceTimerRef.current = setTimeout(tryReadPage, 500);
  }, [fileType, access, percentage, shouldEnforcePreviewLimit]);

  const tts = useTtsEngine(bookId, handleTtsComplete, () => setShowVoiceGate(true));
  ttsPlayRef.current = tts.play;
  const effectiveGenre = musicGenre || "calm";
  const bgMusic = useBackgroundMusic(effectiveGenre);
  const { trackTtsSession, trackTtsModeSwitch } = useActivityTracker();
  const ttsSessionStartRef = useRef<number | null>(null);

  // Track TTS session start/end for duration analytics
  useEffect(() => {
    if (tts.isPlaying && !tts.isPaused) {
      if (!ttsSessionStartRef.current) ttsSessionStartRef.current = Date.now();
    } else if (!tts.isPlaying && ttsSessionStartRef.current && bookId) {
      const dur = Math.round((Date.now() - ttsSessionStartRef.current) / 1000);
      if (dur >= 3) trackTtsSession(bookId, tts.mode, dur);
      ttsSessionStartRef.current = null;
    }
  }, [tts.isPlaying, tts.isPaused]);

  // Reset to browser TTS when the access check completes and the user hasn't unlocked.
  // This handles the case where localStorage has tts_mode="premium" from a previous session
  // on a different book — without this, the user would be in premium mode and call play()
  // before the gate is shown.
  useEffect(() => {
    if (voiceUnlockLoading) return;
    if (!premiumVoiceEnabled && tts.mode === "premium") {
      tts.setMode("browser");
      return;
    }
    if (
      (voiceAccessType === "paid" || voiceAccessType === "subscription") &&
      voiceUnlockData?.unlocked === false &&
      tts.mode === "premium"
    ) {
      tts.setMode("browser");
    }
  }, [premiumVoiceEnabled, voiceAccessType, voiceUnlockData, voiceUnlockLoading, tts.mode, tts.setMode]);

  // ── TTS Pre-warm: silently generate first paragraphs before user presses play ──
  // Triggered when page text changes (PDF page turn) or when premium mode activates.
  // Only runs when TTS is in premium mode and the user has unlocked access.
  useEffect(() => {
    const ttsUnlocked =
      voiceAccessType === "free" ||
      (premiumVoiceEnabled && voiceUnlockData?.unlocked === true);

    if (tts.mode !== "premium" || !ttsUnlocked || tts.isPlaying || tts.isPaused) return;

    const preWarmFn = (tts as any).preWarm as ((text: string) => void) | undefined;
    if (!preWarmFn) return;

    let text = "";
    if (fileType === "pdf") {
      text = pdfPageText;
    } else if (fileType === "epub" && (tts as any).rawText) {
      // Use already-known page text if available
      text = (tts as any).rawText;
    }

    if (text && text.trim().length > 20) {
      preWarmFn(text);
    }
  }, [pdfPageText, tts.mode, tts.isPlaying, tts.isPaused, voiceAccessType, premiumVoiceEnabled, voiceUnlockData, fileType]);

  // Wrap mode change — gate "premium" mode behind voice unlock when required
  const handleTtsModeChange = useCallback((newMode: TtsMode) => {
    if (newMode === "premium") {
      if (!premiumVoiceEnabled) {
        toast.error("Premium Voice is not enabled for this book.");
        return;
      }
      // "free" access — switch immediately, no gate
      if (voiceAccessType === "free") {
        tts.setMode("premium");
        if (bookId) trackTtsModeSwitch(bookId, tts.mode, "premium");
        return;
      }
      // Still loading unlock status — wait to avoid wrong gate trigger
      if (voiceUnlockLoading) return;

      // Both "paid" and "subscription" — check unlock status (subscription also checked server-side)
      const alreadyUnlocked = voiceUnlockData?.unlocked === true;
      if (!alreadyUnlocked) {
        setShowVoiceGate(true);
        return;
      }
    }
    if (bookId && newMode !== tts.mode) {
      trackTtsModeSwitch(bookId, tts.mode, newMode);
    }
    tts.setMode(newMode);
  }, [tts.mode, tts.setMode, bookId, trackTtsModeSwitch, premiumVoiceEnabled, voiceAccessType, voiceUnlockData, voiceUnlockLoading]);

  // Sync background music with TTS state (only when ambient is enabled)
  const ambientEnabledRef = useRef(ambientEnabled);
  ambientEnabledRef.current = ambientEnabled;

  // Sync background music with TTS — use direct bgMusic methods (not stale refs)
  // to ensure we always call the latest version after genre changes recreate the audio context
  useEffect(() => {
    console.log("[EbookAmbient] sync effect:", {
      ambientEnabled, ttsPlaying: tts.isPlaying, ttsPaused: tts.isPaused,
      bgAvailable: bgMusic.available, genre: musicGenre, volume: bgMusic.volume,
    });

    if (!ambientEnabled) {
      bgMusic.stop();
      return;
    }
    if (!bgMusic.available) return;

    if (tts.isPlaying && !tts.isPaused) {
      console.log("[EbookAmbient] → play()");
      bgMusic.play();
    } else if (tts.isPaused) {
      console.log("[EbookAmbient] → pause()");
      bgMusic.pause();
    } else {
      console.log("[EbookAmbient] → stop()");
      bgMusic.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.isPlaying, tts.isPaused, ambientEnabled, bgMusic.available, musicGenre]);


  const handleTtsPlay = useCallback(() => {
    if ((tts as any).isGenerating || (tts as any).isLoading) return;

    let text = "";

    if (fileType === "epub" && epubRef.current) {
      text = epubRef.current.getVisibleText();
    } else if (fileType === "pdf") {
      text = pdfPageText;
    }

    if (!text || !text.trim()) {
      toast.error("Could not extract text from this page. Try scrolling to load content first.");
      return;
    }

    // Only show loading toast if content isn't pre-warmed (not already in cache)
    if (tts.mode === "premium" && !(tts as any).isPreWarmed) {
      toast.info("AI ভয়েস প্রস্তুত হচ্ছে…");
    }

    
    ttsAutoPlayRef.current = true;
    // Must call bgMusic.play() here (user gesture context) so AudioContext can unlock
    if (ambientEnabled) bgMusic.play();
    tts.play(text);
  }, [ambientEnabled, bgMusic, fileType, tts, pdfPageText]);

  const handleTtsPause = useCallback(() => {
    console.log("[EbookAmbient] handleTtsPause()", {
      musicPlaying: bgMusic.isPlaying,
      musicMuted: bgMusic.isMuted,
    });
    bgMusic.pause();
    tts.pause();
  }, [bgMusic, tts]);

  const handleTtsResume = useCallback(() => {
    if (ambientEnabled) {
      console.log("[EbookAmbient] user gesture resume → bgMusic.play()", {
        available: bgMusic.available,
        muted: bgMusic.isMuted,
        volume: bgMusic.volume,
      });
      bgMusic.play();
    }
    tts.resume();
  }, [ambientEnabled, bgMusic, tts]);

  const handleTtsStop = useCallback(() => {
    console.log("[EbookAmbient] handleTtsStop()");
    bgMusic.stop();
    tts.stop();
  }, [bgMusic, tts]);

  // Media Session API for lock-screen controls
  useMediaSession({
    title: bookTitle || "TTS Reading",
    artist: "eBook Reader",
    artwork: bookCover || undefined,
    isPlaying: tts.isPlaying,
    isPaused: tts.isPaused,
    onPlay: () => tts.isPaused ? handleTtsResume() : handleTtsPlay(),
    onPause: handleTtsPause,
    onStop: handleTtsStop,
    onNextTrack: () => tts.skipForward(3),
    onPreviousTrack: () => tts.skipBackward(3),
    onSeekForward: () => tts.skipForward(3),
    onSeekBackward: () => tts.skipBackward(3),
  });

  // Highlight current sentence in EPUB as TTS reads
  useEffect(() => {
    if (fileType !== "epub" || !epubRef.current) return;
    if (tts.isPlaying && tts.currentSegmentText) {
      epubRef.current.highlightSentence(tts.currentSegmentText);
    } else if (!tts.isPlaying) {
      epubRef.current.clearHighlight();
    }
  }, [fileType, tts.isPlaying, tts.currentSegmentText]);

  // Handle headphone button click
  const handleHeadphoneClick = useCallback(() => {
    if (tts.isPlaying) {
      setShowTtsFullPlayer(true);
    } else {
      handleTtsPlay();
    }
  }, [tts.isPlaying, handleTtsPlay]);

  // ── Auto-read: start TTS automatically when reader loads ──
  const autoReadTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoReadTriggeredRef.current) return;
    if (!autoReadRef.current) return;
    if (fileType !== "epub" || !fileUrl || loading) return;
    // Wait for epub to be ready
    const timer = setTimeout(() => {
      if (!epubRef.current || autoReadTriggeredRef.current) return;
      const text = epubRef.current.getVisibleText();
      if (text && text.trim().length > 10) {
        autoReadTriggeredRef.current = true;
        ttsAutoPlayRef.current = true;
        ttsPlayRef.current?.(text);
      }
    }, 2000); // Give EPUB time to render
    return () => clearTimeout(timer);
  }, [fileType, fileUrl, loading]);

  // ── When user manually navigates pages while TTS is active, restart on new page ──
  const lastManualPageCfi = useRef("");
  const handleManualPageTtsRestart = useCallback((cfi: string) => {
    if (!tts.isPlaying || !ttsAutoPlayRef.current) return;
    if (cfi === lastManualPageCfi.current) return;
    lastManualPageCfi.current = cfi;
    // Small delay to let the new page render, then restart TTS
    setTimeout(() => {
      if (!epubRef.current || !ttsAutoPlayRef.current) return;
      const text = epubRef.current.getVisibleText();
      if (text && text.trim().length > 10) {
        tts.stop();
        // Brief gap then restart
        setTimeout(() => {
          if (!ttsAutoPlayRef.current) return;
          tts.play(text);
        }, 150);
      }
    }, 400);
  }, [tts]);

  // ──────── Fetch book & resolve URL ────────
  useEffect(() => {
    if (!slug) { setError("No book specified"); setLoading(false); return; }
    let cancelled = false;

    // Synchronously clear stale book state before any async work — prevents the
    // previous book's content from showing while the new book loads.
    setLoading(true);
    setError(null);
    setFileUrl(null);
    setBookId(null);
    setBookTitle("");
    setBookSlug("");

    const load = async () => {
      const dbBook = await utils.books.detail.fetch({ slug }).catch(() => null);

      if (!dbBook) {
        if (!cancelled) { setError("Book not found"); setLoading(false); }
        return;
      }

      const formats: any[] = (dbBook as any).formats || [];
      const ebookFmt = formats.find(
        (f: any) => f.format === "ebook" && f.is_available !== false && f.submission_status === "approved"
      ) || formats.find((f: any) => f.format === "ebook");

      if (!ebookFmt) {
        if (!cancelled) {
          setBookId(dbBook.id);
          setBookTitle(dbBook.title);
          setBookSlug(dbBook.slug);
          setError("eBook not available for this title");
          setLoading(false);
        }
        return;
      }

      let resolvedUrl: string | null = null;
      let accessDenied = false;
      let denialReason = "";
      try {
        const result = await getSecureUrl(dbBook.id, "ebook");
        resolvedUrl = result.url;
        if (result.denied) {
          accessDenied = true;
          denialReason = result.reason || "Access denied";
        }
      } catch (e) {
        console.warn("[EbookReader] Secure URL failed:", e);
      }

      if (!resolvedUrl && !accessDenied) {
        if (!cancelled) {
          setBookId(dbBook.id);
          setBookTitle(dbBook.title);
          setBookSlug(dbBook.slug);
          setError("eBook file is not available");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setBookId(dbBook.id);
        setBookTitle(dbBook.title);
        setBookSlug(dbBook.slug);
        const resolvedEbookPrice = Number(ebookFmt.price) || 0;
        setIsFreeBook(Boolean(dbBook.is_free) || resolvedEbookPrice <= 0);
        setEbookPrice(resolvedEbookPrice);
        setPreviewPct((ebookFmt as any).preview_percentage ?? null);
        setBookCover(toMediaUrl(dbBook.cover_url) || null);
        setPremiumVoiceEnabled(Boolean((dbBook as any).premium_voice_enabled));
        const vat = (dbBook as any).voice_access_type;
        setVoiceAccessType(vat === "free" ? "free" : vat === "subscription" ? "subscription" : "paid");
        setVoiceCoinPrice(Number((dbBook as any).voice_coin_price) || 0);

        // Only auto-detect genre if user hasn't manually chosen one
        if (!userOverrodeGenre) {
          try {
            const saved = JSON.parse(localStorage.getItem("bgmusic_prefs") || "{}");
            if (saved.genre) {
              setMusicGenreRaw(saved.genre); // Use saved preference, don't overwrite
            } else {
              setMusicGenre(detectMusicGenre((dbBook as any).category?.name, (dbBook as any).tags));
            }
          } catch {
            setMusicGenre(detectMusicGenre((dbBook as any).category?.name, (dbBook as any).tags));
          }
        }
        setActivity("reading", dbBook.id);

        if (accessDenied && !resolvedUrl) {
          setError(denialReason === "Authentication required for premium content"
            ? "LOGIN_REQUIRED"
            : "ACCESS_DENIED");
          setLoading(false);
          return;
        }

        if (!resolvedUrl) {
          setError("eBook file could not be accessed. Please try again later.");
          setLoading(false);
          return;
        }

        setFileUrl(resolvedUrl);
        const detectedType = detectFileType(resolvedUrl, undefined);
        setFileType(detectedType);
        setLoading(false);

        if (user) logAccess(dbBook.id, "ebook", true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [slug, user]);

  // Bookmark state is synced via trpc.books.isBookmarked query above

  // Keep totalPagesRef in sync so EPUB location handler can read it without stale closure
  useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);

  // ──────── Resume progress ────────
  useEffect(() => {
    if (progress && progress.currentPage > 0) {
      setCurrentPage(progress.currentPage);
      setPercentage(progress.percentage);
      // Restore EPUB position from saved CFI — EpubRenderer uses initialCfi prop
      if (progress.lastReadCfi && fileType === "epub") {
        setEpubCfi(progress.lastReadCfi);
      }
    }
  }, [progress]);

  // ──────── Auto-save progress (debounced) ────────
  useEffect(() => {
    const effectiveTotal = fileType === "epub" ? (epubPageTotal || totalPages) : totalPages;
    if (!bookId || effectiveTotal === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (fileType === "epub") {
        saveProgress(currentPage, effectiveTotal, percentage, epubCfi || undefined);
      } else {
        saveProgress(currentPage, totalPages);
      }
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [currentPage, totalPages, epubPageTotal, percentage, epubCfi, fileType, saveProgress, bookId]);

  // ──────── Controls auto-hide ────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 5000);
  }, []);

  // ──────── Preview warning: "Preview ends in X pages" ────────
  useEffect(() => {
    if (!shouldEnforcePreviewLimit) return;
    
    if (fileType === "epub") {
      // For EPUB: warn 2% before the preview limit
      const warnAt = access.previewLimit - 2;
      if (percentage >= warnAt && percentage < access.previewLimit && !previewWarningShown) {
        setPreviewWarningShown(true);
        toast.warning(`Free preview ends soon — ${access.previewLimit - percentage}% remaining`, {
          duration: 5000,
          icon: <AlertTriangle className="w-4 h-4" />,
        });
      }
    } else {
      // For PDF: warn when 2 pages from limit
      const remaining = access.pagesRemaining(currentPage);
      if (remaining > 0 && remaining <= 2 && !previewWarningShown) {
        setPreviewWarningShown(true);
        toast.warning(`Preview ends in ${remaining} page${remaining > 1 ? "s" : ""}`, {
          duration: 4000,
          icon: <AlertTriangle className="w-4 h-4" />,
        });
      }
    }
  }, [percentage, currentPage, access, fileType, previewWarningShown, shouldEnforcePreviewLimit]);

  // ──────── Mobile app prompt: threshold from admin settings ────────
  useEffect(() => {
    if (!promptEnabled || !isFreeBook || !bookId || contentLocked) return
    const reached = promptThresholdType === "page"
      ? currentPage >= promptThresholdValue
      : percentage >= promptThresholdValue
    if (!reached) return
    const key = `app_prompt_ebook_${bookId}`
    let alreadyFired = false
    try { alreadyFired = !!localStorage.getItem(key) } catch {}
    if (alreadyFired) return
    try { localStorage.setItem(key, "1") } catch {}
    try { localStorage.setItem(`app_prompt_locked_ebook_${bookId}`, "1") } catch {}
    setContentLocked(true)
  }, [promptEnabled, isFreeBook, percentage, currentPage, promptThresholdType, promptThresholdValue, bookId, contentLocked])

  // ──────── "Continue in App" nudge — any book, dismissible, not a paywall ────────
  // Distinct from the free-book lock above: reuses the same threshold-config
  // convention (admin can add continue_in_app_* PlatformSettings; falls back
  // to sensible defaults if unset) but never blocks reading, and shows once
  // per book per browser (not tied to isFreeBook/contentLocked at all).
  const continueInAppEnabled = getSetting("continue_in_app_enabled", "true") !== "false";
  const continueInAppThresholdPage = Math.max(1, Number(getSetting("continue_in_app_page", "3")) || 3);
  const showContinueInApp =
    continueInAppEnabled &&
    !Capacitor.isNativePlatform() &&
    !continueInAppDismissed &&
    !!bookSlug &&
    currentPage >= continueInAppThresholdPage;

  useEffect(() => {
    if (!bookId) return;
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(`continue_in_app_dismissed_${bookId}`); } catch {}
    setContinueInAppDismissed(dismissed);
  }, [bookId]);

  const dismissContinueInApp = () => {
    setContinueInAppDismissed(true);
    try { if (bookId) localStorage.setItem(`continue_in_app_dismissed_${bookId}`, "1"); } catch {}
  };

  // ──────── Delayed reader ad — no ad until the placement's threshold is crossed ────────
  const readerAdThreshold = useAdPlacementThreshold("reader_delayed");
  const [readerElapsedSeconds, setReaderElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!readerAdThreshold.isEnabled || loading) return;
    const timer = setInterval(() => setReaderElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [readerAdThreshold.isEnabled, loading]);
  const showReaderAd =
    readerAdThreshold.isEnabled &&
    isAdThresholdReached(readerAdThreshold, { elapsedSeconds: readerElapsedSeconds, progressPercent: percentage });

  // ──────── EPUB location change handler with paywall check ────────
  const handleEpubLocationChange = useCallback(
    ({ percentage: pct, cfi, chapter, page, pageTotal }: {
      percentage: number; cfi: string; chapter?: string; page?: number; pageTotal?: number;
    }) => {
      setPercentage(pct);
      setEpubCfi(cfi);
      if (chapter) setCurrentHref(chapter);
      const tocItem = tocItems.find((t) => chapter && t.href && chapter.includes(t.href));
      setChapterTitle(tocItem?.label || "");
      // Use visual page directly (increments by 1 per page turn) instead of estimating from %
      if (page && page > 0) {
        setCurrentPage(page);
      }
      if (pageTotal && pageTotal > 0) {
        setEpubPageTotal(pageTotal);
      }

      if (shouldEnforcePreviewLimit && access.isPercentageBlocked(pct) && !showPaywall) {
        setShowPaywall(true);
      }

      if (tts.isPlaying && ttsAutoPlayRef.current) {
        handleManualPageTtsRestart(cfi);
      } else if (tts.mode === "premium" && !tts.isPlaying && !tts.isPaused) {
        // Pre-warm when user turns to a new EPUB page (not currently playing)
        const preWarmFn = (tts as any).preWarm as ((text: string) => void) | undefined;
        if (preWarmFn && epubRef.current) {
          const visText = epubRef.current.getVisibleText();
          if (visText && visText.trim().length > 20) preWarmFn(visText);
        }
      }
    },
    [tocItems, access, showPaywall, shouldEnforcePreviewLimit, tts.isPlaying, tts.isPaused, tts.mode, handleManualPageTtsRestart]
  );

  // ──────── Navigation helpers ────────
  // Returns true (and fires the lock) if the target page would cross the free-book threshold.
  const checkAndFireEbookGate = (targetPage: number): boolean => {
    if (!promptEnabled || !isFreeBook || contentLocked || !bookId) return false
    const targetPct = totalPages > 0 ? Math.round((targetPage / totalPages) * 100) : 0
    const reached = promptThresholdType === "page"
      ? targetPage >= promptThresholdValue
      : targetPct >= promptThresholdValue
    if (!reached) return false
    try { localStorage.setItem(`app_prompt_ebook_${bookId}`, "1") } catch {}
    try { localStorage.setItem(`app_prompt_locked_ebook_${bookId}`, "1") } catch {}
    setContentLocked(true)
    return true
  }

  // ──────── Navigation handlers ────────
  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(page, totalPages || 9999));
    if (shouldEnforcePreviewLimit && access.isPageBlocked(p)) {
      setShowPaywall(true);
      return;
    }
    if (checkAndFireEbookGate(p)) return;
    setCurrentPage(p);
    if (totalPages > 0) setPercentage(Math.round((p / totalPages) * 100));
    resetControlsTimer();
  };

  const handlePrevPage = () => {
    if (fileType === "epub") {
      epubRef.current?.prevPage();
    } else {
      goToPage(currentPage - 1);
    }
    resetControlsTimer();
  };

  const handleNextPage = () => {
    const nextPage = currentPage + 1;
    if (fileType !== "epub" && shouldEnforcePreviewLimit && access.isPageBlocked(nextPage)) {
      setShowPaywall(true);
      return;
    }
    if (fileType === "epub") {
      if (shouldEnforcePreviewLimit && access.isPercentageBlocked(percentage)) {
        setShowPaywall(true);
        return;
      }
      if (checkAndFireEbookGate(nextPage)) return;
      epubRef.current?.nextPage();
    } else {
      goToPage(nextPage);
    }
    resetControlsTimer();
  };

  const toggleBookmark = () => {
    if (!user || !bookId) { toast.error("Sign in to bookmark"); return; }
    bookmarkMutation.mutate({ bookId }, {
      onSuccess: (data) => {
        setIsBookmarked(data.bookmarked);
        toast.success(data.bookmarked ? "Bookmarked!" : "Bookmark removed");
      },
    });
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // ──────── Loading state ────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading ebook…</p>
        </div>
      </div>
    );
  }

  // ──────── Error state ────────
  if (error || !fileUrl) {
    const isAccessDenied = error === "ACCESS_DENIED";
    const isLoginRequired = error === "LOGIN_REQUIRED";

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-4">
          <h1 className="text-2xl font-serif font-bold text-foreground">
            {isAccessDenied
              ? "Purchase Required"
              : isLoginRequired
              ? "Sign In Required"
              : error === "Book not found"
              ? "Book Not Found"
              : error || "eBook Not Available"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isAccessDenied
              ? "You need to purchase, unlock with coins, or subscribe to read this book."
              : isLoginRequired
              ? "Please sign in to access this content."
              : error === "Book not found"
              ? "The book you're looking for could not be found."
              : error === "eBook not available for this title"
              ? "This book doesn't have an eBook format yet."
              : error === "eBook file has not been uploaded yet"
              ? "The publisher hasn't uploaded the ebook file yet."
              : "Unable to load the ebook content."}
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            {isLoginRequired && (
              <Button onClick={() => navigate("/auth")} className="bg-primary text-primary-foreground">
                Sign In
              </Button>
            )}
            {bookSlug && (
              <Button onClick={() => navigate(`/book/${bookSlug}`)} variant={isAccessDenied ? "default" : "outline"}
                className={isAccessDenied ? "bg-primary text-primary-foreground" : ""}>
                {isAccessDenied ? "View Book & Purchase" : "Back to Book"}
              </Button>
            )}
            <Button onClick={() => navigate("/")} variant="outline">
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ──────── Preview info for badge ────────
  const previewInfo = shouldEnforcePreviewLimit
    ? fileType === "epub"
      ? `${Math.min(percentage, access.previewLimit)}% / ${access.previewLimit}% প্রিভিউ`
      : `${currentPage} / ${access.previewPageLimit} প্রিভিউ`
    : null;

  // ──────── Reader ────────
  return (
    <div
      className={`min-h-screen transition-colors duration-300 drm-protected drm-print-block ${
        isDarkMode ? "bg-[#121215]" : "bg-[#e8e4da]"
      }`}
      onClick={resetControlsTimer}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Top Bar */}
      <ReaderTopBar
        title={bookTitle}
        chapterTitle={chapterTitle || undefined}
        isBookmarked={isBookmarked}
        show={showControls}
        isDarkMode={isDarkMode}
        isTtsPlaying={tts.isPlaying}
        showTtsButton={true}
        onBack={() => navigate(bookSlug ? `/book/${bookSlug}` : "/")}
        onToggleBookmark={toggleBookmark}
        onOpenToc={() => setShowToc(true)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTts={handleHeadphoneClick}
      />

      {/* Main reader content */}
      <main className={`pt-16 relative ${tts.isPlaying || tts.isPaused ? "pb-36" : "pb-24"}`}>
        {/* DRM Watermark */}
        <DrmWatermark />

        {/* DRM Security Overlays (tab blur, devtools, noise) */}
        {shouldEnableReaderProtection && (
          <DrmOverlay isTabHidden={isTabHidden} devToolsSuspected={devToolsSuspected} isDarkMode={isDarkMode} />
        )}

        {fileType === "pdf" ? (
          <div className="max-w-5xl mx-auto px-2 sm:px-4">
            <Suspense fallback={<ReaderLoadingFallback isDarkMode={isDarkMode} />}>
              <PdfRenderer
                key={fileUrl ?? "pdf-loading"}
                url={fileUrl}
                currentPage={currentPage}
                zoom={zoom}
                onTotalPagesChange={(total) => {
                  setTotalPages(total);
                  // Use resumed currentPage if already loaded; don't clobber with page 1
                  const page = currentPage > 1 ? currentPage : 1;
                  setPercentage(Math.round((page / total) * 100));
                }}
                onPageChange={(p) => goToPage(p)}
                onZoomChange={(z) => setZoom(z)}
                onError={(err) => toast.error(err)}
                isDarkMode={isDarkMode}
                onTextExtracted={(text) => setPdfPageText(text)}
              />
            </Suspense>
          </div>
        ) : (
          <div className="flex justify-center px-4 md:px-8 lg:px-16">
            <div
              className={`w-full max-w-[700px] mx-auto md:my-6 md:rounded-2xl md:shadow-2xl md:ring-1 transition-colors duration-300 relative`}
              style={{
                /* Lock the container height so TTS playback never causes layout shifts */
                height: "calc(100vh - 10rem)",
                minHeight: "calc(100vh - 10rem)",
                maxHeight: "calc(100vh - 10rem)",
                overflow: "hidden",
                backgroundColor: isDarkMode ? "#1a1a20" : "#faf8f2",
                padding: "20px",
                lineHeight: "1.75",
                boxShadow: isDarkMode
                  ? "0 25px 50px -12px rgba(0,0,0,0.4)"
                  : "0 25px 50px -12px rgba(0,0,0,0.1)",
              }}
            >
              <Suspense fallback={<ReaderLoadingFallback isDarkMode={isDarkMode} />}>
                <EpubRenderer
                  key={fileUrl ?? "epub-loading"}
                  ref={epubRef}
                  url={fileUrl}
                  fontSize={fontSize}
                  isDarkMode={isDarkMode}
                  initialCfi={epubCfi || undefined}
                  onTocLoaded={(toc) => setTocItems(toc)}
                  onLocationChange={handleEpubLocationChange}
                  onTotalPagesEstimated={(total) => setEpubPageTotal(total)}
                  onError={(err) => toast.error(err)}
                />
              </Suspense>

              {/* Content blur overlay when paywall is active */}
              {showPaywall && (
                <div
                  className="absolute inset-0 z-30 pointer-events-none"
                  style={{
                    background: isDarkMode
                      ? "linear-gradient(to bottom, transparent 0%, rgba(18,18,21,0.6) 30%, rgba(18,18,21,0.95) 60%)"
                      : "linear-gradient(to bottom, transparent 0%, rgba(232,228,218,0.6) 30%, rgba(232,228,218,0.95) 60%)",
                    backdropFilter: "blur(4px)",
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* PDF content blur overlay when paywall is active */}
        {showPaywall && fileType === "pdf" && (
          <div
            className="absolute inset-0 z-30 pointer-events-none"
            style={{
              background: isDarkMode
                ? "linear-gradient(to bottom, transparent 0%, rgba(18,18,21,0.6) 30%, rgba(18,18,21,0.95) 60%)"
                : "linear-gradient(to bottom, transparent 0%, rgba(232,228,218,0.6) 30%, rgba(232,228,218,0.95) 60%)",
              backdropFilter: "blur(4px)",
            }}
          />
        )}
      </main>

      {/* TTS Mini Player — visible when TTS is active */}
      {(tts.isPlaying || tts.isPaused) && (
        <TtsMiniPlayer
          isPlaying={tts.isPlaying}
          isPaused={tts.isPaused}
          currentSentenceIndex={tts.currentSentenceIndex}
          totalSentences={tts.totalSentences}
          currentEmotion={tts.currentEmotion}
          elapsedSeconds={tts.elapsedSeconds}
          totalDurationSeconds={tts.totalDurationSeconds}
          bookTitle={bookTitle}
          isPremium={tts.isPremium}
          show={true}
          onPlay={handleTtsPlay}
          onPause={handleTtsPause}
          onResume={handleTtsResume}
          onStop={() => { handleTtsStop();   ttsAutoPlayRef.current = false; }}
          onSkipForward={() => tts.skipForward(3)}
          onSkipBackward={() => tts.skipBackward(3)}
          onOpenFullPlayer={() => setShowTtsFullPlayer(true)}
          musicAvailable={ambientEnabled && bgMusic.available}
          musicMuted={bgMusic.isMuted}
          onMusicToggle={bgMusic.toggleMute}
          ttsMode={tts.mode}
          onTtsModeChange={handleTtsModeChange}
          premiumVoiceAvailable={premiumVoiceEnabled}
        />
      )}

      {/* TTS Full Player */}
      <TtsFullPlayer
        open={showTtsFullPlayer}
        isPlaying={tts.isPlaying}
        isPaused={tts.isPaused}
        currentSentenceIndex={tts.currentSentenceIndex}
        totalSentences={tts.totalSentences}
        currentEmotion={tts.currentEmotion}
        playbackRate={tts.playbackRate as any}
        elapsedSeconds={tts.elapsedSeconds}
        totalDurationSeconds={tts.totalDurationSeconds}
        bookTitle={bookTitle}
        bookCover={bookCover || undefined}
        isPremium={tts.isPremium}
        onClose={() => setShowTtsFullPlayer(false)}
        onPlay={handleTtsPlay}
        onPause={handleTtsPause}
        onResume={handleTtsResume}
        onStop={() => { handleTtsStop();   ttsAutoPlayRef.current = false; setShowTtsFullPlayer(false); }}
        onSkipForward={() => tts.skipForward(3)}
        onSkipBackward={() => tts.skipBackward(3)}
        onSeekToIndex={tts.seekToIndex}
        onSetSpeed={(s) => tts.setSpeed(s as any)}
        musicAvailable={ambientEnabled && bgMusic.available}
        musicMuted={bgMusic.isMuted}
        musicVolume={bgMusic.volume}
        onMusicToggle={bgMusic.toggleMute}
        onMusicVolumeChange={bgMusic.setVolume}
        ttsMode={tts.mode}
        onTtsModeChange={handleTtsModeChange}
        premiumVoiceAvailable={premiumVoiceEnabled}
      />

      {/* Bottom Bar */}
      <ReaderBottomBar
        show={showControls}
        isDarkMode={isDarkMode}
        currentPage={currentPage}
        totalPages={fileType === "epub" ? (epubPageTotal || totalPages) : totalPages}
        percentage={percentage}
        fileType={fileType}
        zoom={zoom}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onZoomIn={() => setZoom((z) => Math.min(3, z + 0.2))}
        onZoomOut={() => setZoom((z) => Math.max(0.5, z - 0.2))}
        onFullscreen={handleFullscreen}
        ambientEnabled={ambientEnabled}
        ambientGenre={musicGenre}
        ambientVolume={bgMusic.volume}
        ambientMuted={bgMusic.isMuted}
        ambientTracks={ambientTracks}
        onAmbientGenreChange={(g) => {
          setUserOverrodeGenre(true);
          setMusicGenre(g);
        }}
        onAmbientVolumeChange={bgMusic.setVolume}
        onAmbientMuteToggle={bgMusic.toggleMute}
      />

      {/* TOC Sheet */}
      <TocSheet
        open={showToc}
        onOpenChange={setShowToc}
        items={tocItems}
        currentHref={currentHref}
        fileType={fileType}
        totalPages={totalPages}
        currentPage={currentPage}
        onSelectItem={(item) => {
          if (fileType === "epub" && item.href) {
            epubRef.current?.goToHref(item.href);
          }
        }}
        onGoToPage={(p) => goToPage(p)}
      />

      {/* Settings Sheet */}
      <ReaderSettingsSheet
        open={showSettings}
        onOpenChange={setShowSettings}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        fontSize={fontSize}
        setFontSize={setFontSize}
        fileType={fileType}
        currentPageText={fileType === "epub" && epubRef.current ? epubRef.current.getVisibleText() : pdfPageText}
        onPlayOnPage={handleTtsPlay}
        ttsMode={tts.mode}
        onTtsModeChange={handleTtsModeChange}
        premiumVoiceAvailable={premiumVoiceEnabled}
        voiceUnlocked={voiceAccessType === "free" || voiceUnlockData?.unlocked === true}
        voiceCoinPrice={voiceCoinPrice}
        selectedVoiceId={selectedVoiceId}
        onVoiceChange={(id) => {
          setSelectedVoiceId(id);
          (tts as any).setVoice?.(id);
        }}
        ttsSpeed={ttsSpeed}
        onTtsSpeedChange={(s) => {
          setTtsSpeed(s);
          tts.setSpeed(s as any);
        }}
        autoReadEnabled={autoReadEnabled}
        onAutoReadChange={(enabled) => {
          setAutoReadEnabled(enabled);
          autoReadRef.current = enabled;
          try { localStorage.setItem("tts_auto_read", String(enabled)); } catch {}
        }}
        ambientEnabled={ambientEnabled}
        onAmbientEnabledChange={(enabled) => {
          setAmbientEnabled(enabled);
          // Pre-warm: if enabling while TTS is already playing, start music NOW
          // (inside user gesture so AudioContext creation is allowed)
          if (enabled && tts.isPlaying && !tts.isPaused) {
            console.log("[EbookAmbient] pre-warm play on enable gesture");
            bgMusic.play();
          }
          if (!enabled) {
            bgMusic.stop();
          }
        }}
        ambientGenre={musicGenre}
        onAmbientGenreChange={(g) => {
          setUserOverrodeGenre(true);
          setMusicGenre(g);
        }}
        ambientVolume={bgMusic.volume}
        onAmbientVolumeChange={bgMusic.setVolume}
        ambientMuted={bgMusic.isMuted}
        onAmbientMuteToggle={bgMusic.toggleMute}
        ambientTracks={ambientTracks}
        voices={dynamicVoices}
      />

      {/* Preview Mode Badge */}
      {previewInfo && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 pointer-events-none">
          <Badge className="bg-background/60 text-foreground/80 backdrop-blur-md shadow-sm border border-border/40 px-2.5 py-0.5 text-[10px] md:text-xs font-medium pointer-events-auto">
            {previewInfo}
          </Badge>
        </div>
      )}

      {showReaderAd && !contentLocked && (
        <div className="fixed bottom-0 inset-x-0 z-[190] px-3 pb-3 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <AdBannerBlock placementKey="reader_delayed" device="all" />
          </div>
        </div>
      )}

      {showContinueInApp && !contentLocked && (
        <ContinueInAppPrompt bookPath={`/book/${bookSlug}`} onDismiss={dismissContinueInApp} />
      )}

      {/* Locked overlay — fullscreen gate, fires immediately when threshold is crossed */}
      {contentLocked && (
        <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center p-8 text-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div className="max-w-sm">
            <h2 className="text-2xl font-bold font-serif text-foreground mb-3">{brandName} অ্যাপে সম্পূর্ণ পড়ুন</h2>
            <p className="text-muted-foreground leading-relaxed">
              &ldquo;{bookTitle}&rdquo; — ওয়েবে ফ্রি প্রিভিউ শেষ হয়েছে।<br />
              অ্যাপ ডাউনলোড করুন এবং বিনামূল্যে সম্পূর্ণ পড়ুন।
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-[260px]">
            {playStoreUrl && (
              <a href={playStoreUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 bg-foreground text-background rounded-xl px-5 py-3 text-sm font-semibold hover:bg-foreground/90 transition-colors">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                </svg>
                Google Play থেকে ডাউনলোড করুন
              </a>
            )}
            {appStoreUrl && (
              <a href={appStoreUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 border-2 border-border rounded-xl px-5 py-3 text-sm font-semibold hover:bg-secondary transition-colors">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                App Store থেকে ডাউনলোড করুন
              </a>
            )}
          </div>
        </div>
      )}

      {/* Paywall Modal */}
      <PaywallModal
        open={showPaywall && shouldEnforcePreviewLimit}
        bookTitle={bookTitle}
        bookSlug={bookSlug}
        bookId={bookId || ""}
        ebookPrice={ebookPrice}
        previewPercentage={access.previewLimit}
        onUnlocked={() => {
          setShowPaywall(false);
          access.markUnlocked();
        }}
        onClose={() => navigate(bookSlug ? `/book/${bookSlug}` : "/")}
      />

      {/* Premium Voice Unlock Gate */}
      <Dialog open={showVoiceGate} onOpenChange={setShowVoiceGate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Sparkles className="h-4 w-4" />
              {voiceAccessType === "subscription" ? "Subscription Required" : "Unlock Premium Voice"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                <Lock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium">ElevenLabs AI Narration</p>
                <p className="text-xs text-muted-foreground">
                  {voiceAccessType === "subscription"
                    ? "Active subscription required for this book's AI voice"
                    : "High-quality AI voice reads this book aloud"}
                </p>
              </div>
            </div>

            {voiceAccessType === "subscription" ? (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border/40 bg-accent/10 px-3 py-2">
                  <span className="text-sm text-muted-foreground">Required</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <Sparkles className="h-4 w-4" />
                    Active Subscription
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Subscribe to unlock AI voice for all eligible books.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowVoiceGate(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    onClick={() => { setShowVoiceGate(false); navigate("/subscriptions"); }}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />View Plans
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Price info */}
                <div className="flex items-center justify-between rounded-lg border border-border/40 bg-accent/10 px-3 py-2">
                  <span className="text-sm text-muted-foreground">Book price</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    ৳{ebookPrice > 0 ? ebookPrice.toFixed(0) : "—"}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Buy this book via payment gateway — AI Voice access is included with your purchase.
                </p>

                {/* Primary: pay via gateway */}
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  onClick={() => {
                    setShowVoiceGate(false);
                    navigate(`/book/${bookSlug}`);
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Buy via Payment Gateway
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or instant unlock</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>

                {/* Secondary: coin unlock */}
                <div className="flex items-center justify-between rounded-lg border border-border/40 bg-accent/10 px-3 py-2">
                  <span className="text-sm text-muted-foreground">Coin unlock</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <Coins className="h-4 w-4" />
                    {voiceCoinPrice} coins
                    {balanceData?.wallet && (
                      <span className={`ml-2 text-xs ${(balanceData.wallet.balance ?? 0) >= voiceCoinPrice ? "text-green-400" : "text-red-400"}`}>
                        (balance: {balanceData.wallet.balance ?? 0})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowVoiceGate(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={
                      unlockVoiceMutation.isPending ||
                      !balanceData?.wallet ||
                      (balanceData.wallet.balance ?? 0) < voiceCoinPrice
                    }
                    onClick={() => {
                      if (!bookId) return;
                      unlockVoiceMutation.mutate({ bookId, format: "premium_voice", coinCost: voiceCoinPrice });
                    }}
                  >
                    {unlockVoiceMutation.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Unlocking...</>
                    ) : (balanceData?.wallet && (balanceData.wallet.balance ?? 0) < voiceCoinPrice) ? (
                      "Not enough coins"
                    ) : (
                      <><Coins className="h-3.5 w-3.5 mr-1.5" />Use Coins</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
