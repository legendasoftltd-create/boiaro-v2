/**
 * Security overlays for the ebook reader:
 * 1. Tab-hidden blur overlay
 * 2. DevTools-suspected blur overlay
 * 3. Anti-copy invisible noise layer (randomized CSS noise)
 */

interface DrmOverlayProps {
  isTabHidden: boolean;
  devToolsSuspected: boolean;
  isDarkMode: boolean;
}

export function DrmOverlay({ isTabHidden, devToolsSuspected, isDarkMode }: DrmOverlayProps) {
  const showBlur = isTabHidden || devToolsSuspected;

  return (
    <>
      {/* Invisible noise layer — makes copy-paste produce garbage */}
      <div
        className="fixed inset-0 pointer-events-none z-[35]"
        aria-hidden="true"
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            opacity: 0,
            fontSize: "1px",
            lineHeight: "1px",
            color: "transparent",
          }}
        >
          {/* Invisible characters that pollute clipboard if somehow selected */}
          {Array.from({ length: 30 }, (_, i) => (
            <span key={i} style={{ position: "absolute", top: `${(i * 3.7) % 100}%`, left: `${(i * 7.3) % 100}%` }}>
              {String.fromCharCode(8203 + (i % 4))}{String.fromCharCode(8288)}{String.fromCharCode(65279)}
            </span>
          ))}
        </div>
      </div>

      {/* Tab-hidden / DevTools blur overlay */}
      {showBlur && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            backgroundColor: isDarkMode ? "rgba(18,18,21,0.85)" : "rgba(232,228,218,0.85)",
          }}
        >
          <div className="text-center space-y-3 px-6">
            <p className="text-lg font-semibold text-foreground">
              {devToolsSuspected
                ? "Developer tools detected"
                : "Content hidden"}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {devToolsSuspected
                ? "Please close developer tools to continue reading."
                : "Return to this tab to continue reading."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
