import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tracks reading/listening time for a book and periodically flushes to the database.
 * Used for subscription pool-based creator payout calculations.
 */
export function useConsumptionTracker(
  bookId: string | undefined | null,
  format: "ebook" | "audiobook",
  isActive: boolean
) {
  const { user } = useAuth();
  const accumulatedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    if (!user || !bookId || accumulatedRef.current < 5) return;

    const seconds = accumulatedRef.current;
    accumulatedRef.current = 0;

    try {
      await supabase.rpc("log_consumption_time" as any, {
        p_book_id: bookId,
        p_format: format,
        p_seconds: seconds,
      });
    } catch {
      // Re-add on failure so we don't lose data
      accumulatedRef.current += seconds;
    }
  }, [user, bookId, format]);

  useEffect(() => {
    if (!isActive || !user || !bookId) {
      lastTickRef.current = null;
      return;
    }

    // Tick every second
    const tick = () => {
      const now = Date.now();
      if (lastTickRef.current) {
        const delta = Math.round((now - lastTickRef.current) / 1000);
        if (delta > 0 && delta < 10) { // ignore huge gaps (tab was inactive)
          accumulatedRef.current += delta;
        }
      }
      lastTickRef.current = now;
    };

    lastTickRef.current = Date.now();
    const tickInterval = setInterval(tick, 1000);

    // Flush every 60 seconds
    intervalRef.current = setInterval(flush, 60_000);

    return () => {
      clearInterval(tickInterval);
      if (intervalRef.current) clearInterval(intervalRef.current);
      flush(); // flush remaining on unmount
    };
  }, [isActive, user, bookId, flush]);

  // Flush on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (accumulatedRef.current >= 5 && user && bookId) {
        // Use sendBeacon for reliability
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/log_consumption_time`;
        const body = JSON.stringify({
          p_book_id: bookId,
          p_format: format,
          p_seconds: accumulatedRef.current,
        });
        navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }));
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [user, bookId, format]);

  return { flush };
}
