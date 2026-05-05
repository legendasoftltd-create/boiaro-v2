import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import ePub from "epubjs";
import { Loader2 } from "lucide-react";

// epubjs's Rendition.requireManager() resolves "default"/"continuous" by reading
// window.ePub.ViewManagers. In a Vite ES-module environment there is no global,
// so we expose the imported ePub as a window property once at module load time.
if (typeof window !== "undefined") {
  (window as any).ePub = ePub;
}

type NavItem = { label: string; href: string; subitems?: NavItem[] };

interface EpubRendererProps {
  url: string;
  fontSize: number;
  isDarkMode: boolean;
  onTocLoaded: (toc: NavItem[]) => void;
  onLocationChange: (info: { percentage: number; cfi: string; chapter?: string }) => void;
  onError: (error: string) => void;
  initialCfi?: string;
}

export interface EpubRendererHandle {
  nextPage: () => void;
  prevPage: () => void;
  goToHref: (href: string) => void;
  goToCfi: (cfi: string) => void;
  getVisibleText: () => string;
  highlightSentence: (text: string) => void;
  clearHighlight: () => void;
}

const LOAD_TIMEOUT_MS = 25000;

type RuntimeBook = {
  ready?: Promise<unknown>;
  loaded?: { navigation?: Promise<{ toc?: NavItem[] }> };
  navigation?: { toc?: NavItem[] };
  toc?: NavItem[];
  locations?: { generate?: (chars: number) => Promise<unknown>; length?: () => number } | unknown[];
  generateLocations?: (chars: number) => Promise<unknown>;
  renderTo?: (element: HTMLElement, options?: Record<string, unknown>) => any;
  destroy?: () => void;
};

function getLocationCount(book: RuntimeBook | null) {
  const locations = book?.locations;
  if (!locations) return 0;
  if (Array.isArray(locations)) return locations.length;
  if (typeof locations.length === "function") return locations.length();
  return 0;
}

function generateLocations(book: RuntimeBook, chars: number) {
  const locations = book.locations;
  if (locations && !Array.isArray(locations) && typeof locations.generate === "function") {
    return locations.generate(chars);
  }
  if (typeof book.generateLocations === "function") {
    return book.generateLocations(chars);
  }
  return Promise.resolve();
}

export const EpubRenderer = forwardRef<EpubRendererHandle, EpubRendererProps>(
  ({ url, fontSize, isDarkMode, onTocLoaded, onLocationChange, onError, initialCfi }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<RuntimeBook | null>(null);
    const renditionRef = useRef<any>(null);
    const [loaded, setLoaded] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);

    // Touch/swipe state
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const isSwiping = useRef(false);

    const doNext = useCallback(() => {
      try {
        console.debug("[EpubRenderer] next() called");
        renditionRef.current?.next();
      } catch (e) {
        console.warn("[EpubRenderer] next() error:", e);
      }
    }, []);

    const doPrev = useCallback(() => {
      try {
        console.debug("[EpubRenderer] prev() called");
        renditionRef.current?.prev();
      } catch (e) {
        console.warn("[EpubRenderer] prev() error:", e);
      }
    }, []);

    const getIframeDoc = useCallback(() => {
      const container = containerRef.current;
      if (!container) return null;
      const iframe = container.querySelector("iframe");
      return iframe?.contentDocument || null;
    }, []);

    const clearHighlightInDoc = useCallback((doc: Document) => {
      const existing = doc.querySelectorAll(".tts-highlight");
      existing.forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(doc.createTextNode(el.textContent || ""), el);
          parent.normalize();
        }
      });
    }, []);

    const highlightSentenceInDoc = useCallback((doc: Document, text: string) => {
      clearHighlightInDoc(doc);
      if (!text || text.length < 2) return;

      // Ensure highlight style exists
      if (!doc.getElementById("tts-highlight-style")) {
        const style = doc.createElement("style");
        style.id = "tts-highlight-style";
        style.textContent = `
          .tts-highlight {
            background: rgba(255, 196, 0, 0.25) !important;
            border-radius: 2px;
            padding: 1px 0;
            transition: background 0.2s ease;
          }
        `;
        doc.head.appendChild(style);
      }

      // Walk text nodes to find and wrap the matching text
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
      const searchText = text.trim();
      let node: Text | null;
      let found = false;

      while ((node = walker.nextNode() as Text | null)) {
        if (found) break;
        const idx = node.textContent?.indexOf(searchText) ?? -1;
        if (idx === -1) continue;

        const range = doc.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + searchText.length);
        const span = doc.createElement("span");
        span.className = "tts-highlight";
        range.surroundContents(span);
        span.scrollIntoView({ behavior: "smooth", block: "center" });
        found = true;
      }
    }, [clearHighlightInDoc]);

    useImperativeHandle(ref, () => ({
      nextPage: doNext,
      prevPage: doPrev,
      goToHref: (href: string) => {
        try {
          console.debug("[EpubRenderer] goToHref:", href);
          renditionRef.current?.display(href);
        } catch (e) {
          console.warn("[EpubRenderer] goToHref error:", e);
        }
      },
      goToCfi: (cfi: string) => {
        try {
          console.debug("[EpubRenderer] goToCfi:", cfi);
          renditionRef.current?.display(cfi);
        } catch (e) {
          console.warn("[EpubRenderer] goToCfi error:", e);
        }
      },
      getVisibleText: () => {
        try {
          const contents = renditionRef.current?.getContents?.();
          if (contents && Array.isArray(contents)) {
            return (contents as any[])
              .map((c: any) => c?.document?.body?.innerText || "")
              .join("\n")
              .trim();
          }
          const doc = getIframeDoc();
          if (doc?.body) return doc.body.innerText || "";
          return "";
        } catch {
          return "";
        }
      },
      highlightSentence: (text: string) => {
        const doc = getIframeDoc();
        if (doc) highlightSentenceInDoc(doc, text);
      },
      clearHighlight: () => {
        const doc = getIframeDoc();
        if (doc) clearHighlightInDoc(doc);
      },
    }), [doNext, doPrev, getIframeDoc, highlightSentenceInDoc, clearHighlightInDoc]);

    // Main initialization effect
    useEffect(() => {
      if (!url || !containerRef.current) return;

      if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("blob:")) {
        const msg = "Invalid EPUB URL — file may not be accessible";
        console.error("[EpubRenderer]", msg, url);
        setInitError(msg);
        onError(msg);
        return;
      }

      let destroyed = false;
      let book: RuntimeBook | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let blobUrl: string | null = null;

      const cleanup = () => {
        destroyed = true;
        if (timeoutId) clearTimeout(timeoutId);
        try { renditionRef.current?.destroy(); } catch {}
        renditionRef.current = null;
        try { book?.destroy(); } catch {}
        bookRef.current = null;
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
      };

      const fail = (msg: string) => {
        if (!destroyed) {
          console.error("[EpubRenderer]", msg);
          setInitError(msg);
          onError(msg);
          setLoaded(false);
        }
      };

      const initBook = async () => {
        try {
          setLoaded(false);
          setInitError(null);

          timeoutId = setTimeout(() => {
            if (!destroyed && !loaded) {
              fail("EPUB loading timed out. The file may be too large or inaccessible.");
              cleanup();
            }
          }, LOAD_TIMEOUT_MS);

          // Fetch EPUB as binary
          console.debug("[EpubRenderer] Fetching EPUB binary from:", url.substring(0, 80) + "…");
          const response = await fetch(url);
          if (!response.ok) {
            fail(`Failed to download EPUB file (HTTP ${response.status})`);
            return;
          }
          const arrayBuffer = await response.arrayBuffer();
          if (destroyed) return;

          if (arrayBuffer.byteLength < 100) {
            fail("EPUB file is empty or too small to be valid");
            return;
          }
          console.debug("[EpubRenderer] EPUB fetched, size:", arrayBuffer.byteLength);

          // Pass a second argument ({}) so ePub() takes the 2-arg code path.
          // With 1 arg + ArrayBuffer (object), ePub returns new Epub(arrayBuffer)
          // treating it as options — url stays undefined, book never loads.
          // With 2 args, it calls epub.open(arrayBuffer) which triggers the
          // BINARY path, extracts with JSZip, and returns a Book with renderTo.
          book = await (ePub as any)(arrayBuffer, {}) as RuntimeBook;
          bookRef.current = book;

          if (!book || typeof book.renderTo !== "function") {
            throw new Error("EPUB renderer unavailable — renderTo not found");
          }
          if (destroyed) return;
          console.debug("[EpubRenderer] Book loaded, renderTo confirmed");

          // Render to container
          if (!containerRef.current) return;
          const rendition = book.renderTo(containerRef.current, {
            width: "100%",
            height: "100%",
            spread: "none",
            flow: "paginated",
            allowScriptedContent: false,
          });
          renditionRef.current = rendition;
          applyTheme(rendition, isDarkMode, fontSize);
          console.debug("[EpubRenderer] Rendition created");

          // Load TOC
          try {
            const nav = book.loaded?.navigation
              ? await book.loaded.navigation
              : book.navigation || { toc: book.toc || [] };
            if (!destroyed) {
              console.debug("[EpubRenderer] TOC loaded, items:", nav.toc?.length);
              onTocLoaded(nav.toc || []);
            }
          } catch (tocErr) {
            console.warn("[EpubRenderer] TOC load failed:", tocErr);
          }

          // Display initial location
          try {
            if (initialCfi) {
              await rendition.display(initialCfi);
            } else {
              await rendition.display();
            }
          } catch (displayErr) {
            console.warn("[EpubRenderer] Initial display error, retrying:", displayErr);
            if (initialCfi) {
              try { await rendition.display(); } catch {}
            }
          }

          if (destroyed) return;
          console.debug("[EpubRenderer] First section rendered successfully");
          if (timeoutId) clearTimeout(timeoutId);
          setLoaded(true);

          // Generate locations for accurate percentage tracking (runs in background after first render)
          generateLocations(book, 1024).then(() => {
            if (!destroyed) console.debug("[EpubRenderer] Locations generated:", getLocationCount(book));
          }).catch(() => {});

          // Handle relocated event for progress tracking
          rendition.on("relocated", (location: any) => {
            if (destroyed) return;
            try {
              let pct: number;
              if (getLocationCount(book) && typeof location.start?.percentage === "number") {
                // Accurate percentage once locations are generated
                pct = Math.round((location.start?.percentage ?? 0) * 100);
              } else {
                // Spine-based estimate while locations are still generating
                const spineItems = (book as any)?.spine?.items;
                const spineLen = Array.isArray(spineItems) ? spineItems.length : 1;
                const idx = location.start?.index ?? 0;
                pct = Math.round((idx / Math.max(1, spineLen - 1)) * 100);
              }
              pct = Math.min(100, Math.max(0, pct));
              const cfi = location.start?.cfi || "";
              const chapter = location.start?.href || "";
              console.debug("[EpubRenderer] relocated → pct:", pct, "cfi:", cfi?.substring(0, 40));
              onLocationChange({ percentage: pct, cfi, chapter });
            } catch {}
          });

          // Inject touch/click handlers into the epub iframe for navigation
          rendition.on("rendered", (_section: any, view: any) => {
            try {
              const doc = view?.document || view?.contents?.document;
              if (!doc) return;

              // === DRM: Inject protection into iframe ===
              // Disable text selection via CSS
              const drmStyle = doc.createElement("style");
              drmStyle.textContent = `
                *, *::before, *::after {
                  -webkit-user-select: none !important;
                  -moz-user-select: none !important;
                  user-select: none !important;
                  -webkit-touch-callout: none !important;
                }
                img { pointer-events: none !important; -webkit-user-drag: none !important; }
                @media print { body { display: none !important; } }
              `;
              doc.head.appendChild(drmStyle);

              // Block copy, cut, context menu inside iframe
              doc.addEventListener("copy", (e: Event) => { e.preventDefault(); e.stopPropagation(); }, true);
              doc.addEventListener("cut", (e: Event) => { e.preventDefault(); e.stopPropagation(); }, true);
              doc.addEventListener("contextmenu", (e: Event) => { e.preventDefault(); }, true);
              doc.addEventListener("selectstart", (e: Event) => { e.preventDefault(); }, true);
              doc.addEventListener("dragstart", (e: Event) => { e.preventDefault(); }, true);

              // Block keyboard shortcuts inside iframe
              doc.addEventListener("keydown", (e: KeyboardEvent) => {
                const mod = e.ctrlKey || e.metaKey;
                if (mod && ["p", "s", "c", "a", "u"].includes(e.key.toLowerCase())) {
                  e.preventDefault();
                  e.stopPropagation();
                }
                if (mod && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase())) {
                  e.preventDefault();
                }
                if (e.key === "F12" || e.key === "PrintScreen") {
                  e.preventDefault();
                }
              }, true);

              // Tap zones: left 30% = prev, right 30% = next
              doc.addEventListener("click", (e: MouseEvent) => {
                const width = doc.documentElement.clientWidth || window.innerWidth;
                const x = e.clientX;
                if (x < width * 0.3) {
                  renditionRef.current?.prev();
                } else if (x > width * 0.7) {
                  renditionRef.current?.next();
                }
              });

              // Swipe inside iframe
              let sx = 0;
              doc.addEventListener("touchstart", (e: TouchEvent) => {
                sx = e.changedTouches[0]?.clientX || 0;
              }, { passive: true });
              doc.addEventListener("touchend", (e: TouchEvent) => {
                const ex = e.changedTouches[0]?.clientX || 0;
                const diff = ex - sx;
                if (Math.abs(diff) > 40) {
                  if (diff < 0) {
                    renditionRef.current?.next();
                  } else {
                    renditionRef.current?.prev();
                  }
                }
              }, { passive: true });
            } catch (err) {
              console.warn("[EpubRenderer] Failed to attach iframe handlers:", err);
            }
          });

          // Generate locations for percentage (non-blocking)
          try {
            await generateLocations(book, 1600);
            if (!destroyed) rendition.reportLocation();
          } catch (locErr) {
            console.warn("[EpubRenderer] Location generation failed:", locErr);
          }
        } catch (err: any) {
          if (timeoutId) clearTimeout(timeoutId);
          if (!destroyed) {
            const msg = err?.message?.includes("File not found")
              ? "EPUB file not found"
              : err?.message?.includes("xml")
              ? "Invalid or corrupted EPUB file"
              : `Failed to load EPUB: ${err?.message || "Unknown error"}`;
            fail(msg);
          }
        }
      };

      initBook();
      return cleanup;
    }, [url]);

    // Update theme dynamically
    useEffect(() => {
      if (renditionRef.current) {
        try { applyTheme(renditionRef.current, isDarkMode, fontSize); } catch {}
      }
    }, [isDarkMode, fontSize]);

    function applyTheme(rendition: any, dark: boolean, size: number) {
      rendition.themes.default({
        "body, p, span, div, li, a, blockquote, figcaption, cite, em, strong": {
          "font-size": `${size}px !important`,
          "line-height": "1.75 !important",
          "color": dark ? "#d4c9a8 !important" : "#2d2d2d !important",
          "word-spacing": "0.05em !important",
        },
        "p": {
          "text-align": "justify !important",
          "margin-bottom": "0.85em !important",
          "text-indent": "1.2em !important",
          "hyphens": "auto !important",
        },
        "h1, h2, h3, h4, h5, h6": {
          "font-size": `${Math.round(size * 1.3)}px !important`,
          "line-height": "1.35 !important",
          "color": dark ? "#e8dcc8 !important" : "#1a1a1a !important",
          "margin-top": "1.5em !important",
          "margin-bottom": "0.6em !important",
          "text-indent": "0 !important",
          "text-align": "left !important",
        },
        body: {
          "background-color": dark ? "#1a1a20 !important" : "#faf8f2 !important",
          "padding": "1.5rem 2rem !important",
          "font-family": "'Georgia', 'Noto Serif Bengali', serif !important",
          "max-width": "100% !important",
        },
        "img": {
          "max-width": "100% !important",
          "height": "auto !important",
        },
      });
    }

    // Keyboard navigation
    useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          doNext();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          doPrev();
        }
      };
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }, [doNext, doPrev]);

    // Swipe on the outer container (for areas outside the iframe)
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwiping.current = false;
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      // Only swipe if horizontal movement > vertical and > threshold
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) {
          doNext();
        } else {
          doPrev();
        }
      }
    }, [doNext, doPrev]);

    // Tap navigation on outer container
    const handleContainerClick = useCallback((e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      if (x < width * 0.25) {
        doPrev();
      } else if (x > width * 0.75) {
        doNext();
      }
    }, [doNext, doPrev]);

    if (initError) {
      return (
        <div className="relative w-full flex items-center justify-center" style={{ height: "calc(100vh - 10rem)" }}>
          <div className="text-center space-y-3 px-4">
            <p className="text-destructive font-medium">{initError}</p>
            <p className="text-muted-foreground text-sm">
              The EPUB file could not be loaded. It may be missing, corrupted, or inaccessible.
            </p>
          </div>
        </div>
      );
    }

     return (
       <div className="relative w-full flex justify-center">
         <div
           className="relative w-full max-w-[720px]"
           style={{ height: "calc(100vh - 10rem)" }}
           onTouchStart={handleTouchStart}
           onTouchEnd={handleTouchEnd}
           onClick={handleContainerClick}
         >
           {!loaded && (
             <div className="absolute inset-0 flex items-center justify-center z-10">
               <Loader2 className="w-8 h-8 animate-spin text-primary" />
               <span className="ml-3 text-muted-foreground text-sm">Loading EPUB…</span>
             </div>
           )}

           {/* Visible tap-zone hints on mobile */}
           {loaded && (
             <>
               <button
                 className="absolute left-0 top-0 bottom-0 w-[15%] z-20 opacity-0 active:opacity-10 active:bg-foreground/10 transition-opacity cursor-pointer"
                 onClick={(e) => { e.stopPropagation(); doPrev(); }}
                 aria-label="Previous page"
               />
               <button
                 className="absolute right-0 top-0 bottom-0 w-[15%] z-20 opacity-0 active:opacity-10 active:bg-foreground/10 transition-opacity cursor-pointer"
                 onClick={(e) => { e.stopPropagation(); doNext(); }}
                 aria-label="Next page"
               />
             </>
           )}

           <div
             ref={containerRef}
             className="w-full h-full rounded-none md:rounded-xl overflow-hidden"
             style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.3s" }}
           />
         </div>
       </div>
     );
  }
);

EpubRenderer.displayName = "EpubRenderer";
