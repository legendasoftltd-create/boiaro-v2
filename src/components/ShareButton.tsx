import { useState } from "react"
import { Share2, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"

// WhatsApp/Facebook share URLs need no app registration and work everywhere.
// Messenger's web share dialog does need a registered Facebook App ID
// (`https://www.facebook.com/dialog/send?...&app_id=...`) — no such setting
// exists in this project yet, so it's deliberately left out rather than
// shipping a link that silently fails. Add it back here once one exists.
function shareUrls(url: string, text: string) {
  const encodedUrl = encodeURIComponent(url)
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
  }
}

/**
 * Reused across every On Air surface (LiveShow, ScheduleShowDetail,
 * RadioSchedule rows) — same `url` (one of the three On Air link shapes:
 * /schedule, /live/:id, /schedule/:id) works as a deep link (opens the app if
 * installed, see useDeepLinks.ts) and as a rich-preview share link (see
 * server/src/middleware/social-bot.ts) without this component knowing which.
 */
export function ShareButton({ title, url, className }: { title: string; url: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const urls = shareUrls(url, title)

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        setOpen(false)
        return true
      } catch {
        // User cancelled the native sheet — fall through to the popover.
        return false
      }
    }
    return false
  }

  const handleTrigger = async (e: React.MouseEvent) => {
    // Mobile: prefer the OS share sheet (already includes WhatsApp/Messenger/
    // Facebook if installed) over the popover. Desktop browsers mostly don't
    // implement navigator.share at all, so they fall through to the popover.
    if (navigator.share) {
      e.preventDefault()
      await nativeShare()
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success("লিংক কপি হয়েছে")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className={className} title="শেয়ার করুন" onClick={handleTrigger}>
          <Share2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="space-y-1">
          <a
            href={urls.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
            onClick={() => setOpen(false)}
          >
            <span className="w-5 h-5 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-emerald-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.001 2C6.478 2 2 6.478 2 12c0 1.822.487 3.53 1.338 5.003L2 22l5.13-1.35A9.947 9.947 0 0 0 12 22c5.523 0 10-4.478 10-10S17.523 2 12 2zm0 18.13a8.09 8.09 0 0 1-4.13-1.13l-.296-.176-3.048.8.813-2.97-.193-.306A8.088 8.088 0 0 1 3.87 12c0-4.484 3.647-8.13 8.13-8.13 4.484 0 8.13 3.646 8.13 8.13 0 4.483-3.646 8.13-8.13 8.13z"/></svg>
            </span>
            WhatsApp
          </a>
          <a
            href={urls.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
            onClick={() => setOpen(false)}
          >
            <span className="w-5 h-5 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue-500"><path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94z"/></svg>
            </span>
            Facebook
          </a>
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm hover:bg-secondary transition-colors text-left"
          >
            <span className="w-5 h-5 flex items-center justify-center">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </span>
            লিংক কপি করুন
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
