import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface DrmWatermarkProps {
  className?: string;
}

export function DrmWatermark({ className }: DrmWatermarkProps) {
  const { user } = useAuth();

  const watermarkText = useMemo(() => {
    if (!user) return "";
    const email = user.email || "";
    const masked = email.replace(/(.{2})(.*)(@.*)/, "$1***$3");
    const uid = user.id?.substring(0, 8) || "";
    const ts = new Date().toISOString().split("T")[0];
    return `${masked} • ${uid} • ${ts}`;
  }, [user]);

  if (!user || !watermarkText) return null;

  // Generate grid items with varied animation delays for organic movement
  const items = Array.from({ length: 20 }, (_, i) => i);

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-40 overflow-hidden ${className || ""}`}
      aria-hidden="true"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <div
        className="absolute inset-0"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "repeat(5, 1fr)",
          gap: "0px",
          width: "160%",
          height: "160%",
          top: "-30%",
          left: "-30%",
          transform: "rotate(-22deg)",
        }}
      >
        {items.map((i) => (
          <div
            key={i}
            className="flex items-center justify-center drm-watermark-cell"
            style={{
              animationDelay: `${(i * 1.7) % 8}s`,
            }}
          >
            <span
              className="whitespace-nowrap select-none font-mono tracking-wider text-foreground"
              style={{
                fontSize: "clamp(9px, 1vw, 14px)",
                opacity: 0.045,
                lineHeight: 1,
              }}
            >
              {watermarkText}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
