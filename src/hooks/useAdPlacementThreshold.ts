import { trpc } from "@/lib/trpc";

/**
 * Reads one AdPlacement's delay_seconds/min_progress_percent so a reader/
 * player screen knows WHEN to start rendering <AdBannerBlock placementKey=.../>
 * — AdBannerBlock itself only knows whether a placement is enabled and
 * device-matched, not reading/listening progress, so this is what actually
 * implements "no ad until some engagement" rather than showing one the
 * instant the placement is turned on.
 */
export function useAdPlacementThreshold(placementKey: string) {
  const { data: placements = [], isLoading } = trpc.books.activePlacements.useQuery();
  const placement = placements.find((p: any) => p.placement_key === placementKey);

  return {
    isLoading,
    /** Placement exists and is enabled — same "enabled" check AdBannerBlock does internally */
    isEnabled: !!placement,
    delaySeconds: placement?.delay_seconds ?? null,
    minProgressPercent: placement?.min_progress_percent ?? null,
  };
}

/** True once elapsedSeconds/progressPercent clears whichever threshold is set (either can gate; unset ones don't apply) */
export function isAdThresholdReached(
  threshold: { delaySeconds: number | null; minProgressPercent: number | null },
  current: { elapsedSeconds: number; progressPercent: number }
): boolean {
  const delayReached = threshold.delaySeconds == null || current.elapsedSeconds >= threshold.delaySeconds;
  const progressReached = threshold.minProgressPercent == null || current.progressPercent >= threshold.minProgressPercent;
  return delayReached && progressReached;
}
