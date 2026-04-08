import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { mediaRetryQueue } from "@/lib/retryQueue";

interface ContentToken {
  token: string;
  expiresAt: string;
}

interface BatchUrlEntry {
  signed_url: string;
  expires_in: number;
  fetchedAt: number;
  estimatedBytes?: number;
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
  // Phase 1: bandwidth tracking
  estimatedBytesServed: 0,
  sessionStartTime: Date.now(),
  perBookBandwidth: {} as Record<string, number>,
  perUserSessionBytes: 0,
};

/** Read current media delivery metrics */
export function getMediaMetrics() {
  const sessionDurationSec = Math.max(1, Math.round((Date.now() - mediaMetrics.sessionStartTime) / 1000));
  const totalCacheChecks = mediaMetrics.cacheHits + mediaMetrics.cacheMisses;

  return {
    ...mediaMetrics,
    avgLatencyMs: mediaMetrics.requestCount > 0
      ? Math.round(mediaMetrics.totalLatencyMs / mediaMetrics.requestCount)
      : 0,
    cacheHitRate: totalCacheChecks > 0
      ? Math.round((mediaMetrics.cacheHits / totalCacheChecks) * 100)
      : 0,
    cacheMissRate: totalCacheChecks > 0
      ? Math.round((mediaMetrics.cacheMisses / totalCacheChecks) * 100)
      : 0,
    sessionDurationSec,
    estimatedBytesPerSecond: Math.round(mediaMetrics.estimatedBytesServed / sessionDurationSec),
    topBooksByBandwidth: Object.entries(mediaMetrics.perBookBandwidth)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([bookId, bytes]) => ({ bookId, bytes })),
    // Alert thresholds (configurable, default 500MB/session warn, 900MB critical)
    alertLevel: mediaMetrics.estimatedBytesServed > 900_000_000 ? "critical"
      : mediaMetrics.estimatedBytesServed > 500_000_000 ? "warn"
      : "none",
  };
}

export function resetMediaMetrics() {
  mediaMetrics.signedUrlsGenerated = 0;
  mediaMetrics.batchRequests = 0;
  mediaMetrics.singleRequests = 0;
  mediaMetrics.cacheHits = 0;
  mediaMetrics.cacheMisses = 0;
  mediaMetrics.playbackErrors = 0;
  mediaMetrics.totalLatencyMs = 0;
  mediaMetrics.requestCount = 0;
  mediaMetrics.estimatedBytesServed = 0;
  mediaMetrics.sessionStartTime = Date.now();
  mediaMetrics.perBookBandwidth = {};
  mediaMetrics.perUserSessionBytes = 0;
}

export function recordPlaybackError() {
  mediaMetrics.playbackErrors++;
}

/** Record estimated bytes for a media fetch (call from audio player on track load) */
export function recordBytesServed(bookId: string, bytes: number) {
  mediaMetrics.estimatedBytesServed += bytes;
  mediaMetrics.perUserSessionBytes += bytes;
  mediaMetrics.perBookBandwidth[bookId] = (mediaMetrics.perBookBandwidth[bookId] || 0) + bytes;
}

// Expose to window in dev for easy inspection
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as any).__mediaMetrics = getMediaMetrics;
  (window as any).__resetMediaMetrics = resetMediaMetrics;
  (window as any).__recordBytes = recordBytesServed;
}

// Also expose in production for admin monitoring
if (typeof window !== "undefined") {
  (window as any).__mediaMetrics = getMediaMetrics;
}

export function useSecureContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const tokenCache = useRef<Record<string, ContentToken>>({});
  const batchUrlCache = useRef<Record<string, Record<number, BatchUrlEntry>>>({});
  const batchInFlight = useRef<Record<string, Promise<void>>>({});

  const debugLog = (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.debug("[SecureContent]", ...args);
    }
  };

  const getToken = useCallback(
    async (bookId: string, contentType: "ebook" | "audiobook"): Promise<string | null> => {
      if (!user) return null;

      const cacheKey = `${bookId}-${contentType}`;
      const cached = tokenCache.current[cacheKey];
      if (cached && new Date(cached.expiresAt) > new Date(Date.now() + 60000)) {
        return cached.token;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("secure-content", {
          body: { action: "generate_token", book_id: bookId, content_type: contentType },
        });

        if (error || data?.error) {
          console.error("Token generation failed:", data?.error || error);
          return null;
        }

        tokenCache.current[cacheKey] = {
          token: data.token,
          expiresAt: data.expires_at,
        };
        return data.token;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const prefetchBatchUrls = useCallback(
    async (bookId: string): Promise<void> => {
      const cached = batchUrlCache.current[bookId];
      if (cached) {
        const firstEntry = Object.values(cached)[0];
        if (firstEntry && (Date.now() - firstEntry.fetchedAt) < 240_000) {
          debugLog("batch cache hit", { bookId, tracks: Object.keys(cached).length });
          return;
        }
      }

      if (batchInFlight.current[bookId]) {
        debugLog("batch already in-flight", { bookId });
        return batchInFlight.current[bookId];
      }

      const promise = (async () => {
        const start = performance.now();
        mediaMetrics.batchRequests++;
        mediaMetrics.requestCount++;

        try {
          const { data, error } = await supabase.functions.invoke("secure-content", {
            body: { action: "batch_signed_urls", book_id: bookId },
          });

          const latency = Math.round(performance.now() - start);
          mediaMetrics.totalLatencyMs += latency;

          if (error || data?.error) {
            console.error("Batch URL fetch failed:", data?.error || error);
            return;
          }

          const urls = data.urls as Record<string, { signed_url: string; expires_in: number }>;
          const now = Date.now();
          const batchEntry: Record<number, BatchUrlEntry> = {};

          for (const [trackNum, entry] of Object.entries(urls)) {
            batchEntry[Number(trackNum)] = {
              signed_url: entry.signed_url,
              expires_in: entry.expires_in,
              fetchedAt: now,
            };
          }

          batchUrlCache.current[bookId] = batchEntry;
          mediaMetrics.signedUrlsGenerated += Object.keys(urls).length;

          debugLog("batch URLs fetched", {
            bookId,
            tracks: Object.keys(urls).length,
            fullAccess: data.full_access,
            latencyMs: latency,
            serverMs: data.duration_ms,
          });
        } finally {
          delete batchInFlight.current[bookId];
        }
      })();

      batchInFlight.current[bookId] = promise;
      return promise;
    },
    [user]
  );

  const getSecureUrl = useCallback(
    async (
      bookId: string,
      contentType: "ebook" | "audiobook",
      trackNumber?: number
    ): Promise<{ url: string | null; denied?: boolean; reason?: string }> => {
      // For audiobooks with a track number, try batch cache first
      if (contentType === "audiobook" && trackNumber != null) {
        const cached = batchUrlCache.current[bookId]?.[trackNumber];
        if (cached && (Date.now() - cached.fetchedAt) < 240_000) {
          mediaMetrics.cacheHits++;
          debugLog("signed URL cache hit", { bookId, trackNumber });
          return { url: cached.signed_url };
        }

        // Try batch fetch if not cached
        if (user) {
          await prefetchBatchUrls(bookId);
          const afterBatch = batchUrlCache.current[bookId]?.[trackNumber];
          if (afterBatch) {
            mediaMetrics.cacheHits++;
            return { url: afterBatch.signed_url };
          }
        }

        mediaMetrics.cacheMisses++;
      }

      // Fallback: single track fetch (ebooks always use this path)
      const start = performance.now();
      mediaMetrics.singleRequests++;
      mediaMetrics.requestCount++;

      let token: string | null = null;
      if (user) {
        token = await getToken(bookId, contentType);
      }

      try {
        const requestBody: Record<string, unknown> = {
          action: "get_content",
          book_id: bookId,
          content_type: contentType,
          track_number: trackNumber,
        };

        if (token) {
          requestBody.token = token;
        }

        const { data, error } = await supabase.functions.invoke("secure-content", {
          body: requestBody,
        });

        const latency = Math.round(performance.now() - start);
        mediaMetrics.totalLatencyMs += latency;
        mediaMetrics.signedUrlsGenerated++;

        debugLog("get_content response", {
          bookId,
          contentType,
          trackNumber,
          tokenUsed: Boolean(token),
          error: data?.error || error?.message,
          mimeType: data?.mime_type,
          latencyMs: latency,
        });

        if (error || data?.error) {
          if (data?.error === "Token expired" && user) {
            delete tokenCache.current[`${bookId}-${contentType}`];
            const newToken = await getToken(bookId, contentType);
            if (!newToken) return { url: null, denied: true, reason: "Token refresh failed" };

            const retry = await supabase.functions.invoke("secure-content", {
              body: {
                action: "get_content",
                token: newToken,
                book_id: bookId,
                content_type: contentType,
                track_number: trackNumber,
              },
            });
            return { url: retry.data?.signed_url || null };
          }

          if (data?.error === "Access denied" || data?.reason) {
            return { url: null, denied: true, reason: data?.reason || data?.error };
          }

          console.error("Secure URL fetch failed:", data?.error || error);
          mediaRetryQueue.enqueue({ type: "signed_url", bookId, trackNumber, contentType, error: data?.error || error?.message });
          return { url: null };
        }

        return { url: data.signed_url };
      } catch (err) {
        console.error("Secure URL request error:", err);
        mediaRetryQueue.enqueue({ type: "signed_url", bookId, trackNumber, contentType, error: err instanceof Error ? err.message : "Unknown" });
        return { url: null };
      }
    },
    [getToken, user, prefetchBatchUrls]
  );

  const logAccess = useCallback(
    async (bookId: string, contentType: string, granted: boolean, reason?: string) => {
      if (!user) return;
      await supabase.from("content_access_logs").insert({
        user_id: user.id,
        book_id: bookId,
        content_type: contentType,
        access_granted: granted,
        denial_reason: reason || null,
      });
    },
    [user]
  );

  // Register retry handlers
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
