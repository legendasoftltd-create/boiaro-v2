export const DEFAULT_COINS_PER_CHAPTER = 100;
const FULL_UNLOCK_DISCOUNT = 0.25;
const MINIMUM_COST_FLOOR = 0.20;

export interface TrackWithChapterPrice {
  id: string;
  chapterPrice: number;
}

/** Calculate fair full-unlock coin cost with discount, floor, and cap */
export function calcFullUnlockCost(
  nonPreviewTracks: TrackWithChapterPrice[],
  unlockedIds: Set<string>
): { cost: number; totalOriginal: number; remainingIndividual: number } {
  const remaining = nonPreviewTracks.filter(t => !unlockedIds.has(t.id));
  if (remaining.length <= 0) return { cost: 0, totalOriginal: 0, remainingIndividual: 0 };

  const totalOriginal = nonPreviewTracks.reduce((s, t) => s + t.chapterPrice, 0);
  const remainingIndividualCost = remaining.reduce((s, t) => s + t.chapterPrice, 0);
  const floorCost = Math.ceil(totalOriginal * MINIMUM_COST_FLOOR);
  const discountedCost = Math.ceil(remainingIndividualCost * (1 - FULL_UNLOCK_DISCOUNT));

  const withFloor = floorCost <= remainingIndividualCost
    ? Math.max(discountedCost, floorCost)
    : discountedCost;

  const cost = Math.min(Math.max(withFloor, 1), remainingIndividualCost);
  return { cost, totalOriginal, remainingIndividual: remainingIndividualCost };
}
