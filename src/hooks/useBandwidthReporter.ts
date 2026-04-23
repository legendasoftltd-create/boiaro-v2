import { useEffect } from "react";
import { getMediaMetrics, resetMediaMetrics } from "@/hooks/useSecureContent";

/**
 * No-op stub — bandwidth reporting to Supabase Edge Functions is removed.
 * Media metrics are still collected locally via useSecureContent for future use.
 */
export function useBandwidthReporter() {
  useEffect(() => {
    // Periodically clear metrics to prevent unbounded memory growth
    const interval = setInterval(() => {
      const metrics = getMediaMetrics();
      if (metrics.estimatedBytesServed > 0) {
        resetMediaMetrics();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);
}
