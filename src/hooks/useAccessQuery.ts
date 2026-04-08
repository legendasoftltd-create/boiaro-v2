import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useRef } from "react";

const ACCESS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

interface AccessResult {
  hasFullAccess: boolean;
  method?: string;
  /** Duration of the DB query in ms (only set on actual fetch, not cache hit) */
  fetchDurationMs?: number;
}

// ── Metrics (dev-only, globally accumulated) ──
const metrics = {
  totalChecks: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalFetchMs: 0,
  edgeFunctionCalls: 0,
};

/** Read current access metrics (for dev tools / debugging) */
export function getAccessMetrics() {
  return {
    ...metrics,
    avgFetchMs: metrics.cacheMisses > 0
      ? Math.round(metrics.totalFetchMs / metrics.cacheMisses)
      : 0,
    cacheHitRate: metrics.totalChecks > 0
      ? Math.round((metrics.cacheHits / metrics.totalChecks) * 100)
      : 0,
  };
}

/** Reset metrics (useful for profiling sessions) */
export function resetAccessMetrics() {
  metrics.totalChecks = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.totalFetchMs = 0;
  metrics.edgeFunctionCalls = 0;
}

// Expose to window in dev for easy inspection
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as any).__accessMetrics = getAccessMetrics;
  (window as any).__resetAccessMetrics = resetAccessMetrics;
}

/**
 * Shared React Query–based access check for ebook and audiobook formats.
 * Deduplicates requests, caches for 5 minutes, and exposes invalidation.
 *
 * ACCESS FLOW ARCHITECTURE (no duplication):
 * ┌─────────────────────────────────────────────────────────┐
 * │ CLIENT (UI decisions)          │ SERVER (content URLs)  │
 * │ useAccessQuery (this hook)     │ secure-content edge fn │
 * │  → subscription check          │  → check_content_access│
 * │  → purchase/unlock check       │    RPC (single call)   │
 * │  → order check                 │  → signed URL gen      │
 * │ Result: show/hide paywall      │ Result: deliver content│
 * └─────────────────────────────────────────────────────────┘
 * Client & server checks are INDEPENDENT — client for UI, server for delivery.
 */
async function fetchAccess(
  userId: string,
  bookId: string,
  format: "ebook" | "audiobook"
): Promise<AccessResult> {
  const start = performance.now();
  metrics.cacheMisses++;

  // Single RPC call replaces 3 sequential queries — reduces connections by ~66%
  const { data, error } = await supabase.rpc("check_content_access", {
    p_user_id: userId,
    p_book_id: bookId,
    p_format: format,
  });

  const dur = Math.round(performance.now() - start);
  metrics.totalFetchMs += dur;

  if (error) {
    console.error("[AccessQuery] RPC error:", error.message);
    return { hasFullAccess: false, fetchDurationMs: dur };
  }

  const result = data as { granted: boolean; reason: string } | null;
  if (!result) return { hasFullAccess: false, fetchDurationMs: dur };

  const methodMap: Record<string, string> = {
    free_book: "free",
    free_format: "free",
    coin_unlock: "coin",
    purchased: "purchase",
    subscription: "subscription",
    preview_allowed: "preview",
  };

  return {
    hasFullAccess: result.granted,
    method: methodMap[result.reason] || result.reason,
    fetchDurationMs: dur,
  };
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
  const queryClient = useQueryClient();
  const lastLogRef = useRef(0);

  const query = useQuery({
    queryKey: accessQueryKey(bookId ?? "", format, userId),
    queryFn: () => fetchAccess(userId!, bookId!, format),
    enabled: Boolean(bookId) && !isFree && Boolean(userId),
    staleTime: ACCESS_STALE_TIME,
    gcTime: ACCESS_STALE_TIME * 2,
    refetchOnWindowFocus: false,
  });

  // Track total checks and cache hits
  metrics.totalChecks++;
  if (query.isFetched && !query.isFetching) {
    // Data was served from cache
    metrics.cacheHits++;
  }

  // Periodic dev logging (at most once per 10s to avoid spam)
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

  // Derive access: free books always have full access
  const hasFullAccess = isFree || (query.data?.hasFullAccess ?? false);

  const invalidateAccess = useCallback(() => {
    if (bookId) {
      queryClient.invalidateQueries({
        queryKey: accessQueryKey(bookId, format, userId),
      });
    }
  }, [queryClient, bookId, format, userId]);

  // Optimistic grant (after purchase/unlock)
  const markUnlocked = useCallback(() => {
    if (bookId) {
      queryClient.setQueryData(
        accessQueryKey(bookId, format, userId),
        { hasFullAccess: true, method: "coin" } as AccessResult
      );
    }
  }, [queryClient, bookId, format, userId]);

  return {
    hasFullAccess,
    loading: !isFree && (!bookId ? false : query.isLoading),
    invalidateAccess,
    markUnlocked,
    refetch: query.refetch,
  };
}

/**
 * Invalidate ALL access queries for a user (call after purchase/unlock).
 */
export function useInvalidateAllAccess() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["content-access"] });
  }, [queryClient]);
}
