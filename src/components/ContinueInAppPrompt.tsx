import { useState } from "react"
import { Smartphone, X } from "lucide-react"
import { useSiteSettings } from "@/hooks/useSiteSettings"
import { buildContinueInAppUrl } from "@/lib/appDeepLink"

/**
 * Dismissible nudge shown after some reading/listening engagement — distinct
 * from MobileAppPromptModal, which is a non-dismissible free-book paywall
 * lock. This is available on any book (paid or free) and its "Continue in
 * App" link deep-links straight to this book, not just the store — the app
 * resumes from the same saved progress automatically once logged in, since
 * ReadingProgress/ListeningProgress are already shared by user+book across
 * web and app.
 */
export function ContinueInAppPrompt({
  bookPath,
  onDismiss,
}: {
  /** e.g. `/book/${slug}` */
  bookPath: string
  onDismiss: () => void
}) {
  const { get } = useSiteSettings()
  const [closing, setClosing] = useState(false)
  const playStoreUrl = get("app_android_url") || get("google_play_url")
  const continueUrl = buildContinueInAppUrl(bookPath, playStoreUrl)

  const dismiss = () => {
    setClosing(true)
    setTimeout(onDismiss, 200)
  }

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-[200] px-3 pb-3 transition-transform duration-200 ${closing ? "translate-y-full" : "translate-y-0"}`}
    >
      <div className="max-w-md mx-auto rounded-xl border border-primary/20 bg-background/95 backdrop-blur shadow-lg flex items-center gap-3 p-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">অ্যাপে চালিয়ে যান</p>
          <p className="text-[11px] text-muted-foreground truncate">যেখানে ছিলেন সেখান থেকেই পড়া শুরু হবে</p>
        </div>
        <a
          href={continueUrl}
          className="flex-shrink-0 text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors"
        >
          Continue
        </a>
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
