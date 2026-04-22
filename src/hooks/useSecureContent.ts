import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { mediaRetryQueue } from "@/lib/retryQueue";

interface BatchUrlEntry {
  url: string | null;
  fetchedAt: number;
}

// ── Metrics (production-safe, globally accumulated) ──
const mediaMetrics = {
  signedUrlsGenerated: 0,
  batchRequests: 0,
  singleRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  playbackErrors: 0,
  totalLatencyMs: 0,
  requestCount: 0,
  estimatedBytesServed: 0,
  sessionStartTime: Date.now(),
  perBookBandwidth: {} as Record<string, number>,
  perUserSessionBytes: 0,
};

export function getMediaMetrics() {
  const sessionDurationSec = Math.max(1, Math.round((Date.now() - mediaMetrics.sessionStartTime) / 1000));
  const totalCacheChecks = mediaMetrics.cacheHits + mediaMetrics.cacheMisses;
  return {
    ...mediaMetrics,
    avgLatencyMs: mediaMetrics.requestCount > 0 ? Math.round(mediaMetrics.totalLatencyMs / mediaMetrics.requestCount) : 0,
    cacheHitRate: totalCacheChecks > 0 ? Math.round((mediaMetrics.cacheHits / totalCacheChecks) * 100) : 0,
    cacheMissRate: totalCacheChecks > 0 ? Math.round((mediaMetrics.cacheMisses / totalCacheChecks) * 100) : 0,
    sessionDurationSec,
    estimatedBytesPerSecond: Math.round(mediaMetrics.estimatedBytesServed / sessionDurationSec),
    topBooksByBandwidth: Object.entries(mediaMetrics.perBookBandwidth).sort(([, a], [, b]) => b - a).slice(0, 10).map(([bookId, bytes]) => ({ bookId, bytes })),
    alertLevel: mediaMetrics.estimatedBytesServed > 900_000_000 ? "critical" : mediaMetrics.estimatedBytesServed > 500_000_000 ? "warn" : "none",
  };
}

export function resetMediaMetrics() {
  Object.assign(mediaMetrics, { signedUrlsGenerated: 0, batchRequests: 0, singleRequests: 0, cacheHits: 0, cacheMisses: 0, playbackErrors: 0, totalLatencyMs: 0, requestCount: 0, estimatedBytesServed: 0, sessionStartTime: Date.now(), perBookBandwidth: {}, perUserSessionBytes: 0 });
}

export function recordPlaybackError() { mediaMetrics.playbackErrors++; }

export function recordBytesServed(bookId: string, bytes: number) {
  mediaMetrics.estimatedBytesServed += bytes;
  mediaMetrics.perUserSessionBytes += bytes;
  mediaMetrics.perBookBandwidth[bookId] = (mediaMetrics.perBookBandwidth[bookId] || 0) + bytes;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as any).__mediaMetrics = getMediaMetrics;
  (window as any).__resetMediaMetrics = resetMediaMetrics;
  (window as any).__recordBytes = recordBytesServed;
}
if (typeof window !== "undefined") { (window as any).__mediaMetrics = getMediaMetrics; }

export function useSecureContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const batchUrlCache = useRef<Record<string, Record<number, BatchUrlEntry>>>({});
  const batchInFlight = useRef<Record<string, Promise<void>>>({});

  const utils = trpc.useUtils();
  const logAccessMutation = trpc.content.logAccess.useMutation();
  const logAccessMutationRef = useRef(logAccessMutation.mutateAsync);
  logAccessMutationRef.current = logAccessMutation.mutateAsync;

  const debugLog = (...args: unknown[]) => {
    if (import.meta.env.DEV) console.debug("[SecureContent]", ...args);
  };

  // Token concept replaced — tRPC endpoints handle auth server-side
  const getToken = useCallback(async (_bookId: string, _contentType: "ebook" | "audiobook"): Promise<string | null> => {
    return null; // Auth handled by tRPC middleware
  }, []);

  const prefetchBatchUrls = useCallback(async (bookId: string): Promise<void> => {
    const cached = batchUrlCache.current[bookId];
    if (cached) {
      const firstEntry = Object.values(cached)[0];
      if (firstEntry && (Date.now() - firstEntry.fetchedAt) < 240_000) {
        debugLog("batch cache hit", { bookId });
        return;
      }
    }

    if (batchInFlight.current[bookId]) {
      return batchInFlight.current[bookId];
    }

    const promise = (async () => {
      const start = performance.now();
      mediaMetrics.batchRequests++;
      mediaMetrics.requestCount++;

      try {
        const result = await utils.content.batchSignedUrls.fetch({ bookId }).catch(() => null);
        const latency = Math.round(performance.now() - start);
        mediaMetrics.totalLatencyMs += latency;

        if (!result) return;

        const now = Date.now();
        const batchEntry: Record<number, BatchUrlEntry> = {};
        for (const [trackNum, url] of Object.entries(result.urls)) {
          batchEntry[Number(trackNum)] = { url, fetchedAt: now };
        }
        batchUrlCache.current[bookId] = batchEntry;
        mediaMetrics.signedUrlsGenerated += Object.keys(result.urls).length;
        debugLog("batch URLs fetched", { bookId, tracks: Object.keys(result.urls).length, latencyMs: latency });
      } finally {
        delete batchInFlight.current[bookId];
      }
    })();

    batchInFlight.current[bookId] = promise;
    return promise;
  }, [utils]);

  const getSecureUrl = useCallback(
    async (bookId: string, contentType: "ebook" | "audiobook", trackNumber?: number): Promise<{ url: string | null; denied?: boolean; reason?: string }> => {
      if (contentType === "audiobook" && trackNumber != null) {
        const cached = batchUrlCache.current[bookId]?.[trackNumber];
        if (cached && (Date.now() - cached.fetchedAt) < 240_000) {
          mediaMetrics.cacheHits++;
          return { url: cached.url };
        }

        if (user) {
          await prefetchBatchUrls(bookId);
          const afterBatch = batchUrlCache.current[bookId]?.[trackNumber];
          if (afterBatch) {
            mediaMetrics.cacheHits++;
            return { url: afterBatch.url };
          }
        }
        mediaMetrics.cacheMisses++;
      }

      const start = performance.now();
      mediaMetrics.singleRequests++;
      mediaMetrics.requestCount++;

      setLoading(true);
      try {
        const result = await utils.content.getSignedUrl.fetch({
          bookId,
          contentType,
          trackNumber,
        }).catch((err: any) => {
          if (err?.data?.code === "FORBIDDEN") return { url: null, denied: true, reason: "Access denied" };
          return null;
        });

        const latency = Math.round(performance.now() - start);
        mediaMetrics.totalLatencyMs += latency;

        if (!result) {
          mediaRetryQueue.enqueue({ type: "signed_url", bookId, trackNumber, contentType, error: "Request failed" });
          return { url: null };
        }

        if ((result as any).denied) return result as any;

        mediaMetrics.signedUrlsGenerated++;
        return { url: result.url };
      } catch (err) {
        console.error("Secure URL request error:", err);
        mediaRetryQueue.enqueue({ type: "signed_url", bookId, trackNumber, contentType, error: err instanceof Error ? err.message : "Unknown" });
        return { url: null };
      } finally {
        setLoading(false);
      }
    },
    [user, utils, prefetchBatchUrls]
  );

  const logAccess = useCallback(
    async (bookId: string, contentType: string, granted: boolean, reason?: string) => {
      if (!user) return;
      await logAccessMutationRef.current({ bookId, contentType, accessGranted: granted, denialReason: reason }).catch(() => {});
    },
    [user]
  );

  useEffect(() => {
    mediaRetryQueue.registerHandler("signed_url", async (item) => {
      const result = await getSecureUrl(item.bookId, item.contentType, item.trackNumber);
      return !!result.url;
    });

    mediaRetryQueue.registerHandler("playback", async (item) => {
      await prefetchBatchUrls(item.bookId);
      const cached = batchUrlCache.current[item.bookId]?.[item.trackNumber ?? 1];
      return !!cached;
    });
  }, [getSecureUrl, prefetchBatchUrls]);

  const enqueueRetry = useCallback(
    (type: "signed_url" | "playback", bookId: string, contentType: "ebook" | "audiobook", trackNumber?: number, error?: string) => {
      mediaRetryQueue.enqueue({ type, bookId, trackNumber, contentType, error });
    },
    []
  );

  return { getToken, getSecureUrl, prefetchBatchUrls, logAccess, enqueueRetry, loading };
}
