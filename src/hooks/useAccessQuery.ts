import { trpc } from "@/lib/trpc";
import { useCallback, useRef } from "react";

// ── Metrics (dev-only, globally accumulated) ──
const metrics = {
  totalChecks: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalFetchMs: 0,
};

export function getAccessMetrics() {
  return {
    ...metrics,
    avgFetchMs: metrics.cacheMisses > 0 ? Math.round(metrics.totalFetchMs / metrics.cacheMisses) : 0,
    cacheHitRate: metrics.totalChecks > 0 ? Math.round((metrics.cacheHits / metrics.totalChecks) * 100) : 0,
  };
}

export function resetAccessMetrics() {
  metrics.totalChecks = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.totalFetchMs = 0;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as any).__accessMetrics = getAccessMetrics;
  (window as any).__resetAccessMetrics = resetAccessMetrics;
}

export function accessQueryKey(bookId: string, format: string, userId?: string) {
  return ["content-access", bookId, format, userId ?? "anon"];
}

export function useAccessQuery(
  bookId: string | null,
  format: "ebook" | "audiobook",
  isFree: boolean,
  userId?: string
) {
  const utils = trpc.useUtils();
  const lastLogRef = useRef(0);

  const query = trpc.wallet.checkAccess.useQuery(
    { bookId: bookId!, format },
    {
      enabled: Boolean(bookId) && !isFree && Boolean(userId),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  metrics.totalChecks++;
  if (query.isFetched && !query.isFetching) {
    metrics.cacheHits++;
  }

  if (import.meta.env.DEV) {
    const now = Date.now();
    if (now - lastLogRef.current > 10_000 && query.isFetched) {
      lastLogRef.current = now;
      const m = getAccessMetrics();
      console.debug("[AccessMetrics]", {
        format,
        bookId: bookId?.slice(0, 8),
        cacheHitRate: `${m.cacheHitRate}%`,
        avgFetchMs: `${m.avgFetchMs}ms`,
        totalChecks: m.totalChecks,
        cacheMisses: m.cacheMisses,
      });
    }
  }

  const hasFullAccess = isFree || (query.data?.hasFullAccess ?? false);

  const invalidateAccess = useCallback(() => {
    if (bookId) {
      utils.wallet.checkAccess.invalidate({ bookId, format });
    }
  }, [utils, bookId, format]);

  const markUnlocked = useCallback(() => {
    if (bookId) {
      utils.wallet.checkAccess.setData({ bookId, format }, { hasFullAccess: true, method: "coin" });
    }
  }, [utils, bookId, format]);

  return {
    hasFullAccess,
    loading: !isFree && (!bookId ? false : query.isLoading),
    invalidateAccess,
    markUnlocked,
    refetch: query.refetch,
  };
}

export function useInvalidateAllAccess() {
  const utils = trpc.useUtils();
  return useCallback(() => {
    utils.wallet.checkAccess.invalidate();
  }, [utils]);
}
