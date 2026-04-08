import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessQuery } from "@/hooks/useAccessQuery";

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

  // Always fetch preview_percentage fresh from DB + subscribe to realtime changes
  const [dbPreviewPct, setDbPreviewPct] = useState<number | null>(
    _previewPercentageOverride ?? null
  );

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;

    const fetchPreviewPct = async () => {
      const { data } = await supabase
        .from("book_formats")
        .select("preview_percentage")
        .eq("book_id", bookId)
        .eq("format", "audiobook")
        .maybeSingle();

      if (!cancelled && data) {
        setDbPreviewPct(data.preview_percentage ?? null);
      }
    };

    fetchPreviewPct();

    // Realtime subscription: instant update when admin changes preview_percentage
    const channel = supabase
      .channel(`preview-pct-${bookId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "book_formats",
          filter: `book_id=eq.${bookId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.format === "audiobook") {
            const newPct = row.preview_percentage ?? null;
            if (import.meta.env.DEV) {
              console.debug("[useAudiobookAccess] realtime preview_percentage update", { newPct });
            }
            setDbPreviewPct(newPct);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [bookId]);

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
