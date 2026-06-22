/**
 * GLOBAL AUDIOBOOK PAYWALL — rendered at App level, always visible above FullPlayer.
 *
 * This component bridges the AudioPlayerContext's paywall state with the paywall modal.
 * It must render at z-[110] to appear above FullPlayer (z-[100]).
 *
 * When showPaywall is triggered by the preview enforcement in AudioPlayerContext,
 * this component also auto-closes the FullPlayer so the paywall is clearly visible.
 *
 * If the chapter playing when the preview limit hit also carries its own per-chapter
 * price, show the same rich unlock modal used elsewhere (ads/coin/taka for just that
 * chapter, plus the full-book option) instead of the plain "buy full book only" modal —
 * a time-based preview wall and a per-chapter price wall are different gates, but the
 * user should see one consistent set of choices regardless of which one tripped.
 */
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { trpc } from "@/lib/trpc";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { AudiobookPaywallModal } from "./AudiobookPaywallModal";
import { QuickUnlockModal } from "@/components/book-detail/QuickUnlockModal";
import { calcFullUnlockCost, DEFAULT_COINS_PER_CHAPTER } from "@/lib/audiobookPricing";

export function GlobalAudiobookPaywall() {
  const {
    book, audiobook, tracks, currentTrackIndex, showPaywall, setShowPaywall,
    setHasFullAccess, closeFullPlayer, isPreviewMode, previewLimitSeconds,
  } = useAudioPlayer();

  const { user } = useAuth();
  const { wallet, refetch: refetchWallet } = useWallet();
  const utils = trpc.useUtils();
  const adjustCoinsMutation = trpc.wallet.adjustCoins.useMutation();
  const unlockContentMutation = trpc.wallet.unlockContent.useMutation();

  const { data: userUnlocks = [] } = trpc.wallet.userUnlocks.useQuery(undefined, { enabled: !!user && showPaywall });

  const prevShowPaywall = useRef(false);

  // Auto-close FullPlayer when paywall triggers
  useEffect(() => {
    if (showPaywall && !prevShowPaywall.current) {
      closeFullPlayer();
      if (import.meta.env.DEV) {
        console.debug("[GlobalPaywall] Paywall triggered — closing FullPlayer", {
          bookId: book?.id,
          previewLimitSeconds,
          isPreviewMode,
        });
      }
    }
    prevShowPaywall.current = showPaywall;
  }, [showPaywall, closeFullPlayer, book?.id, previewLimitSeconds, isPreviewMode]);

  const bookUnlocks = (userUnlocks as any[]).filter((u: any) => book && u.book_id === book.id && u.status === "active");
  const hasFullUnlock = bookUnlocks.some((u: any) => u.format === "audiobook");
  const unlockedChapterIds = new Set<string>(
    bookUnlocks.map((u: any) => u.format?.match(/^audiobook_chapter_(.+)$/)?.[1]).filter(Boolean)
  );

  const tracksWithPrices = tracks.map(t => ({
    ...t,
    chapterPrice: t.chapterPrice ?? DEFAULT_COINS_PER_CHAPTER,
  }));
  const nonPreviewTracks = tracksWithPrices.filter(t => !t.isPreview);
  const { cost: fullUnlockCost, remainingIndividual } = calcFullUnlockCost(nonPreviewTracks, unlockedChapterIds);

  const handleFullCoinUnlock = useCallback(async () => {
    if (!user || !book) return;
    if (wallet.balance < fullUnlockCost) {
      toast.error(`${fullUnlockCost} কয়েন প্রয়োজন (বর্তমান: ${wallet.balance})`);
      return;
    }
    try {
      await adjustCoinsMutation.mutateAsync({
        amount: -fullUnlockCost,
        type: "spend",
        description: "সম্পূর্ণ অডিওবুক আনলক",
        referenceId: `full_unlock_${book.id}_${user.id}`,
        source: "full_audiobook_unlock",
      });
      await unlockContentMutation.mutateAsync({ bookId: book.id, format: "audiobook", coinCost: 0 });
      toast.success("সম্পূর্ণ অডিওবুক আনলক হয়েছে!");
      utils.wallet.userUnlocks.invalidate();
      refetchWallet();
      setHasFullAccess(true);
      setShowPaywall(false);
    } catch (e: any) {
      toast.error(e?.message || "আনলক ব্যর্থ হয়েছে");
    }
  }, [user, book, wallet.balance, fullUnlockCost, adjustCoinsMutation, unlockContentMutation, utils, refetchWallet, setHasFullAccess, setShowPaywall]);

  if (!book || !audiobook || !showPaywall) return null;

  const price = audiobook.price ?? 0;
  const previewPct = audiobook.previewPercentage ?? 15;

  const currentTrack = tracksWithPrices[currentTrackIndex];
  const currentTrackHasPrice = !!currentTrack && !currentTrack.isPreview &&
    (Number(currentTrack.chapterPrice) > 0 || Number(currentTrack.chapterTakaPrice) > 0) &&
    !unlockedChapterIds.has(currentTrack.id);

  // The chapter that was playing when the preview limit hit also has its own price —
  // show the full chapter-or-full-book unlock modal instead of the plain "buy full book" one.
  if (!hasFullUnlock && currentTrackHasPrice) {
    const lockedTracks = nonPreviewTracks.filter(t => !unlockedChapterIds.has(t.id));
    const savingsAmount = remainingIndividual - fullUnlockCost;
    const savingsPercent = remainingIndividual > 0 ? Math.round((savingsAmount / remainingIndividual) * 100) : 0;

    return (
      <QuickUnlockModal
        open={true}
        onOpenChange={(open) => { if (!open) setShowPaywall(false); }}
        track={currentTrack}
        bookId={book.id}
        audiobookPrice={price}
        fullUnlockCost={fullUnlockCost}
        fullUnlockSavingsPercent={savingsPercent}
        remainingIndividualCost={remainingIndividual}
        lockedCount={lockedTracks.length}
        onChapterUnlocked={() => {
          utils.wallet.userUnlocks.invalidate();
          refetchWallet();
          setHasFullAccess(true);
          setShowPaywall(false);
        }}
        onFullUnlock={handleFullCoinUnlock}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[110]">
      <AudiobookPaywallModal
        open={true}
        bookTitle={book.title}
        bookSlug={book.slug}
        bookId={book.id}
        audiobookPrice={price}
        previewPercentage={previewPct}
        onUnlocked={() => {
          setHasFullAccess(true);
          setShowPaywall(false);
        }}
        onClose={() => setShowPaywall(false)}
      />
    </div>
  );
}
