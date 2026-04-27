import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useAuth } from "@/contexts/AuthContext";
import { useSecureContent } from "@/hooks/useSecureContent";
import { useDrmProtection } from "@/hooks/useDrmProtection";
import { useEbookAccess } from "@/hooks/useEbookAccess";
import { toast } from "sonner";
import { PaywallModal } from "@/components/ebook-reader/PaywallModal";

import { PdfRenderer } from "@/components/ebook-reader/PdfRenderer";
import { EpubRenderer, type EpubRendererHandle } from "@/components/ebook-reader/EpubRenderer";
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
import { usePresence } from "@/hooks/usePresence";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { trpc } from "@/lib/trpc";

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

export default function EbookReader() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getSecureUrl, logAccess } = useSecureContent();
  const { setActivity } = usePresence();

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
  const [percentage, setPercentage] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [zoom, setZoom] = useState(1.2);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
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
  const [ttsLastIndex, setTtsLastIndex] = useState(0);
  const [ttsAutoPlay, setTtsAutoPlay] = useState(false);
  const ttsAutoPlayRef = useRef(false);
  const [autoReadEnabled, setAutoReadEnabled] = useState(() => {
    try { return localStorage.getItem("tts_auto_read") === "true"; } catch { return false; }
  });
  const autoReadRef = useRef(autoReadEnabled);
  autoReadRef.current = autoReadEnabled;
  const ttsStartedForPageRef = useRef(false);
  const access = useEbookAccess(bookId, isFreeBook, totalPages, previewPct);

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

  const utils = trpc.useUtils();
  const { data: bookmarkData, refetch: refetchBookmark } = trpc.books.isBookmarked.useQuery(
    { bookId: bookId! },
    { enabled: !!user && !!bookId }
  );
  const bookmarkMutation = trpc.books.bookmark.useMutation({ onSuccess: () => refetchBookmark() });
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
      setTtsAutoPlay(false);
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
        tts.play(text);
      } else if (attempts < maxAttempts) {
        lastText = text || "";
        attempts++;
        ttsAdvanceTimerRef.current = setTimeout(tryReadPage, 250);
      } else if (text && text.trim().length > 10) {
        // Use whatever we have after max attempts
        tts.play(text);
      } else {
        // End of book or empty page
        setTtsAutoPlay(false);
        ttsAutoPlayRef.current = false;
      }
    };
    // Initial delay to let the page transition settle
    ttsAdvanceTimerRef.current = setTimeout(tryReadPage, 500);
  }, [fileType, access, percentage, shouldEnforcePreviewLimit]);

  const tts = useTtsEngine(bookId, handleTtsComplete);
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

  // Wrap mode change to track conversions
  const handleTtsModeChange = useCallback((newMode: TtsMode) => {
    if (bookId && newMode !== tts.mode) {
      trackTtsModeSwitch(bookId, tts.mode, newMode);
    }
    tts.setMode(newMode);
  }, [tts.mode, tts.setMode, bookId, trackTtsModeSwitch]);

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

  // Safety: if TTS is not playing, music must not be playing
  useEffect(() => {
    if (!tts.isPlaying && bgMusic.isPlaying) {
      console.log("[EbookAmbient] safety stop — TTS not playing but music is");
      bgMusic.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.isPlaying, bgMusic.isPlaying]);

  const handleTtsPlay = useCallback(() => {
    if (fileType === "epub" && epubRef.current) {
      const text = epubRef.current.getVisibleText();
      if (text) {
        setTtsAutoPlay(true);
        ttsAutoPlayRef.current = true;
        if (ambientEnabled) {
          console.log("[EbookAmbient] user gesture play → bgMusic.play()", {
            available: bgMusic.available,
            muted: bgMusic.isMuted,
            volume: bgMusic.volume,
          });
          bgMusic.play();
        }
        tts.play(text);
      } else {
        toast.error("Could not extract text from this page");
      }
    }
  }, [ambientEnabled, bgMusic, fileType, tts]);

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
        setTtsAutoPlay(true);
        ttsAutoPlayRef.current = true;
        tts.play(text);
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

    const load = async () => {
      setLoading(true);
      setError(null);

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
        setBookCover(dbBook.cover_url || null);
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
        setFileType(detectFileType(resolvedUrl, undefined));
        if (ebookFmt.pages) setTotalPages(ebookFmt.pages);
        setLoading(false);

        if (user) logAccess(dbBook.id, "ebook", true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [slug, user]);

  // Bookmark state is synced via trpc.books.isBookmarked query above

  // ──────── Resume progress ────────
  useEffect(() => {
    if (progress && progress.currentPage > 0) {
      setCurrentPage(progress.currentPage);
      setPercentage(progress.percentage);
    }
  }, [progress]);

  // ──────── Auto-save progress (debounced) ────────
  useEffect(() => {
    if (!bookId || totalPages === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProgress(currentPage, totalPages);
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [currentPage, totalPages, saveProgress, bookId]);

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

  // ──────── EPUB location change handler with paywall check ────────
  const handleEpubLocationChange = useCallback(
    ({ percentage: pct, cfi, chapter }: { percentage: number; cfi: string; chapter?: string }) => {
      setPercentage(pct);
      setEpubCfi(cfi);
      if (chapter) setCurrentHref(chapter);
      const tocItem = tocItems.find((t) => chapter && t.href && chapter.includes(t.href));
      setChapterTitle(tocItem?.label || "");

      // Auto-trigger paywall if percentage exceeds preview limit
      if (shouldEnforcePreviewLimit && access.isPercentageBlocked(pct) && !showPaywall) {
        setShowPaywall(true);
      }

      // If TTS is playing and this is a user-initiated page change (not auto-advance),
      // restart TTS on the new page content
      if (tts.isPlaying && ttsAutoPlayRef.current) {
        handleManualPageTtsRestart(cfi);
      }
    },
    [tocItems, access, showPaywall, shouldEnforcePreviewLimit, tts.isPlaying, handleManualPageTtsRestart]
  );

  // ──────── Navigation handlers ────────
  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(page, totalPages || 9999));
    if (shouldEnforcePreviewLimit && access.isPageBlocked(p)) {
      setShowPaywall(true);
      return;
    }
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
        showTtsButton={fileType === "epub"}
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
            <PdfRenderer
              url={fileUrl}
              currentPage={currentPage}
              zoom={zoom}
              onTotalPagesChange={(total) => {
                setTotalPages(total);
                setPercentage(Math.round((currentPage / total) * 100));
              }}
              onPageChange={(p) => goToPage(p)}
              onZoomChange={(z) => setZoom(z)}
              onError={(err) => toast.error(err)}
              isDarkMode={isDarkMode}
            />
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
              <EpubRenderer
                ref={epubRef}
                url={fileUrl}
                fontSize={fontSize}
                isDarkMode={isDarkMode}
                initialCfi={epubCfi || undefined}
                onTocLoaded={(toc) => setTocItems(toc)}
                onLocationChange={handleEpubLocationChange}
                onError={(err) => toast.error(err)}
              />

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
      {fileType === "epub" && (tts.isPlaying || tts.isPaused) && (
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
          onStop={() => { handleTtsStop(); setTtsLastIndex(0); setTtsAutoPlay(false); ttsAutoPlayRef.current = false; }}
          onSkipForward={() => tts.skipForward(3)}
          onSkipBackward={() => tts.skipBackward(3)}
          onOpenFullPlayer={() => setShowTtsFullPlayer(true)}
          musicAvailable={ambientEnabled && bgMusic.available}
          musicMuted={bgMusic.isMuted}
          onMusicToggle={bgMusic.toggleMute}
          ttsMode={tts.mode}
          onTtsModeChange={tts.setMode}
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
        onStop={() => { handleTtsStop(); setTtsLastIndex(0); setTtsAutoPlay(false); ttsAutoPlayRef.current = false; setShowTtsFullPlayer(false); }}
        onSkipForward={() => tts.skipForward(3)}
        onSkipBackward={() => tts.skipBackward(3)}
        onSeekToIndex={tts.seekToIndex}
        onSetSpeed={tts.setSpeed}
        musicAvailable={ambientEnabled && bgMusic.available}
        musicMuted={bgMusic.isMuted}
        musicVolume={bgMusic.volume}
        onMusicToggle={bgMusic.toggleMute}
        onMusicVolumeChange={bgMusic.setVolume}
        ttsMode={tts.mode}
        onTtsModeChange={tts.setMode}
      />

      {/* Bottom Bar */}
      <ReaderBottomBar
        show={showControls}
        isDarkMode={isDarkMode}
        currentPage={currentPage}
        totalPages={totalPages}
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
        ttsMode={tts.mode}
        onTtsModeChange={handleTtsModeChange}
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
      />

      {/* Preview Mode Badge */}
      {previewInfo && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 pointer-events-none">
          <Badge className="bg-background/60 text-foreground/80 backdrop-blur-md shadow-sm border border-border/40 px-2.5 py-0.5 text-[10px] md:text-xs font-medium pointer-events-auto">
            {previewInfo}
          </Badge>
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
    </div>
  );
}
