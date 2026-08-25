import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { ContinueInAppPrompt } from "@/components/ContinueInAppPrompt"

/**
 * Root-mounted (same reasoning as AppDownloadGate) since audio can keep
 * playing via the mini-player from any page, not just a dedicated listen
 * screen — so this can't live inside one page component the way
 * EbookReader's version does.
 */
export function AudioContinueInAppPrompt() {
  const { continueInAppPromptVisible, dismissContinueInAppPrompt, book } = useAudioPlayer()

  if (!continueInAppPromptVisible || !book?.slug) return null

  return (
    <ContinueInAppPrompt bookPath={`/book/${book.slug}`} onDismiss={dismissContinueInAppPrompt} />
  )
}
