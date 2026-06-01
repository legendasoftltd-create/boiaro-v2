import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Headphones, BookOpen, Star, WifiOff, Zap, Smartphone } from "lucide-react"
import { useSiteSettings } from "@/hooks/useSiteSettings"

interface Props {
  open: boolean
  onClose: () => void
  type: "audiobook" | "ebook"
  bookTitle?: string
}

export function MobileAppPromptModal({ open, onClose, type, bookTitle }: Props) {
  const { get } = useSiteSettings()
  const brandName = get("brand_name", "BoiAro")
  const appStoreUrl  = get("app_ios_url")     || get("app_store_url")
  const playStoreUrl = get("app_android_url") || get("google_play_url")

  const isAudio = type === "audiobook"

  const features = isAudio
    ? [
        { icon: WifiOff,     label: "অফলাইনে শুনুন" },
        { icon: Zap,         label: "ব্যাকগ্রাউন্ড প্লে" },
        { icon: Headphones,  label: "সব এপিসোড বিনামূল্যে" },
        { icon: Smartphone,  label: "প্রগ্রেস সিঙ্ক" },
      ]
    : [
        { icon: WifiOff,   label: "অফলাইনে পড়ুন" },
        { icon: Zap,       label: "দ্রুত লোড" },
        { icon: BookOpen,  label: "সম্পূর্ণ বই বিনামূল্যে" },
        { icon: Smartphone, label: "প্রগ্রেস সিঙ্ক" },
      ]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[340px] p-0 gap-0 overflow-hidden border-border/50">
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-5 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shadow-sm">
              {isAudio
                ? <Headphones className="w-6 h-6 text-primary" />
                : <BookOpen   className="w-6 h-6 text-primary" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{brandName} অ্যাপ</p>
              <div className="flex items-center gap-0.5 mt-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-primary text-primary" />
                ))}
                <span className="text-[10px] text-muted-foreground ml-1">৫০K+ রিভিউ</span>
              </div>
            </div>
          </div>

          <h2 className="text-base font-bold text-foreground leading-snug">
            {isAudio
              ? "অ্যাপে সম্পূর্ণ অডিওবুক শুনুন"
              : "অ্যাপে সম্পূর্ণ বইটি পড়ুন"}
          </h2>
          {bookTitle && (
            <p className="text-xs text-primary mt-1 truncate font-medium">"{bookTitle}"</p>
          )}
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isAudio
              ? "মোবাইল অ্যাপে বিনামূল্যে সব এপিসোড শুনুন — অফলাইনেও, যেকোনো সময়।"
              : "মোবাইল অ্যাপে বিনামূল্যে সম্পূর্ণ বইটি পড়ুন — অফলাইনেও, যেকোনো সময়।"}
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-2">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-3.5 h-3.5 text-primary" />
                </div>
                {f.label}
              </div>
            ))}
          </div>

          {/* Download buttons */}
          <div className="space-y-2 pt-1">
            {playStoreUrl ? (
              <Button className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-xl" asChild>
                <a href={playStoreUrl} target="_blank" rel="noopener noreferrer">
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                  </svg>
                  Google Play-এ ডাউনলোড করুন
                </a>
              </Button>
            ) : null}

            {appStoreUrl ? (
              <Button variant="outline" className="w-full gap-2 rounded-xl" asChild>
                <a href={appStoreUrl} target="_blank" rel="noopener noreferrer">
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  App Store-এ ডাউনলোড করুন
                </a>
              </Button>
            ) : null}

            {!playStoreUrl && !appStoreUrl && (
              <Button className="w-full rounded-xl" disabled>অ্যাপ শীঘ্রই আসছে</Button>
            )}
          </div>

          <Button variant="ghost" size="sm" className="w-full text-muted-foreground text-xs" onClick={onClose}>
            পরে করব
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
