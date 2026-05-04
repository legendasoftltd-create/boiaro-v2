import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2, ChevronLeft, ChevronRight, AlertTriangle, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface PdfRendererProps {
  url: string;
  currentPage: number;
  zoom: number;
  onTotalPagesChange: (total: number) => void;
  onPageChange: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  onError: (error: string) => void;
  isDarkMode: boolean;
}

const PDF_LOAD_TIMEOUT = 30_000;
const PDF_PARSE_TIMEOUT = 20_000;
const PDF_RENDER_TIMEOUT = 20_000;

// ─── Swipe detection constants ───
const SWIPE_THRESHOLD = 50;
const SWIPE_MAX_VERTICAL = 80;
const SWIPE_TIMEOUT = 400;

// ─── Zoom constants ───
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const DOUBLE_TAP_DELAY = 300; // ms
const DOUBLE_TAP_ZOOM = 2.0;

export function PdfRenderer({
  url,
  currentPage,
  zoom,
  onTotalPagesChange,
  onPageChange,
  onZoomChange,
  onError,
  isDarkMode,
}: PdfRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const onErrorRef = useRef(onError);
  const onTotalPagesChangeRef = useRef(onTotalPagesChange);
  const [rendering, setRendering] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [firstPageReady, setFirstPageReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const renderTaskRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch state for swipe
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const swipingRef = useRef(false);

  // ─── Pinch-to-zoom state ───
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const isPinchingRef = useRef(false);
  const [visualScale, setVisualScale] = useState(1); // CSS transform scale during pinch

  // ─── Pan state (when zoomed in) ───
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const isPanningRef = useRef(false);

  // ─── Double-tap state ───
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  useEffect(() => {
    onErrorRef.current = onError;
    onTotalPagesChangeRef.current = onTotalPagesChange;
  }, [onError, onTotalPagesChange]);

  // Reset pan when page changes or zoom resets to base
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
  }, [currentPage]);

  // ─── Load document ───
  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    setLoaded(false);
    setFirstPageReady(false);
    setLoadError(null);

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const loadPdf = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PDF_LOAD_TIMEOUT);

        console.debug("[PdfRenderer] Fetching PDF binary…", url.substring(0, 80));
        let response: Response;
        try {
          response = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        if (arrayBuffer.byteLength < 100) {
          throw new Error("PDF file appears empty or corrupted");
        }

        console.debug("[PdfRenderer] Binary loaded, size:", (arrayBuffer.byteLength / 1024).toFixed(0), "KB");

        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          disableStream: true,
          disableAutoFetch: true,
        });
        const pdf = await withTimeout(
          loadingTask.promise,
          PDF_PARSE_TIMEOUT,
          "PDF parse timed out. The file may be invalid or blocked."
        );
        if (cancelled) return;
        pdfDocRef.current = pdf;
        onTotalPagesChangeRef.current(pdf.numPages);
        setLoaded(true);
      } catch (err: any) {
        console.error("[PdfRenderer] Load error:", err);
        if (cancelled) return;
        let message = `Failed to load PDF: ${err?.message || "Unknown error"}`;
        if (err?.name === "AbortError") {
          message = "PDF took too long to load. Please check your connection and try again.";
        }
        setLoadError(message);
        onErrorRef.current(message);
      }
    };

    loadPdf();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
    };
  }, [url, retryKey]);

  // ─── Render the visible page ───
  const renderPage = useCallback(
    async (pageNum: number, targetCanvas: HTMLCanvasElement) => {
      const pdf = pdfDocRef.current;
      if (!pdf) return;

      const clamped = Math.max(1, Math.min(pageNum, pdf.numPages));

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdf.getPage(clamped);
        const scale = zoom;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        targetCanvas.width = viewport.width * dpr;
        targetCanvas.height = viewport.height * dpr;
        targetCanvas.style.width = `${viewport.width}px`;
        targetCanvas.style.height = `${viewport.height}px`;

        const ctx = targetCanvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;
        await Promise.race([
          renderTask.promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("PDF page render timed out")), PDF_RENDER_TIMEOUT)
          ),
        ]);
        return true;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("[PdfRenderer] Render error:", err);
          const message = `Failed to render PDF page: ${err?.message || "Unknown error"}`;
          setLoadError(message);
          onErrorRef.current(message);
        }
        return false;
      }
    },
    [zoom]
  );

  // Render current page when loaded or page/zoom changes
  useEffect(() => {
    if (!loaded || !canvasRef.current) return;
    let cancelled = false;

    setRendering(true);
    renderPage(currentPage, canvasRef.current).then((ok) => {
      if (!cancelled) {
        setRendering(false);
        if (ok && !firstPageReady) setFirstPageReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loaded, currentPage, zoom, renderPage]);

  // ─── Preload adjacent pages ───
  useEffect(() => {
    if (!loaded || !pdfDocRef.current) return;
    const pdf = pdfDocRef.current;
    const nextPage = currentPage + 1;
    if (nextPage <= pdf.numPages) {
      pdf.getPage(nextPage).catch(() => {});
    }
  }, [loaded, currentPage]);

  // ─── Helper: distance between two touches ───
  const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ─── Touch handlers with pinch-to-zoom + pan + swipe ───
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Start pinch
      isPinchingRef.current = true;
      swipingRef.current = false;
      touchStartRef.current = null;
      pinchStartDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
      pinchStartZoomRef.current = zoom;
      e.preventDefault();
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();

      // Check double-tap
      if (lastTapRef.current) {
        const dt = now - lastTapRef.current.t;
        const dx = Math.abs(touch.clientX - lastTapRef.current.x);
        const dy = Math.abs(touch.clientY - lastTapRef.current.y);
        if (dt < DOUBLE_TAP_DELAY && dx < 30 && dy < 30) {
          // Double-tap detected
          lastTapRef.current = null;
          const isZoomedIn = zoom > 1.5;
          const newZoom = isZoomedIn ? 1.2 : DOUBLE_TAP_ZOOM;
          onZoomChange?.(newZoom);
          setPanOffset({ x: 0, y: 0 });
          e.preventDefault();
          return;
        }
      }
      lastTapRef.current = { t: now, x: touch.clientX, y: touch.clientY };

      // Check if zoomed in — enable panning
      if (zoom > 1.5) {
        isPanningRef.current = true;
        panStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          ox: panOffset.x,
          oy: panOffset.y,
        };
        return;
      }

      // Normal swipe start
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: now };
      swipingRef.current = false;
    }
  }, [zoom, panOffset, onZoomChange]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Pinch zoom
    if (isPinchingRef.current && e.touches.length === 2 && pinchStartDistRef.current) {
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      const scale = dist / pinchStartDistRef.current;
      const newVisualScale = Math.max(MIN_ZOOM / pinchStartZoomRef.current, Math.min(MAX_ZOOM / pinchStartZoomRef.current, scale));
      setVisualScale(newVisualScale);
      e.preventDefault();
      return;
    }

    // Panning when zoomed
    if (isPanningRef.current && panStartRef.current && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - panStartRef.current.x;
      const dy = touch.clientY - panStartRef.current.y;
      setPanOffset({
        x: panStartRef.current.ox + dx,
        y: panStartRef.current.oy + dy,
      });
      e.preventDefault();
      return;
    }

    // Normal swipe
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);

    if (Math.abs(dx) > 20 && dy < SWIPE_MAX_VERTICAL) {
      swipingRef.current = true;
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // End pinch — commit zoom
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        if (pinchStartDistRef.current && visualScale !== 1) {
          const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoomRef.current * visualScale));
          setVisualScale(1);
          setPanOffset({ x: 0, y: 0 });
          onZoomChange?.(Math.round(newZoom * 10) / 10);
        }
        pinchStartDistRef.current = null;
        return;
      }

      // End pan
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panStartRef.current = null;
        return;
      }

      // Normal swipe end
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = Math.abs(touch.clientY - touchStartRef.current.y);
      const dt = Date.now() - touchStartRef.current.t;
      touchStartRef.current = null;

      if (
        Math.abs(dx) >= SWIPE_THRESHOLD &&
        dy < SWIPE_MAX_VERTICAL &&
        dt < SWIPE_TIMEOUT
      ) {
        const pdf = pdfDocRef.current;
        if (!pdf) return;

        if (dx < 0 && currentPage < pdf.numPages) {
          onPageChange(currentPage + 1);
        } else if (dx > 0 && currentPage > 1) {
          onPageChange(currentPage - 1);
        }
      }

      swipingRef.current = false;
    },
    [currentPage, onPageChange, visualScale, onZoomChange]
  );

  // ─── Tap navigation zones ───
  const handleTapNavigation = useCallback(
    (e: React.MouseEvent) => {
      // Don't navigate when zoomed in
      if (zoom > 1.5) return;

      const pdf = pdfDocRef.current;
      const container = containerRef.current;
      if (!pdf || !container) return;

      const rect = container.getBoundingClientRect();
      const tapX = e.clientX - rect.left;
      const width = rect.width;

      if (tapX < width * 0.25 && currentPage > 1) {
        onPageChange(currentPage - 1);
      } else if (tapX > width * 0.75 && currentPage < pdf.numPages) {
        onPageChange(currentPage + 1);
      }
    },
    [currentPage, onPageChange, zoom]
  );

  // ─── Mobile zoom controls ───
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(MAX_ZOOM, zoom + 0.3);
    onZoomChange?.(Math.round(newZoom * 10) / 10);
  }, [zoom, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(MIN_ZOOM, zoom - 0.3);
    onZoomChange?.(Math.round(newZoom * 10) / 10);
    if (newZoom <= 1.3) setPanOffset({ x: 0, y: 0 });
  }, [zoom, onZoomChange]);

  const handleZoomReset = useCallback(() => {
    onZoomChange?.(1.2);
    setPanOffset({ x: 0, y: 0 });
  }, [onZoomChange]);

  const totalPagesCount = pdfDocRef.current?.numPages || 0;
  const isZoomed = zoom > 1.3;

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-sm text-foreground max-w-md">{loadError}</p>
        <Button variant="outline" onClick={() => setRetryKey((v) => v + 1)}>
          Retry PDF
        </Button>
      </div>
    );
  }

  const showSkeleton = !loaded || !firstPageReady;

  // Build canvas transform for pinch visual feedback + pan
  const canvasTransform = isPinchingRef.current
    ? `scale(${visualScale}) translate(${panOffset.x}px, ${panOffset.y}px)`
    : `translate(${panOffset.x}px, ${panOffset.y}px)`;

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center relative select-none px-4 md:px-0 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTapNavigation}
      style={{ touchAction: isPinchingRef.current || isZoomed ? "none" : "pan-y" }}
    >
      {/* Loading skeleton overlay */}
      {showSkeleton && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center py-8 space-y-4">
          <Skeleton
            className="w-full max-w-lg rounded-lg"
            style={{ aspectRatio: "3/4", maxHeight: "70vh" }}
          />
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Loading PDF…
            </span>
          </div>
        </div>
      )}

      {/* Swipe hint arrows on mobile */}
      {!showSkeleton && !isZoomed && currentPage > 1 && (
        <button
          className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full bg-background/70 backdrop-blur-sm text-foreground/50 hover:text-foreground/80 transition-opacity md:hidden"
          onClick={(e) => {
            e.stopPropagation();
            onPageChange(currentPage - 1);
          }}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {!showSkeleton && !isZoomed && currentPage < totalPagesCount && (
        <button
          className="absolute -right-1 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full bg-background/70 backdrop-blur-sm text-foreground/50 hover:text-foreground/80 transition-opacity md:hidden"
          onClick={(e) => {
            e.stopPropagation();
            onPageChange(currentPage + 1);
          }}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Page rendering indicator */}
      {rendering && !showSkeleton && (
        <div className="absolute top-2 right-2 z-10">
          <Loader2 className="w-4 h-4 animate-spin text-primary/60" />
        </div>
      )}

      {/* Canvas with transform for pinch visual + pan */}
      <canvas
        ref={canvasRef}
        className={`max-w-full rounded-lg shadow-lg transition-[filter] duration-300 max-h-[75vh] md:max-h-none object-contain ${
          isDarkMode ? "invert brightness-90 hue-rotate-180" : ""
        } ${showSkeleton ? "invisible" : ""}`}
        style={{
          transform: canvasTransform,
          transformOrigin: "center center",
          willChange: isPinchingRef.current ? "transform" : "auto",
        }}
      />

      {/* Mobile zoom controls — floating pill */}
      {!showSkeleton && (
        <div className="mt-3 flex items-center gap-2 md:hidden">
          <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-full border border-border/50 px-2 py-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
              className="p-1.5 rounded-full text-foreground/60 hover:text-foreground active:bg-muted/50 transition-colors"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground min-w-[36px] text-center font-medium">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
              className="p-1.5 rounded-full text-foreground/60 hover:text-foreground active:bg-muted/50 transition-colors"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {isZoomed && (
              <button
                onClick={(e) => { e.stopPropagation(); handleZoomReset(); }}
                className="p-1.5 rounded-full text-foreground/60 hover:text-foreground active:bg-muted/50 transition-colors"
                aria-label="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {!isZoomed && (
            <span className="text-xs text-muted-foreground/70 select-none">
              ← স্বাইপ করুন →
            </span>
          )}
          {isZoomed && (
            <span className="text-xs text-muted-foreground/70 select-none">
              ড্র্যাগ করে দেখুন
            </span>
          )}
        </div>
      )}
    </div>
  );
}
