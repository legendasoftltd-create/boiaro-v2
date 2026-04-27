/**
 * GLOBAL AUDIOBOOK PAYWALL — rendered at App level, always visible above FullPlayer.
 *
 * This component bridges the AudioPlayerContext's paywall state with the paywall modal.
 * It must render at z-[110] to appear above FullPlayer (z-[100]).
 *
 * When showPaywall is triggered by the preview enforcement in AudioPlayerContext,
 * this component also auto-closes the FullPlayer so the paywall is clearly visible.
 */
import { useEffect, useRef } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { AudiobookPaywallModal } from "./AudiobookPaywallModal";

export function GlobalAudiobookPaywall() {
  const {
    book, audiobook, showPaywall, setShowPaywall,
    setHasFullAccess, closeFullPlayer, isPreviewMode,
    previewLimitSeconds,
  } = useAudioPlayer();

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

  if (!book || !audiobook || !showPaywall) return null;

  const price = audiobook.price ?? 0;
  const previewPct = audiobook.previewPercentage ?? 15;

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
