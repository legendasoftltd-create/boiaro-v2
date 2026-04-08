import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessQuery } from "@/hooks/useAccessQuery";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CRITICAL ACCESS CONTROL — DO NOT MODIFY WITHOUT FULL AUDIT    ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  This hook is the SINGLE SOURCE OF TRUTH for eBook access.     ║
 * ║                                                                ║
 * ║  ACCESS RULES (verified & locked 2026-04-01):                  ║
 * ║  1. Free book          → hasFullAccess = true (always)         ║
 * ║  2. Paid + active sub  → hasFullAccess = true                  ║
 * ║  3. Paid + purchase    → hasFullAccess = true                  ║
 * ║     (user_purchases.status = 'active' ONLY)                    ║
 * ║  4. Paid + coin unlock → hasFullAccess = true                  ║
 * ║     (content_unlocks.status = 'active' ONLY)                   ║
 * ║  5. Everything else    → hasFullAccess = false (preview only)  ║
 * ║                                                                ║
 * ║  NEVER grant access for status = 'completed', 'refunded',     ║
 * ║  'revoked', 'expired', or any non-'active' value.             ║
 * ║                                                                ║
 * ║  EbookReader.tsx and PaywallModal.tsx depend on this hook.     ║
 * ║  Any change here MUST be verified end-to-end.                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Now powered by React Query (5-min staleTime) for deduplication and caching.
 */

interface EbookAccessState {
  hasFullAccess: boolean;
  previewLimit: number;
  previewPageLimit: number;
  isPreviewMode: boolean;
  loading: boolean;
  checkAccess: () => Promise<void>;
  markUnlocked: () => void;
  isPageBlocked: (page: number) => boolean;
  isPercentageBlocked: (pct: number) => boolean;
  pagesRemaining: (currentPage: number) => number;
}

const DEFAULT_PREVIEW_PERCENTAGE = 15;

export function useEbookAccess(
  bookId: string | null,
  isFree: boolean,
  totalPages: number,
  previewPercentage?: number | null
): EbookAccessState {
  const { user } = useAuth();

  // React Query–cached access check (5-min staleTime, deduped)
  const {
    hasFullAccess,
    loading,
    markUnlocked,
    refetch,
  } = useAccessQuery(bookId, "ebook", isFree, user?.id);

  // Fetch preview_percentage fresh from DB + realtime subscription
  const [dbPreviewPct, setDbPreviewPct] = useState<number | null>(previewPercentage ?? null);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;

    const fetchPreviewPct = async () => {
      const { data } = await supabase
        .from("book_formats")
        .select("preview_percentage")
        .eq("book_id", bookId)
        .eq("format", "ebook")
        .maybeSingle();

      if (!cancelled && data) {
        setDbPreviewPct(data.preview_percentage ?? null);
      }
    };

    fetchPreviewPct();

    // Realtime subscription: instant update when admin changes preview_percentage
    const channel = supabase
      .channel(`ebook-preview-pct-${bookId}`)
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
          if (row?.format === "ebook") {
            const newPct = row.preview_percentage ?? null;
            if (import.meta.env.DEV) {
              console.debug("[useEbookAccess] realtime preview_percentage update", { newPct });
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

  const previewPageLimit = useMemo(() => {
    const limit = effectivePreview === 0
      ? 0
      : Math.max(1, Math.ceil(totalPages * (effectivePreview / 100)));

    if (import.meta.env.DEV) {
      console.debug("[useEbookAccess] preview calc", {
        totalPages,
        previewPercent: effectivePreview,
        computedPreviewPageLimit: limit,
      });
    }

    return limit;
  }, [totalPages, effectivePreview]);

  const checkAccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const isPageBlocked = useCallback(
    (page: number) => {
      if (hasFullAccess || isFree) return false;
      if (effectivePreview === 0) return true;
      if (effectivePreview >= 100) return false;
      return page > previewPageLimit;
    },
    [hasFullAccess, isFree, previewPageLimit, effectivePreview]
  );

  const isPercentageBlocked = useCallback(
    (pct: number) => {
      if (hasFullAccess || isFree) return false;
      if (effectivePreview === 0) return true;
      if (effectivePreview >= 100) return false;
      return pct >= effectivePreview;
    },
    [hasFullAccess, isFree, effectivePreview]
  );

  const pagesRemaining = useCallback(
    (currentPage: number) => {
      if (hasFullAccess || isFree) return Infinity;
      return Math.max(0, previewPageLimit - currentPage);
    },
    [hasFullAccess, isFree, previewPageLimit]
  );

  return {
    hasFullAccess,
    previewLimit: effectivePreview,
    previewPageLimit,
    isPreviewMode: !hasFullAccess && !isFree,
    loading,
    checkAccess,
    markUnlocked,
    isPageBlocked,
    isPercentageBlocked,
    pagesRemaining,
  };
}
