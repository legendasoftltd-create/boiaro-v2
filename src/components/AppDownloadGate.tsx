import { Headphones } from "lucide-react"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { useSiteSettings } from "@/hooks/useSiteSettings"

/**
 * Global fullscreen gate that renders whenever appPromptLocked is true in AudioPlayerContext.
 * Because this component is mounted at the app root (not inside a route), it persists across
 * back-navigation and mini-player usage — the overlay cannot be dismissed by pressing Back.
 */
export function AppDownloadGate() {
  const { appPromptLocked, book } = useAudioPlayer()
  const { get } = useSiteSettings()

  if (!appPromptLocked || !book) return null

  const playStoreUrl = get("app_android_url") || get("google_play_url")
  const appStoreUrl  = get("app_ios_url")     || get("app_store_url")
  const brandName    = get("brand_name", "BoiAro")

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col items-center justify-center p-8 text-center gap-6">
      <div className="w-20 h-20 rounded-2xl bg-primary/15 flex items-center justify-center">
        <Headphones className="w-10 h-10 text-primary" />
      </div>
      <div className="max-w-sm">
        <h2 className="text-2xl font-bold font-serif text-foreground mb-3">
          {brandName} অ্যাপে সম্পূর্ণ শুনুন
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          &ldquo;{book.title}&rdquo; — ওয়েবে ফ্রি প্রিভিউ শেষ হয়েছে।<br />
          অ্যাপ ডাউনলোড করুন এবং বিনামূল্যে সম্পূর্ণ শুনুন।
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-[260px]">
        {playStoreUrl && (
          <a
            href={playStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 bg-foreground text-background rounded-xl px-5 py-3 text-sm font-semibold hover:bg-foreground/90 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
            </svg>
            Google Play থেকে ডাউনলোড করুন
          </a>
        )}
        {appStoreUrl && (
          <a
            href={appStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 border-2 border-border rounded-xl px-5 py-3 text-sm font-semibold hover:bg-secondary transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            App Store থেকে ডাউনলোড করুন
          </a>
        )}
      </div>
    </div>
  )
}
