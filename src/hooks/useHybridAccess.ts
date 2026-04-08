/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  DORMANT HOOK — NOT USED IN ANY PRODUCTION FLOW                ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Current active access hooks:                                  ║
 * ║    • eBooks     → useEbookAccess.ts                            ║
 * ║    • Audiobooks → useAudiobookAccess.ts                        ║
 * ║                                                                ║
 * ║  This hook delegates to the check_hybrid_access RPC and is     ║
 * ║  reserved for future hybrid/bundled access use cases (e.g.     ║
 * ║  combo ebook+audiobook unlocks). Do NOT use it as a            ║
 * ║  replacement for the format-specific hooks above.              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface HybridAccessState {
  hasAccess: boolean;
  accessMethod: "free" | "subscription" | "coin" | "purchase" | "preview" | "none";
  /** Non-null when the backend reports a non-paywall error (e.g. invalid format) */
  accessError: string | null;
  loading: boolean;
  checkAccess: () => Promise<void>;
  markUnlocked: () => void;
}

/**
 * Hybrid access hook: checks subscription → coin unlock → purchase → preview.
 * Delegates to the check_hybrid_access RPC which enforces status = 'active'.
 * See useEbookAccess.ts for the canonical access rule documentation.
 *
 * INVALID FORMAT HANDLING:
 * If the backend returns reason = 'invalid_format', this hook sets accessError
 * instead of triggering paywall/checkout flows. The consuming component must
 * check accessError before showing paywall UI.
 */
export function useHybridAccess(
  bookId: string | null,
  format: "ebook" | "audiobook",
  isFree: boolean
): HybridAccessState {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [accessMethod, setAccessMethod] = useState<HybridAccessState["accessMethod"]>("none");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAccess = useCallback(async () => {
    setAccessError(null);
    if (!bookId) { setLoading(false); return; }

    if (isFree) {
      setHasAccess(true);
      setAccessMethod("free");
      setLoading(false);
      return;
    }

    if (!user) {
      setHasAccess(format === "ebook"); // ebook gets preview
      setAccessMethod(format === "ebook" ? "preview" : "none");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("check_hybrid_access" as any, {
        p_user_id: user.id,
        p_book_id: bookId,
        p_format: format,
      });

      if (error) {
        console.warn("[useHybridAccess] RPC error:", error.message);
        setHasAccess(false);
        setAccessMethod("none");
      } else {
        const result = data as any;

        // GUARD: invalid_format means the format param was rejected by the backend.
        // Do NOT trigger paywall — show a generic error instead.
        if (result?.reason === "invalid_format" || result?.method === "none" && result?.reason === "invalid_format") {
          console.error("[useHybridAccess] invalid_format returned", {
            bookId, format, userId: user.id,
          });
          setAccessError("This content format is not supported or invalid.");
          setHasAccess(false);
          setAccessMethod("none");
          toast.error("This content format is not supported or invalid.");
          setLoading(false);
          return;
        }

        setHasAccess(result?.granted ?? false);
        setAccessMethod(result?.method ?? "none");
      }
    } catch (err) {
      console.warn("[useHybridAccess] Error:", err);
      setHasAccess(false);
      setAccessMethod("none");
    } finally {
      setLoading(false);
    }
  }, [bookId, user, isFree, format]);

  useEffect(() => { checkAccess(); }, [checkAccess]);

  const markUnlocked = useCallback(() => {
    setHasAccess(true);
    setAccessMethod("coin");
    setAccessError(null);
  }, []);

  return { hasAccess, accessMethod, accessError, loading, checkAccess, markUnlocked };
}
