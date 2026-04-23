import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

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

  const logConsumption = trpc.gamification.logConsumptionTime.useMutation();

  const flush = useCallback(async () => {
    if (!user || !bookId || accumulatedRef.current < 5) return;

    const seconds = accumulatedRef.current;
    accumulatedRef.current = 0;

    try {
      await logConsumption.mutateAsync({ bookId, format, seconds });
    } catch {
      accumulatedRef.current += seconds;
    }
  }, [user, bookId, format, logConsumption]);

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

  // Flush on page unload (best-effort via tRPC)
  useEffect(() => {
    const handleUnload = () => { flush(); };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [flush]);

  return { flush };
}
