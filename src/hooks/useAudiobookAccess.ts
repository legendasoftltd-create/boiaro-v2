import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessQuery } from "@/hooks/useAccessQuery";
import { trpc } from "@/lib/trpc";

interface AudiobookAccessState {
  hasFullAccess: boolean;
  previewLimitSeconds: number;
  previewPercentage: number;
  isPreviewMode: boolean;
  loading: boolean;
  checkAccess: () => Promise<void>;
  markUnlocked: () => void;
}

const DEFAULT_PREVIEW_PERCENTAGE = 15;

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CRITICAL ACCESS CONTROL — DO NOT MODIFY WITHOUT FULL AUDIT    ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Mirrors useEbookAccess rules for the audiobook format.        ║
 * ║  Access is ONLY granted when status = 'active'.                ║
 * ║  See useEbookAccess.ts for the canonical access rule docs.     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Now powered by React Query (5-min staleTime) for deduplication and caching.
 * Preview limit: previewPercentage% of total duration OR 5 minutes, whichever is smaller.
 */
export function useAudiobookAccess(
  bookId: string | null,
  isFree: boolean,
  totalDurationSeconds: number,
  _previewPercentageOverride?: number | null,
  liveDurationSeconds?: number
): AudiobookAccessState {
  const { user } = useAuth();

  // React Query–cached access check (5-min staleTime, deduped)
  const {
    hasFullAccess,
    loading,
    markUnlocked,
    refetch,
  } = useAccessQuery(bookId, "audiobook", isFree, user?.id);

  const formatsQuery = trpc.books.formatsByBookId.useQuery(
    { bookId: bookId! },
    { enabled: !!bookId, staleTime: 60_000, refetchInterval: 60_000 }
  );

  const audiobookFormat = ((formatsQuery.data as any[]) || []).find(
    (f: any) => f.format === "audiobook"
  );
  const dbPreviewPct: number | null =
    _previewPercentageOverride ?? audiobookFormat?.preview_chapters ?? null;

  const effectivePreview = (dbPreviewPct != null && dbPreviewPct >= 0 && dbPreviewPct <= 100)
    ? dbPreviewPct
    : DEFAULT_PREVIEW_PERCENTAGE;

  // Use live audio element duration if available, otherwise fall back to parsed string duration
  const bestDuration = (liveDurationSeconds && liveDurationSeconds > 0)
    ? liveDurationSeconds
    : totalDurationSeconds;

  // Preview limit: effectivePreview% of total duration, capped at 5 minutes, minimum 60s
  const previewLimitSeconds = useMemo(() => {
    const percentageBased = Math.ceil(bestDuration * (effectivePreview / 100));
    const fiveMinutes = 300;
    const limit = bestDuration > 0
      ? Math.max(60, Math.min(fiveMinutes, percentageBased))
      : fiveMinutes;

    if (import.meta.env.DEV) {
      console.debug("[useAudiobookAccess] preview calc", {
        totalDuration: bestDuration,
        previewPercent: effectivePreview,
        computedPreviewDuration: limit,
        source: (liveDurationSeconds && liveDurationSeconds > 0) ? "liveAudio" : "parsedString",
      });
    }

    return limit;
  }, [bestDuration, effectivePreview, liveDurationSeconds]);

  const checkAccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    hasFullAccess,
    previewLimitSeconds,
    previewPercentage: effectivePreview,
    isPreviewMode: !hasFullAccess && !isFree,
    loading,
    checkAccess,
    markUnlocked,
  };
}
