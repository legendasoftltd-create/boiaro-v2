import { useEffect, useCallback, useRef, useState } from "react";

/**
 * Comprehensive DRM protection hook:
 * - Blocks keyboard shortcuts (print, copy, save, select-all, view-source, dev-tools)
 * - Blocks clipboard, drag, and context menu
 * - CSS text-selection prevention
 * - Tab-visibility blur (blurs content when tab is inactive / hidden)
 * - DevTools detection (size-based heuristic) with content blur
 * - Print media CSS block
 */
export function useDrmProtection(active = true) {
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [devToolsSuspected, setDevToolsSuspected] = useState(false);
  const devToolsCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setIsTabHidden(false);
      setDevToolsSuspected(false);
    }
  }, [active]);

  const blockKeyboard = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); e.stopPropagation(); return; }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); return; }
    if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); e.stopPropagation(); return; }
    if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); e.stopPropagation(); return; }
    if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); e.stopPropagation(); return; }
    if (mod && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase())) { e.preventDefault(); return; }
    if (e.key === "F12") { e.preventDefault(); return; }
    if (e.key === "PrintScreen") { e.preventDefault(); return; }
  }, [active]);

  const blockClipboard = useCallback((e: ClipboardEvent) => {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
  }, [active]);

  const blockDrag = useCallback((e: DragEvent) => {
    if (!active) return;
    e.preventDefault();
  }, [active]);

  const blockContextMenu = useCallback((e: MouseEvent) => {
    if (!active) return;
    e.preventDefault();
  }, [active]);

  // Tab visibility change → blur content
  const handleVisibilityChange = useCallback(() => {
    if (!active) return;
    setIsTabHidden(document.hidden);
  }, [active]);

  // Window blur (alt-tab, switching apps)
  const handleWindowBlur = useCallback(() => {
    if (!active) return;
    setIsTabHidden(true);
  }, [active]);

  const handleWindowFocus = useCallback(() => {
    if (!active) return;
    setIsTabHidden(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    document.addEventListener("keydown", blockKeyboard, true);
    document.addEventListener("copy", blockClipboard, true);
    document.addEventListener("cut", blockClipboard, true);
    document.addEventListener("dragstart", blockDrag, true);
    document.addEventListener("contextmenu", blockContextMenu, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    // DevTools size-based detection (checks if window outer-inner gap is large)
    devToolsCheckRef.current = setInterval(() => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      setDevToolsSuspected(widthThreshold || heightThreshold);
    }, 2000);

    // Inject CSS for text selection block, print block, and tab-hidden blur
    const style = document.createElement("style");
    style.id = "drm-selection-block";
    style.textContent = `
      .drm-protected, .drm-protected * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
      }
      .drm-protected img {
        pointer-events: none !important;
        -webkit-user-drag: none !important;
      }
      @media print {
        .drm-print-block, .drm-print-block * {
          display: none !important;
          visibility: hidden !important;
        }
        body::after {
          content: "Printing is disabled for this content.";
          display: block;
          font-size: 24px;
          text-align: center;
          padding: 100px 20px;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener("keydown", blockKeyboard, true);
      document.removeEventListener("copy", blockClipboard, true);
      document.removeEventListener("cut", blockClipboard, true);
      document.removeEventListener("dragstart", blockDrag, true);
      document.removeEventListener("contextmenu", blockContextMenu, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      if (devToolsCheckRef.current) clearInterval(devToolsCheckRef.current);
      const el = document.getElementById("drm-selection-block");
      if (el) el.remove();
    };
  }, [active, blockKeyboard, blockClipboard, blockDrag, blockContextMenu, handleVisibilityChange, handleWindowBlur, handleWindowFocus]);

  return { isTabHidden, devToolsSuspected };
}
