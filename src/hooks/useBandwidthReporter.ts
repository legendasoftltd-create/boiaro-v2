import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMediaMetrics, resetMediaMetrics } from "@/hooks/useSecureContent";

/**
 * Periodically flushes client-side media metrics to the backend
 * for aggregation into daily_bandwidth_stats.
 * 
 * Flushes every 5 minutes and on page unload.
 */
export function useBandwidthReporter() {
  const lastFlush = useRef(Date.now());

  useEffect(() => {
    const flush = async () => {
      const metrics = getMediaMetrics();

      // Only flush if there's meaningful activity
      if (metrics.estimatedBytesServed === 0 && metrics.signedUrlsGenerated === 0) {
        return;
      }

      try {
        await supabase.functions.invoke("flush-bandwidth-stats", {
          body: {
            bytes_served: metrics.estimatedBytesServed,
            requests: metrics.requestCount,
            cache_hits: metrics.cacheHits,
            cache_misses: metrics.cacheMisses,
            signed_urls: metrics.signedUrlsGenerated,
            top_books: metrics.topBooksByBandwidth,
          },
        });

        // Reset after successful flush
        resetMediaMetrics();
        lastFlush.current = Date.now();
      } catch (err) {
        console.warn("[BandwidthReporter] flush failed:", err);
      }
    };

    // Flush every 5 minutes
    const interval = setInterval(flush, 5 * 60 * 1000);

    // Flush on page unload
    const handleUnload = () => {
      const metrics = getMediaMetrics();
      if (metrics.estimatedBytesServed > 0 || metrics.signedUrlsGenerated > 0) {
        // Use sendBeacon for reliability during unload
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flush-bandwidth-stats`;
        navigator.sendBeacon(
          url,
          JSON.stringify({
            bytes_served: metrics.estimatedBytesServed,
            requests: metrics.requestCount,
            cache_hits: metrics.cacheHits,
            cache_misses: metrics.cacheMisses,
            signed_urls: metrics.signedUrlsGenerated,
            top_books: metrics.topBooksByBandwidth,
          })
        );
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);
}
